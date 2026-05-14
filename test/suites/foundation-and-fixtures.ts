import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import {
  ROOT,
  TestContext,
  cli,
  createCopiedProjectWorkspace,
  fixturePath,
  formatLocalDateStamp,
  loadDistModule,
  projectFixturePath,
  projectWorkspaceCli,
  runCommand,
  type MigrateConverterModule,
  type RoadmapConverterModule,
  type ScaffoldModule,
  type SkillValidationModule,
  type ValidationModule,
  type YamlModule,
} from "../support/harness.js";

function listFilesRecursive(rootDir: string): string[] {
  const files: string[] = [];

  function walk(currentDir: string): void {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }

  walk(rootDir);
  return files;
}

export async function runFoundationAndFixtureSuite(context: TestContext): Promise<void> {
context.section("[2] yaml utilities");

const yamlModule = await loadDistModule<YamlModule>("yaml.js");
const parsed = yamlModule.parseYamlDocument<{ service: { name: string } }>("service:\n  name: strict-spec\n");
context.assert(parsed.service.name === "strict-spec", "parseYamlDocument parses YAML mapping");

const yamlString = yamlModule.stringifyYamlDocument({ alpha: "beta" });
context.assert(yamlString.includes("alpha: beta"), "stringifyYamlDocument serializes mappings");

const tempDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-driven-"));
const yamlPath = path.join(tempDir, "sample.yaml");
const malformedYamlPath = path.join(tempDir, "special-char.yaml");
writeFileSync(yamlPath, "value: 42\n", "utf8");
writeFileSync(malformedYamlPath, "root:\n\tchild: value\n", "utf8");
try {
  const parsedFile = yamlModule.parseYamlFile<{ value: number }>(yamlPath);
  context.assert(parsedFile.value === 42, "parseYamlFile loads YAML from disk");

  let yamlErrorDetails:
    | {
      errorType: string;
      source?: string;
      reason?: string;
      line?: number;
      column?: number;
      snippet?: string;
      offendingCharacter?: string;
    }
    | null = null;
  try {
    yamlModule.parseYamlFile(malformedYamlPath);
  } catch (error) {
    yamlErrorDetails = yamlModule.getYamlParseDetails(error);
  }
  context.assert(Boolean(yamlErrorDetails), "parseYamlFile exposes structured YAML parse details");
  context.assert(
    yamlErrorDetails?.source === malformedYamlPath,
    "structured YAML parse details preserve source file path",
    `source: ${yamlErrorDetails?.source ?? "missing"}`,
  );
  context.assert(
    yamlErrorDetails?.line === 2 && yamlErrorDetails.column === 1,
    "structured YAML parse details include 1-based line and column",
    `line: ${yamlErrorDetails?.line ?? "missing"} column: ${yamlErrorDetails?.column ?? "missing"}`,
  );
  context.assert(
    yamlErrorDetails?.offendingCharacter?.includes("tab") === true,
    "structured YAML parse details identify offending special characters",
    `offending character: ${yamlErrorDetails?.offendingCharacter ?? "missing"}`,
  );
  context.assert(
    Boolean(yamlErrorDetails?.snippet?.includes("child")),
    "structured YAML parse details include a source snippet",
  );
  context.assert(
    yamlModule.formatYamlParseSummary(yamlErrorDetails).includes("offending character"),
    "formatted YAML parse summaries call out the offending character",
  );
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

const roadmapIndexExample = yamlModule.parseYamlFile<{
  milestones: Record<string, { title: string; path: string; status: string }>;
}>(path.join(ROOT, "examples", "strict-spec-driven", "roadmap-index.yaml"));
const roadmapIndexEntries = Object.entries(roadmapIndexExample.milestones);
context.assert(
  roadmapIndexEntries.length >= 1 &&
    roadmapIndexEntries.every(
      ([, milestone]) =>
        milestone.title.length > 0 &&
        milestone.path.length > 0 &&
        milestone.status.length > 0,
    ),
  "primary roadmap index example stays minimal while exposing required milestone fields",
);

const roadmapMilestoneExample = yamlModule.parseYamlFile<{
  dependencies: string[];
  risks: string[];
  notes: string[];
  planned_changes: Record<string, { depends_on: string[] }>;
}>(path.join(ROOT, "examples", "strict-spec-driven", "roadmap-milestone.yaml"));
context.assert(roadmapMilestoneExample.dependencies.length === 0, "primary roadmap milestone example keeps dependencies minimal");
context.assert(roadmapMilestoneExample.risks.length === 0, "primary roadmap milestone example keeps risks minimal");
context.assert(roadmapMilestoneExample.notes.length === 0, "primary roadmap milestone example keeps notes minimal");
const milestonePlannedChangeEntries = Object.entries(roadmapMilestoneExample.planned_changes);
context.assert(
  milestonePlannedChangeEntries.length === 1 &&
    milestonePlannedChangeEntries[0]?.[1].depends_on.length === 0,
  "primary roadmap milestone example keeps planned change dependencies minimal",
);

const plannedChangeExample = yamlModule.parseYamlFile<{
  schema: string;
  artifact_type: string;
  planned_change: { id: string; milestone: string };
  status: string;
  summary: string;
  details: string;
  depends_on: string[];
}>(path.join(ROOT, "examples", "strict-spec-driven", "planned-change.yaml"));
context.assert(
  plannedChangeExample.planned_change.id.length > 0
    && plannedChangeExample.planned_change.milestone.startsWith("0001-")
    && plannedChangeExample.depends_on.length === 0,
  "primary planned change example exposes standalone identity and owning milestone fields",
);

context.section("[3] validation layer utilities");

const roadmapMilestonePlanningExample = yamlModule.parseYamlFile<{
  status: string;
  dependencies: string[];
  risks: string[];
  notes: string[];
  planned_changes: Record<string, { status: string; depends_on: string[] }>;
}>(path.join(ROOT, "examples", "strict-spec-driven", "roadmap-milestone.planning.yaml"));
context.assert(roadmapMilestonePlanningExample.dependencies.length >= 1, "roadmap milestone coverage example includes milestone dependencies");
context.assert(roadmapMilestonePlanningExample.risks.length >= 1, "roadmap milestone coverage example includes milestone risks");
context.assert(roadmapMilestonePlanningExample.notes.length >= 1, "roadmap milestone coverage example includes milestone notes");
const planningChangeEntries = Object.entries(roadmapMilestonePlanningExample.planned_changes);
context.assert(planningChangeEntries.length >= 2, "roadmap milestone coverage example includes multiple planned changes");
const [, firstChange] = planningChangeEntries[0] ?? [];
const [firstChangeId] = planningChangeEntries[0] ?? [];
const [secondChangeId, secondChange] = planningChangeEntries[1] ?? [];
context.assert(
  secondChange?.depends_on[0] === firstChangeId && secondChangeId.length > 0,
  "roadmap milestone coverage example preserves planned change dependency linkage",
);

context.section("[3] validation layer utilities");

const validationModule = await loadDistModule<ValidationModule>("validation.js");
const registrySchema = validationModule.loadBundledSchema<Record<string, unknown>>("registry.yaml");
context.assert(registrySchema.artifact_type === "schema_registry", "loadBundledSchema reads bundled schema assets");

const mainSpecSchema = validationModule.loadBundledSchemaByArtifactType("main_spec") as Record<string, unknown>;
context.assert(
  (mainSpecSchema.properties as Record<string, unknown>)?.artifact_type !== undefined,
  "loadBundledSchemaByArtifactType resolves registry entries",
);

const bySchemaId = validationModule.loadBundledSchemaBySchemaId("strict-spec-driven/main-spec/v1") as Record<string, unknown>;
context.assert(
  (bySchemaId.properties as Record<string, unknown>)?.artifact_type !== undefined,
  "loadBundledSchemaBySchemaId resolves schema IDs",
);

const roadmapIndexSchema = validationModule.loadBundledSchemaByArtifactType("roadmap_index") as Record<string, unknown>;
context.assert(
  (roadmapIndexSchema.properties as Record<string, unknown>)?.milestones !== undefined,
  "roadmap index schema resolves by artifact type",
);
const roadmapIndexMilestonesSchema = (roadmapIndexSchema.properties as Record<string, unknown>).milestones as Record<string, unknown>;
const roadmapIndexMilestonePatternSchema = (roadmapIndexMilestonesSchema.patternProperties as Record<string, unknown>)["^\\d{4}-"] as Record<string, unknown>;
context.assert(
  ((roadmapIndexMilestonePatternSchema.properties as Record<string, unknown>).status as { enum: string[] }).enum.length === 4,
  "roadmap index schema keeps milestone status enums with four values",
);

const roadmapMilestoneSchema = validationModule.loadBundledSchemaBySchemaId("strict-spec-driven/roadmap-milestone/v2") as Record<string, unknown>;
context.assert(
  (roadmapMilestoneSchema.properties as Record<string, unknown>)?.milestone !== undefined,
  "roadmap milestone schema resolves by schema ID",
);
const milestoneSchemaProps = roadmapMilestoneSchema.properties as Record<string, unknown>;
context.assert(
  (milestoneSchemaProps.milestone as Record<string, unknown>)?.patternProperties !== undefined,
  "roadmap milestone schema uses patternProperties for keyed milestone identity",
);
context.assert(
  (milestoneSchemaProps.planned_changes as Record<string, unknown>)?.patternProperties !== undefined,
  "roadmap milestone schema uses patternProperties for keyed planned changes",
);
const roadmapIndexEntryValues = Object.values(roadmapIndexExample.milestones);
context.assert(
  roadmapIndexEntryValues.every(() =>
    (roadmapIndexMilestonePatternSchema.properties as Record<string, unknown>).status !== undefined,
  ),
  "roadmap index example statuses stay within roadmap schema enums",
);
context.assert(
  ((milestoneSchemaProps.status as Record<string, unknown>).enum as string[]).includes(roadmapMilestonePlanningExample.status),
  "roadmap milestone coverage example status stays within roadmap schema enums",
);
const planningChangeStatuses = Object.values(roadmapMilestonePlanningExample.planned_changes).map((pc) => pc.status);
const plannedChangePatternSchema = ((milestoneSchemaProps.planned_changes as Record<string, unknown>).patternProperties as Record<string, unknown>)["^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$"] as Record<string, unknown>;
context.assert(
  planningChangeStatuses.every((status) =>
    ((plannedChangePatternSchema.properties as Record<string, unknown>).status as { enum: string[] }).enum.includes(status),
  ),
  "roadmap milestone coverage example planned change statuses stay within schema enums",
);
const planningEntries = Object.entries(roadmapMilestonePlanningExample.planned_changes);
const [firstPlanningId] = planningEntries[0] ?? [];
const [, secondPlanningChange] = planningEntries[1] ?? [];
context.assert(
  secondPlanningChange?.depends_on[0] === firstPlanningId,
  "roadmap milestone coverage example preserves planned change dependency linkage",
);
context.assert(
  roadmapMilestonePlanningExample.dependencies.length >= 1,
  "roadmap milestone coverage example keeps milestone dependency fields populated",
);

const plannedChangeSchema = validationModule.loadBundledSchemaByArtifactType("planned_change") as Record<string, unknown>;
const plannedChangeSchemaProps = plannedChangeSchema.properties as Record<string, unknown>;
context.assert(
  (plannedChangeSchemaProps.planned_change as Record<string, unknown>)?.properties !== undefined,
  "planned change schema resolves by artifact type",
);
context.assert(
  ((plannedChangeSchemaProps.status as Record<string, unknown>).enum as string[]).includes(plannedChangeExample.status),
  "planned change example status stays within planned change schema enums",
);
context.assert(
  (plannedChangeSchemaProps.extensions as Record<string, unknown>)?.additionalProperties === true,
  "planned change schema exposes optional extension space",
);
const plannedChangeValidation = validationModule.validateArtifact(
  plannedChangeSchema,
  plannedChangeExample,
  "examples/strict-spec-driven/planned-change.yaml",
);
context.assert(plannedChangeValidation.valid, "planned change example validates against planned change schema");
const bundledRegistry = validationModule.loadBundledSchema<Record<string, unknown>>("registry.yaml") as {
  entries: Array<{ schema_id: string; artifact_type: string; schema_file: string; primary_example: string }>;
};
context.assert(
  bundledRegistry.entries.some(
    (entry) =>
      entry.schema_id === "strict-spec-driven/planned-change/v1"
      && entry.artifact_type === "planned_change"
      && entry.schema_file === "planned-change.yaml"
      && entry.primary_example.endsWith("/planned-change.yaml"),
  ),
  "schema registry includes standalone planned change schema and primary example",
);

const testJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name"],
  properties: {
    name: { type: "string" },
  },
};
const invalidArtifact = { name: 123, extra: true };
const schemaResultA = validationModule.validateWithSchema(testJsonSchema, invalidArtifact, "memory://artifact");
const schemaResultB = validationModule.validateWithSchema(testJsonSchema, invalidArtifact, "memory://artifact");

context.assert(schemaResultA.valid === false, "validateWithSchema reports invalid artifacts");
context.assert(
  JSON.stringify(schemaResultA.diagnostics) === JSON.stringify(schemaResultB.diagnostics),
  "validateWithSchema diagnostics are deterministic",
);
context.assert(
  schemaResultA.diagnostics.every((diagnostic) => diagnostic.artifactPath === "memory://artifact"),
  "schema diagnostics include artifact path context",
);
context.assert(
  schemaResultA.diagnostics.some((diagnostic) => diagnostic.fieldPath === "$.name"),
  "schema diagnostics include field path context",
);
context.assert(
  schemaResultA.diagnostics.some(
    (diagnostic) => diagnostic.source === "schema" && Boolean(diagnostic.expected) && Boolean(diagnostic.actual),
  ),
  "schema diagnostics include expected/actual values when available",
);

const duplicateDiagnostics = validationModule.runDuplicateIdChecks(
  { requirements: [{ id: "req-1" }, { id: "req-1" }] },
  "memory://duplicate",
  [{ collectionPath: "requirements", idField: "id" }],
);
context.assert(duplicateDiagnostics.length === 1, "runDuplicateIdChecks detects duplicate identifiers");
context.assert(
  duplicateDiagnostics[0]?.fieldPath === "$.requirements[1].id",
  "duplicate diagnostics include duplicate field path",
);

const referenceDiagnostics = validationModule.runReferenceChecks(
  {
    entries: [{ schema_id: "strict-spec-driven/main-spec/v1" }],
    role_mappings: [{ schema_id: "strict-spec-driven/missing/v1" }],
  },
  "memory://reference",
  [
    {
      sourceCollectionPath: "role_mappings",
      sourceField: "schema_id",
      targetCollectionPath: "entries",
      targetField: "schema_id",
    },
  ],
);
context.assert(referenceDiagnostics.length === 1, "runReferenceChecks detects missing references");
context.assert(
  referenceDiagnostics[0]?.fieldPath === "$.role_mappings[0].schema_id",
  "reference diagnostics include source field path",
);

const combinedResult = validationModule.validateArtifact(
  testJsonSchema,
  { name: 123, requirements: [{ id: "dup" }, { id: "dup" }] },
  "memory://combined",
  {
    duplicateIdRules: [{ collectionPath: "requirements", idField: "id" }],
  },
);
context.assert(combinedResult.valid === false, "validateArtifact combines schema and duplicate checks");
context.assert(
  combinedResult.diagnostics.some((diagnostic) => diagnostic.source === "duplicate_id"),
  "validateArtifact output includes duplicate diagnostics",
);

context.section("[4] scaffold template assets");

const scaffoldModule = await loadDistModule<ScaffoldModule>("scaffold.js");
let traversalRejected = false;
try {
  scaffoldModule.getBundledScaffoldPath("../config.yaml");
} catch {
  traversalRejected = true;
}
context.assert(traversalRejected, "scaffold path helper rejects parent-directory traversal");

let absoluteRejected = false;
try {
  scaffoldModule.getBundledScaffoldPath(path.join(ROOT, "config.yaml"));
} catch {
  absoluteRejected = true;
}
context.assert(absoluteRejected, "scaffold path helper rejects absolute paths");

const firstAssetList = scaffoldModule.getRequiredBundledScaffoldAssets();
const secondAssetList = scaffoldModule.getRequiredBundledScaffoldAssets();
context.assert(
  JSON.stringify(firstAssetList) === JSON.stringify(secondAssetList),
  "required scaffold asset manifest is deterministic",
);
context.assert(firstAssetList.length === 3, "required scaffold asset manifest includes three assets");
context.assert(
  firstAssetList.every((asset) => asset.endsWith(".yaml")),
  "required scaffold asset manifest contains only YAML files",
);

for (const relativeAssetPath of firstAssetList) {
  const absoluteAssetPath = scaffoldModule.getBundledScaffoldPath(relativeAssetPath);
  const exists = existsSync(absoluteAssetPath);
  context.assert(exists, `required scaffold asset exists (${relativeAssetPath})`);
  context.assert(exists ? statSync(absoluteAssetPath).isFile() : false, `required scaffold asset is a file (${relativeAssetPath})`);
  context.assert(
    absoluteAssetPath.split(path.sep).join("/").includes("/scaffold/"),
    `required scaffold asset lives in scaffold bundle (${relativeAssetPath})`,
    `resolved path: ${absoluteAssetPath}`,
  );
}

const missingAssets = scaffoldModule.findMissingRequiredScaffoldAssets();
context.assert(missingAssets.length === 0, "required scaffold assets are all present");

const scaffoldConfig = scaffoldModule.loadBundledScaffoldYaml<Record<string, unknown>>("config.yaml");
context.assert(scaffoldConfig.artifact_type === "workflow_config", "scaffold config template is loadable YAML");
const scaffoldReviewEvidence = scaffoldConfig.review_evidence as
  | { project_regression?: { command?: unknown; meaning?: unknown } }
  | undefined;
context.assert(
  scaffoldReviewEvidence?.project_regression?.command === "bun run build && bun test/run.ts",
  "scaffold config template includes complete project regression command",
);
context.assert(
  typeof scaffoldReviewEvidence?.project_regression?.meaning === "string"
    && scaffoldReviewEvidence.project_regression.meaning.includes("complete project-level regression suite"),
  "scaffold config template documents regression evidence meaning",
);

const scaffoldSpecIndex = scaffoldModule.loadBundledScaffoldYaml<Record<string, unknown>>("specs/INDEX.yaml");
context.assert(scaffoldSpecIndex.artifact_type === "spec_index", "scaffold specs index template is loadable YAML");

const scaffoldRoadmapIndex = scaffoldModule.loadBundledScaffoldYaml<Record<string, unknown>>("roadmap/INDEX.yaml");
context.assert(scaffoldRoadmapIndex.artifact_type === "roadmap_index", "scaffold roadmap index template is loadable YAML");
context.assert(typeof scaffoldRoadmapIndex.milestones === "object" && scaffoldRoadmapIndex.milestones !== null && !Array.isArray(scaffoldRoadmapIndex.milestones), "scaffold roadmap index template includes milestone sequence field");

context.section("[5] init command");

const initTempDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-driven-init-"));
try {
  mkdirSync(path.join(initTempDir, ".spec-driven"), { recursive: true });

  const initFirst = cli(["init"], { cwd: initTempDir });
  context.assert(initFirst.status === 0, "init exits zero when scaffold assets are available", `got exit code ${initFirst.status}`);
  context.assert(
    initFirst.stderr.split("\n").filter((line) => line.includes(".spec-driven/")).length === 1,
    "init emits one coexistence warning when .spec-driven exists",
    `stderr: ${initFirst.stderr.trim()}`,
  );

  const strictRoot = path.join(initTempDir, ".strict-spec-driven");
  const requiredArtifacts = [
    "config.yaml",
    "specs/INDEX.yaml",
    "roadmap/INDEX.yaml",
  ];
  for (const artifactPath of requiredArtifacts) {
    context.assert(
      existsSync(path.join(strictRoot, artifactPath)),
      `init creates scaffold artifact (${artifactPath})`,
    );
  }
  context.assert(
    listFilesRecursive(strictRoot).every((filePath) => filePath.endsWith(".yaml")),
    "init creates only YAML files under .strict-spec-driven",
  );

  const configPath = path.join(strictRoot, "config.yaml");
  const initConfigContent = readFileSync(configPath, "utf8");
  const normalizedInitConfigContent = initConfigContent.replace(/\s+/g, " ");
  context.assert(
    normalizedInitConfigContent.includes("review_evidence:")
      && normalizedInitConfigContent.includes("command: bun run build && bun test/run.ts")
      && normalizedInitConfigContent.includes("complete project-level regression suite"),
    "init scaffolded config includes project regression review evidence",
  );

  writeFileSync(configPath, "custom: keep-me\n", "utf8");

  const initSecond = cli(["init"], { cwd: initTempDir });
  context.assert(initSecond.status === 0, "init rerun exits zero", `got exit code ${initSecond.status}`);
  context.assert(
    readFileSync(configPath, "utf8") === "custom: keep-me\n",
    "init rerun preserves existing strict artifacts (non-clobber)",
  );
} finally {
  rmSync(initTempDir, { recursive: true, force: true });
}

context.section("[6] propose command");

const proposeTempDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-driven-propose-"));
try {
  const invalidName = cli(["propose", "Invalid_Name"], { cwd: proposeTempDir });
  context.assert(invalidName.status !== 0, "propose rejects invalid change names", `got exit code ${invalidName.status}`);
  context.assert(
    invalidName.stderr.includes("kebab-case"),
    "propose invalid-name failure reports kebab-case requirement",
    `stderr: ${invalidName.stderr.trim()}`,
  );
  context.assert(
    !existsSync(path.join(proposeTempDir, ".strict-spec-driven", "changes", "Invalid_Name")),
    "propose invalid-name failure does not create change directory",
  );

  const changeName = "add-propose-command";
  const firstPropose = cli(["propose", changeName], { cwd: proposeTempDir });
  context.assert(firstPropose.status === 0, "propose creates strict change scaffold", `got exit code ${firstPropose.status}`);

  const changeDir = path.join(proposeTempDir, ".strict-spec-driven", "changes", changeName);
  context.assert(existsSync(changeDir), "propose creates change directory");

  const expectedArtifacts = ["proposal.yaml", "design.yaml", "tasks.yaml", "questions.yaml"];
  for (const artifact of expectedArtifacts) {
    context.assert(
      existsSync(path.join(changeDir, artifact)),
      `propose creates planning artifact (${artifact})`,
    );
  }
  context.assert(existsSync(path.join(changeDir, "specs")), "propose creates specs directory");
  context.assert(
    firstPropose.stdout.includes(`Created strict change scaffold at .strict-spec-driven/changes/${changeName}/`),
    "propose output identifies created change directory",
    `stdout: ${firstPropose.stdout.trim()}`,
  );
  for (const artifact of [...expectedArtifacts, "specs/"]) {
    context.assert(
      firstPropose.stdout.includes(`- .strict-spec-driven/changes/${changeName}/${artifact}`),
      `propose output lists created path (.strict-spec-driven/changes/${changeName}/${artifact})`,
    );
  }

  const proposalArtifact = readFileSync(path.join(changeDir, "proposal.yaml"), "utf8");
  context.assert(
    proposalArtifact.includes(`id: ${changeName}`),
    "propose template placeholders are rendered with change name",
  );

  const duplicatePropose = cli(["propose", changeName], { cwd: proposeTempDir });
  context.assert(duplicatePropose.status !== 0, "propose rejects duplicate changes", `got exit code ${duplicatePropose.status}`);
  context.assert(
    duplicatePropose.stderr.includes("already exists"),
    "propose duplicate-change failure reports existing change collision",
    `stderr: ${duplicatePropose.stderr.trim()}`,
  );
  context.assert(
    readFileSync(path.join(changeDir, "proposal.yaml"), "utf8") === proposalArtifact,
    "propose duplicate-change failure preserves existing artifacts",
  );

  const emptyDirChangeName = "empty-existing-dir";
  const emptyDirChangePath = path.join(proposeTempDir, ".strict-spec-driven", "changes", emptyDirChangeName);
  mkdirSync(path.join(emptyDirChangePath, "nested", "still-empty"), { recursive: true });
  const emptyDirPropose = cli(["propose", emptyDirChangeName], { cwd: proposeTempDir });
  context.assert(emptyDirPropose.status === 0, "propose reuses an existing empty change directory tree", `stderr: ${emptyDirPropose.stderr.trim()}`);
  for (const artifact of expectedArtifacts) {
    context.assert(
      existsSync(path.join(emptyDirChangePath, artifact)),
      `propose writes planning artifact into reusable empty directory (${artifact})`,
    );
  }
  context.assert(
    existsSync(path.join(emptyDirChangePath, "nested", "still-empty")),
    "propose preserves pre-existing empty subdirectories when reusing the change directory",
  );
} finally {
  rmSync(proposeTempDir, { recursive: true, force: true });
}

context.section("[6b] generate command");

const generateTempDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-driven-generate-"));
try {
  const changeName = "scripted-change";
  const generatePropose = cli(["propose", changeName], { cwd: generateTempDir });
  context.assert(generatePropose.status === 0, "generate setup creates strict change scaffold", `got exit code ${generatePropose.status}`);
  const changeDir = path.join(generateTempDir, ".strict-spec-driven", "changes", changeName);
  const proposalPath = path.join(changeDir, "proposal.yaml");
  const originalDesign = readFileSync(path.join(changeDir, "design.yaml"), "utf8");

  function writeCompleteTasksArtifact(targetChangeDir: string, targetChangeName: string): void {
    writeFileSync(
      path.join(targetChangeDir, "tasks.yaml"),
      [
        "schema: strict-spec-driven/task-list/v2",
        "schema_version: 2",
        "artifact_type: task_list",
        "schema_file: templates/strict-spec-driven/schemas/task-list.yaml",
        `change: ${targetChangeName}`,
        "sections:",
        "  Implementation:",
        "    implement-generator:",
        "      text: Implement generator.",
        "      status: complete",
        "  Testing:",
        "    run-build:",
        "      text: Run build.",
        "      status: complete",
        "      command: bun run build",
        "    run-tests:",
        "      text: Run tests.",
        "      status: complete",
        "      command: bun test/run.ts",
        "  Verification:",
        "    verify-change:",
        "      text: Verify change.",
        "      status: complete",
        "testing_gates:",
        "  validation_task: run-build",
        "  unit_test_task: run-tests",
        "",
      ].join("\n"),
      "utf8",
    );
  }

  const scaffoldProposal = readFileSync(proposalPath, "utf8");
  const nonFlagGenerate = cli(["generate", changeName, "proposal", "proposal.json"], { cwd: generateTempDir });
  context.assert(nonFlagGenerate.status !== 0, "generate rejects positional JSON input");
  context.assert(
    nonFlagGenerate.stderr.includes("Usage:") && !nonFlagGenerate.stderr.includes("<input-json>"),
    "generate positional input failure prints named-argument usage only",
    `stderr: ${nonFlagGenerate.stderr.trim()}`,
  );
  context.assert(readFileSync(proposalPath, "utf8") === scaffoldProposal, "generate positional input does not rewrite artifact");

  const generatedProposal = cli([
    "generate",
    changeName,
    "proposal",
    "--what",
    "Generate proposal artifacts from named arguments.",
    "--why",
    "Scripted generation keeps YAML formatting deterministic.",
    "--in",
    "Populate one planning artifact from named CLI arguments.",
    "--out",
    "Replace the scaffold creation command.",
    "--unchanged",
    "Existing propose scaffolding remains unchanged.",
  ], { cwd: generateTempDir });
  context.assert(generatedProposal.status === 0, "generate writes proposal artifact from named arguments", `stderr: ${generatedProposal.stderr.trim()}`);
  const generatedProposalJson = JSON.parse(generatedProposal.stdout.trim());
  context.assert(
    generatedProposalJson.artifactPath === `.strict-spec-driven/changes/${changeName}/proposal.yaml`,
    "generate reports the written proposal artifact path",
  );
  context.assert(generatedProposalJson.replaced === true, "generate reports replacement when scaffold artifact exists");

  const parsedGeneratedProposal = yamlModule.parseYamlDocument<{
    change: { id: string };
    summary: { what: string[] };
  }>(readFileSync(proposalPath, "utf8"));
  context.assert(parsedGeneratedProposal.change.id === changeName, "generated proposal preserves change identity");
  context.assert(
    parsedGeneratedProposal.summary.what[0] === "Generate proposal artifacts from named arguments.",
    "generated proposal includes structured input content",
  );
  context.assert(
    readFileSync(path.join(changeDir, "design.yaml"), "utf8") === originalDesign,
    "generate proposal leaves unrelated planning artifacts unchanged",
  );

  const beforeInvalidProposal = readFileSync(proposalPath, "utf8");
  const invalidProposalGenerate = cli(["generate", changeName, "proposal", "--what", "Missing why should fail."], { cwd: generateTempDir });
  context.assert(invalidProposalGenerate.status !== 0, "generate rejects incomplete named proposal input");
  context.assert(
    invalidProposalGenerate.stderr.includes("missing required argument --why"),
    "generate reports the missing named argument before write",
    `stderr: ${invalidProposalGenerate.stderr.trim()}`,
  );
  context.assert(
    readFileSync(proposalPath, "utf8") === beforeInvalidProposal,
    "generate incomplete named input does not rewrite artifact",
  );

  context.assert(
    cli([
      "generate",
      changeName,
      "design",
      "--reset",
      "--approach",
      "Render strict artifacts through structured CLI generation.",
      "--decision",
      "artifact-scoped-generation",
      "--decision-text",
      "Generate one artifact per CLI invocation.",
      "--rationale",
      "Small inputs produce clearer validation failures and avoid monolithic payload coupling.",
      "--alternative",
      "Keep direct YAML editing as the primary path.",
      "--reason",
      "Direct edits leave schema-sensitive formatting in agent-authored text.",
      "--risk",
      "Replacement commands can discard manual edits when used intentionally.",
    ], { cwd: generateTempDir }).status === 0,
    "generate writes design artifact",
  );

  const scaffoldTasks = readFileSync(path.join(changeDir, "tasks.yaml"), "utf8");
  const rejectedTasksGenerate = cli(["generate", changeName, "tasks", "--reset"], { cwd: generateTempDir });
  context.assert(rejectedTasksGenerate.status !== 0, "generate rejects tasks artifact selector");
  context.assert(
    rejectedTasksGenerate.stderr.includes("artifact must be one of")
      && !rejectedTasksGenerate.stderr.includes("tasks"),
    "generate unsupported artifact list omits tasks",
    `stderr: ${rejectedTasksGenerate.stderr.trim()}`,
  );
  context.assert(
    readFileSync(path.join(changeDir, "tasks.yaml"), "utf8") === scaffoldTasks,
    "generate tasks rejection leaves scaffolded tasks artifact unchanged",
  );
  writeCompleteTasksArtifact(changeDir, changeName);

  context.assert(
    cli(["generate", changeName, "questions", "--reset"], { cwd: generateTempDir }).status === 0,
    "generate writes questions artifact",
  );

  const generatedDelta = cli([
    "generate",
    changeName,
    "delta-spec",
    "--target-spec",
    "cli-foundation",
    "--spec-path",
    "cli/foundation.yaml",
    "--implementation",
    "src/propose-generation.ts",
    "--implementation",
    "src/cli/cmd-generation.ts",
    "--test",
    "test/suites/foundation-and-fixtures.ts",
    "--operation",
    "ADDED",
    "--requirement",
    "generated-artifact-test-requirement",
    "--strength",
    "MUST",
    "--statement",
    "The system MUST generate one delta artifact from structured named arguments.",
    "--scenario",
    "delta-artifact-is-generated",
    "--given",
    "a strict change scaffold exists",
    "--when",
    "the delta generation command runs",
    "--then",
    "one delta spec is written",
  ], { cwd: generateTempDir });
  context.assert(generatedDelta.status === 0, "generate writes target-scoped delta spec", `stderr: ${generatedDelta.stderr.trim()}`);
  context.assert(
    existsSync(path.join(changeDir, "specs", "cli", "foundation.yaml")),
    "generate writes delta spec under requested target path",
  );

  const invalidArtifact = cli(["generate", changeName, "unknown", "--what", "Invalid artifact."], { cwd: generateTempDir });
  context.assert(invalidArtifact.status !== 0, "generate rejects unsupported artifact selector");
  context.assert(
    invalidArtifact.stderr.includes("artifact must be one of"),
    "generate unsupported artifact failure names allowed artifacts",
  );

  const verifyGenerated = cli(["verify", changeName], { cwd: generateTempDir });
  context.assert(verifyGenerated.status === 0, "generated complete change passes verify", `stderr: ${verifyGenerated.stderr.trim()} stdout: ${verifyGenerated.stdout.trim()}`);

  const directChangeName = "argument-driven-change";
  const directPropose = cli(["propose", directChangeName], { cwd: generateTempDir });
  context.assert(directPropose.status === 0, "argument-driven generate setup creates strict change scaffold", `stderr: ${directPropose.stderr.trim()}`);
  const directChangeDir = path.join(generateTempDir, ".strict-spec-driven", "changes", directChangeName);
  const directProposalPath = path.join(directChangeDir, "proposal.yaml");

  const directProposal = cli([
    "generate",
    directChangeName,
    "proposal",
    "--what",
    "Populate artifacts from named arguments.",
    "--what",
    "Populate artifacts from named arguments.",
    "--why",
    "Named arguments avoid intermediate payload guessing.",
    "--in",
    "Add parameterized generation.",
    "--out",
    "Add alternate payload-file generation.",
    "--unchanged",
    "Existing scaffolding remains available.",
  ], { cwd: generateTempDir });
  context.assert(directProposal.status === 0, "generate writes proposal artifact from named arguments", `stderr: ${directProposal.stderr.trim()}`);
  const directProposalArtifact = yamlModule.parseYamlDocument<{
    summary: { what: string[] };
  }>(readFileSync(directProposalPath, "utf8"));
  context.assert(
    directProposalArtifact.summary.what.length === 1,
    "generate de-duplicates repeated proposal list values",
  );

  const longStatementPath = path.join(generateTempDir, "long-statement.txt");
  writeFileSync(longStatementPath, "The system MUST accept long prose from @file arguments.", "utf8");

  const directDesign = cli([
    "generate",
    directChangeName,
    "design",
    "--reset",
    "--approach",
    "Use named CLI arguments.",
    "--approach",
    "Use named CLI arguments.",
    "--decision",
    "argument-driven-generation",
    "--decision-text",
    "Generate strict artifacts from named arguments.",
    "--rationale",
    "Named arguments expose the CLI contract directly.",
    "--alternative",
    "Keep JSON as primary input.",
    "--reason",
    "Agents still need to infer the payload shape.",
  ], { cwd: generateTempDir });
  context.assert(directDesign.status === 0, "generate writes design artifact from named arguments", `stderr: ${directDesign.stderr.trim()}`);

  const repeatedDesign = cli([
    "generate",
    directChangeName,
    "design",
    "--decision",
    "argument-driven-generation",
    "--decision-text",
    "Generate strict artifacts from named arguments.",
    "--rationale",
    "Named arguments expose the CLI contract directly.",
  ], { cwd: generateTempDir });
  context.assert(repeatedDesign.status === 0, "generate accepts repeated equivalent keyed design content", `stderr: ${repeatedDesign.stderr.trim()}`);

  const conflictingDesign = cli([
    "generate",
    directChangeName,
    "design",
    "--decision",
    "argument-driven-generation",
    "--decision-text",
    "Conflicting decision text.",
    "--rationale",
    "Named arguments expose the CLI contract directly.",
  ], { cwd: generateTempDir });
  context.assert(conflictingDesign.status !== 0, "generate rejects conflicting duplicate keyed design content");
  context.assert(
    conflictingDesign.stderr.includes("duplicate decision 'argument-driven-generation'"),
    "generate duplicate keyed conflict names the conflicting decision",
    `stderr: ${conflictingDesign.stderr.trim()}`,
  );

  writeCompleteTasksArtifact(directChangeDir, directChangeName);

  const directQuestions = cli([
    "generate",
    directChangeName,
    "questions",
    "--reset",
    "--open",
    "open-cli-contract",
    "--question",
    "Should the CLI accept grouped question arguments?",
    "--context",
    "Single-command generation needs multiple question entries in one invocation.",
    "--resolved",
    "resolved-cli-contract",
    "--question",
    "Can one command generate the full questions artifact?",
    "--context",
    "The named-argument parser now supports multiple question groups.",
    "--answer",
    "Yes. One invocation can now populate both open and resolved questions.",
  ], { cwd: generateTempDir });
  context.assert(directQuestions.status === 0, "generate writes full questions artifact from one named-argument command", `stderr: ${directQuestions.stderr.trim()}`);
  const directQuestionsArtifact = yamlModule.parseYamlDocument<{
    open: Array<{ id: string }>;
    resolved: Array<{ id: string }>;
  }>(readFileSync(path.join(directChangeDir, "questions.yaml"), "utf8"));
  context.assert(
    directQuestionsArtifact.open.length === 1 && directQuestionsArtifact.resolved.length === 1,
    "generate writes open and resolved questions in one command",
  );
  const resetQuestions = cli(["generate", directChangeName, "questions", "--reset"], { cwd: generateTempDir });
  context.assert(resetQuestions.status === 0, "generate resets questions artifact from named arguments", `stderr: ${resetQuestions.stderr.trim()}`);

  const directDelta = cli([
    "generate",
    directChangeName,
    "delta-spec",
    "--reset",
    "--target-spec",
    "cli-foundation",
    "--spec-path",
    "cli/foundation.yaml",
    "--implementation",
    "src/propose-generation.ts",
    "--implementation",
    "src/propose-generation.ts",
    "--implementation",
    "src/cli/cmd-generation.ts",
    "--test",
    "test/suites/foundation-and-fixtures.ts",
    "--operation",
    "ADDED",
    "--requirement",
    "argument-driven-test-requirement",
    "--strength",
    "MUST",
    "--statement",
    `@${longStatementPath}`,
    "--scenario",
    "argument-driven-command-populates-artifact",
    "--given",
    "a strict change scaffold exists",
    "--when",
    "the argument-driven generation command runs",
    "--then",
    "the target artifact is written",
    "--scenario",
    "argument-driven-command-populates-questions",
    "--given",
    "one command includes multiple question groups",
    "--when",
    "the questions generation command runs",
    "--then",
    "the full questions artifact is written",
    "--operation",
    "MODIFIED",
    "--requirement",
    "single-command-question-generation",
    "--strength",
    "MUST",
    "--statement",
    "The CLI MUST generate the full questions artifact from one command.",
    "--scenario",
    "argument-driven-command-populates-questions",
    "--given",
    "one command includes multiple question groups",
    "--when",
    "the questions generation command runs",
    "--then",
    "the full questions artifact is written",
    "--operation",
    "REMOVED",
    "--requirement",
    "incremental-only-generation",
    "--reason",
    "Single-command generation makes repeated per-block invocations unnecessary.",
  ], { cwd: generateTempDir });
  context.assert(directDelta.status === 0, "generate writes full delta artifact from one named-argument command", `stderr: ${directDelta.stderr.trim()}`);
  const repeatedDelta = cli([
    "generate",
    directChangeName,
    "delta-spec",
    "--target-spec",
    "cli-foundation",
    "--spec-path",
    "cli/foundation.yaml",
    "--operation",
    "ADDED",
    "--requirement",
    "argument-driven-test-requirement",
    "--strength",
    "MUST",
    "--statement",
    `@${longStatementPath}`,
    "--scenario",
    "argument-driven-command-populates-artifact",
    "--given",
    "a strict change scaffold exists",
    "--when",
    "the argument-driven generation command runs",
    "--then",
    "the target artifact is written",
    "--scenario",
    "argument-driven-command-populates-questions",
    "--given",
    "one command includes multiple question groups",
    "--when",
    "the questions generation command runs",
    "--then",
    "the full questions artifact is written",
  ], { cwd: generateTempDir });
  context.assert(repeatedDelta.status === 0, "generate accepts repeated equivalent keyed delta content", `stderr: ${repeatedDelta.stderr.trim()}`);
  const parsedDirectDelta = yamlModule.parseYamlDocument<{
    mapping: { implementation: string[] };
    operations: {
      ADDED: Record<string, unknown>;
      MODIFIED: Record<string, unknown>;
      REMOVED: Record<string, unknown>;
    };
  }>(readFileSync(path.join(directChangeDir, "specs", "cli", "foundation.yaml"), "utf8"));
  context.assert(
    parsedDirectDelta.mapping.implementation.length === 2,
    "generate de-duplicates repeated delta mapping paths",
  );
  context.assert(
    Object.keys(parsedDirectDelta.operations.ADDED).length === 1
      && Object.keys(parsedDirectDelta.operations.MODIFIED).length === 1
      && Object.keys(parsedDirectDelta.operations.REMOVED).length === 1,
    "generate writes mixed delta requirement operations in one command",
  );

  const missingArgument = cli(["generate", directChangeName, "proposal", "--what", "Missing why."], { cwd: generateTempDir });
  context.assert(missingArgument.status !== 0, "generate rejects missing required named arguments");
  context.assert(
    missingArgument.stderr.includes("--why"),
    "generate missing argument failure names the missing flag",
    `stderr: ${missingArgument.stderr.trim()}`,
  );

  const verifyDirectGenerated = cli(["verify", directChangeName], { cwd: generateTempDir });
  context.assert(verifyDirectGenerated.status === 0, "argument-driven generated complete change passes verify", `stderr: ${verifyDirectGenerated.stderr.trim()} stdout: ${verifyDirectGenerated.stdout.trim()}`);
} finally {
  rmSync(generateTempDir, { recursive: true, force: true });
}

context.section("[7] fixture-driven validation matrix");

const fixtureSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "kind", "tags"],
  properties: {
    id: { type: "string" },
    kind: { type: "string", enum: ["alpha", "beta"] },
    tags: { type: "array", minItems: 1, items: { type: "string" } },
  },
};

