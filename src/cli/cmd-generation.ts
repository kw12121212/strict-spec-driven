import { existsSync, readFileSync, readdirSync } from "fs";
import path from "path";
import {
  generateChangeArtifactFromInput,
  type GeneratableArtifact,
  type GenerationInputRecord,
  isGeneratableArtifact,
  readSceneAreaForTarget,
  TASK_SECTION_SELECTORS,
} from "../propose-generation.js";
import { buildSeededRequirementQuestions } from "../requirement-questions.js";
import { parseYamlDocument } from "../yaml.js";
import { commitYamlMutation } from "../yaml-mutation.js";
import { CHANGE_NAME_PATTERN, handleHelpRequest } from "./argv.js";
import { getCommandUsage } from "./command-metadata.js";
import { writeError, writeJson, writeUsage } from "./output.js";

const STRICT_WORKFLOW_DIR = ".strict-spec-driven";
const BOOLEAN_FLAGS = new Set(["delete"]);

type FlagMap = Record<string, string[]>;

function usage(): string {
  return getCommandUsage("generate");
}

function parseFlagMap(argv: string[], rootDir: string): FlagMap {
  const flags: FlagMap = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--") || token.length === 2) {
      throw new Error(`expected named argument, got '${token ?? ""}'`);
    }

    const name = token.slice(2);
    flags[name] ??= [];
    if (BOOLEAN_FLAGS.has(name)) {
      flags[name].push("true");
      continue;
    }

    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`missing value for --${name}`);
    }
    flags[name].push(resolveStringValue(value, rootDir));
    index += 1;
  }
  return flags;
}

function resolveStringValue(value: string, rootDir: string): string {
  if (!value.startsWith("@") || value === "@") {
    return value;
  }
  const inputPath = path.resolve(rootDir, value.slice(1));
  return readFileSync(inputPath, "utf8");
}

/**
 * The named arguments each artifact generator accepts. These are exported so the argument set and
 * the command-metadata entry that documents it can be compared by a regression test: an argument
 * the generator accepts but help omits is indistinguishable from an unsupported one, and a caller
 * who guesses a wrong name reads the resulting rejection as proof the capability is missing.
 */
export const PROPOSAL_ARGUMENTS = [
  "what",
  "why",
  "remove-what",
  "remove-why",
  "in",
  "out",
  "unchanged",
  "remove-in",
  "remove-out",
  "remove-unchanged",
  "status",
  "milestone",
  "planned-change",
  "roadmap-milestone",
  "roadmap-planned-change",
] as const;

export const DESIGN_ARGUMENTS = [
  "delete",
  "approach",
  "decision",
  "decision-text",
  "rationale",
  "alternative",
  "reason",
  "risk",
  "remove-approach",
  "remove-decision",
  "remove-alternative",
  "remove-risk",
] as const;

/** Named arguments the questions artifact accepts, so metadata coverage guards them too. */
export const QUESTION_ARGUMENTS = [
  "open",
  "resolved",
  "resolve",
  "question",
  "context",
  "answer",
  "kind",
  "answered-by",
  "remove-question",
] as const;

/** Every named argument the generate command accepts through a declared allow-list. */
export function getDeclaredGenerateArguments(): string[] {
  return [...new Set<string>([...PROPOSAL_ARGUMENTS, ...DESIGN_ARGUMENTS, ...QUESTION_ARGUMENTS])].sort();
}

function ensureAllowedFlags(flags: FlagMap, allowed: string[]): void {
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

function hasFlag(flags: FlagMap, name: string): boolean {
  return values(flags, name).length > 0;
}

function uniqueStrings(input: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of input) {
    if (!seen.has(item)) {
      seen.add(item);
      output.push(item);
    }
  }
  return output;
}

