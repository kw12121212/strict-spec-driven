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
import { deletePlannedChange, type RoadmapDeleteInput } from "../roadmap/delete.js";
import { movePlannedChangeToMilestone, type RoadmapMoveInput } from "../roadmap/move.js";
import { pauseMilestone, resumeMilestone } from "../roadmap/pause.js";
import { deferMilestoneRefinement, refineMilestone } from "../roadmap/refinement.js";
import { reopenMilestone } from "../roadmap/reopen.js";
import { renumberRoadmapMilestones, reorderRoadmapMilestone, type RoadmapReorderInput } from "../roadmap/order.js";
import { handleHelpRequest } from "./argv.js";
import { getCommandUsage } from "./command-metadata.js";
import { writeError, writeJson, writeOut, writeUsage } from "./output.js";

const ROADMAP_RECOMMEND_USAGE = getCommandUsage("roadmap-recommend");
const ROADMAP_ARCHIVE_USAGE = getCommandUsage("roadmap-archive");
const ROADMAP_REOPEN_USAGE = getCommandUsage("roadmap-reopen");
const ROADMAP_PAUSE_USAGE = getCommandUsage("roadmap-pause");
const ROADMAP_RESUME_USAGE = getCommandUsage("roadmap-resume");
const ROADMAP_DEFER_USAGE = getCommandUsage("roadmap-defer");
const ROADMAP_REFINE_USAGE = getCommandUsage("roadmap-refine");
const ROADMAP_REORDER_USAGE = getCommandUsage("roadmap-reorder");
const ROADMAP_RENUMBER_USAGE = getCommandUsage("roadmap-renumber");
const ROADMAP_MOVE_PLANNED_CHANGE_USAGE = getCommandUsage("roadmap-move-planned-change");
const ROADMAP_DELETE_PLANNED_CHANGE_USAGE = getCommandUsage("roadmap-delete-planned-change");
const ROADMAP_GENERATE_USAGE = getCommandUsage("roadmap-generate");
const ACTIONABLE_BLOCKER_LIMIT = 10;
const ROADMAP_GENERATE_BOOLEAN_FLAGS = new Set(["clear-owner", "clear-blocked"]);

type FlagMap = Record<string, string[]>;

type RoadmapRecommendArgs = {
  includeDetails: boolean;
  milestoneId?: string;
  allowUnrefined: boolean;
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
    refineAction: result.refineAction,
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
  if (handleHelpRequest("roadmap-status", argv)) {
    return 0;
  }
  if (argv.length > 0) {
    writeUsage(getCommandUsage("roadmap-status"));
    return 1;
  }

  const result = getRoadmapStatus(process.cwd());
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runRoadmapOverview(argv: string[]): number {
  if (handleHelpRequest("roadmap-overview", argv)) {
    return 0;
  }
  if (argv.length > 0) {
    writeUsage(getCommandUsage("roadmap-overview"));
    return 1;
  }

  const result = getRoadmapStatus(process.cwd());
  writeOut(formatRoadmapOverview(result));
  return result.valid ? 0 : 1;
}

const ROADMAP_SYNC_USAGE = getCommandUsage("roadmap-sync");

export function runRoadmapSync(argv: string[]): number {
  if (handleHelpRequest("roadmap-sync", argv)) {
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

function parseExternalRef(value: string): { label: string; target: string } {
  const separator = value.indexOf("|");
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error("--external-ref must use label|target");
  }
  return { label: value.slice(0, separator).trim(), target: value.slice(separator + 1).trim() };
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
    "remove-scope-in",
    "remove-scope-out",
    "remove-done",
    "remove-dependency",
    "remove-risk",
    "remove-note",
    "remove-intake-question",
  ]);

  const intakeQuestions = values(flags, "intake-question").map(parseIntakeQuestion);

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
    removedScopeIn: values(flags, "remove-scope-in"),
    removedScopeOut: values(flags, "remove-scope-out"),
    removedDoneCriteria: values(flags, "remove-done"),
    removedDependencies: values(flags, "remove-dependency"),
    removedRisks: values(flags, "remove-risk"),
    removedNotes: values(flags, "remove-note"),
    removedIntakeQuestions: values(flags, "remove-intake-question"),
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
    "remove-depends-on",
    "owner",
    "clear-owner",
    "reviewer",
    "remove-reviewer",
    "blocked",
    "blocked-reason",
    "clear-blocked",
    "label",
    "remove-label",
    "external-ref",
    "remove-external-ref",
  ]);

  const blockedValue = optionalOne(flags, "blocked");
  if (blockedValue !== undefined && blockedValue !== "true" && blockedValue !== "false") {
    throw new Error("--blocked must be true or false");
  }

  return {
    id: requiredOne(flags, "id"),
    milestone: requiredOne(flags, "milestone"),
    summary: optionalOne(flags, "summary"),
    details: optionalOne(flags, "details"),
    dependsOn: values(flags, "depends-on"),
    status: optionalOne(flags, "status"),
    removedDependsOn: values(flags, "remove-depends-on"),
    owner: optionalOne(flags, "owner"),
    clearOwner: "clear-owner" in flags,
    reviewers: values(flags, "reviewer"),
    removedReviewers: values(flags, "remove-reviewer"),
    blocked: blockedValue === undefined ? undefined : blockedValue === "true",
    blockedReason: optionalOne(flags, "blocked-reason"),
    clearBlocked: "clear-blocked" in flags,
    labels: values(flags, "label"),
    removedLabels: values(flags, "remove-label"),
    externalRefs: values(flags, "external-ref").map(parseExternalRef),
    removedExternalRefs: values(flags, "remove-external-ref"),
  };
}

