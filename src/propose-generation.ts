import { existsSync, readFileSync } from "fs";
import path from "path";
import { reserveChangeContainer, unwindChangeContainer } from "./scaffold.js";
import { loadBundledSchemaByArtifactType, validateArtifact, type ValidationDiagnostic } from "./validation.js";
import { parseYamlDocument } from "./yaml.js";
import { commitYamlMutation } from "./yaml-mutation.js";
import { resolveYamlArtifactIdentifiers } from "./yaml-mutation-surface.js";

const STRICT_WORKFLOW_DIR = ".strict-spec-driven";

export const GENERATABLE_ARTIFACTS = ["proposal", "design", "questions", "tasks", "delta-spec", "delta-tech"] as const;
export type GeneratableArtifact = (typeof GENERATABLE_ARTIFACTS)[number];

export const TASK_SECTION_NAMES = ["Implementation", "Testing", "Verification"] as const;
const TASK_STATUS_VALUES = ["pending", "complete"] as const;

export type GenerationInputRecord = Record<string, unknown>;

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
  /**
   * Completeness signal for task lists only. `valid` reports write success like every other
   * artifact; `ready` reports whether the written task list is complete, and its shortfalls are
   * carried in `diagnostics`. Undefined for non-task artifacts.
   */
  ready?: boolean;
  /** Task ids deleted by `--remove`; present only when a tasks invocation removed something. */
  removedTasks?: string[];
  /** Artifact kind written, from the YAML mutation surface. */
  artifactKind?: string;
  /** Bundled schema key describing the written artifact; inspect it with `schema-show`. */
  schemaKey?: string;
  /** Cached schema path, present only when the shared schema cache holds the file. */
  schemaFilePath?: string;
  /** Bundled example key for the written artifact; inspect it with `sample-show`. */
  exampleKey?: string;
  /** Task ids named by `--remove` that were already absent, reported so the no-op is visible. */
  unmatchedRemovals?: string[];
};

function normalizeRepoRelativePath(rootDir: string, absolutePath: string): string {
  return path.relative(rootDir, absolutePath).split(path.sep).join("/");
}

function isRecord(value: unknown): value is GenerationInputRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown, fieldPath: string): GenerationInputRecord {
  if (!isRecord(value)) {
    throw new Error(`input field '${fieldPath}' must be an object`);
  }
  return value;
}