function isRecord(value: unknown): value is GenerationInputRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readYamlIfExists<T>(rootDir: string, repoRelativePath: string): T | undefined {
  const absolutePath = path.join(rootDir, repoRelativePath);
  if (!existsSync(absolutePath)) return undefined;
  return parseYamlDocument<T>(readFileSync(absolutePath, "utf8"), { source: repoRelativePath });
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * The identifiers a single invocation has already written, keyed by collection.
 *
 * Restating an identifier that only exists on disk is an edit and overwrites silently, because the
 * caller named the field and supplied the new value. Restating one twice inside the same invocation
 * is a typo instead, since no caller means to set one field to two different values in the same
 * breath, so the conflict error is kept for exactly that case.
 */
type WriteSession = Set<string>;

function newWriteSession(): WriteSession {
  return new Set<string>();
}

/** Records an id as written by this invocation, returning false when it was already written. */
function claimWrite(session: WriteSession, scope: string, id: string): boolean {
  const key = `${scope}\u0000${id}`;
  if (session.has(key)) return false;
  session.add(key);
  return true;
}

function upsertKeyedItem(
  collection: GenerationInputRecord,
  id: string,
  item: GenerationInputRecord,
  fieldName: string,
  session: WriteSession,
): void {
  const existing = collection[id];
  const firstWriteThisInvocation = claimWrite(session, fieldName, id);
  if (!firstWriteThisInvocation && existing !== undefined && !deepEqual(existing, item)) {
    throw new Error(`duplicate ${fieldName} '${id}' has conflicting content`);
  }
  collection[id] = item;
}

/**
 * Removes exactly one entry from an id-less free-text list by substring match.
 *
 * These lists carry no identifiers and their entries are long enough that requiring the full text
 * verbatim would make removal unusable. A match that is absent or ambiguous fails loudly and names
 * the candidates rather than picking one, because silently choosing the first match would
 * reintroduce the unintended deletion this flag exists to prevent.
 */
function removeOneBySubstring<T>(
  entries: T[],
  needle: string,
  flagName: string,
  describe: (entry: T) => string,
): T[] {
  const matched = entries.filter((entry) => describe(entry).includes(needle));
  if (matched.length === 0) {
    throw new Error(`--${flagName} matched no entry: '${needle}'`);
  }
  if (matched.length > 1) {
    const candidates = matched.map((entry) => `'${describe(entry)}'`).join(", ");
    throw new Error(
      `--${flagName} matched ${matched.length} entries: ${candidates}; supply a substring that matches exactly one`,
    );
  }
  return entries.filter((entry) => entry !== matched[0]);
}

/** Removes a keyed item by id, reporting a no-op rather than failing when it is already absent. */
function removeKeyedItem(collection: GenerationInputRecord, id: string): void {
  delete collection[id];
}

/**
 * Merges one delta requirement, appending scenarios that are new and overwriting fields a later
 * invocation restates. Conflicts still fail within a single invocation, matching upsertKeyedItem.
 */
function mergeDeltaRequirement(
  collection: GenerationInputRecord,
  requirementId: string,
  incoming: GenerationInputRecord,
  session: WriteSession,
): void {
  const existing = collection[requirementId];
  const firstWriteThisInvocation = claimWrite(session, "delta requirement", requirementId);
  if (existing === undefined) {
    collection[requirementId] = incoming;
    return;
  }
  if (!isRecord(existing)) {
    collection[requirementId] = incoming;
    return;
  }

  for (const fieldName of ["strength", "statement"] as const) {
    if (deepEqual(existing[fieldName], incoming[fieldName])) continue;
    if (!firstWriteThisInvocation) {
      throw new Error(`duplicate delta requirement '${requirementId}' has conflicting ${fieldName}`);
    }
  }

  const existingScenarios = isRecord(existing.scenarios) ? existing.scenarios : {};
  const incomingScenarios = isRecord(incoming.scenarios) ? incoming.scenarios : {};

  const mergedScenarios: GenerationInputRecord = { ...existingScenarios };
  for (const [scenarioId, steps] of Object.entries(incomingScenarios)) {
    const existingSteps = mergedScenarios[scenarioId];
    const firstScenarioWrite = claimWrite(session, `scenario ${requirementId}`, scenarioId);
    if (existingSteps !== undefined && !firstScenarioWrite && !deepEqual(existingSteps, steps)) {
      throw new Error(
        `duplicate scenario '${scenarioId}' for delta requirement '${requirementId}' has conflicting content`,
      );
    }
    mergedScenarios[scenarioId] = steps;
  }

  collection[requirementId] = {
    ...existing,
    strength: incoming.strength ?? existing.strength,
    statement: incoming.statement ?? existing.statement,
    scenarios: mergedScenarios,
  };
}

function upsertListItem<T extends GenerationInputRecord>(
  collection: T[],
  item: T,
  id: string,
  fieldName: string,
  session: WriteSession,
): T[] {
  const existingIndex = collection.findIndex((candidate) => candidate.id === id);
  const firstWriteThisInvocation = claimWrite(session, fieldName, id);
  if (existingIndex === -1) {
    return [...collection, item];
  }
  if (!firstWriteThisInvocation && !deepEqual(collection[existingIndex], item)) {
    throw new Error(`duplicate ${fieldName} '${id}' has conflicting content`);
  }
  const next = [...collection];
  next[existingIndex] = item;
  return next;
}

/**
 * Reads the recorded proposal so a later invocation merges into it. Rebuilding from the arguments
 * alone made every proposal write a silent full replace, so omitting one --in dropped it without
 * any flag to blame.
 */
function existingProposalInput(rootDir: string, changeName: string): {
  what: string[];
  why: string[];
  in: string[];
  out: string[];
  unchanged: string[];
  status?: string;
  roadmap?: GenerationInputRecord;
} {
  const artifact = readYamlIfExists<GenerationInputRecord>(
    rootDir,
    `${STRICT_WORKFLOW_DIR}/changes/${changeName}/proposal.yaml`,
  );
  const summary = isRecord(artifact?.summary) ? artifact.summary : {};
  const scope = isRecord(artifact?.scope) ? artifact.scope : {};
  const change = isRecord(artifact?.change) ? artifact.change : {};
  const roadmap = isRecord(artifact?.roadmap) ? artifact.roadmap : undefined;
  return {
    what: Array.isArray(summary.what) ? summary.what as string[] : [],
    why: Array.isArray(summary.why) ? summary.why as string[] : [],
    in: Array.isArray(scope.in) ? scope.in as string[] : [],
    out: Array.isArray(scope.out) ? scope.out as string[] : [],
    unchanged: Array.isArray(artifact?.unchanged_behavior) ? artifact.unchanged_behavior as string[] : [],
    status: typeof change.status === "string" ? change.status : undefined,
    roadmap,
  };
}

function buildProposalInput(rootDir: string, changeName: string, flags: FlagMap): GenerationInputRecord {
  ensureAllowedFlags(flags, [...PROPOSAL_ARGUMENTS]);

  const existing = existingProposalInput(rootDir, changeName);
  let what = uniqueStrings([...existing.what, ...values(flags, "what")]);
  let why = uniqueStrings([...existing.why, ...values(flags, "why")]);
  for (const needle of values(flags, "remove-what")) {
    what = removeOneBySubstring(what, needle, "remove-what", (entry) => entry);
  }
  for (const needle of values(flags, "remove-why")) {
    why = removeOneBySubstring(why, needle, "remove-why", (entry) => entry);
  }
  if (what.length === 0) throw new Error("proposal summary requires at least one --what entry");
  if (why.length === 0) throw new Error("proposal summary requires at least one --why entry");
  const removedIn = values(flags, "remove-in");
  const removedOut = values(flags, "remove-out");
  const removedUnchanged = values(flags, "remove-unchanged");

  let scopeIn = uniqueStrings([...existing.in, ...values(flags, "in")]);
  let scopeOut = uniqueStrings([...existing.out, ...values(flags, "out")]);
  let unchanged = uniqueStrings([...existing.unchanged, ...values(flags, "unchanged")]);
  for (const needle of removedIn) {
    scopeIn = removeOneBySubstring(scopeIn, needle, "remove-in", (entry) => entry);
  }
  for (const needle of removedOut) {
    scopeOut = removeOneBySubstring(scopeOut, needle, "remove-out", (entry) => entry);
  }
  for (const needle of removedUnchanged) {
    unchanged = removeOneBySubstring(unchanged, needle, "remove-unchanged", (entry) => entry);
  }

  const input: GenerationInputRecord = {
    summary: { what, why },
    scope: {
      in: scopeIn,
      out: scopeOut,
    },
    unchanged_behavior: unchanged,
  };

  const status = optionalOne(flags, "status") ?? existing.status;
  if (status) input.status = status;

  const milestone = optionalOne(flags, "milestone") ?? optionalOne(flags, "roadmap-milestone");
  const plannedChange = optionalOne(flags, "planned-change") ?? optionalOne(flags, "roadmap-planned-change");
  if (milestone || plannedChange) {
    if (!milestone) throw new Error("missing required argument --milestone");
    if (!plannedChange) throw new Error("missing required argument --planned-change");
    input.roadmap = { milestone, planned_change: plannedChange };
  } else if (existing.roadmap) {
    input.roadmap = existing.roadmap;
  }

  return input;
}

function existingDesignInput(rootDir: string, changeName: string): GenerationInputRecord {
  const artifact = readYamlIfExists<GenerationInputRecord>(
    rootDir,
    `${STRICT_WORKFLOW_DIR}/changes/${changeName}/design.yaml`,
  );
  return {
    approach: Array.isArray(artifact?.approach) ? artifact.approach : [],
    decisions: isRecord(artifact?.decisions) ? artifact.decisions : {},
    alternatives: Array.isArray(artifact?.alternatives) ? artifact.alternatives : [],
    risks: Array.isArray(artifact?.risks) ? artifact.risks : [],
  };
}

function buildDesignInput(rootDir: string, changeName: string, flags: FlagMap): GenerationInputRecord {
  ensureAllowedFlags(flags, [...DESIGN_ARGUMENTS]);
  const session = newWriteSession();

  const input = existingDesignInput(rootDir, changeName);
  let approach = uniqueStrings([...(Array.isArray(input.approach) ? input.approach as string[] : []), ...values(flags, "approach")]);
  let risks = uniqueStrings([...(Array.isArray(input.risks) ? input.risks as string[] : []), ...values(flags, "risk")]);

  const decisions = isRecord(input.decisions) ? input.decisions : {};
  const decisionIds = values(flags, "decision");
  const decisionTexts = values(flags, "decision-text");
  const rationales = values(flags, "rationale");
  if (decisionIds.length !== decisionTexts.length || decisionIds.length !== rationales.length) {
    throw new Error("--decision, --decision-text, and --rationale must be supplied the same number of times");
  }
  for (let index = 0; index < decisionIds.length; index += 1) {
    upsertKeyedItem(decisions, decisionIds[index] as string, {
      decision: decisionTexts[index],
      rationale: rationales[index],
    }, "decision", session);
  }
  for (const decisionId of values(flags, "remove-decision")) {
    removeKeyedItem(decisions, decisionId);
  }
  input.decisions = decisions;

  let alternatives = Array.isArray(input.alternatives) ? input.alternatives as GenerationInputRecord[] : [];
  const alternativeOptions = values(flags, "alternative");
  const reasons = values(flags, "reason");
  if (alternativeOptions.length !== reasons.length) {
    throw new Error("--alternative and --reason must be supplied the same number of times");
  }
  for (let index = 0; index < alternativeOptions.length; index += 1) {
    const item = { option: alternativeOptions[index], reason: reasons[index] };
    if (!alternatives.some((alternative) => deepEqual(alternative, item))) {
      alternatives = [...alternatives, item];
    }
  }

  for (const needle of values(flags, "remove-approach")) {
    approach = removeOneBySubstring(approach, needle, "remove-approach", (entry) => entry);
  }
  for (const needle of values(flags, "remove-risk")) {
    risks = removeOneBySubstring(risks, needle, "remove-risk", (entry) => entry);
  }
  for (const needle of values(flags, "remove-alternative")) {
    alternatives = removeOneBySubstring(
      alternatives,
      needle,
      "remove-alternative",
      (entry) => typeof entry.option === "string" ? entry.option : "",
    );
  }

  input.approach = approach;
  input.risks = risks;
  input.alternatives = alternatives;

  return input;
}

type QuestionGroup = {
  kind: "open" | "resolved" | "resolve";
  id: string;
  question?: string;
  context?: string;
  answer?: string;
  questionKind?: string;
  answeredBy?: string;
};

const QUESTION_KIND_VALUES = ["requirement", "technical"] as const;
const ANSWERED_BY_VALUES = ["human", "roadmap", "assumption"] as const;

/** Requirement-kind entries are the interrogation gate itself, so a rebuild never drops them. */
function isRequirementQuestion(entry: unknown): boolean {
  return isRecord(entry) && entry.kind === "requirement";
}

/**
 * Attaches kind and answered_by to a question entry. Resolving a seeded question carries the kind
 * forward from the open entry it replaces, so attribution survives without restating --kind.
 */
function withQuestionAttribution(
  entry: GenerationInputRecord,
  item: QuestionGroup,
  inheritedFrom?: GenerationInputRecord,
): GenerationInputRecord {
  const kind = item.questionKind ?? (typeof inheritedFrom?.kind === "string" ? inheritedFrom.kind : undefined);
  const answeredBy = item.answeredBy
    ?? (typeof inheritedFrom?.answered_by === "string" ? inheritedFrom.answered_by : undefined);
  if (kind !== undefined) entry.kind = kind;
  if (answeredBy !== undefined) entry.answered_by = answeredBy;
  return entry;
}

type QuestionCommandInput = {
  removals: string[];
  items: QuestionGroup[];
};

function parseQuestionCommandInput(argv: string[], rootDir: string): QuestionCommandInput {
  const input: QuestionCommandInput = { removals: [], items: [] };
  let currentItem: QuestionGroup | undefined;

  function readValue(name: string, index: number): string {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`missing value for --${name}`);
    }
    return resolveStringValue(value, rootDir);
  }

  function setField(field: "question" | "context" | "answer" | "questionKind" | "answeredBy", value: string, flagName: string): void {
    if (!currentItem) {
      throw new Error("missing required argument --open or --resolved");
    }
    if (currentItem[field] !== undefined) {
      throw new Error(`--${flagName} may only be supplied once per question`);
    }
    currentItem[field] = value;
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--") || token.length === 2) {
      throw new Error(`expected named argument, got '${token ?? ""}'`);
    }

    const name = token.slice(2);
    if (name === "remove-question") {
      input.removals.push(readValue(name, index));
      index += 1;
      continue;
    }
    if (name === "open" || name === "resolved" || name === "resolve") {
      currentItem = { kind: name, id: readValue(name, index) };
      input.items.push(currentItem);
      index += 1;
      continue;
    }
    if (name === "question" || name === "context" || name === "answer") {
      setField(name, readValue(name, index), name);
      index += 1;
      continue;
    }
    if (name === "kind") {
      const value = readValue(name, index);
      if (!QUESTION_KIND_VALUES.includes(value as (typeof QUESTION_KIND_VALUES)[number])) {
        throw new Error(`--kind must be one of: ${QUESTION_KIND_VALUES.join(", ")}`);
      }
      setField("questionKind", value, name);
      index += 1;
      continue;
    }
    if (name === "answered-by") {
      const value = readValue(name, index);
      if (!ANSWERED_BY_VALUES.includes(value as (typeof ANSWERED_BY_VALUES)[number])) {
        throw new Error(`--answered-by must be one of: ${ANSWERED_BY_VALUES.join(", ")}`);
      }
      setField("answeredBy", value, name);
      index += 1;
      continue;
    }

    throw new Error(`unsupported argument(s): --${name}`);
  }

  return input;
}

