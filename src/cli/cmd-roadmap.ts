import {
  formatRoadmapOverview,
  getRoadmapStatus,
  recommendRoadmapChange,
  syncRoadmap,
  type RoadmapRecommendResult,
} from "../roadmap.js";
import { archiveRoadmapMilestones } from "../roadmap/archive.js";
import {
  generateRoadmapMilestone,
  generateRoadmapPlannedChange,
  type RoadmapMilestoneAuthorInput,
  type RoadmapPlannedChangeAuthorInput,
} from "../roadmap/author.js";
import { reopenMilestone } from "../roadmap/reopen.js";
import { isHelpRequest } from "./argv.js";
import { writeError, writeHelp, writeJson, writeOut, writeUsage } from "./output.js";

const ROADMAP_RECOMMEND_USAGE = "Usage: strict-spec-cli roadmap-recommend [--details] [--milestone <milestone-id>]\n";
const ROADMAP_ARCHIVE_USAGE = "Usage: strict-spec-cli roadmap-archive [milestone-id]\n";
const ROADMAP_REOPEN_USAGE = "Usage: strict-spec-cli roadmap-reopen <milestone-id> [--reason \"...\"]\n";
const ROADMAP_GENERATE_USAGE = [
  "Usage: strict-spec-cli roadmap-generate milestone --id <milestone-id> --title <text> --goal <text> --intake-question \"id|question|context|impact|recommendation\" [--scope-in <text>] [--scope-out <text>] [--done <text>] [--dependency <text>] [--risk <text>] [--note <text>] [--details <text>] [--reset] [--reset-intake-questions]",
  "       strict-spec-cli roadmap-generate planned-change --milestone <milestone-id> --id <planned-change-id> --summary <text> --details <text> [--depends-on <planned-change-id>] [--status <planned|complete>] [--reset]",
  "",
  "Notes:",
  "  New milestones require at least one --intake-question value.",
  "  Repeat --intake-question to append structured milestone clarification questions.",
  "  Existing scalar fields with different values require --reset.",
  "  List fields append unique values by default; with --reset, supplied list fields replace existing values.",
  "  --reset never removes or replaces existing intake questions; --intake-question values always merge additively unless --reset-intake-questions is supplied.",
  "  --reset-intake-questions replaces the milestone's intake_questions with exactly the supplied --intake-question values and requires at least one of them.",
  "  planned-change writes the artifact at its canonical filename <milestone-id>-<planned-change-id>.yaml under roadmap/planned-changes/ (the milestone prefix is not duplicated when the id already starts with it); callers never choose filenames.",
].join("\n") + "\n";
const ACTIONABLE_BLOCKER_LIMIT = 10;
const ROADMAP_GENERATE_BOOLEAN_FLAGS = new Set(["reset", "reset-intake-questions"]);

type FlagMap = Record<string, string[]>;

type RoadmapRecommendArgs = {
  includeDetails: boolean;
  milestoneId?: string;
};

function summarizeRoadmapRecommendation(result: RoadmapRecommendResult, args: RoadmapRecommendArgs): unknown {
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
    detailsCommand: args.milestoneId === undefined
      ? "strict-spec-cli roadmap-recommend --details"
      : `strict-spec-cli roadmap-recommend --milestone ${args.milestoneId} --details`,
  };
}

export function runRoadmapStatus(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp("Usage: strict-spec-cli roadmap-status\n");
    return 0;
  }
  if (argv.length > 0) {
    writeUsage("Usage: strict-spec-cli roadmap-status\n");
    return 1;
  }

  const result = getRoadmapStatus(process.cwd());
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runRoadmapOverview(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp("Usage: strict-spec-cli roadmap-overview\n");
    return 0;
  }
  if (argv.length > 0) {
    writeUsage("Usage: strict-spec-cli roadmap-overview\n");
    return 1;
  }

  const result = getRoadmapStatus(process.cwd());
  writeOut(formatRoadmapOverview(result));
  return result.valid ? 0 : 1;
}

const ROADMAP_SYNC_USAGE = "Usage: strict-spec-cli roadmap-sync [--materialize-planned-changes] [--fix-names]\n";

export function runRoadmapSync(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp(ROADMAP_SYNC_USAGE);
    return 0;
  }
  let materializePlannedChanges = false;
  let fixNames = false;
  for (const token of argv) {
    if (token === "--materialize-planned-changes" && !materializePlannedChanges) {
      materializePlannedChanges = true;
      continue;
    }
    if (token === "--fix-names" && !fixNames) {
      fixNames = true;
      continue;
    }
    writeUsage(ROADMAP_SYNC_USAGE);
    return 1;
  }

  const result = syncRoadmap(process.cwd(), { materializePlannedChanges, fixNames });
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