const validFixture = yamlModule.parseYamlFile<Record<string, unknown>>(fixturePath("schema-check.valid.yaml"));
const validFixtureResult = validationModule.validateWithSchema(
  fixtureSchema,
  validFixture,
  "fixture://schema-check.valid.yaml",
);
context.assert(validFixtureResult.valid, "[M01:yaml-schema-field-contracts] fixture valid schema case passes");

const missingRequiredFixture = yamlModule.parseYamlFile<Record<string, unknown>>(
  fixturePath("schema-check.invalid.missing-required.yaml"),
);
const missingRequiredResult = validationModule.validateWithSchema(
  fixtureSchema,
  missingRequiredFixture,
  "fixture://schema-check.invalid.missing-required.yaml",
);
context.assert(
  !missingRequiredResult.valid,
  "[M01:yaml-schema-field-contracts] fixture missing-required case fails schema validation",
);
context.assert(
  missingRequiredResult.diagnostics.some((diagnostic) => diagnostic.fieldPath === "$.id"),
  "[M01:yaml-schema-field-contracts] fixture missing-required diagnostics include missing field path",
);

const invalidEnumFixture = yamlModule.parseYamlFile<Record<string, unknown>>(fixturePath("schema-check.invalid.enum.yaml"));
const invalidEnumResult = validationModule.validateWithSchema(
  fixtureSchema,
  invalidEnumFixture,
  "fixture://schema-check.invalid.enum.yaml",
);
context.assert(
  !invalidEnumResult.valid,
  "[M01:yaml-main-spec-requirement-model] fixture invalid-enum case fails schema validation",
);
context.assert(
  invalidEnumResult.diagnostics.some((diagnostic) => diagnostic.fieldPath === "$.kind"),
  "[M01:yaml-main-spec-requirement-model] fixture invalid-enum diagnostics include enum field path",
);

