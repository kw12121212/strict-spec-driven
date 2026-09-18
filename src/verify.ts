import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { formatYamlParseSummary, getYamlDiagnosticDetails, getYamlParseDetails, parseYamlDocument, type YamlDiagnosticDetails } from "./yaml.js";
import {
  loadBundledSchemaByArtifactType,
  validateArtifact,
  type ValidationDiagnostic,
} from "./validation.js";
import { TASK_SECTION_NAMES } from "./propose-generation.js";
import { collectSceneCoverageDiagnostics } from "./scenes.js";

const STRICT_WORKFLOW_DIR = ".strict-spec-driven";
const FORBIDDEN_SPEC_SUBDIRS = new Set([".strict-spec-driven", "changes", "archive"]);

type TaskMap = Record<string, { text: string; status: string; command?: string }>;

type TaskListArtifact = {
  sections: Record<string, TaskMap>;
  testing_gates?: {
    validation_task?: string;
    unit_test_task?: string;
  };
};

type QuestionListArtifact = {
  open?: unknown[];
};

type DeltaSpecArtifact = {
  target_spec?: unknown;
  spec?: unknown;
  operations?: {
    ADDED?: Record<string, unknown>;
    MODIFIED?: Record<string, unknown>;
    REMOVED?: Record<string, unknown>;
  };
};

type DeltaTechArtifact = {
  target_standard?: unknown;
  standard?: unknown;
  operations?: {
    ADDED?: Record<string, unknown>;
    MODIFIED?: Record<string, unknown>;
    REMOVED?: Record<string, unknown>;
  };
};

type MainSpecRequirementIndex = {
  artifactPath: string;
  requirementIds: Set<string>;
};

type MainTechRuleIndex = {
  artifactPath: string;
  ruleIds: Set<string>;
};

export type VerifyDiagnostic = {
  source: string;
  artifactPath: string;
  fieldPath: string;
  message: string;
  expected?: string;
  actual?: string;
} & YamlDiagnosticDetails;

export type VerifyResult = {
  valid: boolean;
  diagnostics: VerifyDiagnostic[];
  changeName: string;
  totalTasks: number;
  completeTasks: number;
  remainingPending: number;
  openQuestionCount: number;
};

function collectDiagnostics(
  results: ValidationDiagnostic[],
): VerifyDiagnostic[] {
  return results.map((d) => ({
    source: d.source,
    artifactPath: d.artifactPath,
    fieldPath: d.fieldPath,
    message: d.message,
    expected: d.expected,
    actual: d.actual,
  }));
}

function makeYamlParseDiagnostic(
  artifactPath: string,
  message: string,
  error: unknown,
): VerifyDiagnostic {
  const yamlDetails = getYamlParseDetails(error);
  const yamlDiagnosticDetails = getYamlDiagnosticDetails(error);
  return {
    source: "yaml_parse",
    artifactPath,
    fieldPath: "$",
    message,
    expected: "parseable YAML mapping",
    actual: yamlDetails ? formatYamlParseSummary(yamlDetails) : error instanceof Error ? error.message : String(error),
    ...yamlDiagnosticDetails,
  };
}

function validateArtifactSchema(
  artifactType: string,
  artifact: unknown,
  artifactPath: string,
): VerifyDiagnostic[] {
  const diagnostics: VerifyDiagnostic[] = [];

  const record = artifact as Record<string, unknown> | null;
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    diagnostics.push({
      source: "schema",
      artifactPath,
      fieldPath: "$",
      message: "artifact is not a YAML mapping",
      expected: "YAML mapping",
      actual: String(typeof artifact),
    });
    return diagnostics;
  }

  const expectedArtifactType = artifactType;
  if (record.artifact_type !== expectedArtifactType) {
    diagnostics.push({
      source: "schema",
      artifactPath,
      fieldPath: "$.artifact_type",
      message: `artifact_type mismatch`,
      expected: expectedArtifactType,
      actual: String(record.artifact_type),
    });
  }

  const schema = loadBundledSchemaByArtifactType(artifactType);
  const result = validateArtifact(schema, artifact, artifactPath);
  diagnostics.push(...collectDiagnostics(result.diagnostics));

  return diagnostics;
}

function checkTaskCompletion(
  artifact: TaskListArtifact,
  artifactPath: string,
): { diagnostics: VerifyDiagnostic[]; totalTasks: number; completeTasks: number } {
  let totalTasks = 0;
  let completeTasks = 0;
  const diagnostics: VerifyDiagnostic[] = [];

  for (const [sectionName, taskMap] of Object.entries(artifact.sections ?? {})) {
    for (const [taskId, task] of Object.entries(taskMap ?? {})) {
      totalTasks += 1;
      if (task.status === "complete") {
        completeTasks += 1;
      } else {
        diagnostics.push({
          source: "task_completion",
          artifactPath,
          fieldPath: `$.sections.${sectionName}.${taskId}`,
          message: `task '${taskId}' has status '${task.status}', expected 'complete'`,
          expected: "complete",
          actual: task.status,
        });
      }
    }
  }

  return { diagnostics, totalTasks, completeTasks };
}