/**
 * Reads the recorded questions artifact, or the typed default for a change that has none yet. The
 * default is the requirement-interrogation set seeded open: those five entries are workflow-required
 * state rather than placeholder content, so creating the artifact without them would quietly retire
 * the gate instead of relocating it.
 */
function existingQuestionsInput(rootDir: string, changeName: string): GenerationInputRecord {
  const artifact = readYamlIfExists<GenerationInputRecord>(
    rootDir,
    `${STRICT_WORKFLOW_DIR}/changes/${changeName}/questions.yaml`,
  );
  if (!artifact) {
    return { open: buildSeededRequirementQuestions(), resolved: [] };
  }
  return {
    open: Array.isArray(artifact.open) ? artifact.open : [],
    resolved: Array.isArray(artifact.resolved) ? artifact.resolved : [],
  };
}

/**
 * Drops a question by id. Requirement-kind entries are the interrogation gate itself, so removing
 * one is refused: a flag that could clear the gate would make the gate advisory.
 */
function removeQuestionById(
  open: GenerationInputRecord[],
  resolved: GenerationInputRecord[],
  id: string,
): { open: GenerationInputRecord[]; resolved: GenerationInputRecord[] } {
  const target = [...open, ...resolved].find((candidate) => candidate.id === id);
  if (target && isRequirementQuestion(target)) {
    throw new Error(
      `--remove-question cannot remove requirement question '${id}': requirement entries are the interrogation gate`,
    );
  }
  return {
    open: open.filter((candidate) => candidate.id !== id),
    resolved: resolved.filter((candidate) => candidate.id !== id),
  };
}

function buildQuestionsInputFromArgs(rootDir: string, changeName: string, argv: string[]): GenerationInputRecord {
  const commandInput = parseQuestionCommandInput(argv, rootDir);
  const session = newWriteSession();
  const input = existingQuestionsInput(rootDir, changeName);
  let open = Array.isArray(input.open) ? input.open as GenerationInputRecord[] : [];
  let resolved = Array.isArray(input.resolved) ? input.resolved as GenerationInputRecord[] : [];

  for (const id of commandInput.removals) {
    ({ open, resolved } = removeQuestionById(open, resolved, id));
  }

  for (const item of commandInput.items) {
    if (item.kind === "open") {
      if (!item.question) throw new Error(`missing required argument --question for question '${item.id}'`);
      if (!item.context) throw new Error(`missing required argument --context for question '${item.id}'`);
      if (item.answer !== undefined) {
        throw new Error(`--answer is only valid with --resolved for question '${item.id}'`);
      }
      const inherited = [...open, ...resolved].find((candidate) => candidate.id === item.id);
      resolved = resolved.filter((candidate) => candidate.id !== item.id);
      open = upsertListItem(open, withQuestionAttribution({
        id: item.id,
        question: item.question,
        context: item.context,
      }, item, inherited), item.id, "open question", session);
      continue;
    }

    if (item.kind === "resolve") {
      if (!item.answer) throw new Error(`missing required argument --answer for resolved question '${item.id}'`);
      const existingOpen = open.find((candidate) => candidate.id === item.id);
      const existingRecord = isRecord(existingOpen) ? existingOpen : undefined;
      const question = item.question ?? (typeof existingRecord?.question === "string" ? existingRecord.question : undefined);
      const context = item.context ?? (typeof existingRecord?.context === "string" ? existingRecord.context : undefined);
      if (!question) throw new Error(`missing required argument --question for unresolved question '${item.id}'`);
      if (!context) throw new Error(`missing required argument --context for unresolved question '${item.id}'`);
      open = open.filter((candidate) => candidate.id !== item.id);
      resolved = upsertListItem(resolved, withQuestionAttribution({
        id: item.id,
        question,
        context,
        answer: item.answer,
      }, item, existingRecord), item.id, "resolved question", session);
      continue;
    }

    if (!item.question) throw new Error(`missing required argument --question for question '${item.id}'`);
    if (!item.context) throw new Error(`missing required argument --context for question '${item.id}'`);
    if (!item.answer) throw new Error(`missing required argument --answer for resolved question '${item.id}'`);
    const inherited = [...resolved, ...open].find((candidate) => candidate.id === item.id);
    open = open.filter((candidate) => candidate.id !== item.id);
    resolved = upsertListItem(resolved, withQuestionAttribution({
      id: item.id,
      question: item.question,
      context: item.context,
      answer: item.answer,
    }, item, inherited), item.id, "resolved question", session);
  }

  input.open = open;
  input.resolved = resolved;
  return input;
}

const TASK_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type TaskGroup = {
  section: string;
  id?: string;
  text?: string;
  status?: string;
  command?: string;
  before?: string;
  after?: string;
};

export type TaskRemovalOutcome = {
  removed: string[];
  unmatched: string[];
};

type TaskCommandInput = {
  removals: string[];
  groups: TaskGroup[];
  validationTask?: string;
  unitTestTask?: string;
};

function parseTaskCommandInput(argv: string[], rootDir: string, changeName: string): TaskCommandInput {
  const input: TaskCommandInput = { removals: [], groups: [] };
  let current: TaskGroup | undefined;
  const selectors = TASK_SECTION_SELECTORS.map(({ flag }) => `--${flag}`).join(", ");

  function setField(
    field: "id" | "text" | "status" | "command" | "before" | "after",
    value: string,
    flagName: string,
  ): void {
    if (!current) {
      throw new Error(`start a task group with one of ${selectors} before --${flagName}; see strict-spec-cli generate --help`);
    }
    if (current[field] !== undefined) {
      throw new Error(`--${flagName} may only be supplied once per task`);
    }
    current[field] = value;
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--") || token.length === 2) {
      throw new Error(`expected named argument, got '${token ?? ""}'`);
    }

    // Task text and commands routinely name CLI flags, so the inline `--flag=value` form is
    // accepted alongside `--flag value` to express values that begin with a dash.
    const rawName = token.slice(2);
    const equalsAt = rawName.indexOf("=");
    const name = equalsAt === -1 ? rawName : rawName.slice(0, equalsAt);
    const inlineValue = equalsAt === -1 ? undefined : rawName.slice(equalsAt + 1);

    const readValue = (): string => {
      if (inlineValue !== undefined) return resolveStringValue(inlineValue, rootDir);
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`missing value for --${name}`);
      }
      index += 1;
      return resolveStringValue(value, rootDir);
    };

    if (name === "section") {
      throw new Error(`--section was removed; use one of ${selectors} (no value). To write .strict-spec-driven/changes/${changeName}/tasks.yaml, for example: strict-spec-cli generate ${changeName} tasks --${TASK_SECTION_SELECTORS[0]!.flag} --task implement-work --text "Implement the scoped behavior."; see strict-spec-cli generate --help`);
    }
    const selector = TASK_SECTION_SELECTORS.find(({ flag }) => flag === name);
    if (selector) {
      if (inlineValue !== undefined || (argv[index + 1] !== undefined && !argv[index + 1]!.startsWith("--"))) {
        throw new Error(`--${name} takes no value; follow it with --task <id>; see strict-spec-cli generate --help`);
      }
      current = { section: selector.section };
      input.groups.push(current);
      continue;
    }
    if (name === "task") {
      setField("id", readValue(), name);
      continue;
    }
    if (name === "text" || name === "status" || name === "command") {
      setField(name, readValue(), name);
      continue;
    }
    // Placement belongs to the open task group rather than to the invocation, so a multi-task call
    // can position each task independently.
    if (name === "before" || name === "after") {
      const opposite = name === "before" ? "after" : "before";
      if (current?.[opposite] !== undefined) {
        const subject = current.id ? `task '${current.id}'` : `the open '${current.section}' task`;
        throw new Error(`--before and --after cannot both be supplied for ${subject}`);
      }
      setField(name, readValue(), name);
      continue;
    }
    if (name === "remove") {
      input.removals.push(readValue());
      continue;
    }
    if (name === "validation-task") {
      if (input.validationTask !== undefined) throw new Error("--validation-task may only be supplied once");
      input.validationTask = readValue();
      continue;
    }
    if (name === "unit-test-task") {
      if (input.unitTestTask !== undefined) throw new Error("--unit-test-task may only be supplied once");
      input.unitTestTask = readValue();
      continue;
    }

    throw new Error(`unsupported argument(s): --${name}`);
  }

  return input;
}

function existingTaskListInput(rootDir: string, changeName: string): GenerationInputRecord {
  const artifact = readYamlIfExists<GenerationInputRecord>(
    rootDir,
    `${STRICT_WORKFLOW_DIR}/changes/${changeName}/tasks.yaml`,
  );
  const gates = isRecord(artifact?.testing_gates) ? artifact.testing_gates : {};
  return {
    sections: isRecord(artifact?.sections) ? artifact.sections : {},
    testing_gates: {
      validation_task: typeof gates.validation_task === "string" ? gates.validation_task : "",
      unit_test_task: typeof gates.unit_test_task === "string" ? gates.unit_test_task : "",
    },
  };
}

function completedTaskIds(rootDir: string, changeName: string): string[] {
  const artifact = readYamlIfExists<GenerationInputRecord>(
    rootDir,
    `${STRICT_WORKFLOW_DIR}/changes/${changeName}/tasks.yaml`,
  );
  const sections = isRecord(artifact?.sections) ? artifact.sections : {};
  const completed: string[] = [];
  for (const sectionTasks of Object.values(sections)) {
    if (!isRecord(sectionTasks)) continue;
    for (const [taskId, task] of Object.entries(sectionTasks)) {
      if (isRecord(task) && task.status === "complete") completed.push(taskId);
    }
  }
  return completed;
}

