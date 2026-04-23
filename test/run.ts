#!/usr/bin/env node
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const CLI = path.join(ROOT, "dist", "strict-spec-cli.js");
const VALIDATION_FIXTURE_ROOT = path.join(ROOT, "test", "fixtures", "validation");

type YamlModule = {
  parseYamlDocument<T>(input: string): T;
  stringifyYamlDocument(value: unknown): string;
  parseYamlFile<T>(path: string): T;
};

type ValidationDiagnostic = {
  source: string;
  artifactPath: string;
  fieldPath: string;
  message: string;
  expected?: string;
  actual?: string;
};

type ValidationModule = {
  loadBundledSchema<T extends object = Record<string, unknown>>(schemaFile: string): T;
  loadBundledSchemaByArtifactType(artifactType: string): Record<string, unknown>;
  loadBundledSchemaBySchemaId(schemaId: string): Record<string, unknown>;
  validateWithSchema(schema: object, artifact: unknown, artifactPath: string): { valid: boolean; diagnostics: ValidationDiagnostic[] };
  runDuplicateIdChecks(
    artifact: unknown,
    artifactPath: string,
    rules: Array<{ collectionPath: string; idField: string; description?: string }>,
  ): ValidationDiagnostic[];
  runReferenceChecks(
    artifact: unknown,
    artifactPath: string,
    rules: Array<{
      sourceCollectionPath: string;
      sourceField: string;
      targetCollectionPath: string;
      targetField: string;
      description?: string;
    }>,
  ): ValidationDiagnostic[];
  validateArtifact(
    schema: object,
    artifact: unknown,
    artifactPath: string,
    options?: {
      duplicateIdRules?: Array<{ collectionPath: string; idField: string; description?: string }>;
      referenceRules?: Array<{
        sourceCollectionPath: string;
        sourceField: string;
        targetCollectionPath: string;
        targetField: string;
        description?: string;
      }>;
    },
  ): { valid: boolean; diagnostics: ValidationDiagnostic[] };
};

type ScaffoldModule = {
  getBundledScaffoldPath(relativePath: string): string;
  readBundledScaffoldTemplate(relativePath: string): string;
  loadBundledScaffoldYaml<T>(relativePath: string): T;
  getRequiredBundledScaffoldAssets(): string[];
  getRequiredBundledChangeTemplateAssets(): string[];
  findMissingRequiredScaffoldAssets(): string[];
};

let passed = 0;
let failed = 0;

function pass(label: string): void {
  console.log(`  PASS ${label}`);
  passed += 1;
}

function fail(label: string, details = ""): void {
  console.log(`  FAIL ${label}${details ? ` (${details})` : ""}`);
  failed += 1;
}

function section(title: string): void {
  console.log(`\n${title}`);
}

function assert(condition: boolean, label: string, details = ""): void {
  if (condition) {
    pass(label);
  } else {
    fail(label, details);
  }
}