const invalidShapeFixture = yamlModule.parseYamlFile<unknown>(fixturePath("schema-check.invalid.shape.yaml"));
const invalidShapeResultA = validationModule.validateWithSchema(
  fixtureSchema,
  invalidShapeFixture,
  "fixture://schema-check.invalid.shape.yaml",
);
const invalidShapeResultB = validationModule.validateWithSchema(
  fixtureSchema,
  invalidShapeFixture,
  "fixture://schema-check.invalid.shape.yaml",
);
context.assert(
  !invalidShapeResultA.valid,
  "[M01:deterministic-schema-validation] fixture unsupported-shape case fails schema validation",
);
context.assert(
  JSON.stringify(invalidShapeResultA.diagnostics) === JSON.stringify(invalidShapeResultB.diagnostics),
  "[M01:deterministic-schema-validation] fixture unsupported-shape diagnostics are deterministic",
);

let malformedRejected = false;
let malformedFixtureDetails:
  | {
    errorType: string;
    source?: string;
    reason?: string;
    line?: number;
    column?: number;
    snippet?: string;
    offendingCharacter?: string;
  }
  | null = null;
try {
  yamlModule.parseYamlFile(fixturePath("schema-check.invalid.malformed.yaml"));
} catch (error) {
  malformedRejected = true;
  malformedFixtureDetails = yamlModule.getYamlParseDetails(error);
}
context.assert(
  malformedRejected,
  "[M01:deterministic-schema-validation] fixture malformed-yaml case is rejected during parsing",
);
context.assert(
  malformedFixtureDetails?.line === 6,
  "[M01:deterministic-schema-validation] malformed fixture reports the failing line number",
  `line: ${malformedFixtureDetails?.line ?? "missing"}`,
);

