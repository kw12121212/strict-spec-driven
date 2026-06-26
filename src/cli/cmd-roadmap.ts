import {
  formatRoadmapOverview,
  getRoadmapStatus,
  recommendRoadmapChange,
  syncRoadmap,
  type RoadmapRecommendResult,
} from "../roadmap.js";
import { archiveRoadmapMilestones } from "../roadmap/archive.js";
import { reopenMilestone } from "../roadmap/reopen.js";
import { isHelpRequest } from "./argv.js";
import { writeHelp, writeJson, writeOut, writeUsage } from "./output.js";

const ROADMAP_RECOMMEND_USAGE = "Usage: strict-spec-driven roadmap-recommend [--details]\n";
const ROADMAP_ARCHIVE_USAGE = "Usage: strict-spec-driven roadmap-archive [milestone-id]\n";
const ROADMAP_REOPEN_USAGE = "Usage: strict-spec-driven roadmap-reopen <milestone-id> [--reason \"...\"]\n";
const ACTIONABLE_BLOCKER_LIMIT = 10;

function summarizeRoadmapRecommendation(result: RoadmapRecommendResult): unknown {
  const skippedByCode: Record<string, number> = {};
  let eligible = 0;
  for (const candidate of result.candidates) {
    if (candidate.eligible) {
      eligible += 1;
      continue;
    }
    for (const reason of candidate.skipReasons) {
      skippedByCode[reason.code] = (skippedByCode[reason.code] ?? 0) + 1;
    }
  }

  const blockers = result.candidates
    .filter((candidate) =>
      !candidate.eligible
      && !candidate.skipReasons.some((reason) => reason.code === "workflow-state-archived")
      && candidate.skipReasons.some((reason) => reason.code !== "workflow-state-archived")
    )
    .slice(0, ACTIONABLE_BLOCKER_LIMIT)
    .map((candidate) => ({
      id: candidate.id,
      path: candidate.path,
      milestone: candidate.milestone,
      skipReasonCodes: candidate.skipReasons.map((reason) => reason.code),
    }));

  const recommendation = result.recommendation === null
    ? null
    : {
      id: result.recommendation.id,
      changeName: result.recommendation.changeName,
      path: result.recommendation.path,
      milestone: result.recommendation.milestone,
    };

  return {
    valid: result.valid,
    status: result.status,
    warnings: result.warnings,
    diagnostics: result.diagnostics,
    recommendation,
    candidateSummary: {
      total: result.candidates.length,
      eligible,
      skipped: result.candidates.length - eligible,
      skippedByCode,
    },
    blockers,
    detailsCommand: "strict-spec-driven roadmap-recommend --details",
  };
}

export function runRoadmapStatus(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp("Usage: strict-spec-driven roadmap-status\n");
    return 0;
  }
  if (argv.length > 0) {
    writeUsage("Usage: strict-spec-driven roadmap-status\n");
    return 1;
  }

  const result = getRoadmapStatus(process.cwd());
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runRoadmapOverview(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp("Usage: strict-spec-driven roadmap-overview\n");
    return 0;
  }
  if (argv.length > 0) {
    writeUsage("Usage: strict-spec-driven roadmap-overview\n");
    return 1;
  }

  const result = getRoadmapStatus(process.cwd());
  writeOut(formatRoadmapOverview(result));
  return result.valid ? 0 : 1;
}

export function runRoadmapSync(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp("Usage: strict-spec-driven roadmap-sync [--materialize-planned-changes]\n");
    return 0;
  }
  const materializePlannedChanges = argv.length === 1 && argv[0] === "--materialize-planned-changes";
  if (argv.length > 0 && !materializePlannedChanges) {
    writeUsage("Usage: strict-spec-driven roadmap-sync [--materialize-planned-changes]\n");
    return 1;
  }

  const result = syncRoadmap(process.cwd(), { materializePlannedChanges });
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runRoadmapRecommend(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp(ROADMAP_RECOMMEND_USAGE);
    return 0;
  }
  const includeDetails = argv.length === 1 && argv[0] === "--details";
  if (argv.length > 0 && !includeDetails) {
    writeUsage(ROADMAP_RECOMMEND_USAGE);
    return 1;
  }

  const result = recommendRoadmapChange(process.cwd());
  writeJson(includeDetails ? result : summarizeRoadmapRecommendation(result));
  return result.status === "recommended" ? 0 : 1;
}

export function runRoadmapArchive(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp(ROADMAP_ARCHIVE_USAGE);
    return 0;
  }
  if (argv.length > 1) {
    writeUsage(ROADMAP_ARCHIVE_USAGE);
    return 1;
  }

  const result = archiveRoadmapMilestones(process.cwd(), argv[0]);
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runRoadmapReopen(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp(ROADMAP_REOPEN_USAGE);
    return 0;
  }
  if (argv.length === 0) {
    writeUsage(ROADMAP_REOPEN_USAGE);
    return 1;
  }

  const milestoneId = argv[0];
  const reasonArgs: string[] = [];
  let reason: string | undefined;
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--reason") {
      const next = argv[index + 1];
      if (typeof next !== "string") {
        writeUsage(ROADMAP_REOPEN_USAGE);
        return 1;
      }
      reason = next;
      index += 1;
      continue;
    }
    if (token.startsWith("--reason=")) {
      reason = token.slice("--reason=".length);
      continue;
    }
    reasonArgs.push(token);
  }

  if (reasonArgs.length > 0) {
    writeUsage(ROADMAP_REOPEN_USAGE);
    return 1;
  }

  const result = reopenMilestone(process.cwd(), milestoneId, reason !== undefined ? { reason } : {});
  writeJson(result);
  return result.valid ? 0 : 1;
}
