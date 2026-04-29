import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import path from "path";
import { loadBundledSchemaByArtifactType, validateArtifact, type ValidationDiagnostic } from "./validation.js";
import { parseYamlDocument, stringifyYamlDocument } from "./yaml.js";

const STRICT_WORKFLOW_DIR = ".strict-spec-driven";

export const GENERATABLE_ARTIFACTS = ["proposal", "design", "tasks", "questions", "delta-spec"] as const;
export type GeneratableArtifact = (typeof GENERATABLE_ARTIFACTS)[number];

type JsonRecord = Record<string, unknown>;

type GeneratedTarget = {
  artifact: unknown;
  artifactType: string;
  absolutePath: string;
};

export type GenerateChangeArtifactResult = {
  changeName: string;
  artifact: GeneratableArtifact;
  artifactPath: string;
  replaced: boolean;
  valid: boolean;
  diagnostics: ValidationDiagnostic[];
};

function normalizeRepoRelativePath(rootDir: string, absolutePath: string): string {
  return path.relative(rootDir, absolutePath).split(path.sep).join("/");
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown, fieldPath: string): JsonRecord {
  if (!isRecord(value)) {
    throw new Error(`input field '${fieldPath}' must be an object`);
  }
  return value;
}

function asOptionalRecord(value: unknown, fieldPath: string): JsonRecord | undefined {
  if (value === undefined) return undefined;
  return asRecord(value, fieldPath);
}

function asString(value: unknown, fieldPath: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`input field '${fieldPath}' must be a non-empty string`);
  }
  return value;
}

function asOptionalString(value: unknown, fieldPath: string): string | undefined {
  if (value === undefined) return undefined;
  return asString(value, fieldPath);
}

function asStringArray(value: unknown, fieldPath: string, options: { minItems?: number } = {}): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`input field '${fieldPath}' must be an array of strings`);
  }
  if (options.minItems !== undefined && value.length < options.minItems) {
    throw new Error(`input field '${fieldPath}' must contain at least ${options.minItems} item(s)`);
  }
  return value.map((item, index) => asString(item, `${fieldPath}[${index}]`));
}

function asOptionalStringArray(value: unknown, fieldPath: string): string[] | undefined {
  if (value === undefined) return undefined;
  return asStringArray(value, fieldPath);
}

function parseJsonInput(inputFile: string): JsonRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(inputFile, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`input JSON '${inputFile}' could not be parsed: ${message}`);
  }
  return asRecord(parsed, "$");
}

function validateGeneratedArtifact(artifactType: string, artifact: unknown, artifactPath: string): ValidationDiagnostic[] {
  const schema = loadBundledSchemaByArtifactType(artifactType);
  const result = validateArtifact(schema, artifact, artifactPath);
  return result.diagnostics;
}

function formatDiagnostics(diagnostics: ValidationDiagnostic[]): string {
  return diagnostics
    .map((diagnostic) => `${diagnostic.artifactPath} ${diagnostic.fieldPath}: ${diagnostic.message}`)
    .join("; ");
}

function mapGeneratedFieldToInputField(artifact: GeneratableArtifact, fieldPath: string): string {
  if (fieldPath === "$") return "$";

  const directPrefixes: Record<GeneratableArtifact, string[]> = {
    proposal: ["$.summary", "$.scope", "$.unchanged_behavior", "$.roadmap"],
    design: ["$.approach", "$.decisions", "$.alternatives", "$.risks"],
    tasks: ["$.sections", "$.testing_gates"],
    questions: ["$.open", "$.resolved"],
    "delta-spec": ["$.target_spec", "$.mapping", "$.operations"],
  };

  for (const prefix of directPrefixes[artifact]) {
    if (fieldPath === prefix || fieldPath.startsWith(`${prefix}.`) || fieldPath.startsWith(`${prefix}[`)) {
      return fieldPath;
    }
  }

  if (artifact === "proposal") {
    if (fieldPath === "$.change.status") return "$.status";
    if (fieldPath === "$.change.id") return "<change-name>";
  }
  if (artifact === "design" || artifact === "tasks" || artifact === "questions") {
    if (fieldPath === "$.change") return "<change-name>";
  }
  if (artifact === "questions") {
    const openStatusMatch = fieldPath.match(/^\$\.open\[(\d+)\]\.status$/);
    if (openStatusMatch) return `$.open[${openStatusMatch[1]}]`;
    const resolvedStatusMatch = fieldPath.match(/^\$\.resolved\[(\d+)\]\.status$/);
    if (resolvedStatusMatch) return `$.resolved[${resolvedStatusMatch[1]}]`;
  }
  if (artifact === "delta-spec" && fieldPath === "$.schema_file") {
    return "<generated schema_file>";
  }

  if (
    fieldPath === "$.schema"
    || fieldPath === "$.schema_version"
    || fieldPath === "$.artifact_type"
    || fieldPath === "$.schema_file"
  ) {
    return `<generated ${fieldPath.slice(2)}>`;
  }

  return fieldPath;
}