function asOptionalRecord(value: unknown, fieldPath: string): GenerationInputRecord | undefined {
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
    questions: ["$.open", "$.resolved"],
    tasks: ["$.sections", "$.testing_gates"],
    "delta-spec": ["$.target_spec", "$.mapping", "$.operations"],
    "delta-tech": ["$.target_standard", "$.standard", "$.mapping", "$.operations"],
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
  if (artifact === "design" || artifact === "questions" || artifact === "tasks") {
    if (fieldPath === "$.change") return "<change-name>";
  }
  if (artifact === "questions") {
    const openStatusMatch = fieldPath.match(/^\$\.open\[(\d+)\]\.status$/);
    if (openStatusMatch) return `$.open[${openStatusMatch[1]}]`;
    const resolvedStatusMatch = fieldPath.match(/^\$\.resolved\[(\d+)\]\.status$/);
    if (resolvedStatusMatch) return `$.resolved[${resolvedStatusMatch[1]}]`;
  }
  if ((artifact === "delta-spec" || artifact === "delta-tech") && fieldPath === "$.schema_file") {
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

/**
 * A rejected write is where a caller is most likely to be wrong about artifact shape, so the
 * message names the schema and example that describe it rather than only the offending fields.
 */
function formatRecoveryAssets(artifactType: string): string[] {
  const identifiers = resolveYamlArtifactIdentifiers(artifactType);
  if (identifiers.schemaKey === undefined) return [];

  const inspect = [
    `schema-show ${path.posix.basename(identifiers.schemaKey, ".yaml")}`,
    ...(identifiers.exampleKey === undefined
      ? []
      : [`sample-show ${path.posix.basename(identifiers.exampleKey, ".yaml")}`]),
  ];
  return [
    `Artifact kind ${identifiers.artifactKind ?? artifactType}; schema ${identifiers.schemaKey}${
      identifiers.schemaFilePath === undefined ? "" : ` (cached at ${identifiers.schemaFilePath})`
    }.`,
    `Inspect the contract with: ${inspect.join(", ")}`,
  ];
}

function formatGenerationDiagnostics(
  artifact: GeneratableArtifact,
  inputLabel: string,
  diagnostics: ValidationDiagnostic[],
  artifactType: string,
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
    `${inputLabel} is invalid for ${artifact}; fix these field(s):`,
    ...lines,
    ...formatRecoveryAssets(artifactType),
  ].join("\n");
}

function buildProposalArtifact(changeName: string, input: GenerationInputRecord): unknown {
  const summary = asRecord(input.summary, "$.summary");
  const scope = asRecord(input.scope, "$.scope");
  const status = asOptionalString(input.status, "$.status") ?? "proposed";
  const artifact: GenerationInputRecord = {
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

function buildDesignArtifact(changeName: string, input: GenerationInputRecord): unknown {
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

const QUESTION_KIND_VALUES = new Set(["requirement", "technical"]);
const ANSWERED_BY_VALUES = new Set(["human", "roadmap", "assumption"]);

/**
 * Copies the optional attribution fields onto a normalized question. They are optional so that
 * question lists written before the requirement-interrogation contract stay valid, but an
 * out-of-set value is rejected here rather than being dropped on the floor.
 */
function applyQuestionAttribution(
  target: GenerationInputRecord,
  record: GenerationInputRecord,
  fieldPath: string,
): GenerationInputRecord {
  if (record.kind !== undefined) {
    const kind = asString(record.kind, `${fieldPath}.kind`);
    if (!QUESTION_KIND_VALUES.has(kind)) {
      throw new Error(`input field '${fieldPath}.kind' must be one of: requirement, technical`);
    }
    target.kind = kind;
  }
  if (record.answered_by !== undefined) {
    const answeredBy = asString(record.answered_by, `${fieldPath}.answered_by`);
    if (!ANSWERED_BY_VALUES.has(answeredBy)) {
      throw new Error(`input field '${fieldPath}.answered_by' must be one of: human, roadmap, assumption`);
    }
    target.answered_by = answeredBy;
  }
  return target;
}

function normalizeOpenQuestion(question: unknown, index: number): GenerationInputRecord {
  const record = asRecord(question, `$.open[${index}]`);
  return applyQuestionAttribution({
    id: asString(record.id, `$.open[${index}].id`),
    question: asString(record.question, `$.open[${index}].question`),
    context: asString(record.context, `$.open[${index}].context`),
    status: "open",
  }, record, `$.open[${index}]`);
}

function normalizeResolvedQuestion(question: unknown, index: number): GenerationInputRecord {
  const record = asRecord(question, `$.resolved[${index}]`);
  return applyQuestionAttribution({
    id: asString(record.id, `$.resolved[${index}].id`),
    question: asString(record.question, `$.resolved[${index}].question`),
    context: asString(record.context, `$.resolved[${index}].context`),
    answer: asString(record.answer, `$.resolved[${index}].answer`),
    status: "resolved",
  }, record, `$.resolved[${index}]`);
}

function buildQuestionsArtifact(changeName: string, input: GenerationInputRecord): unknown {
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

function normalizeTaskRecord(task: unknown, fieldPath: string): GenerationInputRecord {
  const record = asRecord(task, fieldPath);
  const status = asOptionalString(record.status, `${fieldPath}.status`) ?? "pending";
  if (!(TASK_STATUS_VALUES as readonly string[]).includes(status)) {
    throw new Error(`input field '${fieldPath}.status' must be one of: ${TASK_STATUS_VALUES.join(", ")}`);
  }
  const normalized: GenerationInputRecord = {
    text: asString(record.text, `${fieldPath}.text`),
    status,
  };
  const command = asOptionalString(record.command, `${fieldPath}.command`);
  if (command !== undefined) {
    normalized.command = command;
  }
  return normalized;
}

function buildTaskListArtifact(changeName: string, input: GenerationInputRecord): unknown {
  const sectionsInput = asRecord(input.sections, "$.sections");
  const gatesInput = asRecord(input.testing_gates, "$.testing_gates");

  const sections: GenerationInputRecord = {};
  for (const sectionName of TASK_SECTION_NAMES) {
    const sectionInput = sectionsInput[sectionName];
    if (sectionInput === undefined) continue;
    const sectionRecord = asRecord(sectionInput, `$.sections.${sectionName}`);
    const taskEntries = Object.entries(sectionRecord);
    if (taskEntries.length === 0) continue;
    const sectionTasks: GenerationInputRecord = {};
    for (const [taskId, task] of taskEntries) {
      sectionTasks[taskId] = normalizeTaskRecord(task, `$.sections.${sectionName}.${taskId}`);
    }
    sections[sectionName] = sectionTasks;
  }

  const unknownSections = Object.keys(sectionsInput).filter(
    (name) => !(TASK_SECTION_NAMES as readonly string[]).includes(name),
  );
  if (unknownSections.length > 0) {
    throw new Error(`input field '$.sections' has unknown section(s): ${unknownSections.join(", ")}`);
  }

  return {
    schema: "strict-spec-driven/task-list/v2",
    schema_version: 2,
    artifact_type: "task_list",
    schema_file: "templates/strict-spec-driven/schemas/task-list.yaml",
    change: changeName,
    sections,
    testing_gates: {
      // Gates may be empty while a task list is still being built one task at a time; the empty
      // string is schema-valid and surfaces as a non-fatal readiness diagnostic.
      validation_task: asGateReference(gatesInput.validation_task, "$.testing_gates.validation_task"),
      unit_test_task: asGateReference(gatesInput.unit_test_task, "$.testing_gates.unit_test_task"),
    },
  };
}

function asGateReference(value: unknown, fieldPath: string): string {
  if (typeof value !== "string") {
    throw new Error(`input field '${fieldPath}' must be a string`);
  }
  return value;
}

type TaskListShape = {
  sections?: Record<string, Record<string, unknown> | undefined>;
  testing_gates?: { validation_task?: unknown; unit_test_task?: unknown };
};

export function computeTaskListReadiness(artifact: unknown, artifactPath: string): ValidationDiagnostic[] {
  const shape = (isRecord(artifact) ? artifact : {}) as TaskListShape;
  const sections = shape.sections ?? {};
  const testingTaskIds = Object.keys(sections.Testing ?? {});
  const diagnostics: ValidationDiagnostic[] = [];

  for (const sectionName of TASK_SECTION_NAMES) {
    if (Object.keys(sections[sectionName] ?? {}).length === 0) {
      diagnostics.push({
        source: "reference",
        artifactPath,
        fieldPath: `$.sections.${sectionName}`,
        message: `task list has no ${sectionName} task yet; add at least one before verify`,
      });
    }
  }

  for (const gate of ["validation_task", "unit_test_task"] as const) {
    const reference = shape.testing_gates?.[gate];
    if (typeof reference !== "string" || reference.length === 0) {
      diagnostics.push({
        source: "reference",
        artifactPath,
        fieldPath: `$.testing_gates.${gate}`,
        message: `testing gate '${gate}' is not set yet; set it with --${gate.replaceAll("_", "-")}`,
      });
      continue;
    }
    if (!testingTaskIds.includes(reference)) {
      diagnostics.push({
        source: "reference",
        artifactPath,
        fieldPath: `$.testing_gates.${gate}`,
        message: `testing gate '${gate}' references '${reference}', which is not a task in the Testing section`,
      });
    }
  }

  return diagnostics;
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

function resolveDeltaSpecRelativePath(rootDir: string, targetSpec: string, input: GenerationInputRecord): string {
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

function buildDeltaSpecArtifact(rootDir: string, input: GenerationInputRecord): { artifact: unknown; relativePath: string } {
  const targetSpec = asString(input.target_spec, "$.target_spec");
  const mapping = asRecord(input.mapping, "$.mapping");
  const operations = asRecord(input.operations ?? {}, "$.operations");
  const relativePath = resolveDeltaSpecRelativePath(rootDir, targetSpec, input);
  const specBlock = asOptionalRecord(input.spec, "$.spec");

  const artifact: GenerationInputRecord = {
    schema: "strict-spec-driven/delta-spec/v1",
    schema_version: 1,
    artifact_type: "delta_spec",
    schema_file: "templates/strict-spec-driven/schemas/delta-spec.yaml",
    target_spec: targetSpec,
  };

  if (specBlock) {
    artifact.spec = {
      title: asString(specBlock.title, "$.spec.title"),
      path: asString(specBlock.path, "$.spec.path"),
    };
  }

  artifact.mapping = {
    implementation: asStringArray(mapping.implementation ?? [], "$.mapping.implementation"),
    tests: asStringArray(mapping.tests ?? [], "$.mapping.tests"),
  };
  artifact.operations = {
    ADDED: asRecord(operations.ADDED ?? {}, "$.operations.ADDED"),
    MODIFIED: asRecord(operations.MODIFIED ?? {}, "$.operations.MODIFIED"),
    REMOVED: asRecord(operations.REMOVED ?? {}, "$.operations.REMOVED"),
  };

  return { relativePath, artifact };
}

function normalizeDeltaTechRelativePath(relativePath: string): string {
  let normalized = relativePath.replaceAll("\\", "/");
  const strictTechPrefix = `${STRICT_WORKFLOW_DIR}/tech/`;
  if (normalized.startsWith(strictTechPrefix)) {
    normalized = normalized.slice(strictTechPrefix.length);
  }
  if (path.isAbsolute(normalized)) {
    throw new Error("input field '$.tech_path' must be relative to the strict tech directory");
  }
  const parts = normalized.split("/");
  if (
    normalized.length === 0
    || parts.some((part) => part.length === 0 || part === "." || part === "..")
    || path.basename(normalized) === "INDEX.yaml"
    || !(normalized.endsWith(".yaml") || normalized.endsWith(".yml"))
  ) {
    throw new Error("input field '$.tech_path' must be a normalized YAML path under the strict tech directory");
  }
  return normalized;
}

function readTechIndexPathForTarget(rootDir: string, targetStandard: string): string | undefined {
  const indexPath = path.join(rootDir, STRICT_WORKFLOW_DIR, "tech", "INDEX.yaml");
  if (!existsSync(indexPath)) return undefined;
  const index = parseYamlDocument<{ standards?: Array<{ id?: unknown; path?: unknown }> }>(
    readFileSync(indexPath, "utf8"),
    { source: normalizeRepoRelativePath(rootDir, indexPath) },
  );
  const match = (index.standards ?? []).find((candidate) => candidate.id === targetStandard);
  return typeof match?.path === "string" ? match.path : undefined;
}

function resolveDeltaTechRelativePath(rootDir: string, targetStandard: string, input: GenerationInputRecord): string {
  const explicitPath = asOptionalString(input.tech_path, "$.tech_path");
  if (explicitPath) {
    return normalizeDeltaTechRelativePath(explicitPath);
  }

  const indexedPath = readTechIndexPathForTarget(rootDir, targetStandard);
  if (indexedPath) {
    return normalizeDeltaTechRelativePath(indexedPath);
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(targetStandard)) {
    throw new Error("input field '$.tech_path' is required when target_standard is not a kebab-case standard id");
  }
  return `${targetStandard}.yaml`;
}

function buildDeltaTechArtifact(rootDir: string, input: GenerationInputRecord): { artifact: unknown; relativePath: string } {
  const targetStandard = asString(input.target_standard, "$.target_standard");
  const mapping = asRecord(input.mapping, "$.mapping");
  const operations = asRecord(input.operations ?? {}, "$.operations");
  const relativePath = resolveDeltaTechRelativePath(rootDir, targetStandard, input);
  const standardBlock = asOptionalRecord(input.standard, "$.standard");

  const artifact: GenerationInputRecord = {
    schema: "strict-spec-driven/delta-tech/v1",
    schema_version: 1,
    artifact_type: "delta_tech",
    schema_file: "templates/strict-spec-driven/schemas/delta-tech.yaml",
    target_standard: targetStandard,
  };

  if (standardBlock) {
    artifact.standard = {
      title: asString(standardBlock.title, "$.standard.title"),
      category: asString(standardBlock.category, "$.standard.category"),
    };
  }

  artifact.mapping = {
    implementation: asStringArray(mapping.implementation ?? [], "$.mapping.implementation"),
    enforcement: asStringArray(mapping.enforcement ?? [], "$.mapping.enforcement"),
  };
  artifact.operations = {
    ADDED: asRecord(operations.ADDED ?? {}, "$.operations.ADDED"),
    MODIFIED: asRecord(operations.MODIFIED ?? {}, "$.operations.MODIFIED"),
    REMOVED: asRecord(operations.REMOVED ?? {}, "$.operations.REMOVED"),
  };

  return { relativePath, artifact };
}

function buildTarget(
  rootDir: string,
  changeDir: string,
  changeName: string,
  artifact: GeneratableArtifact,
  input: GenerationInputRecord,
): GeneratedTarget {
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
    case "questions":
      return {
        artifact: buildQuestionsArtifact(changeName, input),
        artifactType: "question_list",
        absolutePath: path.join(changeDir, "questions.yaml"),
      };
    case "tasks":
      return {
        artifact: buildTaskListArtifact(changeName, input),
        artifactType: "task_list",
        absolutePath: path.join(changeDir, "tasks.yaml"),
      };
    case "delta-spec": {
      const deltaSpec = buildDeltaSpecArtifact(rootDir, input);
      return {
        artifact: deltaSpec.artifact,
        artifactType: "delta_spec",
        absolutePath: path.join(changeDir, "specs", deltaSpec.relativePath),
      };
    }
    case "delta-tech": {
      const deltaTech = buildDeltaTechArtifact(rootDir, input);
      return {
        artifact: deltaTech.artifact,
        artifactType: "delta_tech",
        absolutePath: path.join(changeDir, "tech", deltaTech.relativePath),
      };
    }
  }
}

export function isGeneratableArtifact(value: string): value is GeneratableArtifact {
  return (GENERATABLE_ARTIFACTS as readonly string[]).includes(value);
}

function writeGeneratedArtifact(
  rootDir: string,
  changeName: string,
  artifact: GeneratableArtifact,
  input: GenerationInputRecord,
  inputLabel: string,
): GenerateChangeArtifactResult {
  // Authoring is the operation that brings a change into existence: whichever call runs first
  // reserves the container, and every path this call created is unwound if anything below rejects,
  // so a failed first write leaves no change behind and a failed later write leaves the existing
  // change untouched.
  const reservation = reserveChangeContainer(rootDir, changeName);
  try {
    return writeGeneratedArtifactIntoContainer(
      rootDir,
      reservation.changeDir,
      changeName,
      artifact,
      input,
      inputLabel,
    );
  } catch (error) {
    unwindChangeContainer(reservation);
    throw error;
  }
}

function writeGeneratedArtifactIntoContainer(
  rootDir: string,
  changeDir: string,
  changeName: string,
  artifact: GeneratableArtifact,
  input: GenerationInputRecord,
  inputLabel: string,
): GenerateChangeArtifactResult {
  const target = buildTarget(rootDir, changeDir, changeName, artifact, input);
  const artifactPath = normalizeRepoRelativePath(rootDir, target.absolutePath);

  const preWriteDiagnostics = validateGeneratedArtifact(target.artifactType, target.artifact, artifactPath);
  if (preWriteDiagnostics.length > 0) {
    throw new Error(formatGenerationDiagnostics(artifact, inputLabel, preWriteDiagnostics, target.artifactType));
  }

  const replaced = existsSync(target.absolutePath);
  const mutation = commitYamlMutation({
    rootDir,
    mutations: [{
      artifactFamily: "strict-change",
      artifactId: `${changeName}/${artifact}`,
      schemaId: target.artifactType,
      familyRoot: changeDir,
      absolutePath: target.absolutePath,
      operation: replaced ? "update" : "create",
      candidate: target.artifact,
      validateCandidate: (candidate, context) => validateGeneratedArtifact(
        target.artifactType,
        candidate,
        context.artifactPath,
      ).map((entry) => ({
        code: entry.source,
        fieldPath: entry.fieldPath,
        message: entry.message,
        expected: entry.expected,
        actual: entry.actual,
      })),
    }],
  });
  if (!mutation.valid) {
    throw new Error([
      `failed to write ${artifact} artifact: ${mutation.diagnostics.map((entry) => `${entry.code} ${entry.artifactPath} ${entry.fieldPath}: ${entry.message}`).join("; ")}`,
      ...formatRecoveryAssets(target.artifactType),
    ].join("\n"));
  }

  const writtenArtifact = parseYamlDocument<unknown>(readFileSync(target.absolutePath, "utf8"), { source: artifactPath });
  const diagnostics = validateGeneratedArtifact(target.artifactType, writtenArtifact, artifactPath);
  if (diagnostics.length > 0) {
    throw new Error(`written ${artifact} artifact is invalid: ${formatDiagnostics(diagnostics)}`);
  }

  const identifiers = resolveYamlArtifactIdentifiers(target.artifactType);

  // Task lists are built one task at a time, so the artifact is structurally valid at every step
  // but may still be incomplete. The write itself succeeded (schema-validated above), so `valid`
  // is true; completeness gaps (missing sections, unresolved testing gates) are reported through
  // the separate `ready` flag and its diagnostics, with verify remaining the authoritative gate.
  if (artifact === "tasks") {
    const readiness = computeTaskListReadiness(writtenArtifact, artifactPath);
    return {
      changeName,
      artifact,
      artifactPath,
      replaced,
      valid: true,
      diagnostics: readiness,
      ready: readiness.length === 0,
      ...identifiers,
    };
  }

  return {
    changeName,
    artifact,
    artifactPath,
    replaced,
    valid: true,
    diagnostics: [],
    ...identifiers,
  };
}

export function generateChangeArtifactFromInput(
  rootDir: string,
  changeName: string,
  artifact: GeneratableArtifact,
  input: GenerationInputRecord,
): GenerateChangeArtifactResult {
  return writeGeneratedArtifact(rootDir, changeName, artifact, input, "command input");
}
