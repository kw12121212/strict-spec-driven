import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "fs";
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

export async function runFoundationAndFixtureSuite(context: TestContext): Promise<void> {
context.section("[2] yaml utilities");

const yamlModule = await loadDistModule<YamlModule>("yaml.js");
const parsed = yamlModule.parseYamlDocument<{ service: { name: string } }>("service:\n  name: strict-spec\n");
context.assert(parsed.service.name === "strict-spec", "parseYamlDocument parses YAML mapping");

const yamlString = yamlModule.stringifyYamlDocument({ alpha: "beta" });
context.assert(yamlString.includes("alpha: beta"), "stringifyYamlDocument serializes mappings");

const tempDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-driven-"));
const yamlPath = path.join(tempDir, "sample.yaml");
writeFileSync(yamlPath, "value: 42\n", "utf8");
try {
  const parsedFile = yamlModule.parseYamlFile<{ value: number }>(yamlPath);
  context.assert(parsedFile.value === 42, "parseYamlFile loads YAML from disk");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

const roadmapIndexExample = yamlModule.parseYamlFile<{
  milestones: Array<{ id: string; title: string; path: string; status: string }>;
}>(path.join(ROOT, "templates", "strict-spec-driven", "examples", "roadmap-index.yaml"));
context.assert(
  roadmapIndexExample.milestones.length >= 1 &&
    roadmapIndexExample.milestones.every(
      (milestone) =>
        milestone.id.length > 0 &&
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
  planned_changes: Array<{ id: string; depends_on: string[] }>;
}>(path.join(ROOT, "templates", "strict-spec-driven", "examples", "roadmap-milestone.yaml"));
context.assert(roadmapMilestoneExample.dependencies.length === 0, "primary roadmap milestone example keeps dependencies minimal");
context.assert(roadmapMilestoneExample.risks.length === 0, "primary roadmap milestone example keeps risks minimal");
context.assert(roadmapMilestoneExample.notes.length === 0, "primary roadmap milestone example keeps notes minimal");
context.assert(
  roadmapMilestoneExample.planned_changes.length === 1 &&
    roadmapMilestoneExample.planned_changes[0]?.depends_on.length === 0,
  "primary roadmap milestone example keeps planned change dependencies minimal",
);

const roadmapIndexOrderingExample = yamlModule.parseYamlFile<{
  milestones: Array<{ id: string; title: string; path: string; status: string }>;
}>(path.join(ROOT, "templates", "strict-spec-driven", "examples", "roadmap-index.ordering.yaml"));
const roadmapIndexOrderingText = readFileSync(
  path.join(ROOT, "templates", "strict-spec-driven", "examples", "roadmap-index.ordering.yaml"),
  "utf8",
);
const roadmapIndexDeclaredOrder = Array.from(roadmapIndexOrderingText.matchAll(/^\s*-\s+id:\s+(.+)\s*$/gm)).map((match) => match[1]);
context.assert(roadmapIndexOrderingExample.milestones.length >= 2, "roadmap index coverage example includes multiple milestones");
context.assert(
  roadmapIndexOrderingExample.milestones.every(
    (milestone) =>
      milestone.id.length > 0 &&
      milestone.title.length > 0 &&
      milestone.path.length > 0 &&
      milestone.status.length > 0,
  ),
  "roadmap index coverage example demonstrates ordered milestone entries",
);

const roadmapMilestonePlanningExample = yamlModule.parseYamlFile<{
  status: string;
  dependencies: string[];
  risks: string[];
  notes: string[];
  planned_changes: Array<{ id: string; status: string; depends_on: string[] }>;
}>(path.join(ROOT, "templates", "strict-spec-driven", "examples", "roadmap-milestone.planning.yaml"));
context.assert(roadmapMilestonePlanningExample.dependencies.length >= 1, "roadmap milestone coverage example includes milestone dependencies");
context.assert(roadmapMilestonePlanningExample.risks.length >= 1, "roadmap milestone coverage example includes milestone risks");
context.assert(roadmapMilestonePlanningExample.notes.length >= 1, "roadmap milestone coverage example includes milestone notes");
context.assert(roadmapMilestonePlanningExample.planned_changes.length >= 2, "roadmap milestone coverage example includes multiple planned changes");
context.assert(
  roadmapMilestonePlanningExample.planned_changes[1]?.depends_on[0] === roadmapMilestonePlanningExample.planned_changes[0]?.id,
  "roadmap milestone coverage example preserves planned change dependency linkage",
);

context.section("[3] validation layer utilities");

const validationModule = await loadDistModule<ValidationModule>("validation.js");
const registrySchema = validationModule.loadBundledSchema<Record<string, unknown>>("registry.yaml");
context.assert(registrySchema.artifact_type === "schema_registry", "loadBundledSchema reads bundled schema assets");

const mainSpecSchema = validationModule.loadBundledSchemaByArtifactType("main_spec");
context.assert(mainSpecSchema.artifact_type === "main_spec", "loadBundledSchemaByArtifactType resolves registry entries");

const bySchemaId = validationModule.loadBundledSchemaBySchemaId("strict-spec-driven/main-spec/v1");
context.assert(bySchemaId.artifact_type === "main_spec", "loadBundledSchemaBySchemaId resolves schema IDs");

const roadmapIndexSchema = validationModule.loadBundledSchemaByArtifactType("roadmap_index") as {
  artifact_type: string;
  fields: {
    milestones: {
      unique_by: string;
      items: {
        fields: {
          status: {
            enum: string[];
          };
        };
      };
    };
  };
};
context.assert(roadmapIndexSchema.artifact_type === "roadmap_index", "roadmap index schema resolves by artifact type");
context.assert(
  roadmapIndexSchema.fields.milestones.unique_by === "id",
  "roadmap index schema keeps milestone uniqueness keyed by id",
);

const roadmapMilestoneSchema = validationModule.loadBundledSchemaBySchemaId("strict-spec-driven/roadmap-milestone/v1") as {
  artifact_type: string;
  fields: {
    milestone: {
      fields: {
        id: {
          type: string;
        };
      };
    };
    planned_changes: {
      items: {
        type: string;
      };
    };
    status: {
      enum: string[];
    };
  };
};
context.assert(roadmapMilestoneSchema.artifact_type === "roadmap_milestone", "roadmap milestone schema resolves by schema ID");
context.assert(
  roadmapMilestoneSchema.fields.milestone.fields.id.type === "string",
  "roadmap milestone schema keeps milestone ids as structured string fields",
);
context.assert(
  roadmapMilestoneSchema.fields.planned_changes.items.type === "planned_change_entry",
  "roadmap milestone schema keeps planned changes typed as planned change entries",
);
const plannedChangeSchema = validationModule.loadBundledSchemaByArtifactType("planned_change_entry") as {
  artifact_type: string;
  fields: {
    status: {
      enum: string[];
    };
  };
};
context.assert(plannedChangeSchema.artifact_type === "planned_change_entry", "planned change schema resolves by artifact type");
context.assert(
  roadmapIndexDeclaredOrder.length >= 2 &&
    roadmapIndexOrderingExample.milestones[0]?.id === roadmapIndexDeclaredOrder[0] &&
    roadmapIndexOrderingExample.milestones[1]?.id === roadmapIndexDeclaredOrder[1],
  "roadmap index coverage example preserves the declared milestone order",
);
context.assert(
  roadmapIndexOrderingExample.milestones.every((milestone) =>
    roadmapIndexSchema.fields.milestones.items.fields.status.enum.includes(milestone.status),
  ),
  "roadmap index coverage example statuses stay within roadmap schema enums",
);
context.assert(
  roadmapMilestoneSchema.fields.status.enum.includes(roadmapMilestonePlanningExample.status),
  "roadmap milestone coverage example status stays within roadmap schema enums",
);
context.assert(
  roadmapMilestonePlanningExample.planned_changes.every((plannedChange) =>
    plannedChangeSchema.fields.status.enum.includes(plannedChange.status),
  ),
  "roadmap milestone coverage example planned change statuses stay within planned change schema enums",
);
context.assert(
  roadmapMilestonePlanningExample.planned_changes[1]?.depends_on[0] === roadmapMilestonePlanningExample.planned_changes[0]?.id,
  "roadmap milestone coverage example preserves planned change dependency linkage",
);
context.assert(
  roadmapMilestonePlanningExample.dependencies.length >= 1,
  "roadmap milestone coverage example keeps milestone dependency fields populated",
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
context.assert(firstAssetList.length === 5, "required scaffold asset manifest includes five assets");
context.assert(
  firstAssetList.every((asset) => asset.endsWith(".yaml") || asset.endsWith(".md")),
  "required scaffold asset manifest contains expected file types",
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

const scaffoldSpecIndex = scaffoldModule.loadBundledScaffoldYaml<Record<string, unknown>>("specs/INDEX.yaml");
context.assert(scaffoldSpecIndex.artifact_type === "spec_index", "scaffold specs index template is loadable YAML");

const scaffoldRoadmapIndex = scaffoldModule.loadBundledScaffoldYaml<Record<string, unknown>>("roadmap/INDEX.yaml");
context.assert(scaffoldRoadmapIndex.artifact_type === "roadmap_index", "scaffold roadmap index template is loadable YAML");
context.assert(Array.isArray(scaffoldRoadmapIndex.milestones), "scaffold roadmap index template includes milestone sequence field");

const scaffoldChangeState = scaffoldModule.loadBundledScaffoldYaml<Record<string, unknown>>("changes/STATE.yaml");
context.assert(scaffoldChangeState.artifact_type === "change_state_index", "scaffold changes state template is loadable YAML");

const scaffoldReadme = scaffoldModule.readBundledScaffoldTemplate("specs/README.md");
context.assert(scaffoldReadme.includes("# Strict Specs"), "scaffold README guidance is readable text");

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
    "changes/STATE.yaml",
    "specs/README.md",
  ];
  for (const artifactPath of requiredArtifacts) {
    context.assert(
      existsSync(path.join(strictRoot, artifactPath)),
      `init creates scaffold artifact (${artifactPath})`,
    );
  }

  const configPath = path.join(strictRoot, "config.yaml");
  writeFileSync(configPath, "custom: keep-me\n", "utf8");
  unlinkSync(path.join(strictRoot, "specs", "README.md"));

  const initSecond = cli(["init"], { cwd: initTempDir });
  context.assert(initSecond.status === 0, "init rerun exits zero", `got exit code ${initSecond.status}`);
  context.assert(
    readFileSync(configPath, "utf8") === "custom: keep-me\n",
    "init rerun preserves existing strict artifacts (non-clobber)",
  );
  context.assert(
    existsSync(path.join(strictRoot, "specs", "README.md")),
    "init rerun creates missing scaffold artifacts without overwriting existing files",
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
} finally {
  rmSync(proposeTempDir, { recursive: true, force: true });
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
try {
  yamlModule.parseYamlFile(fixturePath("schema-check.invalid.malformed.yaml"));
} catch {
  malformedRejected = true;
}
context.assert(
  malformedRejected,
  "[M01:deterministic-schema-validation] fixture malformed-yaml case is rejected during parsing",
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
  "planned-change-entry.yaml",
];
for (const schemaFile of distSchemaFiles) {
  const distSchemaPath = path.join(distSchemasDir, schemaFile);
  context.assert(existsSync(distSchemaPath), `dist schema file exists (${schemaFile})`);
  context.assert(statSync(distSchemaPath).isFile(), `dist schema file is a file (${schemaFile})`);
}

const distExampleFiles = [
  "roadmap-index.yaml",
  "roadmap-index.ordering.yaml",
  "roadmap-milestone.yaml",
  "roadmap-milestone.planning.yaml",
  "planned-change-entry.yaml",
];
for (const exampleFile of distExampleFiles) {
  const distExamplePath = path.join(ROOT, "dist", "templates", "strict-spec-driven", "examples", exampleFile);
  context.assert(existsSync(distExamplePath), `dist example file exists (${exampleFile})`);
  context.assert(statSync(distExamplePath).isFile(), `dist example file is a file (${exampleFile})`);
}

const distRoadmapIndexExample = yamlModule.parseYamlFile<{ milestones: Array<{ id: string }> }>(
  path.join(ROOT, "dist", "templates", "strict-spec-driven", "examples", "roadmap-index.ordering.yaml"),
);
const distRoadmapIndexOrderingText = readFileSync(
  path.join(ROOT, "dist", "templates", "strict-spec-driven", "examples", "roadmap-index.ordering.yaml"),
  "utf8",
);
const distRoadmapIndexDeclaredOrder = Array.from(distRoadmapIndexOrderingText.matchAll(/^\s*-\s+id:\s+(.+)\s*$/gm)).map(
  (match) => match[1],
);
context.assert(
  distRoadmapIndexDeclaredOrder.length >= 2 &&
    distRoadmapIndexExample.milestones[0]?.id === distRoadmapIndexDeclaredOrder[0] &&
    distRoadmapIndexExample.milestones[1]?.id === distRoadmapIndexDeclaredOrder[1],
  "dist roadmap index coverage example preserves milestone ordering",
);

context.section("[9] init from dist-only environment");

const distOnlyDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-dist-only-init-"));
try {
  const distOnlyInit = cli(["init"], { cwd: distOnlyDir });
  context.assert(distOnlyInit.status === 0, "init succeeds from dist-only temp directory", `got exit code ${distOnlyInit.status}`);
  const strictRoot = path.join(distOnlyDir, ".strict-spec-driven");
  context.assert(existsSync(strictRoot), "init from dist creates .strict-spec-driven directory");
  for (const artifact of ["config.yaml", "specs/INDEX.yaml", "roadmap/INDEX.yaml", "changes/STATE.yaml", "specs/README.md"]) {
    context.assert(existsSync(path.join(strictRoot, artifact)), `init from dist creates artifact (${artifact})`);
  }
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
