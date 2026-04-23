#!/usr/bin/env node
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const CLI = path.join(ROOT, "dist", "index.js");

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