const validReferenceFixture = yamlModule.parseYamlFile<Record<string, unknown>>(fixturePath("reference-check.valid.yaml"));
const validReferenceDiagnostics = validationModule.runReferenceChecks(
  validReferenceFixture,
  "fixture://reference-check.valid.yaml",
  [
    {
      sourceCollectionPath: "links",
      sourceField: "schema_id",
      targetCollectionPath: "entries",
      targetField: "schema_id",
    },
  ],
);
context.assert(
  validReferenceDiagnostics.length === 0,
  "[M01:yaml-migration-artifact-role-mapping] fixture valid-reference case produces no diagnostics",
);

const invalidReferenceFixture = yamlModule.parseYamlFile<Record<string, unknown>>(
  fixturePath("reference-check.invalid.missing-target.yaml"),
);
const invalidReferenceDiagnostics = validationModule.runReferenceChecks(
  invalidReferenceFixture,
  "fixture://reference-check.invalid.missing-target.yaml",
  [
    {
      sourceCollectionPath: "links",
      sourceField: "schema_id",
      targetCollectionPath: "entries",
      targetField: "schema_id",
    },
  ],
);
context.assert(
  invalidReferenceDiagnostics.length === 1,
  "[M01:yaml-migration-artifact-role-mapping] fixture invalid-reference case produces one diagnostic",
);
context.assert(
  invalidReferenceDiagnostics[0]?.fieldPath === "$.links[0].schema_id",
  "[M01:yaml-migration-artifact-role-mapping] fixture invalid-reference diagnostics include source field path",
);