function checkOpenQuestions(
  artifact: QuestionListArtifact,
  artifactPath: string,
): { diagnostics: VerifyDiagnostic[]; openCount: number } {
  const open = artifact.open ?? [];
  const diagnostics: VerifyDiagnostic[] = [];

  if (open.length > 0) {
    diagnostics.push({
      source: "open_questions",
      artifactPath,
      fieldPath: "$.open",
      message: `questions.yaml has ${open.length} unresolved open question(s)`,
      expected: "0 open questions",
      actual: `${open.length} open question(s)`,
    });
  }

  return { diagnostics, openCount: open.length };
}

function checkTestingGates(
  artifact: TaskListArtifact,
  artifactPath: string,
): VerifyDiagnostic[] {
  const diagnostics: VerifyDiagnostic[] = [];
  const gates = artifact.testing_gates;
  if (!gates) return diagnostics;

  const testingMap = artifact.sections?.["Testing"];
  const testingTaskIds = new Set(testingMap ? Object.keys(testingMap) : []);

  const gateRefs: [string, string | undefined][] = [
    ["validation_task", gates.validation_task],
    ["unit_test_task", gates.unit_test_task],
  ];

  for (const [gateName, taskId] of gateRefs) {
    if (taskId !== undefined && !testingTaskIds.has(taskId)) {
      diagnostics.push({
        source: "testing_gates",
        artifactPath,
        fieldPath: `$.testing_gates.${gateName}`,
        message: `testing gate '${gateName}' references task '${taskId}' which does not exist in the Testing section`,
        expected: "existing Testing section task ID",
        actual: taskId,
      });
    }
  }

  return diagnostics;
}

function checkTaskListCompleteness(
  artifact: TaskListArtifact,
  artifactPath: string,
): VerifyDiagnostic[] {
  const diagnostics: VerifyDiagnostic[] = [];
  const sections = artifact.sections ?? {};

  // A change task list must exercise all three phases; an empty required section means the phase
  // was never planned and would otherwise sail through to archive.
  for (const sectionName of TASK_SECTION_NAMES) {
    if (Object.keys(sections[sectionName] ?? {}).length === 0) {
      diagnostics.push({
        source: "task_completeness",
        artifactPath,
        fieldPath: `$.sections.${sectionName}`,
        message: `task list section '${sectionName}' has no tasks; add at least one before archiving`,
        expected: "at least one task",
        actual: "no tasks",
      });
    }
  }

  return diagnostics;
}


function validateDeltaSpecs(
  changeDir: string,
  artifactPathPrefix: string,
): VerifyDiagnostic[] {
  const specsDir = path.join(changeDir, "specs");
  if (!existsSync(specsDir)) return [];

  const diagnostics: VerifyDiagnostic[] = [];

  function scanDir(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml"))) {
        const relativePath = path.relative(specsDir, fullPath).split(path.sep).join("/");
        const content = readFileSync(fullPath, "utf8");
        const artifactPath = `${artifactPathPrefix}/${relativePath}`;
        let artifact: unknown;
        try {
          artifact = parseYamlDocument<unknown>(content, { source: artifactPath });
        } catch (error) {
          diagnostics.push(makeYamlParseDiagnostic(artifactPath, "delta spec is not valid YAML", error));
          continue;
        }
        diagnostics.push(
          ...validateArtifactSchema("delta_spec", artifact, artifactPath),
        );
      }
    }
  }

  scanDir(specsDir);
  return diagnostics;
}

/**
 * Schema-validates the delta scenes a change carries, so a change-level scene artifact is a real
 * participant in the lifecycle rather than a file only its writer ever checked. This is artifact
 * validation only: whether a merged scene step names a covering requirement is decided against the
 * merged scene state by collectSceneCoverageDiagnostics, which runs once these diagnostics are clear.
 */
function validateDeltaScenes(
  changeDir: string,
  artifactPathPrefix: string,
): VerifyDiagnostic[] {
  const scenesDir = path.join(changeDir, "scenes");
  if (!existsSync(scenesDir)) return [];

  const diagnostics: VerifyDiagnostic[] = [];

  function scanDir(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
        continue;
      }
      if (!entry.isFile() || !(entry.name.endsWith(".yaml") || entry.name.endsWith(".yml"))) continue;
      const relativePath = path.relative(scenesDir, fullPath).split(path.sep).join("/");
      const artifactPath = `${artifactPathPrefix}/${relativePath}`;
      let artifact: unknown;
      try {
        artifact = parseYamlDocument<unknown>(readFileSync(fullPath, "utf8"), { source: artifactPath });
      } catch (error) {
        diagnostics.push(makeYamlParseDiagnostic(artifactPath, "delta scene is not valid YAML", error));
        continue;
      }
      diagnostics.push(...validateArtifactSchema("delta_scene", artifact, artifactPath));
    }
  }

  scanDir(scenesDir);
  return diagnostics;
}

