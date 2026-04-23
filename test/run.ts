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
    const relativeToTemplates = path.relative(
      path.join(ROOT, "templates", "strict-spec-driven"),
      absoluteAssetPath,
    ).split(path.sep).join("/");
    assert(
      relativeToTemplates.startsWith("scaffold/"),
      `required scaffold asset lives in scaffold bundle (${relativeAssetPath})`,
      `resolved path: ${relativeToTemplates}`,
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