function findTaskSection(sections: GenerationInputRecord, taskId: string): string | undefined {
  for (const [sectionName, sectionTasks] of Object.entries(sections)) {
    if (isRecord(sectionTasks) && Object.prototype.hasOwnProperty.call(sectionTasks, taskId)) {
      return sectionName;
    }
  }
  return undefined;
}

/**
 * Rejects an anchor that cannot position `taskId`, before any section is rebuilt.
 *
 * An anchor is validated on identity and section membership only: task status never constrains
 * placement, so a pending task may be positioned ahead of a completed one.
 */
function assertPlaceableAnchor(
  sections: GenerationInputRecord,
  sectionName: string,
  taskId: string,
  anchorId: string,
): void {
  if (anchorId === taskId) {
    throw new Error(`task '${taskId}' cannot be placed relative to itself`);
  }
  const anchorSection = findTaskSection(sections, anchorId);
  if (anchorSection === undefined) {
    throw new Error(
      `anchor task '${anchorId}' does not exist in section '${sectionName}'; an anchor must already be recorded when the task is placed, so a task created by a later --task group in the same invocation cannot serve as one`,
    );
  }
  if (anchorSection !== sectionName) {
    throw new Error(
      `anchor task '${anchorId}' is in section '${anchorSection}', not '${sectionName}'; an anchor must be in the same section, so use --remove and restate the task to move it between sections`,
    );
  }
}

/**
 * Rebuilds a section so `taskId` sits immediately before or after `anchorId`.
 *
 * Task order inside a section map is the execution order `apply` walks, so placement is expressed
 * as key order rather than as a stored field. The section is rebuilt into a fresh record because
 * key order is only observable through insertion order, and every task entry is carried across by
 * reference so no field is rewritten as a side effect of moving one key.
 */
function placeTaskInSection(
  sectionTasks: GenerationInputRecord,
  taskId: string,
  anchorId: string,
  side: "before" | "after",
): GenerationInputRecord {
  const reordered: GenerationInputRecord = {};
  for (const [currentId, task] of Object.entries(sectionTasks)) {
    if (currentId === taskId) continue;
    if (currentId === anchorId && side === "before") reordered[taskId] = sectionTasks[taskId];
    reordered[currentId] = task;
    if (currentId === anchorId && side === "after") reordered[taskId] = sectionTasks[taskId];
  }
  return reordered;
}

function buildTaskListInputFromArgs(
  rootDir: string,
  changeName: string,
  argv: string[],
  removalOutcome?: TaskRemovalOutcome,
): GenerationInputRecord {
  const commandInput = parseTaskCommandInput(argv, rootDir, changeName);
  const input = existingTaskListInput(rootDir, changeName);
  const sections = isRecord(input.sections) ? input.sections : {};
  const gates = isRecord(input.testing_gates) ? input.testing_gates : { validation_task: "", unit_test_task: "" };

  // Removals run before upserts so a single invocation can move a task between sections by
  // removing the old entry and restating it under the new one.
  for (const taskId of commandInput.removals) {
    const holdingSection = findTaskSection(sections, taskId);
    if (holdingSection === undefined) {
      removalOutcome?.unmatched.push(taskId);
      continue;
    }
    const sectionTasks = sections[holdingSection] as GenerationInputRecord;
    delete sectionTasks[taskId];
    removalOutcome?.removed.push(taskId);
  }

  const seenThisInvocation = new Set<string>();
  for (const group of commandInput.groups) {
    if (!group.id) throw new Error(`missing required argument --task for section '${group.section}'`);
    if (!TASK_ID_PATTERN.test(group.id)) {
      throw new Error(`task id '${group.id}' must be kebab-case (lowercase letters, numbers, and hyphens)`);
    }
    if (seenThisInvocation.has(group.id)) {
      throw new Error(`duplicate task id '${group.id}' supplied in one invocation`);
    }
    seenThisInvocation.add(group.id);

    const existingSection = findTaskSection(sections, group.id);
    if (existingSection !== undefined && existingSection !== group.section) {
      throw new Error(
        `task id '${group.id}' already exists in section '${existingSection}'; remove it there before moving it to '${group.section}'`,
      );
    }

    const sectionTasks = isRecord(sections[group.section]) ? sections[group.section] as GenerationInputRecord : {};
    const existingTask = isRecord(sectionTasks[group.id]) ? sectionTasks[group.id] as GenerationInputRecord : undefined;
    if (existingTask === undefined && !group.text) {
      throw new Error(`missing required argument --text for new task '${group.id}'`);
    }

    // Field-level merge: an invocation overwrites only the fields it supplies, so restating a task
    // to change one field never discards a recorded completion or command.
    const task: GenerationInputRecord = {
      text: group.text ?? existingTask?.text,
      status: group.status ?? existingTask?.status ?? "pending",
    };
    const command = group.command ?? existingTask?.command;
    if (command !== undefined) task.command = command;

    sectionTasks[group.id] = task;
    sections[group.section] = sectionTasks;

    // Anchors resolve against the section as it stands when this group is applied, so a group may
    // anchor to a task an earlier group created but not to one a later group will create.
    const anchorId = group.before ?? group.after;
    if (anchorId !== undefined) {
      const side = group.before !== undefined ? "before" : "after";
      assertPlaceableAnchor(sections, group.section, group.id, anchorId);
      sections[group.section] = placeTaskInSection(sectionTasks, group.id, anchorId, side);
    }
  }

  if (commandInput.validationTask !== undefined) gates.validation_task = commandInput.validationTask;
  if (commandInput.unitTestTask !== undefined) gates.unit_test_task = commandInput.unitTestTask;

  input.sections = sections;
  input.testing_gates = gates;
  return input;
}

function normalizeDeltaSpecRelativePath(relativePath: string): string {
  let normalized = relativePath.replaceAll("\\", "/");
  const strictSpecsPrefix = `${STRICT_WORKFLOW_DIR}/specs/`;
  if (normalized.startsWith(strictSpecsPrefix)) {
    normalized = normalized.slice(strictSpecsPrefix.length);
  }
  return normalized;
}

function readSpecIndexPathForTarget(rootDir: string, targetSpec: string): string | undefined {
  const index = readYamlIfExists<{ specs?: Array<{ id?: unknown; path?: unknown }> }>(
    rootDir,
    `${STRICT_WORKFLOW_DIR}/specs/INDEX.yaml`,
  );
  const match = (index?.specs ?? []).find((candidate) => candidate.id === targetSpec);
  return typeof match?.path === "string" ? normalizeDeltaSpecRelativePath(match.path) : undefined;
}

function resolveDeltaExistingPath(rootDir: string, targetSpec: string, specPath: string | undefined): string {
  if (specPath) {
    return normalizeDeltaSpecRelativePath(specPath);
  }
  const indexedPath = readSpecIndexPathForTarget(rootDir, targetSpec);
  if (indexedPath) return indexedPath;
  return `${targetSpec}.yaml`;
}

function existingDeltaInput(rootDir: string, changeName: string, targetSpec: string, specPath: string | undefined): GenerationInputRecord {
  const relativeSpecPath = resolveDeltaExistingPath(rootDir, targetSpec, specPath);
  const artifact = readYamlIfExists<GenerationInputRecord>(
    rootDir,
    `${STRICT_WORKFLOW_DIR}/changes/${changeName}/specs/${relativeSpecPath}`,
  );
  if (!artifact) {
    return emptyDeltaInput(targetSpec, relativeSpecPath);
  }
  const input: GenerationInputRecord = {
    target_spec: artifact.target_spec ?? targetSpec,
    spec_path: relativeSpecPath,
    operations: isRecord(artifact.operations) ? artifact.operations : { ADDED: {}, MODIFIED: {}, REMOVED: {} },
  };
  if (isRecord(artifact.spec)) {
    input.spec = artifact.spec;
  }
  return input;
}

function emptyDeltaInput(targetSpec: string, specPath: string): GenerationInputRecord {
  return {
    target_spec: targetSpec,
    spec_path: specPath,
    operations: { ADDED: {}, MODIFIED: {}, REMOVED: {} },
  };
}

type DeltaScenarioGroup = {
  id: string;
  steps: GenerationInputRecord[];
};

type DeltaRequirementGroup = {
  operation: string;
  id: string;
  strength?: string;
  statement?: string;
  reason?: string;
  scenarios: DeltaScenarioGroup[];
};

type DeltaCommandInput = {
  targetSpec?: string;
  specPath?: string;
  title?: string;
  newSpecPath?: string;
  requirements: DeltaRequirementGroup[];
  removedRequirements: string[];
  removedScenarios: string[];
};

