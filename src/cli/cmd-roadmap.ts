import {
  formatRoadmapOverview,
  getRoadmapStatus,
  recommendRoadmapChange,
  syncRoadmap,
  type RoadmapRecommendResult,
} from "../roadmap.js";
import { archiveRoadmapMilestones } from "../roadmap/archive.js";
import { generateRoadmapMilestone, type RoadmapMilestoneAuthorInput } from "../roadmap/author.js";
import { reopenMilestone } from "../roadmap/reopen.js";
import { isHelpRequest } from "./argv.js";
import { writeError, writeHelp, writeJson, writeOut, writeUsage } from "./output.js";

const ROADMAP_RECOMMEND_USAGE = "Usage: strict-spec-driven roadmap-recommend [--details]\n";
const ROADMAP_ARCHIVE_USAGE = "Usage: strict-spec-driven roadmap-archive [milestone-id]\n";
const ROADMAP_REOPEN_USAGE = "Usage: strict-spec-driven roadmap-reopen <milestone-id> [--reason \"...\"]\n";
const ROADMAP_GENERATE_USAGE = [
  "Usage: strict-spec-driven roadmap-generate milestone --id <milestone-id> --title <text> --goal <text> [--scope-in <text>] [--scope-out <text>] [--done <text>] [--dependency <text>] [--risk <text>] [--note <text>] [--details <text>] [--reset]",
  "",
  "Notes:",
  "  Existing scalar fields with different values require --reset.",
  "  List fields append unique values by default; with --reset, supplied list fields replace existing values.",
].join("\n") + "\n";
const ACTIONABLE_BLOCKER_LIMIT = 10;
const ROADMAP_GENERATE_BOOLEAN_FLAGS = new Set(["reset"]);

type FlagMap = Record<string, string[]>;

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

function parseRoadmapGenerateFlags(argv: string[]): FlagMap {
  const flags: FlagMap = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--") || token.length === 2) {
      throw new Error(`expected named argument, got '${token ?? ""}'`);
    }

    const name = token.slice(2);
    flags[name] ??= [];
    if (ROADMAP_GENERATE_BOOLEAN_FLAGS.has(name)) {
      flags[name].push("true");
      continue;
    }

    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`missing value for --${name}`);
    }
    flags[name].push(value);
    index += 1;
  }
  return flags;
}

function ensureAllowedRoadmapGenerateFlags(flags: FlagMap, allowed: string[]): void {
  const allowedSet = new Set(allowed);
  const unsupported = Object.keys(flags).filter((flag) => !allowedSet.has(flag));
  if (unsupported.length > 0) {
    throw new Error(`unsupported argument(s): ${unsupported.map((flag) => `--${flag}`).join(", ")}`);
  }
}

function values(flags: FlagMap, name: string): string[] {
  return flags[name] ?? [];
}

function optionalOne(flags: FlagMap, name: string): string | undefined {
  const all = values(flags, name);
  if (all.length > 1) {
    throw new Error(`--${name} may only be supplied once`);
  }
  return all[0];
}

function requiredOne(flags: FlagMap, name: string): string {
  const value = optionalOne(flags, name);
  if (!value) {
    throw new Error(`missing required argument --${name}`);
  }
  return value;
}

function buildRoadmapMilestoneAuthorInput(argv: string[]): RoadmapMilestoneAuthorInput {
  const flags = parseRoadmapGenerateFlags(argv);
  ensureAllowedRoadmapGenerateFlags(flags, [
    "id",
    "title",
    "goal",
    "scope-in",
    "scope-out",
    "done",
    "dependency",
    "risk",
    "note",
    "details",
    "reset",
  ]);

  return {
    id: requiredOne(flags, "id"),
    title: optionalOne(flags, "title"),
    goal: optionalOne(flags, "goal"),
    scopeIn: values(flags, "scope-in"),
    scopeOut: values(flags, "scope-out"),
    doneCriteria: values(flags, "done"),
    dependencies: values(flags, "dependency"),
    risks: values(flags, "risk"),
    notes: values(flags, "note"),
    details: optionalOne(flags, "details"),
    reset: values(flags, "reset").length > 0,
  };
}

export function runRoadmapGenerate(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp(ROADMAP_GENERATE_USAGE);
    return 0;
  }
  const [selector, ...rest] = argv;
  if (selector !== "milestone") {
    writeUsage(ROADMAP_GENERATE_USAGE);
    return 1;
  }

  let input: RoadmapMilestoneAuthorInput;
  try {
    input = buildRoadmapMilestoneAuthorInput(rest);
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error));
    writeUsage(ROADMAP_GENERATE_USAGE);
    return 1;
  }

  const result = generateRoadmapMilestone(process.cwd(), input);
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