function formatInputDiagnostics(
  artifact: GeneratableArtifact,
  inputFile: string,
  diagnostics: ValidationDiagnostic[],
): string {
  const lines = diagnostics.map((diagnostic) => {
    const inputField = mapGeneratedFieldToInputField(artifact, diagnostic.fieldPath);
    const details = [
      diagnostic.message,
      diagnostic.expected ? `expected ${diagnostic.expected}` : undefined,
      diagnostic.actual ? `actual ${diagnostic.actual}` : undefined,
      `generated field ${diagnostic.fieldPath}`,
    ].filter((value): value is string => Boolean(value));
    return `- ${inputField}: ${details.join("; ")}`;
  });

  return [
    `input JSON '${inputFile}' is invalid for ${artifact}; fix these field(s):`,
    ...lines,
  ].join("\n");
}

function ensureExistingChangeDir(rootDir: string, changeName: string): string {
  const changeDir = path.join(rootDir, STRICT_WORKFLOW_DIR, "changes", changeName);
  if (!existsSync(changeDir) || !statSync(changeDir).isDirectory()) {
    throw new Error(`change '${changeName}' not found`);
  }
  return changeDir;
}

function buildProposalArtifact(changeName: string, input: JsonRecord): unknown {
  const summary = asRecord(input.summary, "$.summary");
  const scope = asRecord(input.scope, "$.scope");
  const status = asOptionalString(input.status, "$.status") ?? "proposed";
  const artifact: JsonRecord = {
    schema: "strict-spec-driven/change-proposal/v1",
    schema_version: 1,
    artifact_type: "change_proposal",
    schema_file: "templates/strict-spec-driven/schemas/change-proposal.yaml",
    change: {
      id: changeName,
      status,
    },
    summary: {
      what: asStringArray(summary.what, "$.summary.what", { minItems: 1 }),
      why: asStringArray(summary.why, "$.summary.why", { minItems: 1 }),
    },
    scope: {
      in: asStringArray(scope.in, "$.scope.in"),
      out: asStringArray(scope.out, "$.scope.out"),
    },
    unchanged_behavior: asStringArray(input.unchanged_behavior, "$.unchanged_behavior"),
  };

  const roadmap = asOptionalRecord(input.roadmap, "$.roadmap");
  if (roadmap) {
    artifact.roadmap = {
      milestone: asString(roadmap.milestone, "$.roadmap.milestone"),
      planned_change: asString(roadmap.planned_change, "$.roadmap.planned_change"),
    };
  }

  return artifact;
}

function buildDesignArtifact(changeName: string, input: JsonRecord): unknown {
  const decisions = asRecord(input.decisions, "$.decisions");
  for (const [decisionId, decision] of Object.entries(decisions)) {
    const decisionRecord = asRecord(decision, `$.decisions.${decisionId}`);
    decisions[decisionId] = {
      decision: asString(decisionRecord.decision, `$.decisions.${decisionId}.decision`),
      rationale: asString(decisionRecord.rationale, `$.decisions.${decisionId}.rationale`),
    };
  }

  const alternativesInput = input.alternatives;
  if (!Array.isArray(alternativesInput)) {
    throw new Error("input field '$.alternatives' must be an array");
  }
  const alternatives = alternativesInput.map((alternative, index) => {
    const record = asRecord(alternative, `$.alternatives[${index}]`);
    return {
      option: asString(record.option, `$.alternatives[${index}].option`),
      reason: asString(record.reason, `$.alternatives[${index}].reason`),
    };
  });

  return {
    schema: "strict-spec-driven/change-design/v1",
    schema_version: 1,
    artifact_type: "change_design",
    schema_file: "templates/strict-spec-driven/schemas/change-design.yaml",
    change: changeName,
    approach: asStringArray(input.approach, "$.approach", { minItems: 1 }),
    decisions,
    alternatives,
    risks: asOptionalStringArray(input.risks, "$.risks") ?? [],
  };
}

function normalizeTaskMap(value: unknown, fieldPath: string): JsonRecord {
  const input = asRecord(value, fieldPath);
  const output: JsonRecord = {};
  for (const [taskId, task] of Object.entries(input)) {
    const taskRecord = asRecord(task, `${fieldPath}.${taskId}`);
    const normalizedTask: JsonRecord = {
      text: asString(taskRecord.text, `${fieldPath}.${taskId}.text`),
      status: asOptionalString(taskRecord.status, `${fieldPath}.${taskId}.status`) ?? "pending",
    };
    const command = asOptionalString(taskRecord.command, `${fieldPath}.${taskId}.command`);
    if (command) {
      normalizedTask.command = command;
    }
    output[taskId] = normalizedTask;
  }
  return output;
}