function validateDeltaTech(
  changeDir: string,
  artifactPathPrefix: string,
): VerifyDiagnostic[] {
  const techDir = path.join(changeDir, "tech");
  if (!existsSync(techDir)) return [];

  const diagnostics: VerifyDiagnostic[] = [];

  function scanDir(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml"))) {
        const relativePath = path.relative(techDir, fullPath).split(path.sep).join("/");
        const content = readFileSync(fullPath, "utf8");
        const artifactPath = `${artifactPathPrefix}/${relativePath}`;
        let artifact: unknown;
        try {
          artifact = parseYamlDocument<unknown>(content, { source: artifactPath });
        } catch (error) {
          diagnostics.push(makeYamlParseDiagnostic(artifactPath, "delta tech is not valid YAML", error));
          continue;
        }
        diagnostics.push(
          ...validateArtifactSchema("delta_tech", artifact, artifactPath),
        );
      }
    }
  }

  scanDir(techDir);
  return diagnostics;
}

function listYamlFiles(directoryPath: string): string[] {
  if (!existsSync(directoryPath)) {
    return [];
  }

  const files: string[] = [];

  function walk(currentPath: string): void {
    const entries = readdirSync(currentPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.isFile() && (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml"))) {
        files.push(fullPath);
      }
    }
  }

  walk(directoryPath);
  return files;
}

function buildMainSpecRequirementIndex(rootDir: string): {
  diagnostics: VerifyDiagnostic[];
  specsById: Map<string, MainSpecRequirementIndex>;
} {
  const specsRoot = path.join(rootDir, STRICT_WORKFLOW_DIR, "specs");
  const diagnostics: VerifyDiagnostic[] = [];
  const specsById = new Map<string, MainSpecRequirementIndex>();

  for (const specPath of listYamlFiles(specsRoot)) {
    if (path.basename(specPath) === "INDEX.yaml") {
      continue;
    }

    const artifactPath = path.relative(rootDir, specPath).split(path.sep).join("/");
    const content = readFileSync(specPath, "utf8");
    let artifact: unknown;
    try {
      artifact = parseYamlDocument<unknown>(content, { source: artifactPath });
    } catch (error) {
      diagnostics.push(makeYamlParseDiagnostic(artifactPath, "main spec is not valid YAML", error));
      continue;
    }

    if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
      continue;
    }

    const record = artifact as Record<string, unknown>;
    if (record.artifact_type !== "main_spec") {
      continue;
    }

    const spec = record.spec;
    if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
      continue;
    }

    const specId = (spec as Record<string, unknown>).id;
    if (typeof specId !== "string" || specId.length === 0) {
      continue;
    }

    const requirements = record.requirements;
    if (!requirements || typeof requirements !== "object" || Array.isArray(requirements)) {
      continue;
    }

    specsById.set(specId, {
      artifactPath,
      requirementIds: new Set(Object.keys(requirements)),
    });
  }

  return { diagnostics, specsById };
}

function checkAddedRequirementCollisions(
  rootDir: string,
  changeDir: string,
): VerifyDiagnostic[] {
  const diagnostics: VerifyDiagnostic[] = [];
  const { diagnostics: mainSpecDiagnostics, specsById } = buildMainSpecRequirementIndex(rootDir);
  diagnostics.push(...mainSpecDiagnostics);

  const specsDir = path.join(changeDir, "specs");
  for (const deltaSpecPath of listYamlFiles(specsDir)) {
    const artifactPath = path.relative(rootDir, deltaSpecPath).split(path.sep).join("/");
    const content = readFileSync(deltaSpecPath, "utf8");
    let artifact: DeltaSpecArtifact;
    try {
      artifact = parseYamlDocument<DeltaSpecArtifact>(content, { source: artifactPath });
    } catch {
      continue;
    }

    if (typeof artifact.target_spec !== "string" || artifact.target_spec.length === 0) {
      continue;
    }

    const targetSpec = specsById.get(artifact.target_spec);
    if (!targetSpec) {
      continue;
    }

    const added = artifact.operations?.ADDED;
    if (!added || typeof added !== "object" || Array.isArray(added)) {
      continue;
    }

    for (const requirementId of Object.keys(added).sort()) {
      if (!targetSpec.requirementIds.has(requirementId)) {
        continue;
      }

      diagnostics.push({
        source: "added_requirement_collision",
        artifactPath,
        fieldPath: `$.operations.ADDED.${requirementId}`,
        message: `ADDED requirement '${requirementId}' already exists in target main spec '${artifact.target_spec}'`,
        expected: "ADDED requirement id absent from target main spec",
        actual: `existing requirement '${requirementId}' in ${targetSpec.artifactPath}`,
      });
    }
  }

  return diagnostics;
}

