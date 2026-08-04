import { existsSync, readFileSync } from "fs";
import path from "path";
import {
  generateChangeArtifactFromInput,
  type GeneratableArtifact,
  type GenerationInputRecord,
  isGeneratableArtifact,
  TASK_SECTION_NAMES,
} from "../propose-generation.js";
import { parseYamlDocument } from "../yaml.js";
import { CHANGE_NAME_PATTERN, handleHelpRequest } from "./argv.js";
import { getCommandUsage } from "./command-metadata.js";
import { writeError, writeJson, writeUsage } from "./output.js";

const STRICT_WORKFLOW_DIR = ".strict-spec-driven";
const BOOLEAN_FLAGS = new Set(["reset"]);

type FlagMap = Record<string, string[]>;

function usage(): string {
  return [
    "Usage: strict-spec-cli generate <change-name> <proposal|design|questions|tasks|delta-spec|delta-tech> --<named-args>",
    "",
    "Examples:",
    "  strict-spec-cli generate <change-name> proposal --what <text> --why <text> [--in <text>] [--out <text>] [--unchanged <text>]",
    "  strict-spec-cli generate <change-name> design [--reset] --approach <text> [--decision <id> --decision-text <text> --rationale <text>]",
    "  strict-spec-cli generate <change-name> questions [--reset] [(--open <id> --question <text> --context <text>)|(--resolved <id> --question <text> --context <text> --answer <text>)|(--resolve <id> --answer <text>)] [--kind <requirement|technical>] [--answered-by <human|roadmap|assumption>]...",
    "  strict-spec-cli generate <change-name> tasks [--reset [--force]] [--section <Implementation|Testing|Verification> --task <id> [--text <text>] [--status <pending|complete>] [--command <text>]]... [--remove <id>]... [--validation-task <id>] [--unit-test-task <id>]",
    "  strict-spec-cli generate <change-name> delta-spec --target-spec <id> [--spec-path <path>] [--title <text> --new-spec-path <repo-relative-path>] [--reset] [--implementation <path>] [--test <path>] [--operation <ADDED|MODIFIED|REMOVED> --requirement <id> ...]...",
    "  strict-spec-cli generate <change-name> delta-tech --target-standard <id> [--tech-path <path>] [--reset] [--title <text> --category <cat>] [--implementation <path>] [--enforcement <path>] [--operation <ADDED|MODIFIED|REMOVED> --rule <id> --strength <MUST|SHOULD|MAY> --statement <text> --rationale <text> --method <lint|ci|test|review|manual> [--detail <text>] [--example-good <text>] [--example-bad <text>] [--exception <text>] | --rule <id> --reason <text>]...",
  ].join("\n") + "\n";
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
  "in",
  "out",
  "unchanged",
  "status",
  "milestone",
  "planned-change",
  "roadmap-milestone",
  "roadmap-planned-change",
] as const;