function parseDeltaCommandInput(argv: string[], rootDir: string): DeltaCommandInput {
  const input: DeltaCommandInput = {
    requirements: [],
    removedRequirements: [],
    removedScenarios: [],
  };
  let currentOperation: string | undefined;
  let hasPendingOperation = false;
  let currentRequirement:
    | {
      operation: string;
      id: string;
      strength?: string;
      statement?: string;
      reason?: string;
      scenarios: DeltaScenarioGroup[];
    }
    | undefined;
  let currentScenario: DeltaScenarioGroup | undefined;

  function readValue(name: string, index: number): string {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`missing value for --${name}`);
    }
    return resolveStringValue(value, rootDir);
  }

  function ensureRequirement(flagName: string): NonNullable<typeof currentRequirement> {
    if (!currentRequirement) {
      throw new Error(`missing required argument --requirement before --${flagName}`);
    }
    return currentRequirement;
  }

  function finalizeScenario(): void {
    if (!currentScenario) return;
    if (currentScenario.steps.length === 0) {
      throw new Error(`--scenario '${currentScenario.id}' requires at least one --given, --when, --then, or --and`);
    }
    ensureRequirement("scenario").scenarios.push(currentScenario);
    currentScenario = undefined;
  }

  function finalizeRequirement(): void {
    if (!currentRequirement) return;
    finalizeScenario();
    input.requirements.push(currentRequirement);
    currentRequirement = undefined;
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--") || token.length === 2) {
      throw new Error(`expected named argument, got '${token ?? ""}'`);
    }

    const name = token.slice(2);
    if (name === "remove-requirement" || name === "remove-scenario") {
      const value = readValue(name, index);
      index += 1;
      if (name === "remove-requirement") input.removedRequirements.push(value);
      else input.removedScenarios.push(value);
      continue;
    }
    if (name === "target-spec") {
      if (input.targetSpec !== undefined) throw new Error("--target-spec may only be supplied once");
      input.targetSpec = readValue(name, index);
      index += 1;
      continue;
    }
    if (name === "spec-path") {
      if (input.specPath !== undefined) throw new Error("--spec-path may only be supplied once");
      input.specPath = readValue(name, index);
      index += 1;
      continue;
    }
    if (name === "title") {
      if (input.title !== undefined) throw new Error("--title may only be supplied once");
      input.title = readValue(name, index);
      index += 1;
      continue;
    }
    if (name === "new-spec-path") {
      if (input.newSpecPath !== undefined) throw new Error("--new-spec-path may only be supplied once");
      input.newSpecPath = readValue(name, index);
      index += 1;
      continue;
    }
    if (name === "operation") {
      finalizeRequirement();
      currentOperation = readValue(name, index);
      hasPendingOperation = true;
      index += 1;
      continue;
    }
    if (name === "requirement") {
      finalizeRequirement();
      if (!currentOperation) {
        throw new Error("missing required argument --operation before --requirement");
      }
      currentRequirement = {
        operation: currentOperation,
        id: readValue(name, index),
        scenarios: [],
      };
      hasPendingOperation = false;
      index += 1;
      continue;
    }
    if (name === "strength" || name === "statement" || name === "reason") {
      const requirement = ensureRequirement(name);
      if (requirement[name] !== undefined) {
        throw new Error(`--${name} may only be supplied once per requirement`);
      }
      requirement[name] = readValue(name, index);
      index += 1;
      continue;
    }
    if (name === "scenario") {
      const requirement = ensureRequirement(name);
      finalizeScenario();
      currentScenario = {
        id: readValue(name, index),
        steps: [],
      };
      if (requirement.operation === "REMOVED") {
        throw new Error(`--scenario is not valid for removed requirement '${requirement.id}'`);
      }
      index += 1;
      continue;
    }
    if (name === "given" || name === "when" || name === "then" || name === "and") {
      if (!currentScenario) {
        throw new Error(`missing required argument --scenario before --${name}`);
      }
      currentScenario.steps.push({ [name.toUpperCase()]: readValue(name, index) });
      index += 1;
      continue;
    }

    throw new Error(`unsupported argument(s): --${name}`);
  }

  finalizeRequirement();
  if (hasPendingOperation) {
    throw new Error("missing required argument --requirement");
  }
  return input;
}

function buildDeltaInputFromArgs(rootDir: string, changeName: string, argv: string[]): GenerationInputRecord {
  const commandInput = parseDeltaCommandInput(argv, rootDir);
  const targetSpec = commandInput.targetSpec;
  if (!targetSpec) {
    throw new Error("missing required argument --target-spec");
  }
  const input = existingDeltaInput(rootDir, changeName, targetSpec, commandInput.specPath);

  if (commandInput.title !== undefined || commandInput.newSpecPath !== undefined) {
    if (commandInput.title === undefined || commandInput.newSpecPath === undefined) {
      throw new Error("--title and --new-spec-path must be supplied together to create a new main spec");
    }
    input.spec = { title: commandInput.title, path: commandInput.newSpecPath };
  }

  const session = newWriteSession();
  const operations = isRecord(input.operations) ? input.operations : {};

  // Removals run before upserts so one invocation can drop a requirement and restate it.
  for (const requirementId of commandInput.removedRequirements) {
    for (const operationMap of Object.values(operations)) {
      if (isRecord(operationMap)) removeKeyedItem(operationMap, requirementId);
    }
  }
  for (const target of commandInput.removedScenarios) {
    const separatorAt = target.indexOf(":");
    if (separatorAt === -1) {
      throw new Error(`--remove-scenario expects <requirement-id>:<scenario-id>, got '${target}'`);
    }
    const requirementId = target.slice(0, separatorAt);
    const scenarioId = target.slice(separatorAt + 1);
    for (const operationMap of Object.values(operations)) {
      if (!isRecord(operationMap)) continue;
      const requirement = operationMap[requirementId];
      if (isRecord(requirement) && isRecord(requirement.scenarios)) {
        removeKeyedItem(requirement.scenarios, scenarioId);
      }
    }
  }

  for (const requirement of commandInput.requirements) {
    if (!["ADDED", "MODIFIED", "REMOVED"].includes(requirement.operation)) {
      throw new Error("--operation must be one of: ADDED, MODIFIED, REMOVED");
    }
    const operationMap = isRecord(operations[requirement.operation])
      ? operations[requirement.operation] as GenerationInputRecord
      : {};

    if (requirement.operation === "REMOVED") {
      if (!requirement.reason) throw new Error(`missing required argument --reason for removed requirement '${requirement.id}'`);
      if (requirement.strength || requirement.statement || requirement.scenarios.length > 0) {
        throw new Error(`removed requirement '${requirement.id}' only supports --reason`);
      }
      upsertKeyedItem(operationMap, requirement.id, { reason: requirement.reason }, "delta requirement", session);
      operations[requirement.operation] = operationMap;
      continue;
    }

    if (!requirement.strength) throw new Error(`missing required argument --strength for requirement '${requirement.id}'`);
    if (!requirement.statement) throw new Error(`missing required argument --statement for requirement '${requirement.id}'`);
    if (requirement.reason) {
      throw new Error(`--reason is only valid with removed requirement '${requirement.id}'`);
    }

    const scenarios: GenerationInputRecord = {};
    for (const scenario of requirement.scenarios) {
      const existingScenario = scenarios[scenario.id];
      if (existingScenario === undefined) {
        scenarios[scenario.id] = scenario.steps;
        continue;
      }
      if (!deepEqual(existingScenario, scenario.steps)) {
        throw new Error(`duplicate scenario '${scenario.id}' has conflicting content`);
      }
    }
    mergeDeltaRequirement(operationMap, requirement.id, {
      strength: requirement.strength,
      statement: requirement.statement,
      scenarios,
    }, session);
    operations[requirement.operation] = operationMap;
  }
  input.operations = operations;
  return input;
}

function normalizeDeltaTechRelativePath(relativePath: string): string {
  let normalized = relativePath.replaceAll("\\", "/");
  const strictTechPrefix = `${STRICT_WORKFLOW_DIR}/tech/`;
  if (normalized.startsWith(strictTechPrefix)) {
    normalized = normalized.slice(strictTechPrefix.length);
  }
  return normalized;
}

function readTechIndexPathForTarget(rootDir: string, targetStandard: string): string | undefined {
  const index = readYamlIfExists<{ standards?: Array<{ id?: unknown; path?: unknown }> }>(
    rootDir,
    `${STRICT_WORKFLOW_DIR}/tech/INDEX.yaml`,
  );
  const match = (index?.standards ?? []).find((candidate) => candidate.id === targetStandard);
  return typeof match?.path === "string" ? normalizeDeltaTechRelativePath(match.path) : undefined;
}

function resolveDeltaTechExistingPath(rootDir: string, targetStandard: string, techPath: string | undefined): string {
  if (techPath) {
    return normalizeDeltaTechRelativePath(techPath);
  }
  const indexedPath = readTechIndexPathForTarget(rootDir, targetStandard);
  if (indexedPath) return indexedPath;
  return `${targetStandard}.yaml`;
}

function emptyDeltaTechInput(targetStandard: string, techPath: string): GenerationInputRecord {
  return {
    target_standard: targetStandard,
    tech_path: techPath,
    operations: { ADDED: {}, MODIFIED: {}, REMOVED: {} },
  };
}

function existingDeltaTechInput(
  rootDir: string,
  changeName: string,
  targetStandard: string,
  techPath: string | undefined,
): GenerationInputRecord {
  const relativeTechPath = resolveDeltaTechExistingPath(rootDir, targetStandard, techPath);
  const artifact = readYamlIfExists<GenerationInputRecord>(
    rootDir,
    `${STRICT_WORKFLOW_DIR}/changes/${changeName}/tech/${relativeTechPath}`,
  );
  if (!artifact) {
    return emptyDeltaTechInput(targetStandard, relativeTechPath);
  }
  const input: GenerationInputRecord = {
    target_standard: artifact.target_standard ?? targetStandard,
    tech_path: relativeTechPath,
    operations: isRecord(artifact.operations) ? artifact.operations : { ADDED: {}, MODIFIED: {}, REMOVED: {} },
  };
  if (isRecord(artifact.standard)) {
    input.standard = artifact.standard;
  }
  return input;
}

type TechRuleGroup = {
  operation: string;
  id: string;
  strength?: string;
  statement?: string;
  rationale?: string;
  method?: string;
  detail?: string;
  reason?: string;
  examplesGood: string[];
  examplesBad: string[];
  exceptions: string[];
};