function checkNewSpecDeltaRules(
  rootDir: string,
  changeDir: string,
): VerifyDiagnostic[] {
  const diagnostics: VerifyDiagnostic[] = [];
  const { specsById } = buildMainSpecRequirementIndex(rootDir);

  const existingPaths = new Set<string>();
  for (const entry of specsById.values()) {
    existingPaths.add(entry.artifactPath);
  }

  const specsDir = path.join(changeDir, "specs");
  for (const deltaSpecPath of listYamlFiles(specsDir)) {
    const artifactPath = path.relative(rootDir, deltaSpecPath).split(path.sep).join("/");
    const content = readFileSync(deltaSpecPath, "utf8");
    let artifact: DeltaSpecArtifact;
    try {
      artifact = parseYamlDocument<DeltaSpecArtifact>(content, { source: artifactPath });
    } catch {
      continue;
    }

    const specBlock = artifact.spec;
    const hasSpecBlock =
      specBlock !== null && typeof specBlock === "object" && !Array.isArray(specBlock);
    if (!hasSpecBlock) {
      // Not a new-spec delta; modify-existing rules are enforced elsewhere.
      continue;
    }

    if (typeof artifact.target_spec !== "string" || artifact.target_spec.length === 0) {
      continue;
    }
    const targetSpec = artifact.target_spec;
    const block = specBlock as Record<string, unknown>;
    const title = block.title;
    const targetPath = block.path;

    if (
      typeof title !== "string" ||
      title.length === 0 ||
      typeof targetPath !== "string" ||
      targetPath.length === 0
    ) {
      diagnostics.push({
        source: "new_spec_metadata",
        artifactPath,
        fieldPath: "$.spec",
        message: `delta spec creates new main spec '${targetSpec}' and must provide spec.title and spec.path`,
        expected: "spec block with non-empty title and path",
        actual: "incomplete spec block",
      });
    }

    const existingById = specsById.get(targetSpec);
    if (existingById) {
      diagnostics.push({
        source: "new_spec_collision",
        artifactPath,
        fieldPath: "$.target_spec",
        message: `new-spec delta target '${targetSpec}' already exists as a main spec`,
        expected: "new-spec target id absent from existing main specs",
        actual: `existing main spec '${targetSpec}' in ${existingById.artifactPath}`,
      });
    }

    if (typeof targetPath === "string" && targetPath.length > 0) {
      const normalized = targetPath.split(path.sep).join("/");
      const specsPrefix = `${STRICT_WORKFLOW_DIR}/specs/`;
      const isUnderSpecs = normalized.startsWith(specsPrefix);
      const isYaml = normalized.endsWith(".yaml");
      const hasTraversal = normalized.split("/").includes("..");
      const isIndex = path.basename(normalized) === "INDEX.yaml";
      if (!isUnderSpecs || !isYaml || hasTraversal || isIndex) {
        diagnostics.push({
          source: "new_spec_path",
          artifactPath,
          fieldPath: "$.spec.path",
          message: `new-spec delta path '${targetPath}' must be a repo-relative .yaml file under ${specsPrefix}, not INDEX.yaml, and must not use parent traversal`,
          expected: `repo-relative .yaml path under ${specsPrefix}`,
          actual: normalized,
        });
      } else if (existingPaths.has(normalized)) {
        diagnostics.push({
          source: "new_spec_path",
          artifactPath,
          fieldPath: "$.spec.path",
          message: `new-spec delta path '${targetPath}' collides with an existing main spec file`,
          expected: "new-spec path absent from existing main spec files",
          actual: normalized,
        });
      }
    }

    const modified = artifact.operations?.MODIFIED;
    const removed = artifact.operations?.REMOVED;
    const modifiedCount =
      modified && typeof modified === "object" && !Array.isArray(modified)
        ? Object.keys(modified).length
        : 0;
    const removedCount =
      removed && typeof removed === "object" && !Array.isArray(removed)
        ? Object.keys(removed).length
        : 0;
    if (modifiedCount > 0 || removedCount > 0) {
      diagnostics.push({
        source: "new_spec_operations",
        artifactPath,
        fieldPath: "$.operations",
        message: `new-spec delta '${targetSpec}' must keep MODIFIED and REMOVED empty`,
        expected: "empty MODIFIED and REMOVED on a new-spec delta",
        actual: `${modifiedCount} modified, ${removedCount} removed`,
      });
    }

    const added = artifact.operations?.ADDED;
    const addedCount =
      added && typeof added === "object" && !Array.isArray(added) ? Object.keys(added).length : 0;
    if (addedCount === 0) {
      diagnostics.push({
        source: "new_spec_operations",
        artifactPath,
        fieldPath: "$.operations.ADDED",
        message: `new-spec delta '${targetSpec}' must supply at least one ADDED requirement`,
        expected: "at least one ADDED requirement",
        actual: "no ADDED requirements",
      });
    }
  }

  return diagnostics;
}