export const DESIGN_ARGUMENTS = [
  "reset",
  "approach",
  "decision",
  "decision-text",
  "rationale",
  "alternative",
  "reason",
  "risk",
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

function upsertKeyedItem(collection: GenerationInputRecord, id: string, item: GenerationInputRecord, fieldName: string): void {
  const existing = collection[id];
  if (existing === undefined) {
    collection[id] = item;
    return;
  }
  if (!deepEqual(existing, item)) {
    throw new Error(`duplicate ${fieldName} '${id}' has conflicting content`);
  }
}

function mergeDeltaRequirement(
  collection: GenerationInputRecord,
  requirementId: string,
  incoming: GenerationInputRecord,
): void {
  const existing = collection[requirementId];
  if (existing === undefined) {
    collection[requirementId] = incoming;
    return;
  }
  if (!isRecord(existing)) {
    throw new Error(`duplicate delta requirement '${requirementId}' has conflicting content`);
  }

  for (const fieldName of ["strength", "statement"] as const) {
    if (!deepEqual(existing[fieldName], incoming[fieldName])) {
      throw new Error(`duplicate delta requirement '${requirementId}' has conflicting ${fieldName}`);
    }
  }

  const existingScenarios = existing.scenarios;
  const incomingScenarios = incoming.scenarios;
  if (!isRecord(existingScenarios) || !isRecord(incomingScenarios)) {
    throw new Error(`duplicate delta requirement '${requirementId}' has conflicting scenarios`);
  }

  const mergedScenarios: GenerationInputRecord = { ...existingScenarios };
  for (const [scenarioId, steps] of Object.entries(incomingScenarios)) {
    const existingSteps = mergedScenarios[scenarioId];
    if (existingSteps === undefined) {
      mergedScenarios[scenarioId] = steps;
      continue;
    }
    if (!deepEqual(existingSteps, steps)) {
      throw new Error(
        `duplicate scenario '${scenarioId}' for delta requirement '${requirementId}' has conflicting content`,
      );
    }
  }

  collection[requirementId] = {
    ...existing,
    scenarios: mergedScenarios,
  };
}

function upsertListItem<T extends GenerationInputRecord>(
  collection: T[],
  item: T,
  id: string,
  fieldName: string,
): T[] {
  const existing = collection.find((candidate) => candidate.id === id);
  if (!existing) {
    return [...collection, item];
  }
  if (!deepEqual(existing, item)) {
    throw new Error(`duplicate ${fieldName} '${id}' has conflicting content`);
  }
  return collection;
}

function buildProposalInput(flags: FlagMap): GenerationInputRecord {
  ensureAllowedFlags(flags, [...PROPOSAL_ARGUMENTS]);

  const what = uniqueStrings(values(flags, "what"));
  const why = uniqueStrings(values(flags, "why"));
  if (what.length === 0) throw new Error("missing required argument --what");
  if (why.length === 0) throw new Error("missing required argument --why");

  const input: GenerationInputRecord = {
    summary: { what, why },
    scope: {
      in: uniqueStrings(values(flags, "in")),
      out: uniqueStrings(values(flags, "out")),
    },
    unchanged_behavior: uniqueStrings(values(flags, "unchanged")),
  };

  const status = optionalOne(flags, "status");
  if (status) input.status = status;

  const milestone = optionalOne(flags, "milestone") ?? optionalOne(flags, "roadmap-milestone");
  const plannedChange = optionalOne(flags, "planned-change") ?? optionalOne(flags, "roadmap-planned-change");
  if (milestone || plannedChange) {
    if (!milestone) throw new Error("missing required argument --milestone");
    if (!plannedChange) throw new Error("missing required argument --planned-change");
    input.roadmap = { milestone, planned_change: plannedChange };
  }

  return input;
}

function existingDesignInput(rootDir: string, changeName: string, reset: boolean): GenerationInputRecord {
  if (reset) {
    return { approach: [], decisions: {}, alternatives: [], risks: [] };
  }
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

  const input = existingDesignInput(rootDir, changeName, hasFlag(flags, "reset"));
  input.approach = uniqueStrings([...(Array.isArray(input.approach) ? input.approach as string[] : []), ...values(flags, "approach")]);
  input.risks = uniqueStrings([...(Array.isArray(input.risks) ? input.risks as string[] : []), ...values(flags, "risk")]);

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
    }, "decision");
  }
  input.decisions = decisions;

  const alternatives = Array.isArray(input.alternatives) ? input.alternatives as GenerationInputRecord[] : [];
  const alternativeOptions = values(flags, "alternative");
  const reasons = values(flags, "reason");
  if (alternativeOptions.length !== reasons.length) {
    throw new Error("--alternative and --reason must be supplied the same number of times");
  }
  for (let index = 0; index < alternativeOptions.length; index += 1) {
    const item = { option: alternativeOptions[index], reason: reasons[index] };
    if (!alternatives.some((alternative) => deepEqual(alternative, item))) {
      alternatives.push(item);
    }
  }
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
  reset: boolean;
  items: QuestionGroup[];
};