type DeltaTechCommandInput = {
  removedRules: string[];
  targetStandard?: string;
  techPath?: string;
  title?: string;
  category?: string;
  rules: TechRuleGroup[];
};

function parseDeltaTechCommandInput(argv: string[], rootDir: string): DeltaTechCommandInput {
  const input: DeltaTechCommandInput = {
    rules: [],
    removedRules: [],
  };
  let currentOperation: string | undefined;
  let hasPendingOperation = false;
  let currentRule: TechRuleGroup | undefined;

  function readValue(name: string, index: number): string {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`missing value for --${name}`);
    }
    return resolveStringValue(value, rootDir);
  }

  function ensureRule(flagName: string): TechRuleGroup {
    if (!currentRule) {
      throw new Error(`missing required argument --rule before --${flagName}`);
    }
    return currentRule;
  }

  function finalizeRule(): void {
    if (!currentRule) return;
    input.rules.push(currentRule);
    currentRule = undefined;
  }

  const onceScalar = new Set(["strength", "statement", "rationale", "method", "detail", "reason"]);

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--") || token.length === 2) {
      throw new Error(`expected named argument, got '${token ?? ""}'`);
    }

    const name = token.slice(2);
    if (name === "remove-rule") {
      input.removedRules.push(readValue(name, index));
      index += 1;
      continue;
    }
    if (name === "target-standard") {
      if (input.targetStandard !== undefined) throw new Error("--target-standard may only be supplied once");
      input.targetStandard = readValue(name, index);
      index += 1;
      continue;
    }
    if (name === "tech-path") {
      if (input.techPath !== undefined) throw new Error("--tech-path may only be supplied once");
      input.techPath = readValue(name, index);
      index += 1;
      continue;
    }
    if (name === "title") {
      if (input.title !== undefined) throw new Error("--title may only be supplied once");
      input.title = readValue(name, index);
      index += 1;
      continue;
    }
    if (name === "category") {
      if (input.category !== undefined) throw new Error("--category may only be supplied once");
      input.category = readValue(name, index);
      index += 1;
      continue;
    }
    if (name === "operation") {
      finalizeRule();
      currentOperation = readValue(name, index);
      hasPendingOperation = true;
      index += 1;
      continue;
    }
    if (name === "rule") {
      finalizeRule();
      if (!currentOperation) {
        throw new Error("missing required argument --operation before --rule");
      }
      currentRule = {
        operation: currentOperation,
        id: readValue(name, index),
        examplesGood: [],
        examplesBad: [],
        exceptions: [],
      };
      hasPendingOperation = false;
      index += 1;
      continue;
    }
    if (onceScalar.has(name)) {
      const rule = ensureRule(name);
      const key = name as "strength" | "statement" | "rationale" | "method" | "detail" | "reason";
      if (rule[key] !== undefined) {
        throw new Error(`--${name} may only be supplied once per rule`);
      }
      rule[key] = readValue(name, index);
      index += 1;
      continue;
    }
    if (name === "example-good") {
      ensureRule(name).examplesGood.push(readValue(name, index));
      index += 1;
      continue;
    }
    if (name === "example-bad") {
      ensureRule(name).examplesBad.push(readValue(name, index));
      index += 1;
      continue;
    }
    if (name === "exception") {
      ensureRule(name).exceptions.push(readValue(name, index));
      index += 1;
      continue;
    }

    throw new Error(`unsupported argument(s): --${name}`);
  }

  finalizeRule();
  if (hasPendingOperation) {
    throw new Error("missing required argument --rule");
  }
  return input;
}

function buildDeltaTechInputFromArgs(rootDir: string, changeName: string, argv: string[]): GenerationInputRecord {
  const commandInput = parseDeltaTechCommandInput(argv, rootDir);
  const targetStandard = commandInput.targetStandard;
  if (!targetStandard) {
    throw new Error("missing required argument --target-standard");
  }
  const input = existingDeltaTechInput(rootDir, changeName, targetStandard, commandInput.techPath);
  const session = newWriteSession();

  if (commandInput.title !== undefined || commandInput.category !== undefined) {
    if (commandInput.title === undefined || commandInput.category === undefined) {
      throw new Error("--title and --category must be supplied together to define a new standard");
    }
    input.standard = { title: commandInput.title, category: commandInput.category };
  }

  const operations = isRecord(input.operations) ? input.operations : {};
  for (const ruleId of commandInput.removedRules) {
    for (const operationMap of Object.values(operations)) {
      if (isRecord(operationMap)) removeKeyedItem(operationMap, ruleId);
    }
  }
  for (const rule of commandInput.rules) {
    if (!["ADDED", "MODIFIED", "REMOVED"].includes(rule.operation)) {
      throw new Error("--operation must be one of: ADDED, MODIFIED, REMOVED");
    }
    const operationMap = isRecord(operations[rule.operation])
      ? operations[rule.operation] as GenerationInputRecord
      : {};

    if (rule.operation === "REMOVED") {
      if (!rule.reason) throw new Error(`missing required argument --reason for removed rule '${rule.id}'`);
      if (rule.strength || rule.statement || rule.rationale || rule.method || rule.detail
        || rule.examplesGood.length > 0 || rule.examplesBad.length > 0 || rule.exceptions.length > 0) {
        throw new Error(`removed rule '${rule.id}' only supports --reason`);
      }
      upsertKeyedItem(operationMap, rule.id, { reason: rule.reason }, "delta tech rule", session);
      operations[rule.operation] = operationMap;
      continue;
    }

    if (!rule.strength) throw new Error(`missing required argument --strength for rule '${rule.id}'`);
    if (!rule.statement) throw new Error(`missing required argument --statement for rule '${rule.id}'`);
    if (!rule.rationale) throw new Error(`missing required argument --rationale for rule '${rule.id}'`);
    if (!rule.method) throw new Error(`missing required argument --method for rule '${rule.id}'`);
    if (rule.reason) throw new Error(`--reason is only valid with removed rule '${rule.id}'`);

    const ruleValue: GenerationInputRecord = {
      strength: rule.strength,
      statement: rule.statement,
      rationale: rule.rationale,
      enforcement: rule.detail !== undefined
        ? { method: rule.method, detail: rule.detail }
        : { method: rule.method },
    };
    if (rule.examplesGood.length > 0 || rule.examplesBad.length > 0) {
      const examples: GenerationInputRecord = {};
      if (rule.examplesGood.length > 0) examples.good = rule.examplesGood;
      if (rule.examplesBad.length > 0) examples.bad = rule.examplesBad;
      ruleValue.examples = examples;
    }
    if (rule.exceptions.length > 0) {
      ruleValue.exceptions = rule.exceptions;
    }
    upsertKeyedItem(operationMap, rule.id, ruleValue, "delta tech rule", session);
    operations[rule.operation] = operationMap;
  }
  input.operations = operations;
  return input;
}

type SceneStepGroup = {
  operation: string;
  /** Undefined addresses the main flow; a value addresses one named exception flow. */
  flowId?: string;
  stepId: string;
  action?: string;
  coveredBy: Array<{ spec_id: string; requirement_id: string }>;
  noCoverageReason?: string;
  reason?: string;
};

type DeltaSceneCommandInput = {
  targetScene?: string;
  title?: string;
  area?: string;
  actors: Array<{ name: string; role: string }>;
  preconditions: string[];
  steps: SceneStepGroup[];
  triggers: Array<{ operation: string; flowId: string; trigger: string }>;
  removedSteps: string[];
};

function parseSceneCoverageReference(value: string, flagName: string): { spec_id: string; requirement_id: string } {
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(`--${flagName} expects <spec-id>:<requirement-id>, received '${value}'`);
  }
  return { spec_id: value.slice(0, separator), requirement_id: value.slice(separator + 1) };
}

function parseFlowStepReference(value: string, flagName: string): { flowId: string; stepId: string } {
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(`--${flagName} expects <flow-id>:<step-id>, received '${value}'`);
  }
  return { flowId: value.slice(0, separator), stepId: value.slice(separator + 1) };
}

/** Every field a new-scene block must carry, paired with the arguments that supply it. */
const NEW_SCENE_BLOCK_FIELDS = [
  { key: "title", flags: "--title <text>" },
  { key: "area", flags: "--area <area>" },
  { key: "actors", flags: "--actor <name> --role <text>" },
  { key: "preconditions", flags: "--precondition <text>" },
] as const;