function buildTasksArtifact(changeName: string, input: JsonRecord): unknown {
  const sections = asRecord(input.sections, "$.sections");
  const testingGates = asRecord(input.testing_gates, "$.testing_gates");
  const artifactSections: JsonRecord = {};
  const supportedSections = new Set(["Implementation", "Testing", "Verification"]);

  for (const sectionName of Object.keys(sections)) {
    if (!supportedSections.has(sectionName)) {
      throw new Error("input field '$.sections' may only contain Implementation, Testing, and Verification");
    }
  }

  for (const sectionName of supportedSections) {
    if (sections[sectionName] !== undefined) {
      artifactSections[sectionName] = normalizeTaskMap(sections[sectionName], `$.sections.${sectionName}`);
    }
  }

  return {
    schema: "strict-spec-driven/task-list/v2",
    schema_version: 2,
    artifact_type: "task_list",
    schema_file: "templates/strict-spec-driven/schemas/task-list.yaml",
    change: changeName,
    sections: artifactSections,
    testing_gates: {
      validation_task: asString(testingGates.validation_task, "$.testing_gates.validation_task"),
      unit_test_task: asString(testingGates.unit_test_task, "$.testing_gates.unit_test_task"),
    },
  };
}

function normalizeOpenQuestion(question: unknown, index: number): JsonRecord {
  const record = asRecord(question, `$.open[${index}]`);
  return {
    id: asString(record.id, `$.open[${index}].id`),
    question: asString(record.question, `$.open[${index}].question`),
    context: asString(record.context, `$.open[${index}].context`),
    status: "open",
  };
}

function normalizeResolvedQuestion(question: unknown, index: number): JsonRecord {
  const record = asRecord(question, `$.resolved[${index}]`);
  return {
    id: asString(record.id, `$.resolved[${index}].id`),
    question: asString(record.question, `$.resolved[${index}].question`),
    context: asString(record.context, `$.resolved[${index}].context`),
    answer: asString(record.answer, `$.resolved[${index}].answer`),
    status: "resolved",
  };
}

function buildQuestionsArtifact(changeName: string, input: JsonRecord): unknown {
  const open = input.open ?? [];
  const resolved = input.resolved ?? [];
  if (!Array.isArray(open)) {
    throw new Error("input field '$.open' must be an array");
  }
  if (!Array.isArray(resolved)) {
    throw new Error("input field '$.resolved' must be an array");
  }

  return {
    schema: "strict-spec-driven/question-list/v1",
    schema_version: 1,
    artifact_type: "question_list",
    schema_file: "templates/strict-spec-driven/schemas/question-list.yaml",
    change: changeName,
    open: open.map(normalizeOpenQuestion),
    resolved: resolved.map(normalizeResolvedQuestion),
  };
}

function normalizeDeltaSpecRelativePath(relativePath: string): string {
  let normalized = relativePath.replaceAll("\\", "/");
  const strictSpecsPrefix = `${STRICT_WORKFLOW_DIR}/specs/`;
  if (normalized.startsWith(strictSpecsPrefix)) {
    normalized = normalized.slice(strictSpecsPrefix.length);
  }
  if (path.isAbsolute(normalized)) {
    throw new Error("input field '$.spec_path' must be relative to the strict specs directory");
  }
  const parts = normalized.split("/");
  if (
    normalized.length === 0
    || parts.some((part) => part.length === 0 || part === "." || part === "..")
    || path.basename(normalized) === "INDEX.yaml"
    || !(normalized.endsWith(".yaml") || normalized.endsWith(".yml"))
  ) {
    throw new Error("input field '$.spec_path' must be a normalized YAML path under the strict specs directory");
  }
  return normalized;
}

function readSpecIndexPathForTarget(rootDir: string, targetSpec: string): string | undefined {
  const indexPath = path.join(rootDir, STRICT_WORKFLOW_DIR, "specs", "INDEX.yaml");
  if (!existsSync(indexPath)) return undefined;
  const index = parseYamlDocument<{ specs?: Array<{ id?: unknown; path?: unknown }> }>(
    readFileSync(indexPath, "utf8"),
    { source: normalizeRepoRelativePath(rootDir, indexPath) },
  );
  const match = (index.specs ?? []).find((candidate) => candidate.id === targetSpec);
  return typeof match?.path === "string" ? match.path : undefined;
}