function parseQuestionCommandInput(argv: string[], rootDir: string): QuestionCommandInput {
  const input: QuestionCommandInput = { reset: false, items: [] };
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
    if (name === "reset") {
      input.reset = true;
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

function existingQuestionsInput(rootDir: string, changeName: string, reset: boolean): GenerationInputRecord {
  const artifact = readYamlIfExists<GenerationInputRecord>(
    rootDir,
    `${STRICT_WORKFLOW_DIR}/changes/${changeName}/questions.yaml`,
  );
  const open = Array.isArray(artifact?.open) ? artifact.open : [];
  const resolved = Array.isArray(artifact?.resolved) ? artifact.resolved : [];
  if (reset) {
    // A rebuild clears technical questions only; the seeded requirement interrogation survives it,
    // because a flag that could clear the gate would make the gate advisory.
    return {
      open: open.filter(isRequirementQuestion),
      resolved: resolved.filter(isRequirementQuestion),
    };
  }
  return { open, resolved };
}

function buildQuestionsInputFromArgs(rootDir: string, changeName: string, argv: string[]): GenerationInputRecord {
  const commandInput = parseQuestionCommandInput(argv, rootDir);
  const input = existingQuestionsInput(rootDir, changeName, commandInput.reset);
  let open = Array.isArray(input.open) ? input.open as GenerationInputRecord[] : [];
  let resolved = Array.isArray(input.resolved) ? input.resolved as GenerationInputRecord[] : [];

  for (const item of commandInput.items) {
    if (item.kind === "open") {
      if (!item.question) throw new Error(`missing required argument --question for question '${item.id}'`);
      if (!item.context) throw new Error(`missing required argument --context for question '${item.id}'`);
      if (item.answer !== undefined) {
        throw new Error(`--answer is only valid with --resolved for question '${item.id}'`);
      }
      open = upsertListItem(open, withQuestionAttribution({
        id: item.id,
        question: item.question,
        context: item.context,
      }, item), item.id, "open question");
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
      }, item, existingRecord), item.id, "resolved question");
      continue;
    }

    if (!item.question) throw new Error(`missing required argument --question for question '${item.id}'`);
    if (!item.context) throw new Error(`missing required argument --context for question '${item.id}'`);
    if (!item.answer) throw new Error(`missing required argument --answer for resolved question '${item.id}'`);
    resolved = upsertListItem(resolved, withQuestionAttribution({
      id: item.id,
      question: item.question,
      context: item.context,
      answer: item.answer,
    }, item), item.id, "resolved question");
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
};

export type TaskRemovalOutcome = {
  removed: string[];
  unmatched: string[];
};

type TaskCommandInput = {
  reset: boolean;
  force: boolean;
  removals: string[];
  groups: TaskGroup[];
  validationTask?: string;
  unitTestTask?: string;
};

