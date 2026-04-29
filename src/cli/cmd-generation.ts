import { existsSync, readFileSync } from "fs";
import path from "path";
import {
  generateChangeArtifactFromInput,
  type GeneratableArtifact,
  type GenerationInputRecord,
  isGeneratableArtifact,
} from "../propose-generation.js";
import { parseYamlDocument } from "../yaml.js";
import { CHANGE_NAME_PATTERN, isHelpRequest } from "./argv.js";
import { writeError, writeHelp, writeJson, writeUsage } from "./output.js";

const STRICT_WORKFLOW_DIR = ".strict-spec-driven";
const BOOLEAN_FLAGS = new Set(["reset"]);

type FlagMap = Record<string, string[]>;

function usage(): string {
  return [
    "Usage: strict-spec-driven generate <change-name> <proposal|design|questions|delta-spec> --<named-args>",
    "",
    "Examples:",
    "  strict-spec-driven generate <change-name> proposal --what <text> --why <text> [--in <text>] [--out <text>] [--unchanged <text>]",
    "  strict-spec-driven generate <change-name> design [--reset] --approach <text> [--decision <id> --decision-text <text> --rationale <text>]",
    "  strict-spec-driven generate <change-name> questions [--reset] [(--open <id> --question <text> --context <text>)|(--resolved <id> --question <text> --context <text> --answer <text>)]...",
    "  strict-spec-driven generate <change-name> delta-spec --target-spec <id> [--spec-path <path>] [--reset] [--implementation <path>] [--test <path>] [--operation <ADDED|MODIFIED|REMOVED> --requirement <id> ...]...",
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
  ensureAllowedFlags(flags, [
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
  ]);

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
  ensureAllowedFlags(flags, [
    "reset",
    "approach",
    "decision",
    "decision-text",
    "rationale",
    "alternative",
    "reason",
    "risk",
  ]);

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
  kind: "open" | "resolved";
  id: string;
  question?: string;
  context?: string;
  answer?: string;
};

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

  function setField(field: "question" | "context" | "answer", value: string, flagName: string): void {
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
    if (name === "open" || name === "resolved") {
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

    throw new Error(`unsupported argument(s): --${name}`);
  }

  return input;
}

function existingQuestionsInput(rootDir: string, changeName: string, reset: boolean): GenerationInputRecord {
  if (reset) {
    return { open: [], resolved: [] };
  }
  const artifact = readYamlIfExists<GenerationInputRecord>(
    rootDir,
    `${STRICT_WORKFLOW_DIR}/changes/${changeName}/questions.yaml`,
  );
  return {
    open: Array.isArray(artifact?.open) ? artifact.open : [],
    resolved: Array.isArray(artifact?.resolved) ? artifact.resolved : [],
  };
}

function buildQuestionsInputFromArgs(rootDir: string, changeName: string, argv: string[]): GenerationInputRecord {
  const commandInput = parseQuestionCommandInput(argv, rootDir);
  const input = existingQuestionsInput(rootDir, changeName, commandInput.reset);
  let open = Array.isArray(input.open) ? input.open as GenerationInputRecord[] : [];
  let resolved = Array.isArray(input.resolved) ? input.resolved as GenerationInputRecord[] : [];

  for (const item of commandInput.items) {
    if (!item.question) throw new Error(`missing required argument --question for question '${item.id}'`);
    if (!item.context) throw new Error(`missing required argument --context for question '${item.id}'`);

    if (item.kind === "open") {
      if (item.answer !== undefined) {
        throw new Error(`--answer is only valid with --resolved for question '${item.id}'`);
      }
      open = upsertListItem(open, {
        id: item.id,
        question: item.question,
        context: item.context,
      }, item.id, "open question");
      continue;
    }

    if (!item.answer) throw new Error(`missing required argument --answer for resolved question '${item.id}'`);
    resolved = upsertListItem(resolved, {
      id: item.id,
      question: item.question,
      context: item.context,
      answer: item.answer,
    }, item.id, "resolved question");
  }

  input.open = open;
  input.resolved = resolved;
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
  return {
    target_spec: artifact.target_spec ?? targetSpec,
    spec_path: relativeSpecPath,
    mapping: isRecord(artifact.mapping) ? artifact.mapping : { implementation: [], tests: [] },
    operations: isRecord(artifact.operations) ? artifact.operations : { ADDED: {}, MODIFIED: {}, REMOVED: {} },
  };
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
    upsertKeyedItem(operationMap, requirement.id, {
      strength: requirement.strength,
      statement: requirement.statement,
      scenarios,
    }, "delta requirement");
    operations[requirement.operation] = operationMap;
  }
  input.operations = operations;
  return input;
}

function buildInputFromNamedArgs(
  rootDir: string,
  changeName: string,
  artifact: GeneratableArtifact,
  argv: string[],
): GenerationInputRecord {
  switch (artifact) {
    case "proposal":
      return buildProposalInput(parseFlagMap(argv, rootDir));
    case "design":
      return buildDesignInput(rootDir, changeName, parseFlagMap(argv, rootDir));
    case "questions":
      return buildQuestionsInputFromArgs(rootDir, changeName, argv);
    case "delta-spec":
      return buildDeltaInputFromArgs(rootDir, changeName, argv);
  }
}

export function runGenerate(argv: string[]): number {
  const [changeName, artifact, firstInputArg, ...extraArgs] = argv;
  if (isHelpRequest(argv)) {
    writeHelp(usage());
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
    writeError("artifact must be one of: proposal, design, questions, delta-spec");
    return 1;
  }

  try {
    if (!firstInputArg.startsWith("--")) {
      writeUsage(usage());
      return 1;
    }

    const namedArgs = [firstInputArg, ...extraArgs];
    const input = buildInputFromNamedArgs(process.cwd(), changeName, artifact, namedArgs);
    const result = generateChangeArtifactFromInput(process.cwd(), changeName, artifact, input);
    writeJson(result);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeError(message);
    return 1;
  }
}