// Shared remediation message for a delta spec whose target_spec cannot be
// resolved at verify or archive time. It names the delta file, the failing
// field, the unresolvable id, and the two concrete fixes with a ready-to-run
// command and the index to consult, so the reader never has to guess.
export function formatUnresolvableDeltaTargetMessage(
  changeName: string,
  deltaArtifactPath: string,
  targetSpec: string,
): string {
  return (
    `delta spec '${deltaArtifactPath}' sets target_spec '${targetSpec}', which resolves to no existing main spec ` +
    `and to no sibling delta that creates it in this change, so archive cannot merge it. Fix one of the following: ` +
    `(A) If '${targetSpec}' should be a NEW main spec, add a new-spec seed block by running: ` +
    `strict-spec-cli generate ${changeName} delta-spec --target-spec ${targetSpec} ` +
    `--title "<Spec Title>" --new-spec-path .strict-spec-driven/specs/${targetSpec}.yaml. ` +
    `(B) If the target is wrong, correct the 'target_spec' field in '${deltaArtifactPath}' ` +
    `to an existing spec id listed in .strict-spec-driven/specs/INDEX.yaml.`
  );
}

// Flags a modify-existing delta (no new-spec seed block) whose target_spec
// resolves to neither an existing main spec nor a sibling delta that creates it
// with a valid seed block, mirroring archive's resolution order. Without this
// the failure would surface only at archive time.
function checkUnresolvableDeltaTargets(
  rootDir: string,
  changeDir: string,
): VerifyDiagnostic[] {
  const diagnostics: VerifyDiagnostic[] = [];
  const { specsById } = buildMainSpecRequirementIndex(rootDir);
  const changeName = path.basename(changeDir);

  const specsDir = path.join(changeDir, "specs");
  const deltas: { artifactPath: string; artifact: DeltaSpecArtifact }[] = [];
  const introducedIds = new Set<string>();

  for (const deltaSpecPath of listYamlFiles(specsDir)) {
    const artifactPath = path.relative(rootDir, deltaSpecPath).split(path.sep).join("/");
    const content = readFileSync(deltaSpecPath, "utf8");
    let artifact: DeltaSpecArtifact;
    try {
      artifact = parseYamlDocument<DeltaSpecArtifact>(content, { source: artifactPath });
    } catch {
      continue;
    }
    deltas.push({ artifactPath, artifact });

    const specBlock = artifact.spec;
    const hasSpecBlock =
      specBlock !== null && typeof specBlock === "object" && !Array.isArray(specBlock);
    if (!hasSpecBlock) continue;
    if (typeof artifact.target_spec !== "string" || artifact.target_spec.length === 0) continue;
    const block = specBlock as Record<string, unknown>;
    const title = block.title;
    const targetPath = block.path;
    if (
      typeof title === "string" &&
      title.length > 0 &&
      typeof targetPath === "string" &&
      targetPath.length > 0
    ) {
      // A sibling delta introduces this id as a new main spec.
      introducedIds.add(artifact.target_spec);
    }
  }

  for (const { artifactPath, artifact } of deltas) {
    const specBlock = artifact.spec;
    const hasSpecBlock =
      specBlock !== null && typeof specBlock === "object" && !Array.isArray(specBlock);
    // New-spec deltas are governed by checkNewSpecDeltaRules; schema validation
    // handles a missing target_spec.
    if (hasSpecBlock) continue;
    if (typeof artifact.target_spec !== "string" || artifact.target_spec.length === 0) continue;

    const targetSpec = artifact.target_spec;
    if (specsById.has(targetSpec)) continue;
    if (introducedIds.has(targetSpec)) continue;

    diagnostics.push({
      source: "unresolvable_delta_target",
      artifactPath,
      fieldPath: "$.target_spec",
      message: formatUnresolvableDeltaTargetMessage(changeName, artifactPath, targetSpec),
      expected: "target_spec resolves to an existing main spec or a sibling new-spec delta",
      actual: `no main spec '${targetSpec}' and no sibling new-spec delta creates it`,
    });
  }

  return diagnostics;
}