function parseTaskCommandInput(argv: string[], rootDir: string): TaskCommandInput {
  const input: TaskCommandInput = { reset: false, force: false, removals: [], groups: [] };
  let current: TaskGroup | undefined;

  function setField(field: "id" | "text" | "status" | "command", value: string, flagName: string): void {
    if (!current) {
      throw new Error("missing required argument --section before --" + flagName);
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
    const inlineValue = equalsAt === -1 ? undefined : resolveStringValue(rawName.slice(equalsAt + 1), rootDir);

    const readValue = (): string => {
      if (inlineValue !== undefined) return inlineValue;
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`missing value for --${name}`);
      }
      index += 1;
      return resolveStringValue(value, rootDir);
    };

    if (name === "reset" || name === "force") {
      if (inlineValue !== undefined) throw new Error(`--${name} does not take a value`);
      if (name === "reset") input.reset = true;
      else input.force = true;
      continue;
    }
    if (name === "section") {
      current = { section: readValue() };
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

function existingTaskListInput(rootDir: string, changeName: string, reset: boolean): GenerationInputRecord {
  if (reset) {
    return { sections: {}, testing_gates: { validation_task: "", unit_test_task: "" } };
  }
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

function buildTaskListInputFromArgs(
  rootDir: string,
  changeName: string,
  argv: string[],
  removalOutcome?: TaskRemovalOutcome,
): GenerationInputRecord {
  const commandInput = parseTaskCommandInput(argv, rootDir);

  // Reset discards the existing task list, so it must never be able to silently drop recorded
  // completions and must never be able to rebuild the list as an empty set.
  if (commandInput.reset) {
    if (commandInput.groups.length === 0) {
      throw new Error("--reset requires at least one --section/--task/--text group so the task list is never rebuilt empty");
    }
    if (!commandInput.force) {
      const completed = completedTaskIds(rootDir, changeName);
      if (completed.length > 0) {
        throw new Error(
          `--reset would discard completed task(s): ${completed.join(", ")}; re-run with --force to rebuild anyway`,
        );
      }
    }
  }

  const input = existingTaskListInput(rootDir, changeName, commandInput.reset);
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
    if (!(TASK_SECTION_NAMES as readonly string[]).includes(group.section)) {
      throw new Error(`unknown section '${group.section}'; expected one of: ${TASK_SECTION_NAMES.join(", ")}`);
    }
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

function existingDeltaInput(rootDir: string, changeName: string, targetSpec: string, specPath: string | undefined, reset: boolean): GenerationInputRecord {
  const relativeSpecPath = resolveDeltaExistingPath(rootDir, targetSpec, specPath);
  if (reset) {
    return emptyDeltaInput(targetSpec, relativeSpecPath);
  }
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
    mapping: isRecord(artifact.mapping) ? artifact.mapping : { implementation: [], tests: [] },
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
    mapping: { implementation: [], tests: [] },
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
  reset: boolean;
  targetSpec?: string;
  specPath?: string;
  title?: string;
  newSpecPath?: string;
  implementation: string[];
  tests: string[];
  requirements: DeltaRequirementGroup[];
};

function parseDeltaCommandInput(argv: string[], rootDir: string): DeltaCommandInput {
  const input: DeltaCommandInput = {
    reset: false,
    implementation: [],
    tests: [],
    requirements: [],
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
    if (name === "reset") {
      input.reset = true;
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
    if (name === "implementation") {
      input.implementation.push(readValue(name, index));
      index += 1;
      continue;
    }
    if (name === "test") {
      input.tests.push(readValue(name, index));
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
  const input = existingDeltaInput(rootDir, changeName, targetSpec, commandInput.specPath, commandInput.reset);

  if (commandInput.title !== undefined || commandInput.newSpecPath !== undefined) {
    if (commandInput.title === undefined || commandInput.newSpecPath === undefined) {
      throw new Error("--title and --new-spec-path must be supplied together to create a new main spec");
    }
    input.spec = { title: commandInput.title, path: commandInput.newSpecPath };
  }

  const mapping = isRecord(input.mapping) ? input.mapping : {};
  mapping.implementation = uniqueStrings([
    ...(Array.isArray(mapping.implementation) ? mapping.implementation as string[] : []),
    ...commandInput.implementation,
  ]);
  mapping.tests = uniqueStrings([
    ...(Array.isArray(mapping.tests) ? mapping.tests as string[] : []),
    ...commandInput.tests,
  ]);
  input.mapping = mapping;

  const operations = isRecord(input.operations) ? input.operations : {};
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
      upsertKeyedItem(operationMap, requirement.id, { reason: requirement.reason }, "delta requirement");
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
    });
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
    mapping: { implementation: [], enforcement: [] },
    operations: { ADDED: {}, MODIFIED: {}, REMOVED: {} },
  };
}

function existingDeltaTechInput(
  rootDir: string,
  changeName: string,
  targetStandard: string,
  techPath: string | undefined,
  reset: boolean,
): GenerationInputRecord {
  const relativeTechPath = resolveDeltaTechExistingPath(rootDir, targetStandard, techPath);
  if (reset) {
    return emptyDeltaTechInput(targetStandard, relativeTechPath);
  }
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
    mapping: isRecord(artifact.mapping) ? artifact.mapping : { implementation: [], enforcement: [] },
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
  reset: boolean;
  targetStandard?: string;
  techPath?: string;
  title?: string;
  category?: string;
  implementation: string[];
  enforcement: string[];
  rules: TechRuleGroup[];
};

function parseDeltaTechCommandInput(argv: string[], rootDir: string): DeltaTechCommandInput {
  const input: DeltaTechCommandInput = {
    reset: false,
    implementation: [],
    enforcement: [],
    rules: [],
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
    if (name === "reset") {
      input.reset = true;
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
    if (name === "implementation") {
      input.implementation.push(readValue(name, index));
      index += 1;
      continue;
    }
    if (name === "enforcement") {
      input.enforcement.push(readValue(name, index));
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
  const input = existingDeltaTechInput(rootDir, changeName, targetStandard, commandInput.techPath, commandInput.reset);

  if (commandInput.title !== undefined || commandInput.category !== undefined) {
    if (commandInput.title === undefined || commandInput.category === undefined) {
      throw new Error("--title and --category must be supplied together to define a new standard");
    }
    input.standard = { title: commandInput.title, category: commandInput.category };
  }

  const mapping = isRecord(input.mapping) ? input.mapping : {};
  mapping.implementation = uniqueStrings([
    ...(Array.isArray(mapping.implementation) ? mapping.implementation as string[] : []),
    ...commandInput.implementation,
  ]);
  mapping.enforcement = uniqueStrings([
    ...(Array.isArray(mapping.enforcement) ? mapping.enforcement as string[] : []),
    ...commandInput.enforcement,
  ]);
  input.mapping = mapping;

  const operations = isRecord(input.operations) ? input.operations : {};
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
      upsertKeyedItem(operationMap, rule.id, { reason: rule.reason }, "delta tech rule");
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
    upsertKeyedItem(operationMap, rule.id, ruleValue, "delta tech rule");
    operations[rule.operation] = operationMap;
  }
  input.operations = operations;
  return input;
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
      return buildProposalInput(parseFlagMap(argv, rootDir));
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
    writeError("artifact must be one of: proposal, design, questions, tasks, delta-spec, delta-tech");
    return 1;
  }

  try {
    if (!firstInputArg.startsWith("--")) {
      writeUsage(usage());
      return 1;
    }

    const namedArgs = [firstInputArg, ...extraArgs];
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