const validDuplicateFixture = yamlModule.parseYamlFile<Record<string, unknown>>(
  fixturePath("duplicate-check.valid.requirement-id.yaml"),
);
const validDuplicateDiagnostics = validationModule.runDuplicateIdChecks(
  validDuplicateFixture,
  "fixture://duplicate-check.valid.requirement-id.yaml",
  [{ collectionPath: "requirements", idField: "id" }],
);
context.assert(
  validDuplicateDiagnostics.length === 0,
  "[M01:yaml-requirement-and-scenario-identifiers] fixture valid-duplicate-id case produces no diagnostics",
);

const invalidDuplicateFixture = yamlModule.parseYamlFile<Record<string, unknown>>(
  fixturePath("duplicate-check.invalid.requirement-id.yaml"),
);
const invalidDuplicateDiagnostics = validationModule.runDuplicateIdChecks(
  invalidDuplicateFixture,
  "fixture://duplicate-check.invalid.requirement-id.yaml",
  [{ collectionPath: "requirements", idField: "id" }],
);
context.assert(
  invalidDuplicateDiagnostics.length === 1,
  "[M01:yaml-requirement-and-scenario-identifiers] fixture duplicate-id case produces one diagnostic",
);
context.assert(
  invalidDuplicateDiagnostics[0]?.fieldPath === "$.requirements[1].id",
  "[M01:yaml-requirement-and-scenario-identifiers] fixture duplicate-id diagnostics include duplicate field path",
);