function buildMainTechRuleIndex(rootDir: string): {
  diagnostics: VerifyDiagnostic[];
  standardsById: Map<string, MainTechRuleIndex>;
} {
  const techRoot = path.join(rootDir, STRICT_WORKFLOW_DIR, "tech");
  const diagnostics: VerifyDiagnostic[] = [];
  const standardsById = new Map<string, MainTechRuleIndex>();

  for (const techPath of listYamlFiles(techRoot)) {
    if (path.basename(techPath) === "INDEX.yaml") {
      continue;
    }

    const artifactPath = path.relative(rootDir, techPath).split(path.sep).join("/");
    const content = readFileSync(techPath, "utf8");
    let artifact: unknown;
    try {
      artifact = parseYamlDocument<unknown>(content, { source: artifactPath });
    } catch (error) {
      diagnostics.push(makeYamlParseDiagnostic(artifactPath, "main tech is not valid YAML", error));
      continue;
    }

    if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
      continue;
    }

    const record = artifact as Record<string, unknown>;
    if (record.artifact_type !== "main_tech") {
      continue;
    }

    const standard = record.standard;
    if (!standard || typeof standard !== "object" || Array.isArray(standard)) {
      continue;
    }

    const standardId = (standard as Record<string, unknown>).id;
    if (typeof standardId !== "string" || standardId.length === 0) {
      continue;
    }

    const rules = record.rules;
    if (!rules || typeof rules !== "object" || Array.isArray(rules)) {
      continue;
    }

    standardsById.set(standardId, {
      artifactPath,
      ruleIds: new Set(Object.keys(rules)),
    });
  }

  return { diagnostics, standardsById };
}

function checkTechDeltaTargets(
  rootDir: string,
  changeDir: string,
): VerifyDiagnostic[] {
  const diagnostics: VerifyDiagnostic[] = [];
  const { diagnostics: mainTechDiagnostics, standardsById } = buildMainTechRuleIndex(rootDir);
  diagnostics.push(...mainTechDiagnostics);

  const techDir = path.join(changeDir, "tech");
  for (const deltaTechPath of listYamlFiles(techDir)) {
    const artifactPath = path.relative(rootDir, deltaTechPath).split(path.sep).join("/");
    const content = readFileSync(deltaTechPath, "utf8");
    let artifact: DeltaTechArtifact;
    try {
      artifact = parseYamlDocument<DeltaTechArtifact>(content, { source: artifactPath });
    } catch {
      continue;
    }

    if (typeof artifact.target_standard !== "string" || artifact.target_standard.length === 0) {
      continue;
    }

    const targetStandard = standardsById.get(artifact.target_standard);

    if (!targetStandard) {
      // New-standard creation requires a standard block with title and category.
      const standardBlock = artifact.standard;
      const hasStandardBlock = standardBlock !== null && typeof standardBlock === "object" && !Array.isArray(standardBlock);
      const title = hasStandardBlock ? (standardBlock as Record<string, unknown>).title : undefined;
      const category = hasStandardBlock ? (standardBlock as Record<string, unknown>).category : undefined;
      if (typeof title !== "string" || title.length === 0 || typeof category !== "string" || category.length === 0) {
        diagnostics.push({
          source: "new_standard_metadata",
          artifactPath,
          fieldPath: "$.standard",
          message: `delta tech creates new standard '${artifact.target_standard}' and must provide standard.title and standard.category`,
          expected: "standard block with non-empty title and category",
          actual: hasStandardBlock ? "incomplete standard block" : "missing standard block",
        });
      }
      continue;
    }

    const added = artifact.operations?.ADDED;
    if (!added || typeof added !== "object" || Array.isArray(added)) {
      continue;
    }

    for (const ruleId of Object.keys(added).sort()) {
      if (!targetStandard.ruleIds.has(ruleId)) {
        continue;
      }

      diagnostics.push({
        source: "added_rule_collision",
        artifactPath,
        fieldPath: `$.operations.ADDED.${ruleId}`,
        message: `ADDED rule '${ruleId}' already exists in target standard '${artifact.target_standard}'`,
        expected: "ADDED rule id absent from target standard",
        actual: `existing rule '${ruleId}' in ${targetStandard.artifactPath}`,
      });
    }
  }

  return diagnostics;
}