function parseIntakeQuestion(value: string): RoadmapMilestoneAuthorInput["intakeQuestions"][number] {
  const parts = value.split("|").map((part) => part.trim());
  if (parts.length !== 5 || parts.some((part) => part.length === 0)) {
    throw new Error("--intake-question must use id|question|context|impact|recommendation");
  }
  const [id, question, context, impact, recommendation] = parts;
  return { id, question, context, impact, recommendation };
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
    "intake-question",
    "dependency",
    "risk",
    "note",
    "details",
    "reset",
    "reset-intake-questions",
  ]);

  const intakeQuestions = values(flags, "intake-question").map(parseIntakeQuestion);
  const resetIntakeQuestions = values(flags, "reset-intake-questions").length > 0;
  if (resetIntakeQuestions && intakeQuestions.length === 0) {
    throw new Error("--reset-intake-questions requires at least one --intake-question value");
  }

  return {
    id: requiredOne(flags, "id"),
    title: optionalOne(flags, "title"),
    goal: optionalOne(flags, "goal"),
    scopeIn: values(flags, "scope-in"),
    scopeOut: values(flags, "scope-out"),
    doneCriteria: values(flags, "done"),
    intakeQuestions,
    dependencies: values(flags, "dependency"),
    risks: values(flags, "risk"),
    notes: values(flags, "note"),
    details: optionalOne(flags, "details"),
    reset: values(flags, "reset").length > 0,
    resetIntakeQuestions,
  };
}

function buildRoadmapPlannedChangeAuthorInput(argv: string[]): RoadmapPlannedChangeAuthorInput {
  const flags = parseRoadmapGenerateFlags(argv);
  ensureAllowedRoadmapGenerateFlags(flags, [
    "milestone",
    "id",
    "summary",
    "details",
    "depends-on",
    "status",
    "reset",
  ]);

  return {
    id: requiredOne(flags, "id"),
    milestone: requiredOne(flags, "milestone"),
    summary: optionalOne(flags, "summary"),
    details: optionalOne(flags, "details"),
    dependsOn: values(flags, "depends-on"),
    status: optionalOne(flags, "status"),
    reset: values(flags, "reset").length > 0,
  };
}

export function runRoadmapGenerate(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp(ROADMAP_GENERATE_USAGE);
    return 0;
  }
  const [selector, ...rest] = argv;
  if (selector !== "milestone" && selector !== "planned-change") {
    writeUsage(ROADMAP_GENERATE_USAGE);
    return 1;
  }

  if (selector === "planned-change") {
    let plannedChangeInput: RoadmapPlannedChangeAuthorInput;
    try {
      plannedChangeInput = buildRoadmapPlannedChangeAuthorInput(rest);
    } catch (error) {
      writeError(error instanceof Error ? error.message : String(error));
      writeUsage(ROADMAP_GENERATE_USAGE);
      return 1;
    }
    const plannedChangeResult = generateRoadmapPlannedChange(process.cwd(), plannedChangeInput);
    writeJson(plannedChangeResult);
    return plannedChangeResult.valid ? 0 : 1;
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

function parseRoadmapRecommendArgs(argv: string[]): RoadmapRecommendArgs {
  const result: RoadmapRecommendArgs = { includeDetails: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--details") {
      if (result.includeDetails) throw new Error("--details may only be supplied once");
      result.includeDetails = true;
      continue;
    }
    if (token === "--milestone") {
      if (result.milestoneId !== undefined) throw new Error("--milestone may only be supplied once");
      const value = argv[index + 1];
      if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error("missing value for --milestone");
      result.milestoneId = value;
      index += 1;
      continue;
    }
    if (token.startsWith("--milestone=")) {
      if (result.milestoneId !== undefined) throw new Error("--milestone may only be supplied once");
      const value = token.slice("--milestone=".length);
      if (value.length === 0) throw new Error("missing value for --milestone");
      result.milestoneId = value;
      continue;
    }
    throw new Error(`unsupported argument: ${token}`);
  }
  return result;
}

export function runRoadmapRecommend(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp(ROADMAP_RECOMMEND_USAGE);
    return 0;
  }

  let args: RoadmapRecommendArgs;
  try {
    args = parseRoadmapRecommendArgs(argv);
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error));
    writeUsage(ROADMAP_RECOMMEND_USAGE);
    return 1;
  }

  const result = recommendRoadmapChange(process.cwd(), { milestoneId: args.milestoneId });
  writeJson(args.includeDetails ? result : summarizeRoadmapRecommendation(result, args));
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