function resolveDeltaSpecRelativePath(rootDir: string, targetSpec: string, input: JsonRecord): string {
  const explicitPath = asOptionalString(input.spec_path, "$.spec_path");
  if (explicitPath) {
    return normalizeDeltaSpecRelativePath(explicitPath);
  }

  const indexedPath = readSpecIndexPathForTarget(rootDir, targetSpec);
  if (indexedPath) {
    return normalizeDeltaSpecRelativePath(indexedPath);
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(targetSpec)) {
    throw new Error("input field '$.spec_path' is required when target_spec is not a kebab-case spec id");
  }
  return `${targetSpec}.yaml`;
}

function buildDeltaSpecArtifact(rootDir: string, input: JsonRecord): { artifact: unknown; relativePath: string } {
  const targetSpec = asString(input.target_spec, "$.target_spec");
  const mapping = asRecord(input.mapping, "$.mapping");
  const operations = asRecord(input.operations ?? {}, "$.operations");
  const relativePath = resolveDeltaSpecRelativePath(rootDir, targetSpec, input);

  return {
    relativePath,
    artifact: {
      schema: "strict-spec-driven/delta-spec/v1",
      schema_version: 1,
      artifact_type: "delta_spec",
      schema_file: "templates/strict-spec-driven/schemas/delta-spec.yaml",
      target_spec: targetSpec,
      mapping: {
        implementation: asStringArray(mapping.implementation ?? [], "$.mapping.implementation"),
        tests: asStringArray(mapping.tests ?? [], "$.mapping.tests"),
      },
      operations: {
        ADDED: asRecord(operations.ADDED ?? {}, "$.operations.ADDED"),
        MODIFIED: asRecord(operations.MODIFIED ?? {}, "$.operations.MODIFIED"),
        REMOVED: asRecord(operations.REMOVED ?? {}, "$.operations.REMOVED"),
      },
    },
  };
}

function buildTarget(rootDir: string, changeDir: string, changeName: string, artifact: GeneratableArtifact, input: JsonRecord): GeneratedTarget {
  switch (artifact) {
    case "proposal":
      return {
        artifact: buildProposalArtifact(changeName, input),
        artifactType: "change_proposal",
        absolutePath: path.join(changeDir, "proposal.yaml"),
      };
    case "design":
      return {
        artifact: buildDesignArtifact(changeName, input),
        artifactType: "change_design",
        absolutePath: path.join(changeDir, "design.yaml"),
      };
    case "tasks":
      return {
        artifact: buildTasksArtifact(changeName, input),
        artifactType: "task_list",
        absolutePath: path.join(changeDir, "tasks.yaml"),
      };
    case "questions":
      return {
        artifact: buildQuestionsArtifact(changeName, input),
        artifactType: "question_list",
        absolutePath: path.join(changeDir, "questions.yaml"),
      };
    case "delta-spec": {
      const deltaSpec = buildDeltaSpecArtifact(rootDir, input);
      return {
        artifact: deltaSpec.artifact,
        artifactType: "delta_spec",
        absolutePath: path.join(changeDir, "specs", deltaSpec.relativePath),
      };
    }
  }
}

export function isGeneratableArtifact(value: string): value is GeneratableArtifact {
  return (GENERATABLE_ARTIFACTS as readonly string[]).includes(value);
}

export function generateChangeArtifact(
  rootDir: string,
  changeName: string,
  artifact: GeneratableArtifact,
  inputFile: string,
): GenerateChangeArtifactResult {
  const changeDir = ensureExistingChangeDir(rootDir, changeName);
  const inputPath = path.resolve(rootDir, inputFile);
  const input = parseJsonInput(inputPath);
  const target = buildTarget(rootDir, changeDir, changeName, artifact, input);
  const artifactPath = normalizeRepoRelativePath(rootDir, target.absolutePath);

  const preWriteDiagnostics = validateGeneratedArtifact(target.artifactType, target.artifact, artifactPath);
  if (preWriteDiagnostics.length > 0) {
    throw new Error(formatInputDiagnostics(artifact, inputPath, preWriteDiagnostics));
  }

  const replaced = existsSync(target.absolutePath);
  mkdirSync(path.dirname(target.absolutePath), { recursive: true });
  writeFileSync(target.absolutePath, stringifyYamlDocument(target.artifact), "utf8");

  const writtenArtifact = parseYamlDocument<unknown>(readFileSync(target.absolutePath, "utf8"), { source: artifactPath });
  const diagnostics = validateGeneratedArtifact(target.artifactType, writtenArtifact, artifactPath);
  if (diagnostics.length > 0) {
    throw new Error(`written ${artifact} artifact is invalid: ${formatDiagnostics(diagnostics)}`);
  }

  return {
    changeName,
    artifact,
    artifactPath,
    replaced,
    valid: true,
    diagnostics,
  };
}