function checkExclusiveActiveTechTargets(
  rootDir: string,
  changeName: string,
): VerifyDiagnostic[] {
  const changesDir = path.join(rootDir, STRICT_WORKFLOW_DIR, "changes");
  if (!existsSync(changesDir)) return [];

  const diagnostics: VerifyDiagnostic[] = [];

  // Keyed by `${target_standard}<NUL>${ruleId}` so the same rule id under
  // different standards does not falsely collide.
  const targetMap = new Map<
    string,
    { changeName: string; operation: string; targetStandard: string; ruleId: string }[]
  >();

  const activeDirs = readdirSync(changesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const activeChange of activeDirs) {
    const techDir = path.join(changesDir, activeChange, "tech");
    if (!existsSync(techDir)) continue;

    for (const deltaTechPath of listYamlFiles(techDir)) {
      const artifactPath = path.relative(rootDir, deltaTechPath).split(path.sep).join("/");
      const content = readFileSync(deltaTechPath, "utf8");
      let artifact: DeltaTechArtifact;
      try {
        artifact = parseYamlDocument<DeltaTechArtifact>(content, { source: artifactPath });
      } catch (error) {
        if (activeChange !== changeName) {
          diagnostics.push(makeYamlParseDiagnostic(artifactPath, "delta tech is not valid YAML", error));
        }
        continue;
      }

      if (typeof artifact.target_standard !== "string" || artifact.target_standard.length === 0) {
        continue;
      }

      const ops = artifact.operations ?? {};
      for (const [opName, entries] of Object.entries(ops)) {
        if (opName !== "MODIFIED" && opName !== "REMOVED") continue;
        if (!entries || typeof entries !== "object" || Array.isArray(entries)) continue;
        for (const ruleId of Object.keys(entries)) {
          const key = `${artifact.target_standard}\x00${ruleId}`;
          if (!targetMap.has(key)) targetMap.set(key, []);
          targetMap.get(key)!.push({
            changeName: activeChange,
            operation: opName,
            targetStandard: artifact.target_standard,
            ruleId,
          });
        }
      }
    }
  }

  for (const entries of targetMap.values()) {
    if (entries.length <= 1) continue;
    const changeNames = [...new Set(entries.map((c) => c.changeName))];
    if (!changeNames.includes(changeName)) continue;
    if (changeNames.length <= 1) continue;

    const { targetStandard, ruleId } = entries[0];
    diagnostics.push({
      source: "exclusive_active_target",
      artifactPath: `.strict-spec-driven/changes/${changeName}/tech/`,
      fieldPath: `$.operations`,
      message: `rule '${ruleId}' of standard '${targetStandard}' is MODIFIED/REMOVED in multiple active changes: ${changeNames.join(", ")}`,
      expected: "unique MODIFIED/REMOVED target across active changes",
      actual: `conflict between ${changeNames.join(" and ")}`,
    });
  }

  return diagnostics;
}

function checkExclusiveActiveTargets(
  rootDir: string,
  changeName: string,
): VerifyDiagnostic[] {
  const changesDir = path.join(rootDir, STRICT_WORKFLOW_DIR, "changes");
  if (!existsSync(changesDir)) return [];

  const diagnostics: VerifyDiagnostic[] = [];

  const targetMap = new Map<
    string,
    { changeName: string; operation: string }[]
  >();

  const activeDirs = readdirSync(changesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const activeChange of activeDirs) {
    const specsDir = path.join(changesDir, activeChange, "specs");
    if (!existsSync(specsDir)) continue;

    function scanDir(dir: string): void {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml"))) {
          const artifactPath = path.relative(rootDir, fullPath).split(path.sep).join("/");
          const content = readFileSync(fullPath, "utf8");
          let artifact: DeltaSpecArtifact;
          try {
            artifact = parseYamlDocument<DeltaSpecArtifact>(content, { source: artifactPath });
          } catch (error) {
            if (activeChange !== changeName) {
              diagnostics.push(makeYamlParseDiagnostic(artifactPath, "delta spec is not valid YAML", error));
            }
            continue;
          }
          const ops = artifact.operations ?? {};
          for (const [opName, entries] of Object.entries(ops)) {
            if (opName !== "MODIFIED" && opName !== "REMOVED") continue;
            if (!entries || typeof entries !== "object" || Array.isArray(entries)) continue;
            for (const target of Object.keys(entries)) {
              if (!targetMap.has(target)) targetMap.set(target, []);
              targetMap.get(target)!.push({
                changeName: activeChange,
                operation: opName,
              });
            }
          }
        }
      }
    }

    scanDir(specsDir);
  }

  for (const [requirementId, changes] of targetMap) {
    if (changes.length <= 1) continue;
    const changeNames = [...new Set(changes.map((c) => c.changeName))];
    if (!changeNames.includes(changeName)) continue;
    if (changeNames.length <= 1) continue;

    diagnostics.push({
      source: "exclusive_active_target",
      artifactPath: `.strict-spec-driven/changes/${changeName}/specs/`,
      fieldPath: `$.operations`,
      message: `requirement '${requirementId}' is MODIFIED/REMOVED in multiple active changes: ${changeNames.join(", ")}`,
      expected: "unique MODIFIED/REMOVED target across active changes",
      actual: `conflict between ${changes.map((c) => c.changeName).join(" and ")}`,
    });
  }

  return diagnostics;
}