context.section("[7a] real project fixture baseline");

const todoProjectRoot = projectFixturePath("todo-app");
context.assert(existsSync(todoProjectRoot), "real todo project fixture root exists");

const requiredProjectArtifacts = [
  "README.md",
  ".gitignore",
  "package.json",
  "tsconfig.json",
  "src/index.ts",
  "src/todos.ts",
  "test/todos.test.ts",
  ".spec-driven/config.yaml",
  ".spec-driven/specs/INDEX.md",
  ".spec-driven/specs/todo-management.md",
  ".spec-driven/roadmap/INDEX.md",
  ".spec-driven/roadmap/milestones/01-core-todo-workflows.md",
  ".spec-driven/changes/add-due-dates/proposal.md",
  ".spec-driven/changes/add-due-dates/design.md",
  ".spec-driven/changes/add-due-dates/tasks.md",
  ".spec-driven/changes/add-due-dates/questions.md",
  ".spec-driven/changes/add-due-dates/specs/todo-management.md",
];
for (const artifactPath of requiredProjectArtifacts) {
  context.assert(
    existsSync(path.join(todoProjectRoot, artifactPath)),
    `real todo project fixture artifact exists (${artifactPath})`,
  );
}

const fixturePackageJson = JSON.parse(readFileSync(projectFixturePath("todo-app", "package.json"), "utf8")) as {
  name: string;
  scripts?: Record<string, string>;
};
context.assert(fixturePackageJson.name === "todo-app-fixture", "real todo project fixture exposes a stable package name");
context.assert(
  fixturePackageJson.scripts?.build === "tsc -p tsconfig.json",
  "real todo project fixture exposes an explicit build command",
);
context.assert(
  fixturePackageJson.scripts?.test === "npm run build && node --test dist/test/todos.test.js",
  "real todo project fixture exposes an explicit test command",
);