function cli(args: string[], options?: { cwd?: string }): { status: number; stdout: string; stderr: string } {
  const result = spawnSync("node", [CLI, ...args], { encoding: "utf8", cwd: options?.cwd });
  return {
    status: typeof result.status === "number" ? result.status : 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function fixturePath(fileName: string): string {
  return path.join(VALIDATION_FIXTURE_ROOT, fileName);
}

async function loadDistModule<T>(fileName: string): Promise<T> {
  const moduleUrl = pathToFileURL(path.join(ROOT, "dist", fileName)).href;
  return (await import(moduleUrl)) as T;
}

async function main(): Promise<void> {
  section("[1] entrypoint smoke test");

  const noArgs = cli([]);
  assert(noArgs.status !== 0, "no-arg invocation exits non-zero", `got exit code ${noArgs.status}`);
  assert(
    noArgs.stderr.includes("Usage:"),
    "no-arg invocation prints usage hint to stderr",
    `stderr: ${noArgs.stderr.trim()}`,
  );

  const unknownCmd = cli(["unknown-subcommand"]);
  assert(unknownCmd.status !== 0, "unknown subcommand exits non-zero", `got exit code ${unknownCmd.status}`);
  assert(
    unknownCmd.stderr.includes("Usage:"),
    "unknown subcommand prints usage hint to stderr",
    `stderr: ${unknownCmd.stderr.trim()}`,
  );

  section("[2] yaml utilities");

  const yamlModule = await loadDistModule<YamlModule>("yaml.js");
  const parsed = yamlModule.parseYamlDocument<{ service: { name: string } }>("service:\n  name: strict-spec\n");
  assert(parsed.service.name === "strict-spec", "parseYamlDocument parses YAML mapping");

  const yamlString = yamlModule.stringifyYamlDocument({ alpha: "beta" });
  assert(yamlString.includes("alpha: beta"), "stringifyYamlDocument serializes mappings");

  const tempDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-driven-"));
  const yamlPath = path.join(tempDir, "sample.yaml");
  writeFileSync(yamlPath, "value: 42\n", "utf8");
  try {
    const parsedFile = yamlModule.parseYamlFile<{ value: number }>(yamlPath);
    assert(parsedFile.value === 42, "parseYamlFile loads YAML from disk");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }

  section("[3] validation layer utilities");

  const validationModule = await loadDistModule<ValidationModule>("validation.js");
  const registrySchema = validationModule.loadBundledSchema<Record<string, unknown>>("registry.yaml");
  assert(registrySchema.artifact_type === "schema_registry", "loadBundledSchema reads bundled schema assets");

  const mainSpecSchema = validationModule.loadBundledSchemaByArtifactType("main_spec");
  assert(mainSpecSchema.artifact_type === "main_spec", "loadBundledSchemaByArtifactType resolves registry entries");

  const bySchemaId = validationModule.loadBundledSchemaBySchemaId("strict-spec-driven/main-spec/v1");
  assert(bySchemaId.artifact_type === "main_spec", "loadBundledSchemaBySchemaId resolves schema IDs");

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

  assert(schemaResultA.valid === false, "validateWithSchema reports invalid artifacts");
  assert(
    JSON.stringify(schemaResultA.diagnostics) === JSON.stringify(schemaResultB.diagnostics),
    "validateWithSchema diagnostics are deterministic",
  );
  assert(
    schemaResultA.diagnostics.every((diagnostic) => diagnostic.artifactPath === "memory://artifact"),
    "schema diagnostics include artifact path context",
  );
  assert(
    schemaResultA.diagnostics.some((diagnostic) => diagnostic.fieldPath === "$.name"),
    "schema diagnostics include field path context",
  );
  assert(
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
  assert(duplicateDiagnostics.length === 1, "runDuplicateIdChecks detects duplicate identifiers");
  assert(
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
  assert(referenceDiagnostics.length === 1, "runReferenceChecks detects missing references");
  assert(
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
  assert(combinedResult.valid === false, "validateArtifact combines schema and duplicate checks");
  assert(
    combinedResult.diagnostics.some((diagnostic) => diagnostic.source === "duplicate_id"),
    "validateArtifact output includes duplicate diagnostics",
  );

  section("[4] scaffold template assets");

  const scaffoldModule = await loadDistModule<ScaffoldModule>("scaffold.js");
  let traversalRejected = false;
  try {
    scaffoldModule.getBundledScaffoldPath("../config.yaml");
  } catch {
    traversalRejected = true;
  }
  assert(traversalRejected, "scaffold path helper rejects parent-directory traversal");

  let absoluteRejected = false;
  try {
    scaffoldModule.getBundledScaffoldPath(path.join(ROOT, "config.yaml"));
  } catch {
    absoluteRejected = true;
  }
  assert(absoluteRejected, "scaffold path helper rejects absolute paths");

  const firstAssetList = scaffoldModule.getRequiredBundledScaffoldAssets();
  const secondAssetList = scaffoldModule.getRequiredBundledScaffoldAssets();
  assert(
    JSON.stringify(firstAssetList) === JSON.stringify(secondAssetList),
    "required scaffold asset manifest is deterministic",
  );
  assert(firstAssetList.length === 5, "required scaffold asset manifest includes five assets");
  assert(
    firstAssetList.every((asset) => asset.endsWith(".yaml") || asset.endsWith(".md")),
    "required scaffold asset manifest contains expected file types",
  );

  for (const relativeAssetPath of firstAssetList) {
    const absoluteAssetPath = scaffoldModule.getBundledScaffoldPath(relativeAssetPath);
    const exists = existsSync(absoluteAssetPath);
    assert(exists, `required scaffold asset exists (${relativeAssetPath})`);
    assert(exists ? statSync(absoluteAssetPath).isFile() : false, `required scaffold asset is a file (${relativeAssetPath})`);
    assert(
      absoluteAssetPath.split(path.sep).join("/").includes("/scaffold/"),
      `required scaffold asset lives in scaffold bundle (${relativeAssetPath})`,
      `resolved path: ${absoluteAssetPath}`,
    );
  }

  const missingAssets = scaffoldModule.findMissingRequiredScaffoldAssets();
  assert(missingAssets.length === 0, "required scaffold assets are all present");

  const scaffoldConfig = scaffoldModule.loadBundledScaffoldYaml<Record<string, unknown>>("config.yaml");
  assert(scaffoldConfig.artifact_type === "workflow_config", "scaffold config template is loadable YAML");

  const scaffoldSpecIndex = scaffoldModule.loadBundledScaffoldYaml<Record<string, unknown>>("specs/INDEX.yaml");
  assert(scaffoldSpecIndex.artifact_type === "spec_index", "scaffold specs index template is loadable YAML");

  const scaffoldRoadmapIndex = scaffoldModule.loadBundledScaffoldYaml<Record<string, unknown>>("roadmap/INDEX.yaml");
  assert(scaffoldRoadmapIndex.artifact_type === "roadmap_index", "scaffold roadmap index template is loadable YAML");

  const scaffoldChangeState = scaffoldModule.loadBundledScaffoldYaml<Record<string, unknown>>("changes/STATE.yaml");
  assert(scaffoldChangeState.artifact_type === "change_state_index", "scaffold changes state template is loadable YAML");

  const scaffoldReadme = scaffoldModule.readBundledScaffoldTemplate("specs/README.md");
  assert(scaffoldReadme.includes("# Strict Specs"), "scaffold README guidance is readable text");

  section("[5] init command");

  const initTempDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-driven-init-"));
  try {
    mkdirSync(path.join(initTempDir, ".spec-driven"), { recursive: true });

    const initFirst = cli(["init"], { cwd: initTempDir });
    assert(initFirst.status === 0, "init exits zero when scaffold assets are available", `got exit code ${initFirst.status}`);
    assert(
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
      assert(
        existsSync(path.join(strictRoot, artifactPath)),
        `init creates scaffold artifact (${artifactPath})`,
      );
    }

    const configPath = path.join(strictRoot, "config.yaml");
    writeFileSync(configPath, "custom: keep-me\n", "utf8");
    unlinkSync(path.join(strictRoot, "specs", "README.md"));

    const initSecond = cli(["init"], { cwd: initTempDir });
    assert(initSecond.status === 0, "init rerun exits zero", `got exit code ${initSecond.status}`);
    assert(
      readFileSync(configPath, "utf8") === "custom: keep-me\n",
      "init rerun preserves existing strict artifacts (non-clobber)",
    );
    assert(
      existsSync(path.join(strictRoot, "specs", "README.md")),
      "init rerun creates missing scaffold artifacts without overwriting existing files",
    );
  } finally {
    rmSync(initTempDir, { recursive: true, force: true });
  }

  section("[6] propose command");

  const proposeTempDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-driven-propose-"));
  try {
    const invalidName = cli(["propose", "Invalid_Name"], { cwd: proposeTempDir });
    assert(invalidName.status !== 0, "propose rejects invalid change names", `got exit code ${invalidName.status}`);
    assert(
      invalidName.stderr.includes("kebab-case"),
      "propose invalid-name failure reports kebab-case requirement",
      `stderr: ${invalidName.stderr.trim()}`,
    );
    assert(
      !existsSync(path.join(proposeTempDir, ".strict-spec-driven", "changes", "Invalid_Name")),
      "propose invalid-name failure does not create change directory",
    );

    const changeName = "add-propose-command";
    const firstPropose = cli(["propose", changeName], { cwd: proposeTempDir });
    assert(firstPropose.status === 0, "propose creates strict change scaffold", `got exit code ${firstPropose.status}`);

    const changeDir = path.join(proposeTempDir, ".strict-spec-driven", "changes", changeName);
    assert(existsSync(changeDir), "propose creates change directory");

    const expectedArtifacts = ["proposal.yaml", "design.yaml", "tasks.yaml", "questions.yaml"];
    for (const artifact of expectedArtifacts) {
      assert(
        existsSync(path.join(changeDir, artifact)),
        `propose creates planning artifact (${artifact})`,
      );
    }
    assert(existsSync(path.join(changeDir, "specs")), "propose creates specs directory");
    assert(
      firstPropose.stdout.includes(`Created strict change scaffold at .strict-spec-driven/changes/${changeName}/`),
      "propose output identifies created change directory",
      `stdout: ${firstPropose.stdout.trim()}`,
    );
    for (const artifact of [...expectedArtifacts, "specs/"]) {
      assert(
        firstPropose.stdout.includes(`- .strict-spec-driven/changes/${changeName}/${artifact}`),
        `propose output lists created path (.strict-spec-driven/changes/${changeName}/${artifact})`,
      );
    }

    const proposalArtifact = readFileSync(path.join(changeDir, "proposal.yaml"), "utf8");
    assert(
      proposalArtifact.includes(`id: ${changeName}`),
      "propose template placeholders are rendered with change name",
    );

    const duplicatePropose = cli(["propose", changeName], { cwd: proposeTempDir });
    assert(duplicatePropose.status !== 0, "propose rejects duplicate changes", `got exit code ${duplicatePropose.status}`);
    assert(
      duplicatePropose.stderr.includes("already exists"),
      "propose duplicate-change failure reports existing change collision",
      `stderr: ${duplicatePropose.stderr.trim()}`,
    );
    assert(
      readFileSync(path.join(changeDir, "proposal.yaml"), "utf8") === proposalArtifact,
      "propose duplicate-change failure preserves existing artifacts",
    );
  } finally {
    rmSync(proposeTempDir, { recursive: true, force: true });
  }

  section("[7] fixture-driven validation matrix");

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
  assert(validFixtureResult.valid, "[M01:yaml-schema-field-contracts] fixture valid schema case passes");

  const missingRequiredFixture = yamlModule.parseYamlFile<Record<string, unknown>>(
    fixturePath("schema-check.invalid.missing-required.yaml"),
  );
  const missingRequiredResult = validationModule.validateWithSchema(
    fixtureSchema,
    missingRequiredFixture,
    "fixture://schema-check.invalid.missing-required.yaml",
  );
  assert(
    !missingRequiredResult.valid,
    "[M01:yaml-schema-field-contracts] fixture missing-required case fails schema validation",
  );
  assert(
    missingRequiredResult.diagnostics.some((diagnostic) => diagnostic.fieldPath === "$.id"),
    "[M01:yaml-schema-field-contracts] fixture missing-required diagnostics include missing field path",
  );

  const invalidEnumFixture = yamlModule.parseYamlFile<Record<string, unknown>>(fixturePath("schema-check.invalid.enum.yaml"));
  const invalidEnumResult = validationModule.validateWithSchema(
    fixtureSchema,
    invalidEnumFixture,
    "fixture://schema-check.invalid.enum.yaml",
  );
  assert(
    !invalidEnumResult.valid,
    "[M01:yaml-main-spec-requirement-model] fixture invalid-enum case fails schema validation",
  );
  assert(
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
  assert(
    !invalidShapeResultA.valid,
    "[M01:deterministic-schema-validation] fixture unsupported-shape case fails schema validation",
  );
  assert(
    JSON.stringify(invalidShapeResultA.diagnostics) === JSON.stringify(invalidShapeResultB.diagnostics),
    "[M01:deterministic-schema-validation] fixture unsupported-shape diagnostics are deterministic",
  );

  let malformedRejected = false;
  try {
    yamlModule.parseYamlFile(fixturePath("schema-check.invalid.malformed.yaml"));
  } catch {
    malformedRejected = true;
  }
  assert(
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
  assert(
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
  assert(
    invalidReferenceDiagnostics.length === 1,
    "[M01:yaml-migration-artifact-role-mapping] fixture invalid-reference case produces one diagnostic",
  );
  assert(
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
  assert(
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
  assert(
    invalidDuplicateDiagnostics.length === 1,
    "[M01:yaml-requirement-and-scenario-identifiers] fixture duplicate-id case produces one diagnostic",
  );
  assert(
    invalidDuplicateDiagnostics[0]?.fieldPath === "$.requirements[1].id",
    "[M01:yaml-requirement-and-scenario-identifiers] fixture duplicate-id diagnostics include duplicate field path",
  );

  section("[8] bundled template assets in dist");

  const distTemplatesRoot = path.join(ROOT, "dist", "templates", "strict-spec-driven");
  const distScaffoldDir = path.join(distTemplatesRoot, "scaffold");
  const distSchemasDir = path.join(distTemplatesRoot, "schemas");

  assert(existsSync(distScaffoldDir), "dist/templates/strict-spec-driven/scaffold exists after build");
  assert(existsSync(distSchemasDir), "dist/templates/strict-spec-driven/schemas exists after build");

  for (const relativeAssetPath of scaffoldModule.getRequiredBundledScaffoldAssets()) {
    const distAssetPath = path.join(distScaffoldDir, relativeAssetPath);
    assert(existsSync(distAssetPath), `dist scaffold asset exists (${relativeAssetPath})`);
    assert(statSync(distAssetPath).isFile(), `dist scaffold asset is a file (${relativeAssetPath})`);
  }

  for (const changeAsset of scaffoldModule.getRequiredBundledChangeTemplateAssets()) {
    const distAssetPath = path.join(distScaffoldDir, changeAsset);
    assert(existsSync(distAssetPath), `dist change template asset exists (${changeAsset})`);
    assert(statSync(distAssetPath).isFile(), `dist change template asset is a file (${changeAsset})`);
  }

  const distSchemaFiles = ["registry.yaml", "main-spec.yaml", "delta-spec.yaml", "task-list.yaml", "question-list.yaml"];
  for (const schemaFile of distSchemaFiles) {
    const distSchemaPath = path.join(distSchemasDir, schemaFile);
    assert(existsSync(distSchemaPath), `dist schema file exists (${schemaFile})`);
    assert(statSync(distSchemaPath).isFile(), `dist schema file is a file (${schemaFile})`);
  }

  section("[9] init from dist-only environment");

  const distOnlyDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-dist-only-init-"));
  try {
    const distOnlyInit = cli(["init"], { cwd: distOnlyDir });
    assert(distOnlyInit.status === 0, "init succeeds from dist-only temp directory", `got exit code ${distOnlyInit.status}`);
    const strictRoot = path.join(distOnlyDir, ".strict-spec-driven");
    assert(existsSync(strictRoot), "init from dist creates .strict-spec-driven directory");
    for (const artifact of ["config.yaml", "specs/INDEX.yaml", "roadmap/INDEX.yaml", "changes/STATE.yaml", "specs/README.md"]) {
      assert(existsSync(path.join(strictRoot, artifact)), `init from dist creates artifact (${artifact})`);
    }
  } finally {
    rmSync(distOnlyDir, { recursive: true, force: true });
  }

  section("[10] propose from dist-only environment");

  const distOnlyProposeDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-dist-only-propose-"));
  try {
    const distOnlyPropose = cli(["propose", "test-change"], { cwd: distOnlyProposeDir });
    assert(distOnlyPropose.status === 0, "propose succeeds from dist-only temp directory", `got exit code ${distOnlyPropose.status}`);
    const changeDir = path.join(distOnlyProposeDir, ".strict-spec-driven", "changes", "test-change");
    assert(existsSync(changeDir), "propose from dist creates change directory");
    for (const artifact of ["proposal.yaml", "design.yaml", "tasks.yaml", "questions.yaml"]) {
      assert(existsSync(path.join(changeDir, artifact)), `propose from dist creates artifact (${artifact})`);
    }
    assert(existsSync(path.join(changeDir, "specs")), "propose from dist creates specs directory");
  } finally {
    rmSync(distOnlyProposeDir, { recursive: true, force: true });
  }

  section("[11] apply command");

  const applyHappyDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-apply-happy-"));
  try {
    mkdirSync(path.join(applyHappyDir, ".strict-spec-driven", "changes", "my-change"), { recursive: true });
    writeFileSync(
      path.join(applyHappyDir, ".strict-spec-driven", "changes", "my-change", "tasks.yaml"),
      [
        "schema: strict-spec-driven/task-list/v1",
        "sections:",
        "  - name: Implementation",
        "    tasks:",
        "      - id: task-a",
        "        text: First task",
        "        status: pending",
        "      - id: task-b",
        "        text: Second task",
        "        status: pending",
        "  - name: Testing",
        "    tasks:",
        "      - id: test-a",
        "        text: Run tests",
        "        status: pending",
        "        command: bun test/run.ts",
      ].join("\n") + "\n",
      "utf8",
    );

    const applyFirst = cli(["apply", "my-change"], { cwd: applyHappyDir });
    assert(applyFirst.status === 0, "apply exits zero when pending tasks exist", `got exit code ${applyFirst.status}`);
    const firstJson = JSON.parse(applyFirst.stdout.trim());
    assert(firstJson.sectionName === "Implementation", "apply json includes completed section name");
    assert(firstJson.taskId === "task-a", "apply json includes completed task id");
    assert(firstJson.taskText === "First task", "apply json includes completed task text");
    assert(firstJson.totalTasks === 3, "apply json includes total task count");
    assert(firstJson.remainingPending === 2, "apply json includes remaining pending count");

    const updatedContent = readFileSync(
      path.join(applyHappyDir, ".strict-spec-driven", "changes", "my-change", "tasks.yaml"),
      "utf8",
    );
    const updatedParsed = yamlModule.parseYamlDocument<{ sections: Array<{ name: string; tasks: Array<{ id: string; status: string }> }> }>(updatedContent);
    assert(
      updatedParsed.sections[0].tasks[0].status === "complete" &&
        updatedParsed.sections[0].tasks[1].status === "pending" &&
        updatedParsed.sections[1].tasks[0].status === "pending",
      "apply only modifies the first pending task status",
    );

    const applySecond = cli(["apply", "my-change"], { cwd: applyHappyDir });
    assert(applySecond.status === 0, "apply second invocation exits zero");
    const secondJson = JSON.parse(applySecond.stdout.trim());
    assert(secondJson.taskId === "task-b", "apply second invocation completes next pending task");
    assert(secondJson.remainingPending === 1, "apply second invocation reports correct remaining count");

    const applyThird = cli(["apply", "my-change"], { cwd: applyHappyDir });
    assert(applyThird.status === 0, "apply third invocation exits zero");
    const thirdJson = JSON.parse(applyThird.stdout.trim());
    assert(thirdJson.taskId === "test-a", "apply third invocation completes task from second section");
    assert(thirdJson.remainingPending === 0, "apply third invocation reports zero remaining");

    const applyAllDone = cli(["apply", "my-change"], { cwd: applyHappyDir });
    assert(applyAllDone.status !== 0, "apply rejects when all tasks complete", `got exit code ${applyAllDone.status}`);
    assert(
      applyAllDone.stderr.includes("no pending tasks"),
      "apply all-complete failure reports no pending tasks",
      `stderr: ${applyAllDone.stderr.trim()}`,
    );
  } finally {
    rmSync(applyHappyDir, { recursive: true, force: true });
  }

  const applyMissingDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-apply-missing-"));
  try {
    mkdirSync(path.join(applyMissingDir, ".strict-spec-driven", "changes"), { recursive: true });
    const applyMissing = cli(["apply", "no-such-change"], { cwd: applyMissingDir });
    assert(applyMissing.status !== 0, "apply rejects missing change", `got exit code ${applyMissing.status}`);
    assert(
      applyMissing.stderr.includes("not found"),
      "apply missing-change failure reports change not found",
      `stderr: ${applyMissing.stderr.trim()}`,
    );
  } finally {
    rmSync(applyMissingDir, { recursive: true, force: true });
  }

  const applyEmptyDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-apply-empty-"));
  try {
    mkdirSync(path.join(applyEmptyDir, ".strict-spec-driven", "changes", "empty-tasks"), { recursive: true });
    writeFileSync(
      path.join(applyEmptyDir, ".strict-spec-driven", "changes", "empty-tasks", "tasks.yaml"),
      "sections: []\n",
      "utf8",
    );
    const applyEmpty = cli(["apply", "empty-tasks"], { cwd: applyEmptyDir });
    assert(applyEmpty.status !== 0, "apply rejects when tasks.yaml has no sections", `got exit code ${applyEmpty.status}`);
    assert(
      applyEmpty.stderr.includes("no pending tasks"),
      "apply empty-tasks failure reports no pending tasks",
      `stderr: ${applyEmpty.stderr.trim()}`,
    );
  } finally {
    rmSync(applyEmptyDir, { recursive: true, force: true });
  }

  const applyDeterminismDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-apply-det-"));
  try {
    mkdirSync(path.join(applyDeterminismDir, ".strict-spec-driven", "changes", "det-test"), { recursive: true });
    const tasksContent = [
      "sections:",
      "  - name: Build",
      "    tasks:",
      "      - id: build",
      "        text: Build step",
      "        status: pending",
    ].join("\n") + "\n";

    for (let i = 0; i < 2; i++) {
      writeFileSync(
        path.join(applyDeterminismDir, ".strict-spec-driven", "changes", "det-test", "tasks.yaml"),
        tasksContent,
        "utf8",
      );
      const result = cli(["apply", "det-test"], { cwd: applyDeterminismDir });
      assert(result.status === 0, `apply determinism run ${i + 1} exits zero`);
      const parsed = JSON.parse(result.stdout.trim());
      assert(
        parsed.sectionName === "Build" && parsed.taskId === "build" && parsed.taskText === "Build step",
        `apply determinism run ${i + 1} output matches expected fields`,
      );
    }
  } finally {
    rmSync(applyDeterminismDir, { recursive: true, force: true });
  }

  section("[12] verify command");

  const verifyModule = await loadDistModule<{
    verifyChange(rootDir: string, changeName: string): {
      valid: boolean;
      diagnostics: Array<{ source: string; artifactPath: string; fieldPath: string; message: string; expected?: string; actual?: string }>;
      changeName: string;
      totalTasks: number;
      completeTasks: number;
      remainingPending: number;
      openQuestionCount: number;
    };
  }>("verify.js");

  // 12a: valid fully-complete change
  const verifyValidDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-valid-"));
  try {
    const vChangeDir = path.join(verifyValidDir, ".strict-spec-driven", "changes", "valid-change");
    mkdirSync(vChangeDir, { recursive: true });
    mkdirSync(path.join(vChangeDir, "specs"), { recursive: true });

    writeFileSync(path.join(vChangeDir, "proposal.yaml"), [
      "schema: strict-spec-driven/change-proposal/v1",
      "schema_version: 1",
      "artifact_type: change_proposal",
      "schema_file: test",
      "change:",
      "  id: valid-change",
      "  status: proposed",
      "summary:",
      "  what:",
      "    - Test change",
      "  why:",
      "    - Testing",
      "scope:",
      "  in: []",
      "  out: []",
      "unchanged_behavior: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "design.yaml"), [
      "schema: strict-spec-driven/change-design/v1",
      "schema_version: 1",
      "artifact_type: change_design",
      "schema_file: test",
      "change: valid-change",
      "approach:",
      "  - Test approach",
      "decisions: []",
      "alternatives: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "tasks.yaml"), [
      "schema: strict-spec-driven/task-list/v1",
      "schema_version: 1",
      "artifact_type: task_list",
      "schema_file: test",
      "change: valid-change",
      "sections:",
      "  - name: Implementation",
      "    tasks:",
      "      - id: impl-1",
      "        text: Do the work",
      "        status: complete",
      "  - name: Testing",
      "    tasks:",
      "      - id: test-build",
      "        text: Build",
      "        status: complete",
      "        command: bun run build",
      "      - id: test-unit",
      "        text: Unit tests",
      "        status: complete",
      "        command: bun test/run.ts",
      "  - name: Verification",
      "    tasks:",
      "      - id: verify-1",
      "        text: Verify scope",
      "        status: complete",
      "testing_gates:",
      "  validation_task: test-build",
      "  unit_test_task: test-unit",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "questions.yaml"), [
      "schema: strict-spec-driven/question-list/v1",
      "schema_version: 1",
      "artifact_type: question_list",
      "schema_file: test",
      "change: valid-change",
      "open: []",
      "resolved: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "specs", "cli.yaml"), [
      "schema: strict-spec-driven/delta-spec/v1",
      "schema_version: 1",
      "artifact_type: delta_spec",
      "schema_file: test",
      "target_spec: cli-foundation",
      "mapping:",
      "  implementation: []",
      "  tests: []",
      "operations:",
      "  ADDED:",
      "    - requirement:",
      "        id: verify-req",
      "        strength: MUST",
      "        statement: The system MUST verify.",
      "        scenarios: []",
      "  MODIFIED: []",
      "  REMOVED: []",
    ].join("\n") + "\n", "utf8");

    const validResult = verifyModule.verifyChange(verifyValidDir, "valid-change");
    assert(validResult.valid, "valid fully-complete change passes verification", `diagnostics: ${JSON.stringify(validResult.diagnostics)}`);
    assert(validResult.changeName === "valid-change", "verify result includes changeName");
    assert(validResult.totalTasks === 4, "verify result includes totalTasks", `got ${validResult.totalTasks}`);
    assert(validResult.completeTasks === 4, "verify result includes completeTasks", `got ${validResult.completeTasks}`);
    assert(validResult.remainingPending === 0, "verify result reports zero remainingPending");
    assert(validResult.openQuestionCount === 0, "verify result reports zero openQuestionCount");

    const validCli = cli(["verify", "valid-change"], { cwd: verifyValidDir });
    assert(validCli.status === 0, "verify CLI exits zero for valid change", `got ${validCli.status}`);
    const validCliJson = JSON.parse(validCli.stdout.trim());
    assert(validCliJson.valid === true, "verify CLI JSON output includes valid=true");

    // verify output is deterministic
    const validCli2 = cli(["verify", "valid-change"], { cwd: verifyValidDir });
    assert(validCli.stdout.trim() === validCli2.stdout.trim(), "verify CLI output is deterministic across runs");
  } finally {
    rmSync(verifyValidDir, { recursive: true, force: true });
  }

  // 12b: incomplete tasks
  const verifyIncompleteDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-incomplete-"));
  try {
    const vChangeDir = path.join(verifyIncompleteDir, ".strict-spec-driven", "changes", "incomplete");
    mkdirSync(vChangeDir, { recursive: true });
    mkdirSync(path.join(vChangeDir, "specs"), { recursive: true });

    writeFileSync(path.join(vChangeDir, "proposal.yaml"), [
      "schema: strict-spec-driven/change-proposal/v1",
      "schema_version: 1",
      "artifact_type: change_proposal",
      "schema_file: test",
      "change:",
      "  id: incomplete",
      "  status: proposed",
      "summary:",
      "  what:",
      "    - Test",
      "  why:",
      "    - Test",
      "scope:",
      "  in: []",
      "  out: []",
      "unchanged_behavior: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "design.yaml"), [
      "schema: strict-spec-driven/change-design/v1",
      "schema_version: 1",
      "artifact_type: change_design",
      "schema_file: test",
      "change: incomplete",
      "approach:",
      "  - Test",
      "decisions: []",
      "alternatives: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "tasks.yaml"), [
      "schema: strict-spec-driven/task-list/v1",
      "schema_version: 1",
      "artifact_type: task_list",
      "schema_file: test",
      "change: incomplete",
      "sections:",
      "  - name: Implementation",
      "    tasks:",
      "      - id: impl-1",
      "        text: Do the work",
      "        status: pending",
      "  - name: Testing",
      "    tasks:",
      "      - id: test-build",
      "        text: Build",
      "        status: complete",
      "        command: bun run build",
      "      - id: test-unit",
      "        text: Unit tests",
      "        status: complete",
      "        command: bun test/run.ts",
      "  - name: Verification",
      "    tasks:",
      "      - id: verify-1",
      "        text: Verify",
      "        status: complete",
      "testing_gates:",
      "  validation_task: test-build",
      "  unit_test_task: test-unit",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "questions.yaml"), [
      "schema: strict-spec-driven/question-list/v1",
      "schema_version: 1",
      "artifact_type: question_list",
      "schema_file: test",
      "change: incomplete",
      "open: []",
      "resolved: []",
    ].join("\n") + "\n", "utf8");

    const incompleteResult = verifyModule.verifyChange(verifyIncompleteDir, "incomplete");
    assert(!incompleteResult.valid, "incomplete tasks cause verification failure");
    assert(
      incompleteResult.diagnostics.some((d) => d.source === "task_completion"),
      "incomplete tasks produce task_completion diagnostic",
    );
    assert(incompleteResult.totalTasks === 4, "incomplete change reports totalTasks=4", `got ${incompleteResult.totalTasks}`);
    assert(incompleteResult.completeTasks === 3, "incomplete change reports completeTasks=3", `got ${incompleteResult.completeTasks}`);
    assert(incompleteResult.remainingPending === 1, "incomplete change reports remainingPending=1", `got ${incompleteResult.remainingPending}`);

    const incompleteCli = cli(["verify", "incomplete"], { cwd: verifyIncompleteDir });
    assert(incompleteCli.status !== 0, "verify CLI exits non-zero for incomplete tasks", `got ${incompleteCli.status}`);
  } finally {
    rmSync(verifyIncompleteDir, { recursive: true, force: true });
  }

  // 12c: open questions
  const verifyQuestionsDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-questions-"));
  try {
    const vChangeDir = path.join(verifyQuestionsDir, ".strict-spec-driven", "changes", "open-qs");
    mkdirSync(vChangeDir, { recursive: true });
    mkdirSync(path.join(vChangeDir, "specs"), { recursive: true });

    writeFileSync(path.join(vChangeDir, "proposal.yaml"), [
      "schema: strict-spec-driven/change-proposal/v1",
      "schema_version: 1",
      "artifact_type: change_proposal",
      "schema_file: test",
      "change:",
      "  id: open-qs",
      "  status: proposed",
      "summary:",
      "  what:",
      "    - Test",
      "  why:",
      "    - Test",
      "scope:",
      "  in: []",
      "  out: []",
      "unchanged_behavior: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "design.yaml"), [
      "schema: strict-spec-driven/change-design/v1",
      "schema_version: 1",
      "artifact_type: change_design",
      "schema_file: test",
      "change: open-qs",
      "approach:",
      "  - Test",
      "decisions: []",
      "alternatives: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "tasks.yaml"), [
      "schema: strict-spec-driven/task-list/v1",
      "schema_version: 1",
      "artifact_type: task_list",
      "schema_file: test",
      "change: open-qs",
      "sections:",
      "  - name: Implementation",
      "    tasks:",
      "      - id: impl-1",
      "        text: Do work",
      "        status: complete",
      "  - name: Testing",
      "    tasks:",
      "      - id: test-build",
      "        text: Build",
      "        status: complete",
      "        command: bun run build",
      "      - id: test-unit",
      "        text: Unit tests",
      "        status: complete",
      "        command: bun test/run.ts",
      "  - name: Verification",
      "    tasks:",
      "      - id: verify-1",
      "        text: Verify",
      "        status: complete",
      "testing_gates:",
      "  validation_task: test-build",
      "  unit_test_task: test-unit",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "questions.yaml"), [
      "schema: strict-spec-driven/question-list/v1",
      "schema_version: 1",
      "artifact_type: question_list",
      "schema_file: test",
      "change: open-qs",
      "open:",
      "        - id: q1",
      "          question: What?",
      "          context: testing",
      "          status: open",
      "resolved: []",
    ].join("\n") + "\n", "utf8");

    const qsResult = verifyModule.verifyChange(verifyQuestionsDir, "open-qs");
    assert(!qsResult.valid, "open questions cause verification failure");
    assert(
      qsResult.diagnostics.some((d) => d.source === "open_questions"),
      "open questions produce open_questions diagnostic",
    );
    assert(qsResult.openQuestionCount === 1, "verify reports openQuestionCount=1", `got ${qsResult.openQuestionCount}`);

    const qsCli = cli(["verify", "open-qs"], { cwd: verifyQuestionsDir });
    assert(qsCli.status !== 0, "verify CLI exits non-zero for open questions", `got ${qsCli.status}`);
  } finally {
    rmSync(verifyQuestionsDir, { recursive: true, force: true });
  }

  // 12d: invalid testing gates
  const verifyGatesDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-gates-"));
  try {
    const vChangeDir = path.join(verifyGatesDir, ".strict-spec-driven", "changes", "bad-gates");
    mkdirSync(vChangeDir, { recursive: true });
    mkdirSync(path.join(vChangeDir, "specs"), { recursive: true });

    writeFileSync(path.join(vChangeDir, "proposal.yaml"), [
      "schema: strict-spec-driven/change-proposal/v1",
      "schema_version: 1",
      "artifact_type: change_proposal",
      "schema_file: test",
      "change:",
      "  id: bad-gates",
      "  status: proposed",
      "summary:",
      "  what:",
      "    - Test",
      "  why:",
      "    - Test",
      "scope:",
      "  in: []",
      "  out: []",
      "unchanged_behavior: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "design.yaml"), [
      "schema: strict-spec-driven/change-design/v1",
      "schema_version: 1",
      "artifact_type: change_design",
      "schema_file: test",
      "change: bad-gates",
      "approach:",
      "  - Test",
      "decisions: []",
      "alternatives: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "tasks.yaml"), [
      "schema: strict-spec-driven/task-list/v1",
      "schema_version: 1",
      "artifact_type: task_list",
      "schema_file: test",
      "change: bad-gates",
      "sections:",
      "  - name: Implementation",
      "    tasks:",
      "      - id: impl-1",
      "        text: Do work",
      "        status: complete",
      "  - name: Testing",
      "    tasks:",
      "      - id: test-build",
      "        text: Build",
      "        status: complete",
      "        command: bun run build",
      "      - id: test-unit",
      "        text: Unit tests",
      "        status: complete",
      "        command: bun test/run.ts",
      "  - name: Verification",
      "    tasks:",
      "      - id: verify-1",
      "        text: Verify",
      "        status: complete",
      "testing_gates:",
      "  validation_task: nonexistent-task",
      "  unit_test_task: test-unit",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "questions.yaml"), [
      "schema: strict-spec-driven/question-list/v1",
      "schema_version: 1",
      "artifact_type: question_list",
      "schema_file: test",
      "change: bad-gates",
      "open: []",
      "resolved: []",
    ].join("\n") + "\n", "utf8");

    const gatesResult = verifyModule.verifyChange(verifyGatesDir, "bad-gates");
    assert(!gatesResult.valid, "invalid testing gates cause verification failure");
    assert(
      gatesResult.diagnostics.some((d) => d.source === "testing_gates"),
      "invalid testing gates produce testing_gates diagnostic",
    );
    assert(
      gatesResult.diagnostics.some((d) => d.message.includes("nonexistent-task")),
      "testing gates diagnostic names the missing task ID",
    );
  } finally {
    rmSync(verifyGatesDir, { recursive: true, force: true });
  }

  // 12e: malformed delta spec
  const verifyDeltaDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-delta-"));
  try {
    const vChangeDir = path.join(verifyDeltaDir, ".strict-spec-driven", "changes", "bad-delta");
    mkdirSync(vChangeDir, { recursive: true });
    mkdirSync(path.join(vChangeDir, "specs"), { recursive: true });

    writeFileSync(path.join(vChangeDir, "proposal.yaml"), [
      "schema: strict-spec-driven/change-proposal/v1",
      "schema_version: 1",
      "artifact_type: change_proposal",
      "schema_file: test",
      "change:",
      "  id: bad-delta",
      "  status: proposed",
      "summary:",
      "  what:",
      "    - Test",
      "  why:",
      "    - Test",
      "scope:",
      "  in: []",
      "  out: []",
      "unchanged_behavior: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "design.yaml"), [
      "schema: strict-spec-driven/change-design/v1",
      "schema_version: 1",
      "artifact_type: change_design",
      "schema_file: test",
      "change: bad-delta",
      "approach:",
      "  - Test",
      "decisions: []",
      "alternatives: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "tasks.yaml"), [
      "schema: strict-spec-driven/task-list/v1",
      "schema_version: 1",
      "artifact_type: task_list",
      "schema_file: test",
      "change: bad-delta",
      "sections:",
      "  - name: Implementation",
      "    tasks:",
      "      - id: impl-1",
      "        text: Do work",
      "        status: complete",
      "  - name: Testing",
      "    tasks:",
      "      - id: test-build",
      "        text: Build",
      "        status: complete",
      "        command: bun run build",
      "      - id: test-unit",
      "        text: Unit tests",
      "        status: complete",
      "        command: bun test/run.ts",
      "  - name: Verification",
      "    tasks:",
      "      - id: verify-1",
      "        text: Verify",
      "        status: complete",
      "testing_gates:",
      "  validation_task: test-build",
      "  unit_test_task: test-unit",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "questions.yaml"), [
      "schema: strict-spec-driven/question-list/v1",
      "schema_version: 1",
      "artifact_type: question_list",
      "schema_file: test",
      "change: bad-delta",
      "open: []",
      "resolved: []",
    ].join("\n") + "\n", "utf8");

    // malformed delta spec with wrong schema id
    writeFileSync(path.join(vChangeDir, "specs", "bad.yaml"), "invalid_field: true\n", "utf8");

    const deltaResult = verifyModule.verifyChange(verifyDeltaDir, "bad-delta");
    assert(!deltaResult.valid, "malformed delta spec causes verification failure");
    assert(
      deltaResult.diagnostics.some((d) => d.artifactPath.includes("specs")),
      "delta spec diagnostic references specs path",
    );
  } finally {
    rmSync(verifyDeltaDir, { recursive: true, force: true });
  }

  // 12f: exclusive target conflicts
  const verifyConflictDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-conflict-"));
  try {
    // change-a: MODIFIED req-1
    const changeADir = path.join(verifyConflictDir, ".strict-spec-driven", "changes", "change-a");
    mkdirSync(changeADir, { recursive: true });
    mkdirSync(path.join(changeADir, "specs"), { recursive: true });

    writeFileSync(path.join(changeADir, "proposal.yaml"), [
      "schema: strict-spec-driven/change-proposal/v1",
      "schema_version: 1",
      "artifact_type: change_proposal",
      "schema_file: test",
      "change:",
      "  id: change-a",
      "  status: proposed",
      "summary:",
      "  what:",
      "    - Test",
      "  why:",
      "    - Test",
      "scope:",
      "  in: []",
      "  out: []",
      "unchanged_behavior: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(changeADir, "design.yaml"), [
      "schema: strict-spec-driven/change-design/v1",
      "schema_version: 1",
      "artifact_type: change_design",
      "schema_file: test",
      "change: change-a",
      "approach:",
      "  - Test",
      "decisions: []",
      "alternatives: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(changeADir, "tasks.yaml"), [
      "schema: strict-spec-driven/task-list/v1",
      "schema_version: 1",
      "artifact_type: task_list",
      "schema_file: test",
      "change: change-a",
      "sections:",
      "  - name: Implementation",
      "    tasks:",
      "      - id: impl-1",
      "        text: Do work",
      "        status: complete",
      "  - name: Testing",
      "    tasks:",
      "      - id: test-build",
      "        text: Build",
      "        status: complete",
      "        command: bun run build",
      "      - id: test-unit",
      "        text: Unit tests",
      "        status: complete",
      "        command: bun test/run.ts",
      "  - name: Verification",
      "    tasks:",
      "      - id: verify-1",
      "        text: Verify",
      "        status: complete",
      "testing_gates:",
      "  validation_task: test-build",
      "  unit_test_task: test-unit",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(changeADir, "questions.yaml"), [
      "schema: strict-spec-driven/question-list/v1",
      "schema_version: 1",
      "artifact_type: question_list",
      "schema_file: test",
      "change: change-a",
      "open: []",
      "resolved: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(changeADir, "specs", "delta.yaml"), [
      "schema: strict-spec-driven/delta-spec/v1",
      "schema_version: 1",
      "artifact_type: delta_spec",
      "schema_file: test",
      "target_spec: some-spec",
      "mapping:",
      "  implementation: []",
      "  tests: []",
      "operations:",
      "  ADDED: []",
      "  MODIFIED:",
      "    - target_requirement: req-1",
      "      replacement:",
      "        id: req-1",
      "        strength: MUST",
      "        statement: Modified version",
      "        scenarios: []",
      "  REMOVED: []",
    ].join("\n") + "\n", "utf8");

    // change-b: also MODIFIED req-1 (conflict)
    const changeBDir = path.join(verifyConflictDir, ".strict-spec-driven", "changes", "change-b");
    mkdirSync(changeBDir, { recursive: true });
    mkdirSync(path.join(changeBDir, "specs"), { recursive: true });

    writeFileSync(path.join(changeBDir, "proposal.yaml"), [
      "schema: strict-spec-driven/change-proposal/v1",
      "schema_version: 1",
      "artifact_type: change_proposal",
      "schema_file: test",
      "change:",
      "  id: change-b",
      "  status: proposed",
      "summary:",
      "  what:",
      "    - Test",
      "  why:",
      "    - Test",
      "scope:",
      "  in: []",
      "  out: []",
      "unchanged_behavior: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(changeBDir, "design.yaml"), [
      "schema: strict-spec-driven/change-design/v1",
      "schema_version: 1",
      "artifact_type: change_design",
      "schema_file: test",
      "change: change-b",
      "approach:",
      "  - Test",
      "decisions: []",
      "alternatives: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(changeBDir, "tasks.yaml"), [
      "schema: strict-spec-driven/task-list/v1",
      "schema_version: 1",
      "artifact_type: task_list",
      "schema_file: test",
      "change: change-b",
      "sections:",
      "  - name: Implementation",
      "    tasks:",
      "      - id: impl-1",
      "        text: Do work",
      "        status: complete",
      "  - name: Testing",
      "    tasks:",
      "      - id: test-build",
      "        text: Build",
      "        status: complete",
      "        command: bun run build",
      "      - id: test-unit",
      "        text: Unit tests",
      "        status: complete",
      "        command: bun test/run.ts",
      "  - name: Verification",
      "    tasks:",
      "      - id: verify-1",
      "        text: Verify",
      "        status: complete",
      "testing_gates:",
      "  validation_task: test-build",
      "  unit_test_task: test-unit",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(changeBDir, "questions.yaml"), [
      "schema: strict-spec-driven/question-list/v1",
      "schema_version: 1",
      "artifact_type: question_list",
      "schema_file: test",
      "change: change-b",
      "open: []",
      "resolved: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(changeBDir, "specs", "delta.yaml"), [
      "schema: strict-spec-driven/delta-spec/v1",
      "schema_version: 1",
      "artifact_type: delta_spec",
      "schema_file: test",
      "target_spec: some-spec",
      "mapping:",
      "  implementation: []",
      "  tests: []",
      "operations:",
      "  ADDED: []",
      "  MODIFIED:",
      "    - target_requirement: req-1",
      "      replacement:",
      "        id: req-1",
      "        strength: MUST",
      "        statement: Other modified version",
      "        scenarios: []",
      "  REMOVED: []",
    ].join("\n") + "\n", "utf8");

    const conflictResultA = verifyModule.verifyChange(verifyConflictDir, "change-a");
    assert(!conflictResultA.valid, "exclusive target conflict causes verification failure");
    assert(
      conflictResultA.diagnostics.some((d) => d.source === "exclusive_active_target"),
      "exclusive target conflict produces exclusive_active_target diagnostic",
    );
    assert(
      conflictResultA.diagnostics.some((d) => d.message.includes("req-1")),
      "exclusive target diagnostic names conflicting requirement ID",
    );
    assert(
      conflictResultA.diagnostics.some((d) => d.message.includes("change-a") && d.message.includes("change-b")),
      "exclusive target diagnostic names both conflicting changes",
    );

    const conflictCliA = cli(["verify", "change-a"], { cwd: verifyConflictDir });
    assert(conflictCliA.status !== 0, "verify CLI exits non-zero for target conflict", `got ${conflictCliA.status}`);
  } finally {
    rmSync(verifyConflictDir, { recursive: true, force: true });
  }

  // 12g: missing change
  const verifyMissingDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-missing-"));
  try {
    mkdirSync(path.join(verifyMissingDir, ".strict-spec-driven", "changes"), { recursive: true });

    const missingModule = verifyModule.verifyChange(verifyMissingDir, "no-such-change");
    assert(false, "verify missing change should throw", `got result: ${JSON.stringify(missingModule)}`);
  } catch (e) {
    assert(
      (e instanceof Error ? e.message : String(e)).includes("not found"),
      "verify missing change throws 'not found' error",
    );
  } finally {
    rmSync(verifyMissingDir, { recursive: true, force: true });
  }

  // 12h: missing change via CLI
  const verifyMissingCliDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-missingcli-"));
  try {
    mkdirSync(path.join(verifyMissingCliDir, ".strict-spec-driven", "changes"), { recursive: true });
    const missingCli = cli(["verify", "no-such-change"], { cwd: verifyMissingCliDir });
    assert(missingCli.status !== 0, "verify CLI exits non-zero for missing change", `got ${missingCli.status}`);
    assert(
      missingCli.stderr.includes("not found"),
      "verify CLI stderr reports 'not found' for missing change",
    );
  } finally {
    rmSync(verifyMissingCliDir, { recursive: true, force: true });
  }

  // 12i: verify CLI argument validation
  const verifyNoArgDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-noarg-"));
  try {
    const noArg = cli(["verify"], { cwd: verifyNoArgDir });
    assert(noArg.status !== 0, "verify without change name exits non-zero");
    assert(noArg.stderr.includes("Usage:"), "verify without change name prints usage");
  } finally {
    rmSync(verifyNoArgDir, { recursive: true, force: true });
  }

  // 12j: verify from dist-only environment
  const distOnlyVerifyDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-dist-only-verify-"));
  try {
    const vChangeDir = path.join(distOnlyVerifyDir, ".strict-spec-driven", "changes", "dist-verify-test");
    mkdirSync(vChangeDir, { recursive: true });
    mkdirSync(path.join(vChangeDir, "specs"), { recursive: true });

    writeFileSync(path.join(vChangeDir, "proposal.yaml"), [
      "schema: strict-spec-driven/change-proposal/v1",
      "schema_version: 1",
      "artifact_type: change_proposal",
      "schema_file: test",
      "change:",
      "  id: dist-verify-test",
      "  status: proposed",
      "summary:",
      "  what:",
      "    - Test",
      "  why:",
      "    - Test",
      "scope:",
      "  in: []",
      "  out: []",
      "unchanged_behavior: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "design.yaml"), [
      "schema: strict-spec-driven/change-design/v1",
      "schema_version: 1",
      "artifact_type: change_design",
      "schema_file: test",
      "change: dist-verify-test",
      "approach:",
      "  - Test",
      "decisions: []",
      "alternatives: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "tasks.yaml"), [
      "schema: strict-spec-driven/task-list/v1",
      "schema_version: 1",
      "artifact_type: task_list",
      "schema_file: test",
      "change: dist-verify-test",
      "sections:",
      "  - name: Implementation",
      "    tasks:",
      "      - id: impl-1",
      "        text: Do work",
      "        status: complete",
      "  - name: Testing",
      "    tasks:",
      "      - id: test-build",
      "        text: Build",
      "        status: complete",
      "        command: bun run build",
      "      - id: test-unit",
      "        text: Unit tests",
      "        status: complete",
      "        command: bun test/run.ts",
      "  - name: Verification",
      "    tasks:",
      "      - id: verify-1",
      "        text: Verify",
      "        status: complete",
      "testing_gates:",
      "  validation_task: test-build",
      "  unit_test_task: test-unit",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "questions.yaml"), [
      "schema: strict-spec-driven/question-list/v1",
      "schema_version: 1",
      "artifact_type: question_list",
      "schema_file: test",
      "change: dist-verify-test",
      "open: []",
      "resolved: []",
    ].join("\n") + "\n", "utf8");

    const distVerifyCli = cli(["verify", "dist-verify-test"], { cwd: distOnlyVerifyDir });
    assert(distVerifyCli.status === 0, "verify succeeds from dist-only temp directory", `got ${distVerifyCli.status}`);
    const distVerifyJson = JSON.parse(distVerifyCli.stdout.trim());
    assert(distVerifyJson.valid === true, "verify from dist reports valid=true");
    assert(distVerifyJson.changeName === "dist-verify-test", "verify from dist reports correct changeName");
  } finally {
    rmSync(distOnlyVerifyDir, { recursive: true, force: true });
  }

  console.log("");
  const total = passed + failed;
  if (failed === 0) {
    console.log(`All ${total} tests passed.`);
    return;
  }
  console.log(`${failed}/${total} tests failed.`);
  process.exit(1);
}

void main();