export function runRoadmapGenerate(argv: string[]): number {
  if (handleHelpRequest("roadmap-generate", argv)) {
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
    try {
      const plannedChangeResult = generateRoadmapPlannedChange(process.cwd(), plannedChangeInput);
      writeJson(plannedChangeResult);
      return plannedChangeResult.valid ? 0 : 1;
    } catch (error) {
      // An unresolvable removal is reported as a deterministic failure; it throws before any write,
      // so the planned change is left byte-identical.
      writeError(error instanceof Error ? error.message : String(error));
      return 1;
    }
  }

  let input: RoadmapMilestoneAuthorInput;
  try {
    input = buildRoadmapMilestoneAuthorInput(rest);
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error));
    writeUsage(ROADMAP_GENERATE_USAGE);
    return 1;
  }

  try {
    const result = generateRoadmapMilestone(process.cwd(), input);
    writeJson(result);
    return result.valid ? 0 : 1;
  } catch (error) {
    // An unresolvable removal is reported as a deterministic failure; it throws before any write,
    // so the milestone is left byte-identical.
    writeError(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function parseRoadmapRecommendArgs(argv: string[]): RoadmapRecommendArgs {
  const result: RoadmapRecommendArgs = { includeDetails: false, allowUnrefined: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--details") {
      if (result.includeDetails) throw new Error("--details may only be supplied once");
      result.includeDetails = true;
      continue;
    }
    if (token === "--allow-unrefined") {
      if (result.allowUnrefined) throw new Error("--allow-unrefined may only be supplied once");
      result.allowUnrefined = true;
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
  if (handleHelpRequest("roadmap-recommend", argv)) {
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

  const result = recommendRoadmapChange(process.cwd(), {
    milestoneId: args.milestoneId,
    allowUnrefined: args.allowUnrefined,
  });
  writeJson(args.includeDetails ? result : summarizeRoadmapRecommendation(result, args));
  return result.status === "recommended" ? 0 : 1;
}

export function runRoadmapArchive(argv: string[]): number {
  if (handleHelpRequest("roadmap-archive", argv)) {
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

function parseRoadmapReorderArgs(argv: string[]): RoadmapReorderInput {
  const [milestoneId, ...rest] = argv;
  if (!milestoneId) throw new Error("missing milestone id");
  let before: string | undefined;
  let after: string | undefined;
  let order: number | undefined;
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--before" || token === "--after" || token === "--order") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${token}`);
      if (token === "--before") before = value;
      if (token === "--after") after = value;
      if (token === "--order") {
        if (!/^-?\d+$/.test(value)) throw new Error("--order must be an integer");
        order = Number(value);
      }
      index += 1;
      continue;
    }
    if (token.startsWith("--before=")) {
      before = token.slice("--before=".length);
      continue;
    }
    if (token.startsWith("--after=")) {
      after = token.slice("--after=".length);
      continue;
    }
    if (token.startsWith("--order=")) {
      const value = token.slice("--order=".length);
      if (!/^-?\d+$/.test(value)) throw new Error("--order must be an integer");
      order = Number(value);
      continue;
    }
    throw new Error(`unsupported argument: ${token}`);
  }

  const modes = [before !== undefined, after !== undefined, order !== undefined].filter(Boolean).length;
  if (modes !== 1) throw new Error("supply exactly one of --before, --after, or --order");
  if (before !== undefined) return { milestoneId, mode: "before", neighborId: before };
  if (after !== undefined) return { milestoneId, mode: "after", neighborId: after };
  return { milestoneId, mode: "order", order: order as number };
}

export function runRoadmapReorder(argv: string[]): number {
  if (handleHelpRequest("roadmap-reorder", argv)) {
    return 0;
  }
  let input: RoadmapReorderInput;
  try {
    input = parseRoadmapReorderArgs(argv);
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error));
    writeUsage(ROADMAP_REORDER_USAGE);
    return 1;
  }
  const result = reorderRoadmapMilestone(process.cwd(), input);
  writeJson(result);
  return result.valid ? 0 : 1;
}

function parseRoadmapMovePlannedChangeArgs(argv: string[]): RoadmapMoveInput {
  const [plannedChangeId, ...rest] = argv;
  if (!plannedChangeId || plannedChangeId.startsWith("--")) throw new Error("missing planned change id");
  let targetMilestoneId: string | undefined;
  let allowComplete = false;
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--milestone") {
      if (targetMilestoneId !== undefined) throw new Error("--milestone may only be supplied once");
      const value = rest[index + 1];
      if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error("missing value for --milestone");
      targetMilestoneId = value;
      index += 1;
      continue;
    }
    if (token.startsWith("--milestone=")) {
      if (targetMilestoneId !== undefined) throw new Error("--milestone may only be supplied once");
      const value = token.slice("--milestone=".length);
      if (value.length === 0) throw new Error("missing value for --milestone");
      targetMilestoneId = value;
      continue;
    }
    if (token === "--allow-complete") {
      if (allowComplete) throw new Error("--allow-complete may only be supplied once");
      allowComplete = true;
      continue;
    }
    throw new Error(`unsupported argument: ${token}`);
  }

  if (targetMilestoneId === undefined) throw new Error("missing required argument --milestone");
  return { plannedChangeId, targetMilestoneId, allowComplete };
}