const fixtureReadme = readFileSync(projectFixturePath("todo-app", "README.md"), "utf8");
context.assert(
  fixtureReadme.includes("committed baseline fixture"),
  "real todo project fixture README documents baseline fixture intent",
);

const fixtureSpec = readFileSync(projectFixturePath("todo-app", ".spec-driven", "specs", "todo-management.md"), "utf8");
context.assert(
  fixtureSpec.includes("src/todos.ts") && fixtureSpec.includes("test/todos.test.ts"),
  "real todo project fixture main spec maps implementation and tests",
);
context.assert(
  fixtureSpec.includes("### Requirement: manage-todo-items"),
  "real todo project fixture main spec includes core todo requirement text",
);

const fixtureRoadmap = readFileSync(
  projectFixturePath("todo-app", ".spec-driven", "roadmap", "milestones", "01-core-todo-workflows.md"),
  "utf8",
);
context.assert(
  fixtureRoadmap.includes("`add-due-dates`") && fixtureRoadmap.includes("`add-tag-filtering`"),
  "real todo project fixture roadmap seeds multiple planned changes",
);

const fixtureChangeProposal = readFileSync(
  projectFixturePath("todo-app", ".spec-driven", "changes", "add-due-dates", "proposal.md"),
  "utf8",
);
context.assert(
  fixtureChangeProposal.toLowerCase().includes("due date"),
  "real todo project fixture active change proposal describes the seeded change",
);

const fixtureChangeTasks = readFileSync(
  projectFixturePath("todo-app", ".spec-driven", "changes", "add-due-dates", "tasks.md"),
  "utf8",
);
context.assert(
  fixtureChangeTasks.includes("`npm run build`") && fixtureChangeTasks.toLowerCase().includes("unit tests"),
  "real todo project fixture active change tasks include validation and unit test commands",
);

const fixtureDeltaSpec = readFileSync(
  projectFixturePath("todo-app", ".spec-driven", "changes", "add-due-dates", "specs", "todo-management.md"),
  "utf8",
);
context.assert(
  fixtureDeltaSpec.includes("## ADDED Requirements") && fixtureDeltaSpec.includes("### Requirement: assign-due-dates"),
  "real todo project fixture seeded change includes a delta spec for due dates",
);

context.section("[7b] copied real project workspace harness");

const copiedWorkspaceChangePath = path.join(".strict-spec-driven", "changes", "copied-workspace-smoke-change");
context.assert(
  !existsSync(path.join(todoProjectRoot, copiedWorkspaceChangePath)),
  "committed fixture baseline starts without copied-workspace smoke change",
);

const firstCopiedWorkspace = createCopiedProjectWorkspace("todo-app");
try {
  context.assert(
    firstCopiedWorkspace.workspaceRoot !== todoProjectRoot,
    "copied workspace helper creates a distinct workspace root",
  );
  context.assert(
    existsSync(path.join(firstCopiedWorkspace.workspaceRoot, ".spec-driven", "changes", "add-due-dates", "proposal.md")),
    "copied workspace includes the seeded active change",
  );

  const firstPropose = projectWorkspaceCli(firstCopiedWorkspace.workspaceRoot, ["propose", "copied-workspace-smoke-change"]);
  context.assert(
    firstPropose.status === 0,
    "copied workspace allows mutable CLI scenarios without touching baseline fixture",
    `stdout: ${firstPropose.stdout.trim()} stderr: ${firstPropose.stderr.trim()}`,
  );
  context.assert(
    existsSync(path.join(firstCopiedWorkspace.workspaceRoot, copiedWorkspaceChangePath, "proposal.yaml")),
    "copied workspace records new change artifacts inside the temp copy",
  );
  context.assert(
    !existsSync(path.join(todoProjectRoot, copiedWorkspaceChangePath)),
    "committed fixture baseline stays unchanged during copied-workspace mutation",
  );
} finally {
  firstCopiedWorkspace.cleanup();
}

context.assert(!existsSync(firstCopiedWorkspace.workspaceRoot), "copied workspace cleanup removes the first temp workspace");

const secondCopiedWorkspace = createCopiedProjectWorkspace("todo-app");
try {
  context.assert(
    !existsSync(path.join(secondCopiedWorkspace.workspaceRoot, copiedWorkspaceChangePath)),
    "fresh copied workspace starts from the committed fixture baseline",
  );

  const secondPropose = projectWorkspaceCli(secondCopiedWorkspace.workspaceRoot, ["propose", "copied-workspace-smoke-change"]);
  context.assert(
    secondPropose.status === 0,
    "copied workspace scenarios can be repeated across fresh copies",
    `stdout: ${secondPropose.stdout.trim()} stderr: ${secondPropose.stderr.trim()}`,
  );
  context.assert(
    existsSync(path.join(secondCopiedWorkspace.workspaceRoot, copiedWorkspaceChangePath, "proposal.yaml")),
    "repeat copied workspace run creates the same change artifacts again",
  );
} finally {
  secondCopiedWorkspace.cleanup();
}

context.assert(!existsSync(secondCopiedWorkspace.workspaceRoot), "copied workspace cleanup removes the second temp workspace");
context.assert(
  !existsSync(path.join(todoProjectRoot, copiedWorkspaceChangePath)),
  "committed fixture baseline stays unchanged after repeated copied-workspace scenarios",
);

context.section("[7c] copied real project CLI init, propose, and list flows");