function parseDeltaSceneCommandInput(argv: string[], rootDir: string): DeltaSceneCommandInput {
  const input: DeltaSceneCommandInput = { actors: [], preconditions: [], steps: [], triggers: [], removedSteps: [] };
  let currentOperation: string | undefined;
  let currentStep: SceneStepGroup | undefined;
  let pendingExceptionFlow: string | undefined;

  function readValue(name: string, index: number): string {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for --${name}`);
    return resolveStringValue(value, rootDir);
  }

  function requireOperation(flagName: string): string {
    if (currentOperation === undefined) throw new Error(`missing required argument --operation before --${flagName}`);
    return currentOperation;
  }

  function requireStep(flagName: string): SceneStepGroup {
    if (currentStep === undefined) {
      throw new Error(`--${flagName} requires an open step; supply --step <id> or --exception-step <flow-id>:<step-id> first`);
    }
    return currentStep;
  }

  function openStep(group: SceneStepGroup): void {
    input.steps.push(group);
    currentStep = group;
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--") || token.length === 2) {
      throw new Error(`expected named argument, got '${token ?? ""}'`);
    }
    const equals = token.indexOf("=");
    const name = equals === -1 ? token.slice(2) : token.slice(2, equals);
    const value = equals === -1 ? undefined : resolveStringValue(token.slice(equals + 1), rootDir);
    const take = (): string => {
      if (value !== undefined) return value;
      const read = readValue(name, index);
      index += 1;
      return read;
    };

    switch (name) {
      case "target-scene":
        if (input.targetScene !== undefined) throw new Error("--target-scene may only be supplied once");
        input.targetScene = take();
        break;
      case "title":
        if (input.title !== undefined) throw new Error("--title may only be supplied once");
        input.title = take();
        break;
      case "area":
        if (input.area !== undefined) throw new Error("--area may only be supplied once");
        input.area = take();
        break;
      case "actor":
        input.actors.push({ name: take(), role: "" });
        break;
      case "role": {
        const actor = input.actors[input.actors.length - 1];
        if (actor === undefined || actor.role !== "") {
          throw new Error("--role requires a preceding --actor naming the actor it describes");
        }
        actor.role = take();
        break;
      }
      case "precondition":
        input.preconditions.push(take());
        break;
      case "operation":
        currentOperation = take();
        currentStep = undefined;
        pendingExceptionFlow = undefined;
        break;
      case "exception-flow":
        pendingExceptionFlow = take();
        currentStep = undefined;
        break;
      case "trigger": {
        const trigger = take();
        if (pendingExceptionFlow === undefined) {
          throw new Error("--trigger requires a preceding --exception-flow naming the flow it describes");
        }
        input.triggers.push({ operation: requireOperation("trigger"), flowId: pendingExceptionFlow, trigger });
        break;
      }
      case "step":
        openStep({ operation: requireOperation("step"), stepId: take(), coveredBy: [] });
        break;
      case "exception-step": {
        const reference = parseFlowStepReference(take(), "exception-step");
        openStep({
          operation: requireOperation("exception-step"),
          flowId: reference.flowId,
          stepId: reference.stepId,
          coveredBy: [],
        });
        break;
      }
      case "action": {
        const step = requireStep("action");
        if (step.action !== undefined) throw new Error(`--action may be supplied once per step, repeated for '${step.stepId}'`);
        step.action = take();
        break;
      }
      case "covered-by":
        requireStep("covered-by").coveredBy.push(parseSceneCoverageReference(take(), "covered-by"));
        break;
      case "no-coverage-reason": {
        const step = requireStep("no-coverage-reason");
        if (step.noCoverageReason !== undefined) {
          throw new Error(`--no-coverage-reason may be supplied once per step, repeated for '${step.stepId}'`);
        }
        step.noCoverageReason = take();
        break;
      }
      case "reason": {
        const step = requireStep("reason");
        if (step.reason !== undefined) throw new Error(`--reason may be supplied once per step, repeated for '${step.stepId}'`);
        step.reason = take();
        break;
      }
      case "remove-step":
        input.removedSteps.push(take());
        break;
      default:
        throw new Error(`unsupported argument --${name}`);
    }
  }
  return input;
}

/**
 * A delta scene sits at the same area-and-id path beneath the change as the main scene it targets.
 * The area is read from an already-written delta first, so a repeated call resolves the same file
 * even before the targeted scene exists in the main store.
 */
function resolveDeltaSceneRelativePath(
  rootDir: string,
  changeName: string,
  targetScene: string,
  declaredArea: string | undefined,
): string | undefined {
  const changeScenesDir = path.join(rootDir, STRICT_WORKFLOW_DIR, "changes", changeName, "scenes");
  if (existsSync(changeScenesDir)) {
    for (const areaName of readdirSync(changeScenesDir).sort()) {
      if (existsSync(path.join(changeScenesDir, areaName, `${targetScene}.yaml`))) return `${areaName}/${targetScene}.yaml`;
    }
  }
  const indexPath = path.join(rootDir, STRICT_WORKFLOW_DIR, "scenes", "INDEX.yaml");
  if (existsSync(indexPath)) {
    const index = parseYamlDocument<{ areas?: Record<string, Record<string, unknown>> }>(
      readFileSync(indexPath, "utf8"),
      { source: indexPath },
    );
    for (const [area, scenes] of Object.entries(index.areas ?? {})) {
      if (isRecord(scenes) && Object.prototype.hasOwnProperty.call(scenes, targetScene)) return `${area}/${targetScene}.yaml`;
    }
  }
  return declaredArea === undefined ? undefined : `${declaredArea}/${targetScene}.yaml`;
}

function buildDeltaSceneInputFromArgs(rootDir: string, changeName: string, argv: string[]): GenerationInputRecord {
  const commandInput = parseDeltaSceneCommandInput(argv, rootDir);
  const targetScene = commandInput.targetScene;
  if (!targetScene) throw new Error("missing required argument --target-scene");
  if ((commandInput.title === undefined) !== (commandInput.area === undefined)) {
    throw new Error("--title and --area must be supplied together to define a new scene");
  }
  const namelessActor = commandInput.actors.find((actor) => actor.role === "");
  if (namelessActor !== undefined) {
    throw new Error(`actor '${namelessActor.name}' has no role; follow each --actor with --role <text>`);
  }

  // Actors and preconditions belong to the scene rather than to any flow step, so a delta may only
  // supply them for a scene it creates; a recorded scene's own edit path is the scene command.
  if ((commandInput.actors.length > 0 || commandInput.preconditions.length > 0)
    && readSceneAreaForTarget(rootDir, targetScene) !== undefined) {
    throw new Error(
      `scene '${targetScene}' is already recorded, so a delta may not restate its actors or preconditions; `
      + `edit them directly with 'strict-spec-cli scene-edit ${targetScene} --actor <name> --role <text> --precondition <text>'`,
    );
  }

  const relativePath = resolveDeltaSceneRelativePath(rootDir, changeName, targetScene, commandInput.area);
  const existing = relativePath === undefined
    ? undefined
    : readYamlIfExists<GenerationInputRecord>(
      rootDir,
      `${STRICT_WORKFLOW_DIR}/changes/${changeName}/scenes/${relativePath}`,
    );

  const input: GenerationInputRecord = {
    target_scene: targetScene,
    operations: existing && isRecord(existing.operations)
      ? existing.operations
      : { ADDED: {}, MODIFIED: {}, REMOVED: {} },
  };
  // The new-scene block carries the sections no flow step references. It is assembled across calls
  // the way every other generated artifact is, so an author may name the scene in one invocation and
  // add an actor in the next, and it is only checked for completeness once something declares it.
  const sceneBlock: GenerationInputRecord = existing && isRecord(existing.scene) ? { ...existing.scene } : {};
  if (commandInput.title !== undefined) sceneBlock.title = commandInput.title;
  if (commandInput.area !== undefined) sceneBlock.area = commandInput.area;
  if (commandInput.actors.length > 0) {
    const actors = Array.isArray(sceneBlock.actors)
      ? [...sceneBlock.actors] as Array<{ name: string; role: string }>
      : [];
    for (const actor of commandInput.actors) {
      const recorded = actors.find((entry) => entry.name === actor.name);
      if (recorded === undefined) actors.push({ ...actor });
      else recorded.role = actor.role;
    }
    sceneBlock.actors = actors;
  }
  if (commandInput.preconditions.length > 0) {
    const preconditions = Array.isArray(sceneBlock.preconditions) ? [...sceneBlock.preconditions] as string[] : [];
    for (const value of commandInput.preconditions) {
      if (!preconditions.includes(value)) preconditions.push(value);
    }
    sceneBlock.preconditions = preconditions;
  }
  if (Object.keys(sceneBlock).length > 0) {
    const missing = NEW_SCENE_BLOCK_FIELDS.filter((field) => sceneBlock[field.key] === undefined);
    if (missing.length > 0) {
      throw new Error(
        `the new-scene block for '${targetScene}' is incomplete; supply ${missing.map((field) => field.flags).join(" and ")}, `
        + "because the main scene contract requires a title, an area, at least one actor, and at least one precondition",
      );
    }
    input.scene = sceneBlock;
  }

  const operations = isRecord(input.operations) ? input.operations : {};
  const session = newWriteSession();

  // Removing the last step of a flow must take the flow container with it. Both step maps declare a
  // minimum of one entry, and an exception flow requires its steps, so a container left empty by a
  // removal would be refused by the delta's own schema on the very next write.
  for (const reference of commandInput.removedSteps) {
    const separator = reference.indexOf(":");
    for (const operationMap of Object.values(operations)) {
      if (!isRecord(operationMap)) continue;
      if (separator === -1) {
        if (!isRecord(operationMap.main_flow)) continue;
        removeKeyedItem(operationMap.main_flow, reference);
        if (Object.keys(operationMap.main_flow).length === 0) delete operationMap.main_flow;
        continue;
      }
      const flows = operationMap.exception_flows;
      if (!isRecord(flows)) continue;
      const flowId = reference.slice(0, separator);
      const flow = flows[flowId];
      if (!isRecord(flow) || !isRecord(flow.steps)) continue;
      removeKeyedItem(flow.steps, reference.slice(separator + 1));
      if (Object.keys(flow.steps).length === 0) delete flows[flowId];
      if (Object.keys(flows).length === 0) delete operationMap.exception_flows;
    }
  }

  for (const entry of [...commandInput.triggers, ...commandInput.steps]) {
    if (!["ADDED", "MODIFIED", "REMOVED"].includes(entry.operation)) {
      throw new Error("--operation must be one of: ADDED, MODIFIED, REMOVED");
    }
  }

  function operationMapFor(operation: string): GenerationInputRecord {
    const existingMap = isRecord(operations[operation]) ? operations[operation] as GenerationInputRecord : {};
    operations[operation] = existingMap;
    return existingMap;
  }

  function exceptionFlowFor(operation: string, flowId: string): GenerationInputRecord {
    const operationMap = operationMapFor(operation);
    const flows = isRecord(operationMap.exception_flows) ? operationMap.exception_flows as GenerationInputRecord : {};
    operationMap.exception_flows = flows;
    const flow = isRecord(flows[flowId]) ? flows[flowId] as GenerationInputRecord : {};
    flows[flowId] = flow;
    return flow;
  }

  for (const declaration of commandInput.triggers) {
    if (declaration.operation === "REMOVED") {
      throw new Error(`a REMOVED exception flow takes no --trigger; drop its steps with --exception-step instead`);
    }
    exceptionFlowFor(declaration.operation, declaration.flowId).trigger = declaration.trigger;
  }

  for (const step of commandInput.steps) {
    const stepValue: GenerationInputRecord = {};
    if (step.operation === "REMOVED") {
      if (!step.reason) throw new Error(`missing required argument --reason for removed step '${step.stepId}'`);
      if (step.action || step.coveredBy.length > 0 || step.noCoverageReason) {
        throw new Error(`removed step '${step.stepId}' only supports --reason`);
      }
      stepValue.reason = step.reason;
    } else {
      if (step.reason) throw new Error(`--reason is only valid with a REMOVED step, supplied for '${step.stepId}'`);
      if (step.coveredBy.length > 0 && step.noCoverageReason !== undefined) {
        throw new Error(
          `step '${step.stepId}' may declare covering requirements or a no-coverage reason, not both`,
        );
      }
      if (step.coveredBy.length === 0 && step.noCoverageReason === undefined) {
        throw new Error(
          `step '${step.stepId}' requires --covered-by or --no-coverage-reason, because a step declaring neither would pass as though it were covered`,
        );
      }
      if (!step.action) throw new Error(`missing required argument --action for step '${step.stepId}'`);
      stepValue.action = step.action;
      if (step.coveredBy.length > 0) stepValue.covered_by = step.coveredBy;
      else stepValue.no_coverage_reason = step.noCoverageReason;
    }

    const container = step.flowId === undefined
      ? (() => {
        const operationMap = operationMapFor(step.operation);
        const mainFlow = isRecord(operationMap.main_flow) ? operationMap.main_flow as GenerationInputRecord : {};
        operationMap.main_flow = mainFlow;
        return mainFlow;
      })()
      : (() => {
        const flow = exceptionFlowFor(step.operation, step.flowId as string);
        const steps = isRecord(flow.steps) ? flow.steps as GenerationInputRecord : {};
        flow.steps = steps;
        return steps;
      })();
    upsertKeyedItem(container, step.stepId, stepValue, "delta scene step", session);
  }

  input.operations = operations;
  return input;
}

/** Flags that identify which artifact --delete targets, and so may accompany it. */
const DELETE_COMPANION_FLAGS = new Set(["delete", "target-spec", "spec-path", "target-standard", "tech-path", "target-scene"]);

/** Artifacts --delete refuses, with the reason reported to the caller. */
const DELETE_REFUSALS: Partial<Record<GeneratableArtifact, string>> = {
  questions:
    "questions.yaml holds the requirement-interrogation entries, which no flag may clear; remove a technical question with --remove-question instead",
  proposal:
    "proposal.yaml is required for every change and is merged rather than rebuilt; restate the fields you want to change instead",
};

/**
 * Resolves the artifact file --delete removes. Delta artifacts cannot be located without their
 * identity flag, which is why --delete excludes editing flags rather than requiring it be alone.
 */
function resolveDeleteTarget(
  rootDir: string,
  changeName: string,
  artifact: GeneratableArtifact,
  flags: FlagMap,
): string {
  const changeDir = `${STRICT_WORKFLOW_DIR}/changes/${changeName}`;
  if (artifact === "delta-spec") {
    const targetSpec = requiredOne(flags, "target-spec");
    return `${changeDir}/specs/${resolveDeltaExistingPath(rootDir, targetSpec, optionalOne(flags, "spec-path"))}`;
  }
  if (artifact === "delta-tech") {
    const targetStandard = requiredOne(flags, "target-standard");
    return `${changeDir}/tech/${resolveDeltaTechExistingPath(rootDir, targetStandard, optionalOne(flags, "tech-path"))}`;
  }
  if (artifact === "delta-scene") {
    const targetScene = requiredOne(flags, "target-scene");
    const relativePath = resolveDeltaSceneRelativePath(rootDir, changeName, targetScene, undefined);
    if (relativePath === undefined) {
      throw new Error(`no delta scene for '${targetScene}' is recorded in change '${changeName}'`);
    }
    return `${changeDir}/scenes/${relativePath}`;
  }
  return `${changeDir}/${artifact}.yaml`;
}

type DeleteResult = {
  changeName: string;
  artifact: GeneratableArtifact;
  artifactPath: string;
  deleted: boolean;
};

const DELETE_SCHEMA_IDS: Record<GeneratableArtifact, string> = {
  proposal: "change_proposal",
  design: "change_design",
  questions: "question_list",
  tasks: "task_list",
  "delta-spec": "delta_spec",
  "delta-tech": "delta_tech",
  "delta-scene": "delta_scene",
};

function runArtifactDelete(
  rootDir: string,
  changeName: string,
  artifact: GeneratableArtifact,
  argv: string[],
): DeleteResult {
  const flags = parseFlagMap(argv, rootDir);
  const refusal = DELETE_REFUSALS[artifact];
  if (refusal) {
    throw new Error(`--delete is not supported for ${artifact}: ${refusal}`);
  }
  const editingFlags = Object.keys(flags).filter((flag) => !DELETE_COMPANION_FLAGS.has(flag));
  if (editingFlags.length > 0) {
    throw new Error(
      `--delete cannot be combined with editing argument(s): ${editingFlags.map((flag) => `--${flag}`).join(", ")}`,
    );
  }

  // Deleting the task list would discard recorded completions in one step, which is the class of
  // loss this command set exists to prevent, so completed work blocks it and must be removed by id.
  if (artifact === "tasks") {
    const completed = completedTaskIds(rootDir, changeName);
    if (completed.length > 0) {
      throw new Error(
        `--delete would discard completed task(s): ${completed.join(", ")}; remove them by id with --remove first`,
      );
    }
  }

  const artifactPath = resolveDeleteTarget(rootDir, changeName, artifact, flags);
  const absolutePath = path.join(rootDir, artifactPath);
  const deleted = existsSync(absolutePath);
  if (deleted) {
    const mutation = commitYamlMutation({
      rootDir,
      mutations: [{
        artifactFamily: artifact === "delta-spec" || artifact === "delta-tech"
          || artifact === "delta-scene"
          ? "change-delta-state"
          : "change-planning-state",
        artifactId: `${changeName}/${artifact}`,
        schemaId: DELETE_SCHEMA_IDS[artifact],
        familyRoot: path.join(rootDir, STRICT_WORKFLOW_DIR, "changes", changeName),
        absolutePath,
        operation: "delete",
      }],
    });
    if (!mutation.valid) {
      throw new Error(
        `failed to delete ${artifact} artifact: ${mutation.diagnostics.map((entry) => `${entry.code} ${entry.artifactPath} ${entry.fieldPath}: ${entry.message}`).join("; ")}`,
      );
    }
  }
  return { changeName, artifact, artifactPath, deleted };
}

function buildInputFromNamedArgs(
  rootDir: string,
  changeName: string,
  artifact: GeneratableArtifact,
  argv: string[],
  removalOutcome?: TaskRemovalOutcome,
): GenerationInputRecord {
  switch (artifact) {
    case "proposal":
      return buildProposalInput(rootDir, changeName, parseFlagMap(argv, rootDir));
    case "design":
      return buildDesignInput(rootDir, changeName, parseFlagMap(argv, rootDir));
    case "questions":
      return buildQuestionsInputFromArgs(rootDir, changeName, argv);
    case "tasks":
      return buildTaskListInputFromArgs(rootDir, changeName, argv, removalOutcome);
    case "delta-spec":
      return buildDeltaInputFromArgs(rootDir, changeName, argv);
    case "delta-tech":
      return buildDeltaTechInputFromArgs(rootDir, changeName, argv);
    case "delta-scene":
      return buildDeltaSceneInputFromArgs(rootDir, changeName, argv);
  }
}

export function runGenerate(argv: string[]): number {
  const [changeName, artifact, firstInputArg, ...extraArgs] = argv;
  if (handleHelpRequest("generate", argv)) {
    return 0;
  }
  if (!changeName || !artifact || !firstInputArg) {
    writeUsage(usage());
    return 1;
  }
  if (!CHANGE_NAME_PATTERN.test(changeName)) {
    writeError("change name must be kebab-case (lowercase letters, numbers, and hyphens)");
    return 1;
  }
  if (!isGeneratableArtifact(artifact)) {
    writeError("artifact must be one of: proposal, design, questions, tasks, delta-spec, delta-tech, delta-scene");
    return 1;
  }

  try {
    if (!firstInputArg.startsWith("--")) {
      writeUsage(usage());
      return 1;
    }

    const namedArgs = [firstInputArg, ...extraArgs];
    if (namedArgs.includes("--delete")) {
      writeJson(runArtifactDelete(process.cwd(), changeName, artifact, namedArgs));
      return 0;
    }
    const removalOutcome: TaskRemovalOutcome = { removed: [], unmatched: [] };
    const input = buildInputFromNamedArgs(process.cwd(), changeName, artifact, namedArgs, removalOutcome);
    const result = generateChangeArtifactFromInput(process.cwd(), changeName, artifact, input);
    if (removalOutcome.removed.length > 0) result.removedTasks = removalOutcome.removed;
    if (removalOutcome.unmatched.length > 0) result.unmatchedRemovals = removalOutcome.unmatched;
    writeJson(result);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeError(message);
    return 1;
  }
}