export function runRoadmapMovePlannedChange(argv: string[]): number {
  if (handleHelpRequest("roadmap-move-planned-change", argv)) {
    return 0;
  }
  let input: RoadmapMoveInput;
  try {
    input = parseRoadmapMovePlannedChangeArgs(argv);
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error));
    writeUsage(ROADMAP_MOVE_PLANNED_CHANGE_USAGE);
    return 1;
  }
  const result = movePlannedChangeToMilestone(process.cwd(), input);
  writeJson(result);
  return result.valid ? 0 : 1;
}

function parseRoadmapDeletePlannedChangeArgs(argv: string[]): RoadmapDeleteInput {
  const [plannedChangeId, ...rest] = argv;
  if (!plannedChangeId || plannedChangeId.startsWith("--")) throw new Error("missing planned change id");
  let allowComplete = false;
  let detachDependents = false;
  for (const token of rest) {
    if (token === "--allow-complete") {
      if (allowComplete) throw new Error("--allow-complete may only be supplied once");
      allowComplete = true;
      continue;
    }
    if (token === "--detach-dependents") {
      if (detachDependents) throw new Error("--detach-dependents may only be supplied once");
      detachDependents = true;
      continue;
    }
    throw new Error(`unsupported argument: ${token}`);
  }
  return { plannedChangeId, allowComplete, detachDependents };
}

export function runRoadmapDeletePlannedChange(argv: string[]): number {
  if (handleHelpRequest("roadmap-delete-planned-change", argv)) {
    return 0;
  }
  let input: RoadmapDeleteInput;
  try {
    input = parseRoadmapDeletePlannedChangeArgs(argv);
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error));
    writeUsage(ROADMAP_DELETE_PLANNED_CHANGE_USAGE);
    return 1;
  }
  const result = deletePlannedChange(process.cwd(), input);
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runRoadmapRenumber(argv: string[]): number {
  if (handleHelpRequest("roadmap-renumber", argv)) {
    return 0;
  }
  if (argv.length > 0) {
    writeUsage(ROADMAP_RENUMBER_USAGE);
    return 1;
  }
  const result = renumberRoadmapMilestones(process.cwd());
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runRoadmapReopen(argv: string[]): number {
  if (handleHelpRequest("roadmap-reopen", argv)) {
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

function parseOptionalReasonArg(
  argv: string[],
  usage: string,
): { milestoneId: string; reason: string | undefined } | number {
  if (argv.length === 0) {
    writeUsage(usage);
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
        writeUsage(usage);
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
    writeUsage(usage);
    return 1;
  }
  return { milestoneId, reason };
}

export function runRoadmapPause(argv: string[]): number {
  if (handleHelpRequest("roadmap-pause", argv)) {
    return 0;
  }
  const parsed = parseOptionalReasonArg(argv, ROADMAP_PAUSE_USAGE);
  if (typeof parsed === "number") return parsed;
  const result = pauseMilestone(process.cwd(), parsed.milestoneId, parsed.reason !== undefined ? { reason: parsed.reason } : {});
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runRoadmapResume(argv: string[]): number {
  if (handleHelpRequest("roadmap-resume", argv)) {
    return 0;
  }
  const parsed = parseOptionalReasonArg(argv, ROADMAP_RESUME_USAGE);
  if (typeof parsed === "number") return parsed;
  const result = resumeMilestone(process.cwd(), parsed.milestoneId, parsed.reason !== undefined ? { reason: parsed.reason } : {});
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runRoadmapDefer(argv: string[]): number {
  if (handleHelpRequest("roadmap-defer", argv)) {
    return 0;
  }
  const parsed = parseOptionalReasonArg(argv, ROADMAP_DEFER_USAGE);
  if (typeof parsed === "number") return parsed;
  const result = deferMilestoneRefinement(
    process.cwd(),
    parsed.milestoneId,
    parsed.reason !== undefined ? { reason: parsed.reason } : {},
  );
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runRoadmapRefine(argv: string[]): number {
  if (handleHelpRequest("roadmap-refine", argv)) {
    return 0;
  }
  const parsed = parseOptionalReasonArg(argv, ROADMAP_REFINE_USAGE);
  if (typeof parsed === "number") return parsed;
  const result = refineMilestone(
    process.cwd(),
    parsed.milestoneId,
    parsed.reason !== undefined ? { reason: parsed.reason } : {},
  );
  writeJson(result);
  return result.valid ? 0 : 1;
}