const copiedWorkspaceCliChangePath = path.join(".strict-spec-driven", "changes", "copied-workspace-cli-change");
function runCopiedWorkspaceCliFlowScenario(): {
  initStatus: number;
  initWarning: string;
  proposeStatus: number;
  proposeStdout: string;
  listStatus: number;
  listStdout: string;
} {
  const copiedWorkspaceCliFlow = createCopiedProjectWorkspace("todo-app");
  const { workspaceRoot } = copiedWorkspaceCliFlow;
  try {
    context.assert(
      !existsSync(path.join(workspaceRoot, ".strict-spec-driven")),
      "copied workspace CLI flow starts without strict scaffold output",
    );

    const copiedInit = projectWorkspaceCli(workspaceRoot, ["init"]);
    const copiedInitWarning = copiedInit.stderr.trim();
    context.assert(
      copiedInit.status === 0,
      "copied workspace init exits zero alongside the legacy fixture baseline",
      `stdout: ${copiedInit.stdout.trim()} stderr: ${copiedInitWarning}`,
    );
    context.assert(
      copiedInitWarning.includes("legacy '.spec-driven/' directory"),
      "copied workspace init reports legacy bootstrap coexistence warning",
      `stderr: ${copiedInitWarning}`,
    );
    context.assert(
      existsSync(path.join(workspaceRoot, ".strict-spec-driven", "config.yaml")),
      "copied workspace init creates strict scaffold artifacts in the temp workspace",
    );

    const copiedPropose = projectWorkspaceCli(workspaceRoot, ["propose", "copied-workspace-cli-change"]);
    const copiedProposeStdout = copiedPropose.stdout.trim();
    context.assert(
      copiedPropose.status === 0,
      "copied workspace propose creates a strict active change inside the temp workspace",
      `stdout: ${copiedProposeStdout} stderr: ${copiedPropose.stderr.trim()}`,
    );
    context.assert(
      existsSync(path.join(workspaceRoot, copiedWorkspaceCliChangePath, "proposal.yaml")),
      "copied workspace propose records change artifacts inside the temp workspace",
    );

    const copiedList = projectWorkspaceCli(workspaceRoot, ["list"]);
    const copiedListStdout = copiedList.stdout.trim();
    context.assert(
      copiedList.status === 0,
      "copied workspace list exits zero after a copied-fixture propose flow",
      `stdout: ${copiedListStdout} stderr: ${copiedList.stderr.trim()}`,
    );
    context.assert(copiedListStdout.includes("Active:"), "copied workspace list reports the Active heading");
    context.assert(
      copiedListStdout.includes("copied-workspace-cli-change    proposed"),
      "copied workspace list reports the proposed copied-workspace change",
      `stdout: ${copiedListStdout}`,
    );
    context.assert(
      !existsSync(path.join(todoProjectRoot, ".strict-spec-driven")),
      "committed fixture baseline still has no strict scaffold after copied workspace init",
    );
    context.assert(
      !existsSync(path.join(todoProjectRoot, copiedWorkspaceCliChangePath)),
      "committed fixture baseline stays unchanged after copied init, propose, and list flow",
    );

    return {
      initStatus: copiedInit.status,
      initWarning: copiedInitWarning,
      proposeStatus: copiedPropose.status,
      proposeStdout: copiedProposeStdout,
      listStatus: copiedList.status,
      listStdout: copiedListStdout,
    };
  } finally {
    copiedWorkspaceCliFlow.cleanup();
    context.assert(!existsSync(workspaceRoot), "copied workspace CLI flow cleanup removes the temp workspace");
  }
}

const copiedWorkspaceCliFirstRun = runCopiedWorkspaceCliFlowScenario();
const copiedWorkspaceCliSecondRun = runCopiedWorkspaceCliFlowScenario();
context.assert(
  copiedWorkspaceCliFirstRun.initStatus === copiedWorkspaceCliSecondRun.initStatus
    && copiedWorkspaceCliFirstRun.initWarning === copiedWorkspaceCliSecondRun.initWarning,
  "copied workspace init warning stays stable across repeated copied-fixture CLI flows",
);
context.assert(
  copiedWorkspaceCliFirstRun.proposeStatus === copiedWorkspaceCliSecondRun.proposeStatus
    && copiedWorkspaceCliFirstRun.proposeStdout === copiedWorkspaceCliSecondRun.proposeStdout,
  "copied workspace propose output stays stable across repeated copied-fixture CLI flows",
);
context.assert(
  copiedWorkspaceCliFirstRun.listStatus === copiedWorkspaceCliSecondRun.listStatus
    && copiedWorkspaceCliFirstRun.listStdout === copiedWorkspaceCliSecondRun.listStdout,
  "copied workspace list output stays stable across repeated copied-fixture CLI flows",
);

context.section("[8] bundled template assets in dist");

const distTemplatesRoot = path.join(ROOT, "dist", "templates", "strict-spec-driven");
const distScaffoldDir = path.join(distTemplatesRoot, "scaffold");
const distSchemasDir = path.join(distTemplatesRoot, "schemas");
const distExamplesDir = path.join(distTemplatesRoot, "examples");

context.assert(existsSync(distScaffoldDir), "dist/templates/strict-spec-driven/scaffold exists after build");
context.assert(existsSync(distSchemasDir), "dist/templates/strict-spec-driven/schemas exists after build");

for (const relativeAssetPath of scaffoldModule.getRequiredBundledScaffoldAssets()) {
  const distAssetPath = path.join(distScaffoldDir, relativeAssetPath);
  context.assert(existsSync(distAssetPath), `dist scaffold asset exists (${relativeAssetPath})`);
  context.assert(statSync(distAssetPath).isFile(), `dist scaffold asset is a file (${relativeAssetPath})`);
}

for (const changeAsset of scaffoldModule.getRequiredBundledChangeTemplateAssets()) {
  const distAssetPath = path.join(distScaffoldDir, changeAsset);
  context.assert(existsSync(distAssetPath), `dist change template asset exists (${changeAsset})`);
  context.assert(statSync(distAssetPath).isFile(), `dist change template asset is a file (${changeAsset})`);
}

const distSchemaFiles = [
  "registry.yaml",
  "main-spec.yaml",
  "delta-spec.yaml",
  "task-list.yaml",
  "question-list.yaml",
  "roadmap-index.yaml",
  "roadmap-milestone.yaml",
  "planned-change.yaml",
];
for (const schemaFile of distSchemaFiles) {
  const distSchemaPath = path.join(distSchemasDir, schemaFile);
  context.assert(existsSync(distSchemaPath), `dist schema file exists (${schemaFile})`);
  context.assert(statSync(distSchemaPath).isFile(), `dist schema file is a file (${schemaFile})`);
}

context.assert(!existsSync(distExamplesDir), "dist/templates/strict-spec-driven/examples is not bundled after build");

context.section("[9] init from dist-only environment");

const distOnlyDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-dist-only-init-"));
try {
  const distOnlyInit = cli(["init"], { cwd: distOnlyDir });
  context.assert(distOnlyInit.status === 0, "init succeeds from dist-only temp directory", `got exit code ${distOnlyInit.status}`);
  const strictRoot = path.join(distOnlyDir, ".strict-spec-driven");
  context.assert(existsSync(strictRoot), "init from dist creates .strict-spec-driven directory");
  for (const artifact of ["config.yaml", "specs/INDEX.yaml", "roadmap/INDEX.yaml"]) {
    context.assert(existsSync(path.join(strictRoot, artifact)), `init from dist creates artifact (${artifact})`);
  }
  context.assert(
    listFilesRecursive(strictRoot).every((filePath) => filePath.endsWith(".yaml")),
    "init from dist creates only YAML files under .strict-spec-driven",
  );
} finally {
  rmSync(distOnlyDir, { recursive: true, force: true });
}

context.section("[10] propose from dist-only environment");

const distOnlyProposeDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-dist-only-propose-"));
try {
  const distOnlyPropose = cli(["propose", "test-change"], { cwd: distOnlyProposeDir });
  context.assert(distOnlyPropose.status === 0, "propose succeeds from dist-only temp directory", `got exit code ${distOnlyPropose.status}`);
  const changeDir = path.join(distOnlyProposeDir, ".strict-spec-driven", "changes", "test-change");
  context.assert(existsSync(changeDir), "propose from dist creates change directory");
  for (const artifact of ["proposal.yaml", "design.yaml", "tasks.yaml", "questions.yaml"]) {
    context.assert(existsSync(path.join(changeDir, artifact)), `propose from dist creates artifact (${artifact})`);
  }
  context.assert(existsSync(path.join(changeDir, "specs")), "propose from dist creates specs directory");
} finally {
  rmSync(distOnlyProposeDir, { recursive: true, force: true });
}

}
