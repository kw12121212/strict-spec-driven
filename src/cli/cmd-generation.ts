import { existsSync, readFileSync } from "fs";
import path from "path";
import {
  generateChangeArtifact,
  generateChangeArtifactFromInput,
  type GeneratableArtifact,
  type GenerationInputRecord,
  isGeneratableArtifact,
} from "../propose-generation.js";
import { parseYamlDocument } from "../yaml.js";
import { CHANGE_NAME_PATTERN } from "./argv.js";
import { writeError, writeJson, writeUsage } from "./output.js";

const STRICT_WORKFLOW_DIR = ".strict-spec-driven";
const BOOLEAN_FLAGS = new Set(["reset"]);

type FlagMap = Record<string, string[]>;

function usage(): string {
  return [
    "Usage:",
    "  strict-spec-driven generate <change-name> <proposal|design|tasks|questions|delta-spec> <input-json>",
    "  strict-spec-driven generate <change-name> proposal --what <text> --why <text> [--in <text>] [--out <text>] [--unchanged <text>]",
    "  strict-spec-driven generate <change-name> design [--reset] --approach <text> [--decision <id> --decision-text <text> --rationale <text>]",
    "  strict-spec-driven generate <change-name> tasks [--reset] --section <Implementation|Testing|Verification> --task <id> --text <text> [--status <pending|complete>] [--command <cmd>]",
    "  strict-spec-driven generate <change-name> questions [--reset] (--open <id>|--resolved <id>) --question <text> --context <text> [--answer <text>]",
    "  strict-spec-driven generate <change-name> delta-spec --target-spec <id> [--spec-path <path>] [--reset] --operation <ADDED|MODIFIED|REMOVED> --requirement <id> ...",
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

function existingTasksInput(rootDir: string, changeName: string, reset: boolean): GenerationInputRecord {
  if (reset) {
    return { sections: {}, testing_gates: { validation_task: "", unit_test_task: "" } };
  }
  const artifact = readYamlIfExists<GenerationInputRecord>(
    rootDir,
    `${STRICT_WORKFLOW_DIR}/changes/${changeName}/tasks.yaml`,
  );
  return {
    sections: isRecord(artifact?.sections) ? artifact.sections : {},
    testing_gates: isRecord(artifact?.testing_gates) ? artifact.testing_gates : { validation_task: "", unit_test_task: "" },
  };
}

function buildTasksInput(rootDir: string, changeName: string, flags: FlagMap): GenerationInputRecord {
  ensureAllowedFlags(flags, [
    "reset",
    "section",
    "task",
    "text",
    "status",
    "command",
    "validation-task",
    "unit-test-task",
  ]);

  const input = existingTasksInput(rootDir, changeName, hasFlag(flags, "reset"));
  const sections = isRecord(input.sections) ? input.sections : {};
  const taskId = optionalOne(flags, "task");
  if (taskId) {
    const section = requiredOne(flags, "section");
    if (!["Implementation", "Testing", "Verification"].includes(section)) {
      throw new Error("--section must be one of: Implementation, Testing, Verification");
    }
    const sectionMap = isRecord(sections[section]) ? sections[section] as GenerationInputRecord : {};
    const task: GenerationInputRecord = {
      text: requiredOne(flags, "text"),
      status: optionalOne(flags, "status") ?? "pending",
    };
    const command = optionalOne(flags, "command");
    if (command) task.command = command;
    upsertKeyedItem(sectionMap, taskId, task, "task");
    sections[section] = sectionMap;
  } else if (hasFlag(flags, "section") || hasFlag(flags, "text") || hasFlag(flags, "status") || hasFlag(flags, "command")) {
    throw new Error("missing required argument --task");
  }
  input.sections = sections;

  const testingGates = isRecord(input.testing_gates) ? input.testing_gates : {};
  const validationTask = optionalOne(flags, "validation-task");
  const unitTestTask = optionalOne(flags, "unit-test-task");
  if (validationTask) testingGates.validation_task = validationTask;
  if (unitTestTask) testingGates.unit_test_task = unitTestTask;
  input.testing_gates = testingGates;

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

function buildQuestionsInput(rootDir: string, changeName: string, flags: FlagMap): GenerationInputRecord {
  ensureAllowedFlags(flags, ["reset", "open", "resolved", "question", "context", "answer"]);

  const openId = optionalOne(flags, "open");
  const resolvedId = optionalOne(flags, "resolved");
  if (openId && resolvedId) {
    throw new Error("--open and --resolved cannot be supplied together");
  }

  const input = existingQuestionsInput(rootDir, changeName, hasFlag(flags, "reset"));
  if (openId) {
    input.open = upsertListItem(Array.isArray(input.open) ? input.open as GenerationInputRecord[] : [], {
      id: openId,
      question: requiredOne(flags, "question"),
      context: requiredOne(flags, "context"),
    }, openId, "open question");
  }
  if (resolvedId) {
    input.resolved = upsertListItem(Array.isArray(input.resolved) ? input.resolved as GenerationInputRecord[] : [], {
      id: resolvedId,
      question: requiredOne(flags, "question"),
      context: requiredOne(flags, "context"),
      answer: requiredOne(flags, "answer"),
    }, resolvedId, "resolved question");
  }
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

function buildScenario(flags: FlagMap): GenerationInputRecord {
  const scenarioId = optionalOne(flags, "scenario");
  if (!scenarioId) return {};

  const steps: GenerationInputRecord[] = [];
  for (const given of values(flags, "given")) steps.push({ GIVEN: given });
  for (const when of values(flags, "when")) steps.push({ WHEN: when });
  for (const then of values(flags, "then")) steps.push({ THEN: then });
  for (const and of values(flags, "and")) steps.push({ AND: and });
  if (steps.length === 0) {
    throw new Error("--scenario requires at least one --given, --when, --then, or --and");
  }
  return { [scenarioId]: steps };
}

function buildDeltaInput(rootDir: string, changeName: string, flags: FlagMap): GenerationInputRecord {
  ensureAllowedFlags(flags, [
    "reset",
    "target-spec",
    "spec-path",
    "implementation",
    "test",
    "operation",
    "requirement",
    "strength",
    "statement",
    "scenario",
    "given",
    "when",
    "then",
    "and",
    "reason",
  ]);

  const targetSpec = requiredOne(flags, "target-spec");
  const specPath = optionalOne(flags, "spec-path");
  const input = existingDeltaInput(rootDir, changeName, targetSpec, specPath, hasFlag(flags, "reset"));
  const mapping = isRecord(input.mapping) ? input.mapping : {};
  mapping.implementation = uniqueStrings([
    ...(Array.isArray(mapping.implementation) ? mapping.implementation as string[] : []),
    ...values(flags, "implementation"),
  ]);
  mapping.tests = uniqueStrings([
    ...(Array.isArray(mapping.tests) ? mapping.tests as string[] : []),
    ...values(flags, "test"),
  ]);
  input.mapping = mapping;

  const operation = optionalOne(flags, "operation");
  if (!operation) return input;
  if (!["ADDED", "MODIFIED", "REMOVED"].includes(operation)) {
    throw new Error("--operation must be one of: ADDED, MODIFIED, REMOVED");
  }
  const requirementId = requiredOne(flags, "requirement");
  const operations = isRecord(input.operations) ? input.operations : {};
  const operationMap = isRecord(operations[operation]) ? operations[operation] as GenerationInputRecord : {};
  const item = operation === "REMOVED"
    ? { reason: requiredOne(flags, "reason") }
    : {
        strength: requiredOne(flags, "strength"),
        statement: requiredOne(flags, "statement"),
        scenarios: buildScenario(flags),
      };
  upsertKeyedItem(operationMap, requirementId, item, "delta requirement");
  operations[operation] = operationMap;
  input.operations = operations;
  return input;
}

function buildInputFromFlags(
  rootDir: string,
  changeName: string,
  artifact: GeneratableArtifact,
  flags: FlagMap,
): GenerationInputRecord {
  switch (artifact) {
    case "proposal":
      return buildProposalInput(flags);
    case "design":
      return buildDesignInput(rootDir, changeName, flags);
    case "tasks":
      return buildTasksInput(rootDir, changeName, flags);
    case "questions":
      return buildQuestionsInput(rootDir, changeName, flags);
    case "delta-spec":
      return buildDeltaInput(rootDir, changeName, flags);
  }
}

export function runGenerate(argv: string[]): number {
  const [changeName, artifact, firstInputArg, ...extraArgs] = argv;
  if (!changeName || !artifact || !firstInputArg) {
    writeUsage(usage());
    return 1;
  }
  if (!CHANGE_NAME_PATTERN.test(changeName)) {
    writeError("change name must be kebab-case (lowercase letters, numbers, and hyphens)");
    return 1;
  }
  if (!isGeneratableArtifact(artifact)) {
    writeError("artifact must be one of: proposal, design, tasks, questions, delta-spec");
    return 1;
  }

  try {
    if (!firstInputArg.startsWith("--")) {
      if (extraArgs.length > 0) {
        writeUsage(usage());
        return 1;
      }
      writeJson(generateChangeArtifact(process.cwd(), changeName, artifact, firstInputArg));
      return 0;
    }

    const flags = parseFlagMap([firstInputArg, ...extraArgs], process.cwd());
    const input = buildInputFromFlags(process.cwd(), changeName, artifact, flags);
    const result = generateChangeArtifactFromInput(process.cwd(), changeName, artifact, input);
    writeJson(result);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeError(message);
    return 1;
  }
}