export function verifyChange(
  rootDir: string,
  changeName: string,
): VerifyResult {
  const changeDir = path.join(
    rootDir,
    STRICT_WORKFLOW_DIR,
    "changes",
    changeName,
  );
  if (!existsSync(changeDir)) {
    throw new Error(`change '${changeName}' not found`);
  }

  const allDiagnostics: VerifyDiagnostic[] = [];
  let totalTasks = 0;
  let completeTasks = 0;
  let openQuestionCount = 0;

  const specsRoot = path.join(rootDir, STRICT_WORKFLOW_DIR, "specs");
  if (existsSync(specsRoot) && statSync(specsRoot).isDirectory()) {
    for (const entry of readdirSync(specsRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && FORBIDDEN_SPEC_SUBDIRS.has(entry.name)) {
        allDiagnostics.push({
          source: "directory_structure",
          artifactPath: `.strict-spec-driven/specs/${entry.name}`,
          fieldPath: "$",
          message: `.strict-spec-driven/specs/ must not contain a '${entry.name}' subdirectory; workflow state directories belong under .strict-spec-driven/ directly`,
          expected: `no '${entry.name}' subdirectory under .strict-spec-driven/specs/`,
          actual: `found .strict-spec-driven/specs/${entry.name}/`,
        });
      }
    }
  }

  // Artifacts are created only when something has real content for them, so an unauthored artifact
  // is literally absent rather than present-but-placeholder. Each diagnostic therefore names the
  // authoring command, which is the only way the artifact can come into existence.
  const artifactConfigs: [string, string, string][] = [
    ["change_proposal", "proposal.yaml", "proposal"],
    ["change_design", "design.yaml", "design"],
    ["task_list", "tasks.yaml", "tasks"],
    ["question_list", "questions.yaml", "questions"],
  ];

  for (const [artifactType, fileName, generateArtifactName] of artifactConfigs) {
    const filePath = path.join(changeDir, fileName);
    const artifactPath = `.strict-spec-driven/changes/${changeName}/${fileName}`;
    if (!existsSync(filePath)) {
      allDiagnostics.push({
        source: "missing_artifact",
        artifactPath,
        fieldPath: "$",
        message:
          `required artifact '${fileName}' has not been authored; create it with `
          + `'strict-spec-cli generate ${changeName} ${generateArtifactName} --<named-args>'`,
        expected: `an authored ${fileName}`,
        actual: "no file at that path",
      });
      continue;
    }

    const content = readFileSync(filePath, "utf8");
    let artifact: unknown;
    try {
      artifact = parseYamlDocument<unknown>(content, { source: artifactPath });
    } catch (error) {
      allDiagnostics.push(makeYamlParseDiagnostic(artifactPath, `artifact '${fileName}' is not valid YAML`, error));
      continue;
    }
    allDiagnostics.push(
      ...validateArtifactSchema(artifactType, artifact, artifactPath),
    );

    if (artifactType === "task_list") {
      const taskArtifact = artifact as TaskListArtifact;
      const taskResult = checkTaskCompletion(taskArtifact, artifactPath);
      allDiagnostics.push(...taskResult.diagnostics);
      totalTasks = taskResult.totalTasks;
      completeTasks = taskResult.completeTasks;

      allDiagnostics.push(...checkTestingGates(taskArtifact, artifactPath));
      allDiagnostics.push(...checkTaskListCompleteness(taskArtifact, artifactPath));
    }

    if (artifactType === "question_list") {
      const questionArtifact = artifact as QuestionListArtifact;
      const questionResult = checkOpenQuestions(questionArtifact, artifactPath);
      allDiagnostics.push(...questionResult.diagnostics);
      openQuestionCount = questionResult.openCount;
    }
  }

  const specsPrefix = `.strict-spec-driven/changes/${changeName}/specs`;
  allDiagnostics.push(...validateDeltaSpecs(changeDir, specsPrefix));
  allDiagnostics.push(...checkAddedRequirementCollisions(rootDir, changeDir));
  allDiagnostics.push(...checkNewSpecDeltaRules(rootDir, changeDir));
  allDiagnostics.push(...checkUnresolvableDeltaTargets(rootDir, changeDir));

  allDiagnostics.push(...checkExclusiveActiveTargets(rootDir, changeName));

  const scenesPrefix = `.strict-spec-driven/changes/${changeName}/scenes`;
  const sceneSchemaDiagnostics = validateDeltaScenes(changeDir, scenesPrefix);
  allDiagnostics.push(...sceneSchemaDiagnostics);
  // Coverage gating reads the merged scene state, which a delta scene that fails its own schema
  // cannot produce, so the structural diagnostics are reported alone rather than alongside a
  // merge failure that only restates them.
  if (sceneSchemaDiagnostics.length === 0) {
    allDiagnostics.push(...collectSceneCoverageDiagnostics(rootDir, changeDir, changeName));
  }

  const techPrefix = `.strict-spec-driven/changes/${changeName}/tech`;
  allDiagnostics.push(...validateDeltaTech(changeDir, techPrefix));
  allDiagnostics.push(...checkTechDeltaTargets(rootDir, changeDir));
  allDiagnostics.push(...checkExclusiveActiveTechTargets(rootDir, changeName));

  allDiagnostics.sort((a, b) => {
    const aKey = [a.source, a.artifactPath, a.fieldPath, a.message].join("|");
    const bKey = [b.source, b.artifactPath, b.fieldPath, b.message].join("|");
    return aKey.localeCompare(bKey);
  });

  return {
    valid: allDiagnostics.length === 0,
    diagnostics: allDiagnostics,
    changeName,
    totalTasks,
    completeTasks,
    remainingPending: totalTasks - completeTasks,
    openQuestionCount,
  };
}
