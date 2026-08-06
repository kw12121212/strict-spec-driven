import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, statSync, symlinkSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import {
  ROOT,
  TEST_SHARED_SCHEMA_CACHE_DIR,
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
import { pathToFileURL } from "url";
import { load } from "js-yaml";
import {
  validateYamlMutationInventory,
  type InventoryDiagnostic,
} from "../../scripts/check-yaml-mutation-inventory.js";

const YAML_MUTATION_INVENTORY_PATH = path.join(ROOT, "inventory", "yaml-mutation-surfaces.yaml");

type YamlMutationModule = typeof import("../../src/yaml-mutation.js");
type YamlMutationFileSystem = import("../../src/yaml-mutation.js").YamlMutationFileSystem;

function loadYamlMutationInventory(): Record<string, unknown> {
  return load(readFileSync(YAML_MUTATION_INVENTORY_PATH, "utf8")) as Record<string, unknown>;
}

function cloneYamlMutationInventory(): Record<string, unknown> {
  return structuredClone(loadYamlMutationInventory());
}

function hasInventoryDiagnostic(diagnostics: InventoryDiagnostic[], code: string, pathFragment?: string): boolean {
  return diagnostics.some((diagnostic) => diagnostic.code === code && (!pathFragment || diagnostic.path.includes(pathFragment)));
}

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

type SharedSchemaCacheManifest = {
  export_version: string;
  exported_files: string[];
  last_sync_time: string;
};

type SharedSchemaCacheModule = {
  getSharedSchemaCacheRoot(): string;
  getSharedSchemaManifestPath(rootDir?: string): string;
  getBundledSharedSchemaCacheVersion(): string;
  getBundledSharedSchemaCacheFiles(): string[];
  formatSharedSchemaCacheWarning(error: unknown, rootDir?: string): string;
  synchronizeSharedSchemaCache(): {
    action: "synced" | "skipped";
    rootDir: string;
    manifestPath: string;
    exportVersion: string;
    exportedFiles: string[];
  };
};

type McpServerModule = {
  runMcpServer(argv: string[], connect?: (context: unknown) => Promise<void>): Promise<void>;
};

const CANONICAL_REQUIREMENT_IDS = [
  "requirement-problem",
  "requirement-outcome",
  "requirement-trigger",
  "requirement-non-goals",
  "requirement-interpretation",
] as const;

/**
 * propose seeds the requirement interrogation as open questions, so a change stays blocked until a
 * human answers them. Fixtures that expect a verifiable change must answer them like a requester.
 */
/**
 * Authors the design and proposal artifacts a change needs before it can verify. Nothing is seeded,
 * so these are creations rather than replacements of placeholder content.
 */
function clearScaffoldPlaceholders(changeName: string, cwd: string): void {
  cli([
    "generate", changeName, "design",
    "--approach", "Authored approach recorded for this change.",
  ], { cwd });
  cli([
    "generate", changeName, "proposal",
    "--what", "Authored summary.",
    "--why", "Authored rationale.",
  ], { cwd });
}

function answerSeededRequirementQuestions(changeName: string, cwd: string): void {
  for (const questionId of CANONICAL_REQUIREMENT_IDS) {
    cli([
      "generate",
      changeName,
      "questions",
      "--resolve",
      questionId,
      "--answer",
      `Fixture requester answer for ${questionId}.`,
      "--answered-by",
      "human",
    ], { cwd });
  }
}

export async function runFoundationAndFixtureSuite(context: TestContext): Promise<void> {
context.section("[2] yaml utilities");

const yamlModule = await loadDistModule<YamlModule>("yaml.js");
const parsed = yamlModule.parseYamlDocument<{ service: { name: string } }>("service:\n  name: strict-spec\n");
context.assert(parsed.service.name === "strict-spec", "parseYamlDocument parses YAML mapping");

const yamlString = yamlModule.stringifyYamlDocument({ alpha: "beta" });
context.assert(yamlString.includes("alpha: beta"), "stringifyYamlDocument serializes mappings");

const longScalar = `summary-${"x".repeat(160)}-end`;
const longScalarYaml = yamlModule.stringifyYamlDocument({ summary: longScalar });
const longScalarLines = longScalarYaml.split("\n").filter((line) => line.length > 0);
context.assert(
  longScalarLines.length === 1 && longScalarLines[0].includes(longScalar),
  "stringifyYamlDocument does not fold long scalars across multiple lines",
);

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

context.section("[2b] shared YAML mutation boundary");

const yamlMutationModule = await loadDistModule<YamlMutationModule>("yaml-mutation.js");
const mutationRoot = mkdtempSync(path.join(os.tmpdir(), "strict-yaml-mutation-"));
const ownedMutationRoot = path.join(mutationRoot, "owned");
mkdirSync(ownedMutationRoot);
const updatePath = path.join(ownedMutationRoot, "update.yaml");
const deletePath = path.join(ownedMutationRoot, "delete.yaml");
const createPath = path.join(ownedMutationRoot, "create.yaml");
writeFileSync(updatePath, yamlModule.stringifyYamlDocument({ schema: "fixture/v1", value: "before" }), "utf8");
writeFileSync(deletePath, yamlModule.stringifyYamlDocument({ schema: "fixture/v1", value: "remove" }), "utf8");

try {
  let relationshipValidationRuns = 0;
  const committed = yamlMutationModule.commitYamlMutation({
    rootDir: mutationRoot,
    mutations: [
      {
        artifactFamily: "fixture",
        artifactId: "delete",
        schemaId: "fixture/v1",
        familyRoot: ownedMutationRoot,
        absolutePath: deletePath,
        operation: "delete",
        role: "reference",
      },
      {
        artifactFamily: "fixture",
        artifactId: "create",
        schemaId: "fixture/v1",
        familyRoot: ownedMutationRoot,
        absolutePath: createPath,
        operation: "create",
        candidate: { schema: "fixture/v1", value: "created" },
        validateCandidate: () => [],
      },
      {
        artifactFamily: "fixture",
        artifactId: "update",
        schemaId: "fixture/v1",
        familyRoot: ownedMutationRoot,
        absolutePath: updatePath,
        operation: "update",
        candidate: { schema: "fixture/v1", value: "after" },
        validateCandidate: () => [],
      },
    ],
    validateRelationships: (transaction) => {
      relationshipValidationRuns++;
      return transaction.getCandidate("fixture", "create") ? [] : [{
        fieldPath: "$.references",
        message: "created fixture must participate in the transaction",
      }];
    },
  });
  context.assert(
    committed.valid && committed.committed && committed.exitStatus === 0,
    "shared YAML mutation commits a validated multi-file transaction",
    JSON.stringify(committed.diagnostics),
  );
  context.assert(relationshipValidationRuns === 1, "shared YAML mutation validates relationships once before commit");
  context.assert(
    committed.changes.map((change) => change.artifactId).join(",") === "create,delete,update",
    "shared YAML mutation reports a deterministic change-set order",
    JSON.stringify(committed.changes),
  );
  context.assert(
    yamlModule.parseYamlFile<{ value: string }>(createPath).value === "created"
      && yamlModule.parseYamlFile<{ value: string }>(updatePath).value === "after"
      && !existsSync(deletePath),
    "shared YAML mutation applies create, update, and delete effects together",
  );

  const updateBytes = readFileSync(updatePath, "utf8");
  const noOp = yamlMutationModule.commitYamlMutation({
    rootDir: mutationRoot,
    mutations: [{
      artifactFamily: "fixture",
      artifactId: "update",
      schemaId: "fixture/v1",
      familyRoot: ownedMutationRoot,
      absolutePath: updatePath,
      operation: "update",
      candidate: { schema: "fixture/v1", value: "after" },
      validateCandidate: () => [],
    }],
  });
  context.assert(
    noOp.valid && noOp.changes[0]?.changed === false && readFileSync(updatePath, "utf8") === updateBytes,
    "shared YAML mutation reports and preserves byte-identical no-op updates",
  );

  const rejectedBytes = readFileSync(updatePath, "utf8");
  const rejected = yamlMutationModule.commitYamlMutation({
    rootDir: mutationRoot,
    mutations: [{
      artifactFamily: "fixture",
      artifactId: "update",
      schemaId: "fixture/v1",
      familyRoot: ownedMutationRoot,
      absolutePath: updatePath,
      operation: "update",
      candidate: { schema: "fixture/v1", value: "invalid" },
      validateCandidate: () => [{
        code: "schema",
        fieldPath: "$.value",
        message: "fixture value is invalid",
        expected: "valid fixture value",
        actual: "invalid",
      }],
    }],
  });
  context.assert(
    !rejected.valid
      && rejected.diagnostics[0]?.code === "schema"
      && readFileSync(updatePath, "utf8") === rejectedBytes,
    "shared YAML mutation rejects an invalid complete candidate before writing",
    JSON.stringify(rejected.diagnostics),
  );

  const outsidePath = path.join(mutationRoot, "outside.yaml");
  const outside = yamlMutationModule.commitYamlMutation({
    rootDir: mutationRoot,
    mutations: [{
      artifactFamily: "fixture",
      artifactId: "outside",
      schemaId: "fixture/v1",
      familyRoot: ownedMutationRoot,
      absolutePath: outsidePath,
      operation: "create",
      candidate: { schema: "fixture/v1", value: "outside" },
      validateCandidate: () => [],
    }],
  });
  context.assert(
    !outside.valid
      && outside.diagnostics.some((entry) => entry.code === "path-outside-family")
      && !existsSync(outsidePath),
    "shared YAML mutation rejects an arbitrary path outside the declared artifact family",
  );

  const physicalOutsideRoot = path.join(mutationRoot, "physical-outside");
  mkdirSync(physicalOutsideRoot);
  const escapedDirectory = path.join(ownedMutationRoot, "escaped-link");
  symlinkSync(physicalOutsideRoot, escapedDirectory, "dir");
  const escapedPath = path.join(escapedDirectory, "escaped.yaml");
  const symlinkEscape = yamlMutationModule.commitYamlMutation({
    rootDir: mutationRoot,
    mutations: [{
      artifactFamily: "fixture",
      artifactId: "symlink-escape",
      schemaId: "fixture/v1",
      familyRoot: ownedMutationRoot,
      absolutePath: escapedPath,
      operation: "create",
      candidate: { schema: "fixture/v1", value: "outside" },
      validateCandidate: () => [],
    }],
  });
  context.assert(
    !symlinkEscape.valid
      && symlinkEscape.diagnostics.some((entry) => entry.code === "target-symlink-escape")
      && !existsSync(path.join(physicalOutsideRoot, "escaped.yaml")),
    "shared YAML mutation rejects a lexically confined target that resolves through a symlink escape",
  );

  const validatorFailureBytes = readFileSync(updatePath, "utf8");
  const validatorFailure = yamlMutationModule.commitYamlMutation({
    rootDir: mutationRoot,
    mutations: [{
      artifactFamily: "fixture",
      artifactId: "validator-failure",
      schemaId: "fixture/v1",
      familyRoot: ownedMutationRoot,
      absolutePath: updatePath,
      operation: "update",
      candidate: { schema: "fixture/v1", value: "validator-throws" },
      validateCandidate: () => {
        throw Object.assign(new Error("injected validator failure"), { code: "EVALID" });
      },
    }],
  });
  context.assert(
    !validatorFailure.valid
      && validatorFailure.diagnostics.some(
        (entry) => entry.code === "candidate-validation-failed" && entry.actual === "EVALID",
      )
      && readFileSync(updatePath, "utf8") === validatorFailureBytes,
    "candidate validator exceptions become deterministic no-write diagnostics",
  );

  const baseFileSystem: YamlMutationFileSystem = {
    exists: existsSync,
    read: (filePath) => readFileSync(filePath, "utf8"),
    mkdir: (directoryPath) => mkdirSync(directoryPath),
    writeExclusive: (filePath, content) => writeFileSync(filePath, content, { encoding: "utf8", flag: "wx" }),
    rename: renameSync,
    remove: (filePath) => rmSync(filePath, { force: true }),
    removeEmptyDirectory: rmdirSync,
  };
  const failedCreatePath = path.join(ownedMutationRoot, "new-container", "failed.yaml");
  const failedCreate = yamlMutationModule.commitYamlMutation({
    rootDir: mutationRoot,
    mutations: [{
      artifactFamily: "fixture",
      artifactId: "failed-create",
      schemaId: "fixture/v1",
      familyRoot: ownedMutationRoot,
      absolutePath: failedCreatePath,
      operation: "create",
      candidate: { schema: "fixture/v1", value: "never-written" },
      validateCandidate: () => [],
    }],
    fileSystem: {
      ...baseFileSystem,
      writeExclusive: () => {
        throw Object.assign(new Error("injected staging failure"), { code: "EIO" });
      },
    },
  });
  context.assert(
    !failedCreate.valid
      && failedCreate.diagnostics.some((entry) => entry.code === "stage-failed" && entry.actual === "EIO")
      && !existsSync(failedCreatePath)
      && !existsSync(path.dirname(failedCreatePath)),
    "failed first writes leave no artifact or empty container",
    JSON.stringify(failedCreate.diagnostics),
  );

  const rollbackAPath = path.join(ownedMutationRoot, "rollback-a.yaml");
  const rollbackBPath = path.join(ownedMutationRoot, "rollback-b.yaml");
  const rollbackABytes = yamlModule.stringifyYamlDocument({ schema: "fixture/v1", value: "original-a" });
  const rollbackBBytes = yamlModule.stringifyYamlDocument({ schema: "fixture/v1", value: "original-b" });
  writeFileSync(rollbackAPath, rollbackABytes, "utf8");
  writeFileSync(rollbackBPath, rollbackBBytes, "utf8");
  let renameCount = 0;
  const rolledBack = yamlMutationModule.commitYamlMutation({
    rootDir: mutationRoot,
    mutations: [
      {
        artifactFamily: "fixture",
        artifactId: "rollback-a",
        schemaId: "fixture/v1",
        familyRoot: ownedMutationRoot,
        absolutePath: rollbackAPath,
        operation: "update",
        candidate: { schema: "fixture/v1", value: "changed-a" },
        validateCandidate: () => [],
      },
      {
        artifactFamily: "fixture",
        artifactId: "rollback-b",
        schemaId: "fixture/v1",
        familyRoot: ownedMutationRoot,
        absolutePath: rollbackBPath,
        operation: "update",
        candidate: { schema: "fixture/v1", value: "changed-b" },
        validateCandidate: () => [],
      },
    ],
    fileSystem: {
      ...baseFileSystem,
      rename: (sourcePath, destinationPath) => {
        renameCount++;
        if (renameCount === 4) {
          throw Object.assign(new Error("injected commit failure"), { code: "EIO" });
        }
        renameSync(sourcePath, destinationPath);
      },
    },
  });
  context.assert(
    !rolledBack.valid
      && rolledBack.diagnostics.some((entry) => entry.code === "commit-failed" && entry.actual === "EIO")
      && readFileSync(rollbackAPath, "utf8") === rollbackABytes
      && readFileSync(rollbackBPath, "utf8") === rollbackBBytes,
    "a mid-commit failure restores every pre-existing file byte-for-byte",
    JSON.stringify(rolledBack.diagnostics),
  );

  const cleanupAPath = path.join(ownedMutationRoot, "cleanup-a.yaml");
  const cleanupBPath = path.join(ownedMutationRoot, "cleanup-b.yaml");
  const cleanupABytes = yamlModule.stringifyYamlDocument({ schema: "fixture/v1", value: "cleanup-original-a" });
  const cleanupBBytes = yamlModule.stringifyYamlDocument({ schema: "fixture/v1", value: "cleanup-original-b" });
  writeFileSync(cleanupAPath, cleanupABytes, "utf8");
  writeFileSync(cleanupBPath, cleanupBBytes, "utf8");
  let removeCount = 0;
  const cleanupRolledBack = yamlMutationModule.commitYamlMutation({
    rootDir: mutationRoot,
    mutations: [
      {
        artifactFamily: "fixture",
        artifactId: "cleanup-a",
        schemaId: "fixture/v1",
        familyRoot: ownedMutationRoot,
        absolutePath: cleanupAPath,
        operation: "update",
        candidate: { schema: "fixture/v1", value: "cleanup-changed-a" },
        validateCandidate: () => [],
      },
      {
        artifactFamily: "fixture",
        artifactId: "cleanup-b",
        schemaId: "fixture/v1",
        familyRoot: ownedMutationRoot,
        absolutePath: cleanupBPath,
        operation: "update",
        candidate: { schema: "fixture/v1", value: "cleanup-changed-b" },
        validateCandidate: () => [],
      },
    ],
    fileSystem: {
      ...baseFileSystem,
      remove: (filePath) => {
        removeCount++;
        if (removeCount === 2) {
          throw Object.assign(new Error("injected cleanup failure"), { code: "EACCES" });
        }
        rmSync(filePath, { force: true });
      },
    },
  });
  context.assert(
    !cleanupRolledBack.valid
      && cleanupRolledBack.diagnostics.some((entry) => entry.code === "cleanup-failed" && entry.actual === "EACCES")
      && readFileSync(cleanupAPath, "utf8") === cleanupABytes
      && readFileSync(cleanupBPath, "utf8") === cleanupBBytes,
    "a backup cleanup failure reconstructs removed snapshots and restores the transaction",
    JSON.stringify(cleanupRolledBack.diagnostics),
  );
  context.assert(
    readdirSync(ownedMutationRoot).every((entry) => !entry.includes(".strict-spec-")),
    "successful commits and rollbacks remove all staging and backup files",
  );
} finally {
  rmSync(mutationRoot, { recursive: true, force: true });
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
  intake_questions: Array<{ id: string; question: string; context: string; impact: string; recommendation: string }>;
  planned_changes: Record<string, { depends_on: string[] }>;
}>(path.join(ROOT, "examples", "strict-spec-driven", "roadmap-milestone.yaml"));
context.assert(roadmapMilestoneExample.dependencies.length === 0, "primary roadmap milestone example keeps dependencies minimal");
context.assert(roadmapMilestoneExample.risks.length === 0, "primary roadmap milestone example keeps risks minimal");
context.assert(roadmapMilestoneExample.notes.length === 0, "primary roadmap milestone example keeps notes minimal");
context.assert(
  roadmapMilestoneExample.intake_questions.length === 1
    && roadmapMilestoneExample.intake_questions[0]?.id === "objective",
  "primary roadmap milestone example includes a minimal structured intake question",
);
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
  intake_questions: Array<{ id: string }>;
  planned_changes: Record<string, { status: string; depends_on: string[] }>;
}>(path.join(ROOT, "examples", "strict-spec-driven", "roadmap-milestone.planning.yaml"));
context.assert(roadmapMilestonePlanningExample.dependencies.length >= 1, "roadmap milestone coverage example includes milestone dependencies");
context.assert(roadmapMilestonePlanningExample.risks.length >= 1, "roadmap milestone coverage example includes milestone risks");
context.assert(roadmapMilestonePlanningExample.notes.length >= 1, "roadmap milestone coverage example includes milestone notes");
context.assert(
  roadmapMilestonePlanningExample.intake_questions.length >= 3,
  "roadmap milestone coverage example includes multiple intake question categories",
);
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
const sharedSchemaCacheModule = await loadDistModule<SharedSchemaCacheModule>("shared-schema-cache.js");
const mcpServerModule = await loadDistModule<McpServerModule>("mcp/server.js");

context.section("[4] shared schema cache");

const harnessIsolationProbe = cli(["schema-list"], { cwd: ROOT });
context.assert(
  harnessIsolationProbe.status === 0 && existsSync(path.join(TEST_SHARED_SCHEMA_CACHE_DIR, "manifest.yaml")),
  "test harness CLI invocations write the shared schema cache to the per-run isolated directory by default",
);

const cliSharedSchemaTemp = mkdtempSync(path.join(os.tmpdir(), "strict-shared-schema-cli-"));
try {
  const cliSharedSchemaHome = path.join(cliSharedSchemaTemp, "home");
  const cliSharedSchemaCacheDir = path.join(cliSharedSchemaTemp, "cache-root");
  mkdirSync(cliSharedSchemaHome, { recursive: true });
  const schemaListWithCache = cli(["schema-list"], {
    cwd: ROOT,
    env: {
      HOME: cliSharedSchemaHome,
      USERPROFILE: cliSharedSchemaHome,
      STRICT_SPEC_SCHEMA_CACHE_DIR: cliSharedSchemaCacheDir,
    },
  });
  context.assert(schemaListWithCache.status === 0, "cli startup still succeeds while populating shared schema cache");
  const sharedManifestPath = path.join(cliSharedSchemaCacheDir, "manifest.yaml");
  context.assert(
    existsSync(sharedManifestPath),
    "cli startup writes the shared schema cache manifest under the STRICT_SPEC_SCHEMA_CACHE_DIR override",
  );
  context.assert(
    !existsSync(path.join(cliSharedSchemaHome, ".strict-spec-schemas")),
    "the STRICT_SPEC_SCHEMA_CACHE_DIR override keeps the user's home directory untouched",
  );
  const sharedManifest = yamlModule.parseYamlFile<SharedSchemaCacheManifest>(sharedManifestPath);
  context.assert(
    sharedManifest.export_version === sharedSchemaCacheModule.getBundledSharedSchemaCacheVersion(),
    "shared schema cache manifest records the bundled export version",
  );
  context.assert(
    JSON.stringify(sharedManifest.exported_files) === JSON.stringify(sharedSchemaCacheModule.getBundledSharedSchemaCacheFiles()),
    "shared schema cache manifest enumerates the exported schema files",
  );
  const sharedRegistryPath = path.join(cliSharedSchemaCacheDir, "templates", "strict-spec-driven", "schemas", "registry.yaml");
  context.assert(existsSync(sharedRegistryPath), "cli startup exports registry.yaml into the shared schema cache");
  context.assert(
    readFileSync(sharedRegistryPath, "utf8").includes("schema: strict-spec-driven/schema-registry/v1"),
    "shared schema cache preserves bundled schema file contents",
  );
  const sharedSamplePath = path.join(cliSharedSchemaCacheDir, "examples", "strict-spec-driven", "change-proposal.yaml");
  context.assert(existsSync(sharedSamplePath), "cli startup exports sample YAML into the shared schema cache");
  context.assert(
    readFileSync(sharedSamplePath, "utf8").includes("schema: strict-spec-driven/change-proposal/v1"),
    "shared schema cache preserves bundled sample file contents",
  );
} finally {
  rmSync(cliSharedSchemaTemp, { recursive: true, force: true });
}

const cliDefaultRootHome = mkdtempSync(path.join(os.tmpdir(), "strict-shared-schema-default-"));
try {
  const defaultRootSchemaList = cli(["schema-list"], {
    cwd: ROOT,
    env: { HOME: cliDefaultRootHome, USERPROFILE: cliDefaultRootHome, STRICT_SPEC_SCHEMA_CACHE_DIR: "" },
  });
  context.assert(defaultRootSchemaList.status === 0, "cli startup succeeds with the default home-based cache root");
  context.assert(
    existsSync(path.join(cliDefaultRootHome, ".strict-spec-schemas", "manifest.yaml")),
    "an empty STRICT_SPEC_SCHEMA_CACHE_DIR falls back to ~/.strict-spec-schemas/",
  );
} finally {
  rmSync(cliDefaultRootHome, { recursive: true, force: true });
}

const helpSharedSchemaTemp = mkdtempSync(path.join(os.tmpdir(), "strict-shared-schema-help-"));
try {
  const helpCacheDir = path.join(helpSharedSchemaTemp, "cache-root");
  const helpResult = cli(["--help"], {
    cwd: ROOT,
    env: { STRICT_SPEC_SCHEMA_CACHE_DIR: helpCacheDir },
  });
  const shortHelpResult = cli(["-h"], {
    cwd: ROOT,
    env: { STRICT_SPEC_SCHEMA_CACHE_DIR: helpCacheDir },
  });
  context.assert(
    helpResult.status === 0 && shortHelpResult.status === 0,
    "cli help requests succeed without a shared schema cache",
  );
  context.assert(
    !existsSync(helpCacheDir),
    "cli help requests do not create or write the shared schema cache",
  );
} finally {
  rmSync(helpSharedSchemaTemp, { recursive: true, force: true });
}

function withSharedSchemaCacheDir<T>(cacheDir: string, run: () => T): T {
  const savedCacheDirEnv = process.env.STRICT_SPEC_SCHEMA_CACHE_DIR;
  process.env.STRICT_SPEC_SCHEMA_CACHE_DIR = cacheDir;
  try {
    return run();
  } finally {
    process.env.STRICT_SPEC_SCHEMA_CACHE_DIR = savedCacheDirEnv;
  }
}

const skippedSharedSchemaRoot = mkdtempSync(path.join(os.tmpdir(), "strict-shared-schema-skip-"));
try {
  const firstSync = withSharedSchemaCacheDir(skippedSharedSchemaRoot, () => sharedSchemaCacheModule.synchronizeSharedSchemaCache());
  const secondSync = withSharedSchemaCacheDir(skippedSharedSchemaRoot, () => sharedSchemaCacheModule.synchronizeSharedSchemaCache());
  context.assert(firstSync.action === "synced", "shared schema cache first sync writes files");
  context.assert(secondSync.action === "skipped", "shared schema cache skips rewrites when the manifest version matches");
} finally {
  rmSync(skippedSharedSchemaRoot, { recursive: true, force: true });
}

const refreshedCacheRoot = mkdtempSync(path.join(os.tmpdir(), "strict-shared-schema-refresh-"));
try {
  withSharedSchemaCacheDir(refreshedCacheRoot, () => sharedSchemaCacheModule.synchronizeSharedSchemaCache());
  const refreshedManifestPath = path.join(refreshedCacheRoot, "manifest.yaml");
  const staleManifest = yamlModule.parseYamlFile<SharedSchemaCacheManifest>(refreshedManifestPath);
  staleManifest.export_version = "sha256:stale";
  writeFileSync(refreshedManifestPath, yamlModule.stringifyYamlDocument(staleManifest), "utf8");
  const refreshedAfterStaleManifest = withSharedSchemaCacheDir(refreshedCacheRoot, () =>
    sharedSchemaCacheModule.synchronizeSharedSchemaCache());
  context.assert(
    refreshedAfterStaleManifest.action === "synced"
      && yamlModule.parseYamlFile<SharedSchemaCacheManifest>(refreshedManifestPath).export_version
        === sharedSchemaCacheModule.getBundledSharedSchemaCacheVersion(),
    "shared schema cache refreshes when the manifest version is stale",
  );
  const staleExportListManifest = yamlModule.parseYamlFile<SharedSchemaCacheManifest>(refreshedManifestPath);
  staleExportListManifest.exported_files = ["templates/strict-spec-driven/schemas/stale.yaml"];
  writeFileSync(refreshedManifestPath, yamlModule.stringifyYamlDocument(staleExportListManifest), "utf8");
  const refreshedAfterStaleExportList = withSharedSchemaCacheDir(refreshedCacheRoot, () =>
    sharedSchemaCacheModule.synchronizeSharedSchemaCache());
  context.assert(
    refreshedAfterStaleExportList.action === "synced"
      && JSON.stringify(yamlModule.parseYamlFile<SharedSchemaCacheManifest>(refreshedManifestPath).exported_files)
        === JSON.stringify(sharedSchemaCacheModule.getBundledSharedSchemaCacheFiles()),
    "shared schema cache refreshes when the manifest exported file list is stale",
  );
  const exportedSchemaPath = path.join(
    refreshedCacheRoot,
    sharedSchemaCacheModule.getBundledSharedSchemaCacheFiles()[0]!,
  );
  rmSync(exportedSchemaPath, { force: true });
  const refreshedAfterMissingSchema = withSharedSchemaCacheDir(refreshedCacheRoot, () =>
    sharedSchemaCacheModule.synchronizeSharedSchemaCache());
  context.assert(
    refreshedAfterMissingSchema.action === "synced" && existsSync(exportedSchemaPath),
    "shared schema cache refreshes when expected exported schema files are missing",
  );
  const originalSchemaContent = readFileSync(exportedSchemaPath, "utf8");
  writeFileSync(exportedSchemaPath, "corrupted: true\n", "utf8");
  const refreshedAfterCorruptedSchema = withSharedSchemaCacheDir(refreshedCacheRoot, () =>
    sharedSchemaCacheModule.synchronizeSharedSchemaCache());
  context.assert(
    refreshedAfterCorruptedSchema.action === "synced"
      && readFileSync(exportedSchemaPath, "utf8") === originalSchemaContent,
    "shared schema cache self-heals cached schema files whose content was edited or corrupted",
  );
  const refreshedSchemasDir = path.join(refreshedCacheRoot, "templates", "strict-spec-driven", "schemas");
  const straySchemaPath = path.join(refreshedSchemasDir, "stray.yaml");
  writeFileSync(exportedSchemaPath, "corrupted: true\n", "utf8");
  writeFileSync(straySchemaPath, "stray: true\n", "utf8");
  withSharedSchemaCacheDir(refreshedCacheRoot, () => sharedSchemaCacheModule.synchronizeSharedSchemaCache());
  context.assert(
    !existsSync(straySchemaPath),
    "shared schema cache refresh replaces the schemas directory wholesale via the staged swap",
  );
  context.assert(
    readdirSync(path.dirname(refreshedSchemasDir)).every((entry) => entry === "schemas"),
    "shared schema cache refresh leaves no staging or retired directories behind",
  );
} finally {
  rmSync(refreshedCacheRoot, { recursive: true, force: true });
}

const damagedCacheRoot = mkdtempSync(path.join(os.tmpdir(), "strict-shared-schema-damaged-"));
try {
  const damagedCacheEnv = { STRICT_SPEC_SCHEMA_CACHE_DIR: damagedCacheRoot };
  const damagedManifestPath = path.join(damagedCacheRoot, "manifest.yaml");
  const populateDamagedCache = cli(["schema-list"], { cwd: ROOT, env: damagedCacheEnv });
  context.assert(populateDamagedCache.status === 0, "cli startup populates the cache used for damage recovery checks");
  const damagedSchemaPath = path.join(
    damagedCacheRoot,
    sharedSchemaCacheModule.getBundledSharedSchemaCacheFiles()[0]!,
  );
  const expectedSchemaContent = readFileSync(damagedSchemaPath, "utf8");

  writeFileSync(damagedManifestPath, "{ not: [valid yaml\n", "utf8");
  const recoverFromGarbageManifest = cli(["schema-list"], { cwd: ROOT, env: damagedCacheEnv });
  context.assert(
    recoverFromGarbageManifest.status === 0
      && yamlModule.parseYamlFile<SharedSchemaCacheManifest>(damagedManifestPath).export_version
        === sharedSchemaCacheModule.getBundledSharedSchemaCacheVersion(),
    "cli startup rewrites the shared schema cache when the manifest is unparseable",
  );

  writeFileSync(damagedSchemaPath, "corrupted: true\n", "utf8");
  const recoverFromCorruptedSchema = cli(["schema-list"], { cwd: ROOT, env: damagedCacheEnv });
  context.assert(
    recoverFromCorruptedSchema.status === 0 && readFileSync(damagedSchemaPath, "utf8") === expectedSchemaContent,
    "cli startup self-heals a corrupted cached schema file",
  );

  rmSync(damagedSchemaPath, { force: true });
  mkdirSync(damagedSchemaPath);
  const recoverFromDirectoryShadow = cli(["schema-list"], { cwd: ROOT, env: damagedCacheEnv });
  context.assert(
    recoverFromDirectoryShadow.status === 0 && statSync(damagedSchemaPath).isFile(),
    "cli startup refreshes when a cached schema file is shadowed by a directory",
  );

  chmodSync(damagedSchemaPath, 0o000);
  const recoverFromUnreadableSchema = cli(["schema-list"], { cwd: ROOT, env: damagedCacheEnv });
  context.assert(
    recoverFromUnreadableSchema.status === 0 && readFileSync(damagedSchemaPath, "utf8") === expectedSchemaContent,
    "cli startup refreshes when a cached schema file is unreadable",
  );

  const damagedSamplePath = path.join(damagedCacheRoot, "examples", "strict-spec-driven", "change-proposal.yaml");
  const expectedSampleContent = readFileSync(damagedSamplePath, "utf8");
  writeFileSync(damagedSamplePath, "corrupted: true\n", "utf8");
  const recoverFromCorruptedSample = cli(["sample-list"], { cwd: ROOT, env: damagedCacheEnv });
  context.assert(
    recoverFromCorruptedSample.status === 0 && readFileSync(damagedSamplePath, "utf8") === expectedSampleContent,
    "cli startup self-heals a corrupted cached sample file",
  );
} finally {
  rmSync(damagedCacheRoot, { recursive: true, force: true });
}

const explicitWarning = sharedSchemaCacheModule.formatSharedSchemaCacheWarning(new Error("disk full"), "/tmp/example-cache-root");
context.assert(
  explicitWarning.includes("'/tmp/example-cache-root'") && explicitWarning.includes("disk full"),
  "shared schema cache warning names the provided cache root and error message",
);
const defaultRootWarning = sharedSchemaCacheModule.formatSharedSchemaCacheWarning("raw failure");
context.assert(
  defaultRootWarning.includes(`'${TEST_SHARED_SCHEMA_CACHE_DIR}'`) && defaultRootWarning.includes("raw failure"),
  "shared schema cache warning resolves the env-overridden cache root and stringifies non-Error values",
);
context.assert(
  sharedSchemaCacheModule.getSharedSchemaManifestPath() === path.join(TEST_SHARED_SCHEMA_CACHE_DIR, "manifest.yaml"),
  "shared schema manifest path defaults to the resolved cache root",
);
const savedCacheDirEnvForFallback = process.env.STRICT_SPEC_SCHEMA_CACHE_DIR;
try {
  delete process.env.STRICT_SPEC_SCHEMA_CACHE_DIR;
  context.assert(
    sharedSchemaCacheModule.getSharedSchemaCacheRoot() === path.join(os.homedir(), ".strict-spec-schemas"),
    "shared schema cache root falls back to ~/.strict-spec-schemas when no override is set",
  );
} finally {
  process.env.STRICT_SPEC_SCHEMA_CACHE_DIR = savedCacheDirEnvForFallback;
}

const blockedSharedSchemaTemp = mkdtempSync(path.join(os.tmpdir(), "strict-shared-schema-blocked-"));
try {
  const blockedCacheDir = path.join(blockedSharedSchemaTemp, "cache-root");
  writeFileSync(blockedCacheDir, "blocked\n", "utf8");
  const blockedSchemaList = cli(["schema-list"], {
    cwd: ROOT,
    env: { STRICT_SPEC_SCHEMA_CACHE_DIR: blockedCacheDir },
  });
  context.assert(blockedSchemaList.status === 0, "cli startup continues when the shared schema cache cannot be written");
  context.assert(
    blockedSchemaList.stderr.includes(`Warning: shared schema cache at '${blockedCacheDir}' could not be synchronized`),
    "cli startup warning names the resolved cache path when synchronization fails",
    `stderr: ${blockedSchemaList.stderr.trim()}`,
  );
} finally {
  rmSync(blockedSharedSchemaTemp, { recursive: true, force: true });
}

const mcpSharedSchemaTemp = mkdtempSync(path.join(os.tmpdir(), "strict-shared-schema-mcp-"));
const savedSharedSchemaCacheDirEnv = process.env.STRICT_SPEC_SCHEMA_CACHE_DIR;
try {
  const mcpSharedCacheDir = path.join(mcpSharedSchemaTemp, "cache-root");
  process.env.STRICT_SPEC_SCHEMA_CACHE_DIR = mcpSharedCacheDir;
  await mcpServerModule.runMcpServer(["--project", ROOT], async () => {});
  context.assert(
    existsSync(path.join(mcpSharedCacheDir, "templates", "strict-spec-driven", "schemas", "registry.yaml")),
    "mcp startup synchronizes the shared schema cache through the STRICT_SPEC_SCHEMA_CACHE_DIR override before connecting",
  );
  context.assert(
    existsSync(path.join(mcpSharedCacheDir, "examples", "strict-spec-driven", "change-proposal.yaml")),
    "mcp startup synchronizes bundled samples through the STRICT_SPEC_SCHEMA_CACHE_DIR override before connecting",
  );
} finally {
  process.env.STRICT_SPEC_SCHEMA_CACHE_DIR = savedSharedSchemaCacheDirEnv;
  rmSync(mcpSharedSchemaTemp, { recursive: true, force: true });
}

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
const roadmapMilestoneIdPattern = "^(\\d{4}-)?([a-z0-9][a-z0-9-]*[a-z0-9]|[a-z0-9])$";
const roadmapIndexMilestonePatternSchema = (roadmapIndexMilestonesSchema.patternProperties as Record<string, unknown>)[roadmapMilestoneIdPattern] as Record<string, unknown>;
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
context.assert(
  (milestoneSchemaProps.intake_questions as Record<string, unknown>)?.minItems === 1,
  "roadmap milestone schema requires at least one structured intake question",
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

const mainTechSchema = validationModule.loadBundledSchemaByArtifactType("main_tech") as Record<string, unknown>;
context.assert(
  (mainTechSchema.properties as Record<string, unknown>)?.rules !== undefined,
  "main-tech schema resolves by artifact type and exposes rules",
);
const mainTechExample = yamlModule.parseYamlFile<Record<string, unknown>>(
  path.join(ROOT, "examples", "strict-spec-driven", "main-tech.yaml"),
);
const mainTechValidation = validationModule.validateArtifact(
  mainTechSchema,
  mainTechExample,
  "examples/strict-spec-driven/main-tech.yaml",
);
context.assert(mainTechValidation.valid, "main-tech example validates against main-tech schema");

const mainTechCategoryEnum = (((mainTechSchema.properties as Record<string, unknown>)?.standard as Record<string, unknown>)?.properties as Record<string, unknown> | undefined);
const mainTechCategorySchema = (mainTechCategoryEnum?.category as { enum?: string[] } | undefined);
context.assert(
  Array.isArray(mainTechCategorySchema?.enum) && mainTechCategorySchema!.enum!.includes("ui"),
  "main-tech category enum includes ui",
);
const mainTechUiExample = yamlModule.parseYamlFile<Record<string, unknown>>(
  path.join(ROOT, "examples", "strict-spec-driven", "main-tech-ui.yaml"),
);
const mainTechUiValidation = validationModule.validateArtifact(
  mainTechSchema,
  mainTechUiExample,
  "examples/strict-spec-driven/main-tech-ui.yaml",
);
context.assert(mainTechUiValidation.valid, "main-tech ui-category example validates against main-tech schema");

const techIndexSchema = validationModule.loadBundledSchemaBySchemaId("strict-spec-driven/tech-index/v1") as Record<string, unknown>;
const techIndexExample = yamlModule.parseYamlFile<Record<string, unknown>>(
  path.join(ROOT, "examples", "strict-spec-driven", "tech-index.yaml"),
);
const techIndexValidation = validationModule.validateArtifact(
  techIndexSchema,
  techIndexExample,
  "examples/strict-spec-driven/tech-index.yaml",
);
context.assert(techIndexValidation.valid, "tech-index example validates against tech-index schema");

const deltaTechSchema = validationModule.loadBundledSchemaByArtifactType("delta_tech") as Record<string, unknown>;
context.assert(
  (deltaTechSchema.properties as Record<string, unknown>)?.target_standard !== undefined,
  "delta-tech schema resolves by artifact type and exposes target_standard",
);
const deltaTechExample = yamlModule.parseYamlFile<Record<string, unknown>>(
  path.join(ROOT, "examples", "strict-spec-driven", "delta-tech.yaml"),
);
const deltaTechValidation = validationModule.validateArtifact(
  deltaTechSchema,
  deltaTechExample,
  "examples/strict-spec-driven/delta-tech.yaml",
);
context.assert(deltaTechValidation.valid, "delta-tech example validates against delta-tech schema");
const deltaTechOperationsExample = yamlModule.parseYamlFile<Record<string, unknown>>(
  path.join(ROOT, "examples", "strict-spec-driven", "delta-tech.operations.yaml"),
);
const deltaTechOperationsValidation = validationModule.validateArtifact(
  deltaTechSchema,
  deltaTechOperationsExample,
  "examples/strict-spec-driven/delta-tech.operations.yaml",
);
context.assert(deltaTechOperationsValidation.valid, "delta-tech operations example validates against delta-tech schema");

const deltaSpecSchema = validationModule.loadBundledSchemaByArtifactType("delta_spec") as Record<string, unknown>;
const deltaSpecNewSpecExample = yamlModule.parseYamlFile<{ spec?: { title?: unknown; path?: unknown } }>(
  path.join(ROOT, "examples", "strict-spec-driven", "delta-spec.new-spec.yaml"),
);
const deltaSpecNewSpecValidation = validationModule.validateArtifact(
  deltaSpecSchema,
  deltaSpecNewSpecExample,
  "examples/strict-spec-driven/delta-spec.new-spec.yaml",
);
context.assert(deltaSpecNewSpecValidation.valid, "delta-spec new-spec coverage example validates against delta-spec schema");
context.assert(
  typeof deltaSpecNewSpecExample.spec?.title === "string" && typeof deltaSpecNewSpecExample.spec?.path === "string",
  "delta-spec new-spec coverage example carries a spec block with title and path",
);

const harnessSchema = validationModule.loadBundledSchemaByArtifactType("harness") as Record<string, unknown>;
context.assert(
  (harnessSchema.properties as Record<string, unknown>)?.harness !== undefined,
  "harness schema resolves by artifact type",
);
const harnessSessionSchema = validationModule.loadBundledSchemaByArtifactType("harness_session") as Record<string, unknown>;
context.assert(
  (harnessSessionSchema.properties as Record<string, unknown>)?.harness_session !== undefined,
  "harness-session schema resolves by artifact type",
);
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
context.assert(
  bundledRegistry.entries.some(
    (entry) =>
      entry.schema_id === "strict-spec-driven/harness/v1"
      && entry.artifact_type === "harness"
      && entry.schema_file === "harness.yaml"
      && entry.primary_example.endsWith("/harness.yaml"),
  ),
  "schema registry includes harness schema and primary example",
);
context.assert(
  bundledRegistry.entries.some(
    (entry) =>
      entry.schema_id === "strict-spec-driven/harness-session/v1"
      && entry.artifact_type === "harness_session"
      && entry.schema_file === "harness-session.yaml"
      && entry.primary_example.endsWith("/harness-session.yaml"),
  ),
  "schema registry includes harness-session schema and primary example",
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
context.assert(firstAssetList.length === 7, "required scaffold asset manifest includes seven assets");
context.assert(
  firstAssetList.every((asset) => asset.endsWith(".yaml")),
  "required scaffold asset manifest contains only YAML files",
);
context.assert(firstAssetList.includes("harness.yaml"), "required scaffold asset manifest includes harness scaffold");
context.assert(
  firstAssetList.includes("architecture.yaml"),
  "required scaffold asset manifest includes architecture scaffold",
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
context.assert(
  scaffoldConfig.preferred_human_language === "English",
  "scaffold config template defaults preferred_human_language to English",
);
const scaffoldReviewEvidence = scaffoldConfig.review_evidence as
  | { project_regression?: { command?: unknown; meaning?: unknown } }
  | undefined;
context.assert(
  typeof scaffoldReviewEvidence?.project_regression?.command === "string"
    && scaffoldReviewEvidence.project_regression.command.startsWith("REPLACE WITH")
    && !scaffoldReviewEvidence.project_regression.command.includes("bun"),
  "scaffold config template carries a toolchain-neutral regression command placeholder",
);
context.assert(
  typeof scaffoldReviewEvidence?.project_regression?.meaning === "string"
    && scaffoldReviewEvidence.project_regression.meaning.includes("complete project-level regression suite")
    && scaffoldReviewEvidence.project_regression.meaning.includes("coverage"),
  "scaffold config template documents regression evidence meaning including the coverage gate",
);
const scaffoldConfigText = readFileSync(
  path.join(ROOT, "templates", "strict-spec-driven", "scaffold", "config.yaml"),
  "utf8",
);
context.assert(
  scaffoldConfigText.includes("# coverage:") && scaffoldConfigText.includes("#   threshold:"),
  "scaffold config template includes a commented coverage declaration example",
);

const scaffoldSpecIndex = scaffoldModule.loadBundledScaffoldYaml<Record<string, unknown>>("specs/INDEX.yaml");
context.assert(scaffoldSpecIndex.artifact_type === "spec_index", "scaffold specs index template is loadable YAML");

const scaffoldRoadmapIndex = scaffoldModule.loadBundledScaffoldYaml<Record<string, unknown>>("roadmap/INDEX.yaml");
context.assert(scaffoldRoadmapIndex.artifact_type === "roadmap_index", "scaffold roadmap index template is loadable YAML");
context.assert(typeof scaffoldRoadmapIndex.milestones === "object" && scaffoldRoadmapIndex.milestones !== null && !Array.isArray(scaffoldRoadmapIndex.milestones), "scaffold roadmap index template includes milestone sequence field");

const scaffoldTechIndex = scaffoldModule.loadBundledScaffoldYaml<Record<string, unknown>>("tech/INDEX.yaml");
context.assert(scaffoldTechIndex.artifact_type === "tech_index", "scaffold tech index template is loadable YAML");

const scaffoldHarness = scaffoldModule.loadBundledScaffoldYaml<Record<string, unknown>>("harness.yaml");
context.assert(scaffoldHarness.artifact_type === "harness", "scaffold harness template is loadable YAML");
const scaffoldHarnessSession = scaffoldModule.loadBundledScaffoldYaml<Record<string, unknown>>("harness-sessions/session.yaml");
context.assert(scaffoldHarnessSession.artifact_type === "harness_session", "scaffold harness-session template is loadable YAML");

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
    "harness.yaml",
    "specs/INDEX.yaml",
    "tech/INDEX.yaml",
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
      && normalizedInitConfigContent.includes("preferred_human_language: English")
      && normalizedInitConfigContent.includes("command: REPLACE WITH the complete project regression command")
      && normalizedInitConfigContent.includes("complete project-level regression suite"),
    "init scaffolded config includes preferred human language and project regression review evidence with a neutral placeholder",
  );
  context.assert(
    initConfigContent.includes("# coverage:") && initConfigContent.includes("#   threshold:"),
    "init scaffolded config includes the commented coverage declaration example",
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
  context.assert(firstPropose.status === 0, "propose creates the strict change container", `got exit code ${firstPropose.status}`);

  const changeDir = path.join(proposeTempDir, ".strict-spec-driven", "changes", changeName);
  context.assert(existsSync(changeDir), "propose creates change directory");

  const planningArtifacts = ["proposal.yaml", "design.yaml", "tasks.yaml", "questions.yaml"];
  for (const artifact of planningArtifacts) {
    context.assert(
      !existsSync(path.join(changeDir, artifact)),
      `propose writes no placeholder planning artifact (${artifact})`,
    );
  }
  context.assert(existsSync(path.join(changeDir, "specs")), "propose creates specs directory");
  context.assert(
    firstPropose.stdout.includes(`Created strict change at .strict-spec-driven/changes/${changeName}/`),
    "propose output identifies created change directory",
    `stdout: ${firstPropose.stdout.trim()}`,
  );
  context.assert(
    firstPropose.stdout.includes(`- .strict-spec-driven/changes/${changeName}/specs/`),
    "propose output lists the created specs directory",
    `stdout: ${firstPropose.stdout.trim()}`,
  );
  context.assert(
    firstPropose.stdout.includes(`strict-spec-cli generate ${changeName} <proposal|design|tasks|questions>`),
    "propose output names the command that authors each planning artifact",
    `stdout: ${firstPropose.stdout.trim()}`,
  );

  // An unauthored artifact is absent rather than placeholder-filled, so verify must say so by name
  // and point at the command that creates it. This is what replaced placeholder-literal detection.
  const unauthoredVerify = cli(["verify", changeName], { cwd: proposeTempDir });
  context.assert(unauthoredVerify.status !== 0, "verify fails for a change with no authored artifacts");
  const unauthoredVerifyPayload = JSON.parse(unauthoredVerify.stdout) as {
    diagnostics: { source: string; artifactPath: string; message: string }[];
  };
  for (const artifact of planningArtifacts) {
    const diagnostic = unauthoredVerifyPayload.diagnostics.find(
      (entry) => entry.source === "missing_artifact" && entry.artifactPath.endsWith(`/${artifact}`),
    );
    context.assert(
      Boolean(diagnostic),
      `verify reports the unauthored artifact by name (${artifact})`,
      `diagnostics: ${JSON.stringify(unauthoredVerifyPayload.diagnostics.map((entry) => entry.source))}`,
    );
    context.assert(
      Boolean(diagnostic?.message.includes(`strict-spec-cli generate ${changeName} `)),
      `verify names the authoring command for the unauthored artifact (${artifact})`,
      `message: ${diagnostic?.message ?? "<none>"}`,
    );
  }

  const proposeIdempotent = cli(["propose", changeName], { cwd: proposeTempDir });
  context.assert(
    proposeIdempotent.status === 0,
    "propose is idempotent against an artifact-free container so an interrupted first write can be retried",
    `stderr: ${proposeIdempotent.stderr.trim()}`,
  );
  context.assert(
    proposeIdempotent.stdout.includes("Reused existing empty strict change"),
    "propose reports reuse rather than creation for an artifact-free container",
    `stdout: ${proposeIdempotent.stdout.trim()}`,
  );

  const authoredDesign = cli(
    ["generate", changeName, "design", "--approach", "Author the design directly, with no scaffold to overwrite."],
    { cwd: proposeTempDir },
  );
  context.assert(authoredDesign.status === 0, "generate authors an artifact into an existing container", `stderr: ${authoredDesign.stderr.trim()}`);
  const designArtifact = readFileSync(path.join(changeDir, "design.yaml"), "utf8");

  const duplicatePropose = cli(["propose", changeName], { cwd: proposeTempDir });
  context.assert(duplicatePropose.status !== 0, "propose rejects duplicate changes", `got exit code ${duplicatePropose.status}`);
  context.assert(
    duplicatePropose.stderr.includes("already exists"),
    "propose duplicate-change failure reports existing change collision",
    `stderr: ${duplicatePropose.stderr.trim()}`,
  );
  context.assert(
    readFileSync(path.join(changeDir, "design.yaml"), "utf8") === designArtifact,
    "propose duplicate-change failure preserves existing artifacts",
  );

  const cancelProposeChange = cli(["cancel", changeName], { cwd: proposeTempDir });
  context.assert(
    cancelProposeChange.status === 0,
    "cancel clears the active change so the active-change capacity is available for the next propose",
    `stderr: ${cancelProposeChange.stderr.trim()}`,
  );

  mkdirSync(
    path.join(proposeTempDir, ".strict-spec-driven", "changes", "archive", "2026-01-01-archived-change"),
    { recursive: true },
  );

  const emptyDirChangeName = "empty-existing-dir";
  const emptyDirChangePath = path.join(proposeTempDir, ".strict-spec-driven", "changes", emptyDirChangeName);
  mkdirSync(path.join(emptyDirChangePath, "nested", "still-empty"), { recursive: true });
  const emptyDirPropose = cli(["propose", emptyDirChangeName], { cwd: proposeTempDir });
  context.assert(
    emptyDirPropose.status === 0,
    "propose reuses an existing empty change directory tree",
    `stderr: ${emptyDirPropose.stderr.trim()}`,
  );
  context.assert(
    emptyDirPropose.status === 0,
    "propose succeeds while only archived changes exist under changes/archive/",
  );
  for (const artifact of planningArtifacts) {
    context.assert(
      !existsSync(path.join(emptyDirChangePath, artifact)),
      `propose writes no placeholder into a reused empty directory (${artifact})`,
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
  context.assert(generatePropose.status === 0, "generate setup creates the strict change container", `got exit code ${generatePropose.status}`);
  const changeDir = path.join(generateTempDir, ".strict-spec-driven", "changes", changeName);
  const proposalPath = path.join(changeDir, "proposal.yaml");
  const designSetup = cli(
    ["generate", changeName, "design", "--approach", "Set up an unrelated artifact that later writes must leave alone."],
    { cwd: generateTempDir },
  );
  context.assert(designSetup.status === 0, "generate setup authors the design artifact", `stderr: ${designSetup.stderr.trim()}`);
  const originalDesign = readFileSync(path.join(changeDir, "design.yaml"), "utf8");

  // The generated deltas target cli-foundation, so that main spec must exist in
  // the workspace for the changes to resolve at verify time.
  mkdirSync(path.join(generateTempDir, ".strict-spec-driven", "specs", "cli"), { recursive: true });
  writeFileSync(
    path.join(generateTempDir, ".strict-spec-driven", "specs", "cli", "foundation.yaml"),
    [
      "schema: strict-spec-driven/main-spec/v1",
      "schema_version: 1",
      "artifact_type: main_spec",
      "schema_file: test",
      "spec:",
      "  id: cli-foundation",
      "  title: CLI Foundation",
      "mapping:",
      "  implementation: []",
      "  tests: []",
      "requirements: {}",
    ].join("\n") + "\n",
    "utf8",
  );

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
        "    run-lint:",
        "      text: Run lint.",
        "      status: complete",
        "      command: bun run lint",
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

  const nonFlagGenerate = cli(["generate", changeName, "proposal", "proposal.json"], { cwd: generateTempDir });
  context.assert(nonFlagGenerate.status !== 0, "generate rejects positional JSON input");
  context.assert(
    nonFlagGenerate.stderr.includes("Usage:") && !nonFlagGenerate.stderr.includes("<input-json>"),
    "generate positional input failure prints named-argument usage only",
    `stderr: ${nonFlagGenerate.stderr.trim()}`,
  );
  context.assert(!existsSync(proposalPath), "generate positional input creates no artifact");

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
  context.assert(generatedProposalJson.replaced === false, "generate reports creation when the target artifact does not exist yet");

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

  const partialProposalGenerate = cli([
    "generate", changeName, "proposal", "--what", "Partial edits preserve existing summary entries.",
  ], { cwd: generateTempDir });
  context.assert(partialProposalGenerate.status === 0, "generate accepts a partial named proposal edit");
  const partiallyEditedProposal = yamlModule.parseYamlDocument<{
    summary: { what: string[]; why: string[] };
  }>(readFileSync(proposalPath, "utf8"));
  context.assert(
    partiallyEditedProposal.summary.what.includes("Partial edits preserve existing summary entries.")
      && partiallyEditedProposal.summary.why.includes("Scripted generation keeps YAML formatting deterministic."),
    "generate merges partial proposal intent without dropping omitted summary entries",
  );

  const beforeInvalidProposal = readFileSync(proposalPath, "utf8");
  const invalidProposalGenerate = cli([
    "generate", changeName, "proposal", "--remove-why", "Scripted generation",
  ], { cwd: generateTempDir });
  context.assert(invalidProposalGenerate.status !== 0, "generate rejects removal of the last why entry");
  context.assert(
    invalidProposalGenerate.stderr.includes("proposal summary requires at least one --why entry"),
    "generate reports the invalid named removal before write",
    `stderr: ${invalidProposalGenerate.stderr.trim()}`,
  );
  context.assert(readFileSync(proposalPath, "utf8") === beforeInvalidProposal, "invalid proposal removal does not rewrite artifact");

  context.assert(
    cli([
      "generate",
      changeName,
      "design",
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

  // generate tasks builds the task list one task at a time. The first call creates the artifact from
  // typed defaults, so the list starts with exactly the task supplied and no placeholder to remove.
  const firstTask = cli([
    "generate", changeName, "tasks",
    "--section", "Implementation", "--task", "do-the-work", "--text", "Implement the scoped behavior.",
  ], { cwd: generateTempDir });
  context.assert(firstTask.status === 0, "generate tasks writes the first task", `stderr: ${firstTask.stderr.trim()}`);
  const afterFirstTask = yamlModule.parseYamlDocument<{ sections: Record<string, Record<string, unknown>> }>(
    readFileSync(path.join(changeDir, "tasks.yaml"), "utf8"),
  );
  context.assert(
    Object.keys(afterFirstTask.sections.Implementation ?? {}).length === 1
      && "do-the-work" in (afterFirstTask.sections.Implementation ?? {}),
    "generate tasks creates the list holding only the supplied task, with no placeholder alongside it",
  );

  // A second Implementation task appends, and removing it by id leaves its sibling in place.
  cli([
    "generate", changeName, "tasks",
    "--section", "Implementation", "--task", "extra-work", "--text", "An extra task to remove by id.",
  ], { cwd: generateTempDir });
  const removePlaceholder = cli([
    "generate", changeName, "tasks",
    "--remove", "extra-work",
  ], { cwd: generateTempDir });
  const afterRemoval = yamlModule.parseYamlDocument<{ sections: Record<string, Record<string, unknown>> }>(
    readFileSync(path.join(changeDir, "tasks.yaml"), "utf8"),
  );
  context.assert(
    removePlaceholder.status === 0
      && !("extra-work" in (afterRemoval.sections.Implementation ?? {}))
      && "do-the-work" in (afterRemoval.sections.Implementation ?? {}),
    "generate tasks --remove drops the named task and leaves its siblings",
    `stderr: ${removePlaceholder.stderr.trim()}`,
  );
  const removalJson = JSON.parse(removePlaceholder.stdout.trim());
  context.assert(
    removalJson.valid === true && removalJson.ready === false,
    "generate tasks reports a successful write as valid with the incomplete list as ready:false",
  );
  context.assert(
    Array.isArray(removalJson.diagnostics)
      && removalJson.diagnostics.some((diagnostic: { fieldPath: string }) => diagnostic.fieldPath === "$.sections.Testing"),
    "generate tasks reports the missing Testing section as a readiness diagnostic",
  );

  // Appending a Testing task and setting gates still writes while the list is incomplete.
  const testingTask = cli([
    "generate", changeName, "tasks",
    "--section", "Testing", "--task", "run-tests", "--text", "Run the tests.", "--command", "bun test/run.ts",
    "--validation-task", "run-tests", "--unit-test-task", "run-tests",
  ], { cwd: generateTempDir });
  context.assert(testingTask.status === 0, "generate tasks appends a Testing task and sets gates", `stderr: ${testingTask.stderr.trim()}`);
  const testingTaskJson = JSON.parse(testingTask.stdout.trim());
  context.assert(
    testingTaskJson.valid === true
      && testingTaskJson.ready === false
      && testingTaskJson.diagnostics.some((diagnostic: { fieldPath: string }) => diagnostic.fieldPath === "$.sections.Verification"),
    "generate tasks still reports the missing Verification section while writing the append",
  );

  // Completing the task list clears the readiness diagnostics.
  const verificationTask = cli([
    "generate", changeName, "tasks",
    "--section", "Verification", "--task", "verify-scope", "--text", "Verify the change scope.",
  ], { cwd: generateTempDir });
  const verificationTaskJson = JSON.parse(verificationTask.stdout.trim());
  context.assert(
    verificationTask.status === 0 && verificationTaskJson.valid === true && verificationTaskJson.ready === true && verificationTaskJson.diagnostics.length === 0,
    "generate tasks reports a complete task list as valid and ready with no diagnostics",
    `stderr: ${verificationTask.stderr.trim()}`,
  );

  // Re-running an identical task invocation is idempotent.
  const completedTasks = readFileSync(path.join(changeDir, "tasks.yaml"), "utf8");
  const idempotentTask = cli([
    "generate", changeName, "tasks",
    "--section", "Implementation", "--task", "do-the-work", "--text", "Implement the scoped behavior.",
  ], { cwd: generateTempDir });
  context.assert(idempotentTask.status === 0, "generate tasks idempotent re-run succeeds", `stderr: ${idempotentTask.stderr.trim()}`);
  context.assert(
    readFileSync(path.join(changeDir, "tasks.yaml"), "utf8") === completedTasks,
    "generate tasks re-running an identical task changes nothing",
  );

  // Malformed per-task input fails before writing and leaves the artifact unchanged.
  const beforeInvalidTask = readFileSync(path.join(changeDir, "tasks.yaml"), "utf8");
  const invalidTaskCases: Array<[string, string[]]> = [
    ["unknown section", ["--section", "Nope", "--task", "x", "--text", "y"]],
    ["invalid status", ["--section", "Testing", "--task", "x", "--text", "y", "--status", "done"]],
    ["non-kebab task id", ["--section", "Testing", "--task", "Bad_Id", "--text", "y"]],
    ["duplicate task id in one invocation", ["--section", "Testing", "--task", "dup", "--text", "a", "--section", "Implementation", "--task", "dup", "--text", "b"]],
    ["cross-section move", ["--section", "Testing", "--task", "do-the-work", "--text", "moved"]],
    ["missing text", ["--section", "Testing", "--task", "notext"]],
  ];
  for (const [label, argv] of invalidTaskCases) {
    const rejected = cli(["generate", changeName, "tasks", ...argv], { cwd: generateTempDir });
    context.assert(rejected.status !== 0, `generate tasks rejects ${label}`, `stderr: ${rejected.stderr.trim()}`);
    context.assert(
      readFileSync(path.join(changeDir, "tasks.yaml"), "utf8") === beforeInvalidTask,
      `generate tasks rejection for ${label} leaves the artifact unchanged`,
    );
  }

  const readTasks = () => yamlModule.parseYamlDocument<{
    sections: Record<string, Record<string, { text: string; status: string; command?: string }>>;
  }>(readFileSync(path.join(changeDir, "tasks.yaml"), "utf8"));

  // Field-level merge: mark a task complete with a command, then restate only its text and confirm
  // the completion and command survive.
  cli([
    "generate", changeName, "tasks",
    "--section", "Testing", "--task", "run-tests", "--text", "Run the tests.", "--command", "bun test/run.ts", "--status", "complete",
  ], { cwd: generateTempDir });
  const mergeResult = cli([
    "generate", changeName, "tasks",
    "--section", "Testing", "--task", "run-tests", "--text", "Run the entire suite.",
  ], { cwd: generateTempDir });
  context.assert(mergeResult.status === 0, "generate tasks field-level restatement succeeds", `stderr: ${mergeResult.stderr.trim()}`);
  const mergedRunTests = readTasks().sections.Testing["run-tests"];
  context.assert(
    mergedRunTests.text === "Run the entire suite."
      && mergedRunTests.status === "complete"
      && mergedRunTests.command === "bun test/run.ts",
    "generate tasks restatement overwrites only supplied fields and preserves status and command",
  );

  // No flag rebuilds the list, so a completed task survives every edit and can only go away when
  // it is named. This is the guard the old rebuild-with-force flags used to stand in for.
  const completedBefore = readTasks().sections.Testing["run-tests"];
  const addAlongsideCompleted = cli([
    "generate", changeName, "tasks",
    "--section", "Implementation", "--task", "fresh", "--text", "Fresh start.",
  ], { cwd: generateTempDir });
  context.assert(
    addAlongsideCompleted.status === 0
      && JSON.stringify(readTasks().sections.Testing["run-tests"]) === JSON.stringify(completedBefore),
    "generate tasks leaves a completed task untouched while appending new work",
    `stderr: ${addAlongsideCompleted.stderr.trim()}`,
  );
  const deleteOverCompleted = cli(["generate", changeName, "tasks", "--delete"], { cwd: generateTempDir });
  context.assert(
    deleteOverCompleted.status !== 0 && deleteOverCompleted.stderr.includes("run-tests"),
    "generate tasks --delete over completed work is refused and names the completed task",
    `stderr: ${deleteOverCompleted.stderr.trim()}`,
  );
  context.assert(
    readTasks().sections.Testing["run-tests"] !== undefined,
    "a refused generate tasks --delete leaves the task list in place",
  );

  // --remove deletes a task; an unknown id is an idempotent no-op reported in the result.
  cli([
    "generate", changeName, "tasks",
    "--section", "Implementation", "--task", "throwaway", "--text", "Throwaway.",
  ], { cwd: generateTempDir });
  const removeResult = cli([
    "generate", changeName, "tasks", "--remove", "throwaway", "--remove", "ghost",
  ], { cwd: generateTempDir });
  const removeJson = JSON.parse(removeResult.stdout.trim());
  context.assert(
    removeResult.status === 0
      && Array.isArray(removeJson.removedTasks) && removeJson.removedTasks.includes("throwaway")
      && Array.isArray(removeJson.unmatchedRemovals) && removeJson.unmatchedRemovals.includes("ghost")
      && !("throwaway" in readTasks().sections.Implementation),
    "generate tasks --remove deletes a task and reports an unknown id as a no-op",
    `stderr: ${removeResult.stderr.trim()}`,
  );

  // A section move removes the task from its old section and restates it under the new one.
  const moveResult = cli([
    "generate", changeName, "tasks",
    "--remove", "rebuilt", "--section", "Verification", "--task", "rebuilt", "--text", "Rebuilt as verification.",
  ], { cwd: generateTempDir });
  const movedSections = readTasks().sections;
  context.assert(
    moveResult.status === 0
      && !("rebuilt" in (movedSections.Implementation ?? {}))
      && "rebuilt" in (movedSections.Verification ?? {}),
    "generate tasks remove-and-restate moves a task between sections in one call",
    `stderr: ${moveResult.stderr.trim()}`,
  );

  // Values may begin with a dash via the --flag=value form.
  const dashValue = cli([
    "generate", changeName, "tasks",
    "--section", "Implementation", "--task", "dashy", "--text=--delete removes the whole artifact",
  ], { cwd: generateTempDir });
  context.assert(
    dashValue.status === 0 && readTasks().sections.Implementation["dashy"].text === "--delete removes the whole artifact",
    "generate tasks --flag=value stores a value that begins with a dash",
    `stderr: ${dashValue.stderr.trim()}`,
  );

  writeCompleteTasksArtifact(changeDir, changeName);

  context.assert(
    cli([
      "generate", changeName, "questions",
      "--resolved", "technical-detail", "--question", "Which path?", "--context", "Context for the choice.",
      "--answer", "The documented path.",
    ], { cwd: generateTempDir }).status === 0,
    "generate writes questions artifact",
  );
  answerSeededRequirementQuestions(changeName, generateTempDir);

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

  clearScaffoldPlaceholders(changeName, generateTempDir);
  const verifyGenerated = cli(["verify", changeName], { cwd: generateTempDir });
  context.assert(verifyGenerated.status === 0, "generated complete change passes verify", `stderr: ${verifyGenerated.stderr.trim()} stdout: ${verifyGenerated.stdout.trim()}`);

  const directChangeName = "argument-driven-change";
  const directPropose = cli(["propose", directChangeName], { cwd: generateTempDir });
  context.assert(
    directPropose.status === 0,
    "propose allows a second active change",
    `status: ${directPropose.status} stderr: ${directPropose.stderr.trim()}`,
  );
  const capacityBlockedChangeName = "capacity-blocked-change";
  const blockedCapacityPropose = cli(["propose", capacityBlockedChangeName], { cwd: generateTempDir });
  context.assert(
    blockedCapacityPropose.status !== 0
      && blockedCapacityPropose.stderr.includes(`'${changeName}'`)
      && blockedCapacityPropose.stderr.includes(`'${directChangeName}'`)
      && blockedCapacityPropose.stderr.includes("limit of two active changes")
      && blockedCapacityPropose.stderr.includes("archive or cancel one"),
    "propose rejects a third active change and names both blocking changes",
    `status: ${blockedCapacityPropose.status} stderr: ${blockedCapacityPropose.stderr.trim()}`,
  );
  context.assert(
    !existsSync(path.join(generateTempDir, ".strict-spec-driven", "changes", capacityBlockedChangeName)),
    "third-change rejection writes no scaffold state",
  );

  // generate can create a change, so it crosses the same boundary and must enforce the same limit.
  // A separate copy of the check in each command would drift into two answers.
  const capacityBlockedGenerate = cli(
    ["generate", capacityBlockedChangeName, "design", "--approach", "Should never be written."],
    { cwd: generateTempDir },
  );
  context.assert(
    capacityBlockedGenerate.status !== 0
      && capacityBlockedGenerate.stderr.includes("limit of two active changes"),
    "generate rejects a third active change through the same boundary as propose",
    `status: ${capacityBlockedGenerate.status} stderr: ${capacityBlockedGenerate.stderr.trim()}`,
  );
  context.assert(
    !existsSync(path.join(generateTempDir, ".strict-spec-driven", "changes", capacityBlockedChangeName)),
    "a generate call refused by the active-change limit creates no change directory",
  );

  // A rejected write into a change that already exists must leave that change entirely alone: the
  // unwind list holds only paths the call itself created, and here it created none.
  const existingChangeDesignPath = path.join(generateTempDir, ".strict-spec-driven", "changes", changeName, "design.yaml");
  const existingChangeDesignBefore = readFileSync(existingChangeDesignPath, "utf8");
  const rejectedIntoExisting = cli(
    ["generate", changeName, "proposal", "--status", "not-a-valid-status"],
    { cwd: generateTempDir },
  );
  context.assert(
    rejectedIntoExisting.status !== 0
      && existsSync(path.join(generateTempDir, ".strict-spec-driven", "changes", changeName))
      && readFileSync(existingChangeDesignPath, "utf8") === existingChangeDesignBefore,
    "a rejected write into an existing change leaves the container and its other artifacts unchanged",
    `stderr: ${rejectedIntoExisting.stderr.trim()}`,
  );

  const cancelScripted = cli(["cancel", changeName], { cwd: generateTempDir });
  context.assert(cancelScripted.status === 0, "cancel frees one active-change slot", `stderr: ${cancelScripted.stderr.trim()}`);
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

  // A later invocation restating an id is an edit and overwrites just that decision.
  const amendedDesign = cli([
    "generate",
    directChangeName,
    "design",
    "--decision",
    "argument-driven-generation",
    "--decision-text",
    "Amended decision text.",
    "--rationale",
    "Named arguments expose the CLI contract directly.",
  ], { cwd: generateTempDir });
  const amendedDesignArtifact = yamlModule.parseYamlDocument<{
    approach: string[];
    decisions: Record<string, { decision: string }>;
  }>(readFileSync(path.join(generateTempDir, ".strict-spec-driven", "changes", directChangeName, "design.yaml"), "utf8"));
  context.assert(
    amendedDesign.status === 0
      && amendedDesignArtifact.decisions["argument-driven-generation"].decision === "Amended decision text.",
    "generate overwrites a restated decision in a later invocation",
    `stderr: ${amendedDesign.stderr.trim()}`,
  );
  context.assert(
    amendedDesignArtifact.approach.length > 0,
    "amending one decision leaves the recorded approach entries in place",
  );

  // Naming one id twice inside a single invocation is a typo, not an edit, and still fails.
  const conflictingDesign = cli([
    "generate",
    directChangeName,
    "design",
    "--decision",
    "same-invocation-twice",
    "--decision-text",
    "First text.",
    "--rationale",
    "First rationale.",
    "--decision",
    "same-invocation-twice",
    "--decision-text",
    "Second text.",
    "--rationale",
    "Second rationale.",
  ], { cwd: generateTempDir });
  context.assert(conflictingDesign.status !== 0, "generate rejects the same decision id supplied twice in one invocation");
  context.assert(
    conflictingDesign.stderr.includes("duplicate decision 'same-invocation-twice'"),
    "generate duplicate keyed conflict names the conflicting decision",
    `stderr: ${conflictingDesign.stderr.trim()}`,
  );

  writeCompleteTasksArtifact(directChangeDir, directChangeName);

  const directQuestions = cli([
    "generate",
    directChangeName,
    "questions",
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
    "--kind",
    "technical",
    "--answered-by",
    "human",
  ], { cwd: generateTempDir });
  context.assert(directQuestions.status === 0, "generate writes full questions artifact from one named-argument command", `stderr: ${directQuestions.stderr.trim()}`);
  const directQuestionsArtifact = yamlModule.parseYamlDocument<{
    open: Array<{ id: string; kind?: string }>;
    resolved: Array<{ id: string; kind?: string }>;
  }>(readFileSync(path.join(directChangeDir, "questions.yaml"), "utf8"));
  const directOpenTechnical = directQuestionsArtifact.open.filter((entry) => entry.kind !== "requirement");
  const directResolvedTechnical = directQuestionsArtifact.resolved.filter((entry) => entry.kind !== "requirement");
  context.assert(
    directOpenTechnical.length === 1 && directResolvedTechnical.length === 1,
    "generate writes open and resolved questions in one command",
  );

  const reopenQuestion = cli([
    "generate", directChangeName, "questions",
    "--open", "resolved-cli-contract",
    "--question", "Can one command generate the full questions artifact?",
    "--context", "The named-argument parser now supports multiple question groups.",
  ], { cwd: generateTempDir });
  const reopenedQuestions = yamlModule.parseYamlDocument<{
    open: Array<{ id: string; kind?: string; answered_by?: string }>;
    resolved: Array<{ id: string }>;
  }>(readFileSync(path.join(directChangeDir, "questions.yaml"), "utf8"));
  const reopenedQuestion = reopenedQuestions.open.find((entry) => entry.id === "resolved-cli-contract");
  context.assert(
    reopenQuestion.status === 0
      && reopenedQuestion?.kind === "technical"
      && reopenedQuestion.answered_by === "human"
      && !reopenedQuestions.resolved.some((entry) => entry.id === "resolved-cli-contract"),
    "restating a resolved question as open moves one id and preserves its attribution",
    `stderr: ${reopenQuestion.stderr.trim()}`,
  );

  const resolveQuestionByRestatement = cli([
    "generate", directChangeName, "questions",
    "--resolved", "resolved-cli-contract",
    "--question", "Can one command generate the full questions artifact?",
    "--context", "The named-argument parser now supports multiple question groups.",
    "--answer", "Yes. One invocation can populate both open and resolved questions.",
  ], { cwd: generateTempDir });
  const reResolvedQuestions = yamlModule.parseYamlDocument<{
    open: Array<{ id: string }>;
    resolved: Array<{ id: string; kind?: string; answered_by?: string }>;
  }>(readFileSync(path.join(directChangeDir, "questions.yaml"), "utf8"));
  const reResolvedQuestion = reResolvedQuestions.resolved.find((entry) => entry.id === "resolved-cli-contract");
  context.assert(
    resolveQuestionByRestatement.status === 0
      && reResolvedQuestion?.kind === "technical"
      && reResolvedQuestion.answered_by === "human"
      && !reResolvedQuestions.open.some((entry) => entry.id === "resolved-cli-contract"),
    "restating an open question as resolved moves one id and preserves its attribution",
    `stderr: ${resolveQuestionByRestatement.stderr.trim()}`,
  );

  // No flag clears the interrogation gate: removal refuses a requirement id and --delete is refused
  // outright for the questions artifact.
  const removeRequirement = cli([
    "generate", directChangeName, "questions", "--remove-question", CANONICAL_REQUIREMENT_IDS[0] as string,
  ], { cwd: generateTempDir });
  context.assert(
    removeRequirement.status !== 0 && removeRequirement.stderr.includes("interrogation gate"),
    "generate questions --remove-question refuses a requirement-kind entry",
    `stderr: ${removeRequirement.stderr.trim()}`,
  );
  const deleteQuestions = cli(["generate", directChangeName, "questions", "--delete"], { cwd: generateTempDir });
  context.assert(
    deleteQuestions.status !== 0 && deleteQuestions.stderr.includes("not supported for questions"),
    "generate questions rejects --delete",
    `stderr: ${deleteQuestions.stderr.trim()}`,
  );
  const gateIntact = yamlModule.parseYamlDocument<{ open: Array<{ id: string; kind?: string }> }>(
    readFileSync(path.join(directChangeDir, "questions.yaml"), "utf8"),
  );
  context.assert(
    CANONICAL_REQUIREMENT_IDS.every((questionId) => gateIntact.open.some((entry) => entry.id === questionId)),
    "the seeded requirement interrogation survives every removal attempt",
  );
  answerSeededRequirementQuestions(directChangeName, generateTempDir);

  const directDelta = cli([
    "generate",
    directChangeName,
    "delta-spec",
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
  const incrementalScenarioArgs = [
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
    "incremental-scenario-append",
    "--given",
    "the delta requirement already has scenarios",
    "--when",
    "a later generation call supplies a new scenario id",
    "--then",
    "the new scenario is appended without resetting the artifact",
  ];
  const appendedDeltaScenario = cli(incrementalScenarioArgs, { cwd: generateTempDir });
  context.assert(
    appendedDeltaScenario.status === 0,
    "generate appends a compatible scenario to an existing delta requirement",
    `stderr: ${appendedDeltaScenario.stderr.trim()}`,
  );
  const directDeltaPath = path.join(directChangeDir, "specs", "cli", "foundation.yaml");
  const appendedDeltaBytes = readFileSync(directDeltaPath, "utf8");
  const repeatedAppendedDeltaScenario = cli(incrementalScenarioArgs, { cwd: generateTempDir });
  context.assert(
    repeatedAppendedDeltaScenario.status === 0 && readFileSync(directDeltaPath, "utf8") === appendedDeltaBytes,
    "generate keeps a repeated equivalent appended scenario idempotent",
    `stderr: ${repeatedAppendedDeltaScenario.stderr.trim()}`,
  );
  const conflictingDeltaMetadata = cli([
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
    "Conflicting requirement statement.",
  ], { cwd: generateTempDir });
  // A later invocation restating a requirement is an edit: the statement is replaced and the
  // requirement's recorded scenarios survive.
  context.assert(
    conflictingDeltaMetadata.status === 0,
    "generate overwrites a restated delta requirement statement in a later invocation",
    `stderr: ${conflictingDeltaMetadata.stderr.trim()}`,
  );
  const amendedDelta = yamlModule.parseYamlDocument<{
    operations: { ADDED: Record<string, { statement: string; scenarios: Record<string, unknown> }> };
  }>(readFileSync(directDeltaPath, "utf8"));
  context.assert(
    amendedDelta.operations.ADDED["argument-driven-test-requirement"].statement === "Conflicting requirement statement."
      && Object.keys(amendedDelta.operations.ADDED["argument-driven-test-requirement"].scenarios).length > 0,
    "amending a delta requirement statement preserves its recorded scenarios",
  );
  const amendedDeltaBytes = readFileSync(directDeltaPath, "utf8");
  // Naming the same requirement twice inside one invocation with different statements is a typo.
  const sameInvocationRequirementConflict = cli([
    "generate", directChangeName, "delta-spec",
    "--target-spec", "cli-foundation", "--spec-path", "cli/foundation.yaml",
    "--operation", "ADDED", "--requirement", "argument-driven-test-requirement",
    "--strength", "MUST", "--statement", "First statement in one invocation.",
    "--operation", "ADDED", "--requirement", "argument-driven-test-requirement",
    "--strength", "MUST", "--statement", "Second statement in the same invocation.",
  ], { cwd: generateTempDir });
  context.assert(
    sameInvocationRequirementConflict.status !== 0
      && sameInvocationRequirementConflict.stderr.includes("delta requirement 'argument-driven-test-requirement'")
      && sameInvocationRequirementConflict.stderr.includes("statement"),
    "generate rejects one delta requirement id restated twice in a single invocation",
    `stderr: ${sameInvocationRequirementConflict.stderr.trim()}`,
  );
  context.assert(
    readFileSync(directDeltaPath, "utf8") === amendedDeltaBytes,
    "a rejected same-invocation requirement conflict leaves the delta artifact unchanged",
  );
  const conflictingDeltaScenario = cli([
    ...incrementalScenarioArgs.slice(0, -2),
    "--then",
    "conflicting scenario steps replace the artifact",
  ], { cwd: generateTempDir });
  context.assert(
    conflictingDeltaScenario.status === 0,
    "generate overwrites a restated scenario's steps in a later invocation",
    `stderr: ${conflictingDeltaScenario.stderr.trim()}`,
  );
  const scenarioAmended = yamlModule.parseYamlDocument<{
    operations: { ADDED: Record<string, { scenarios: Record<string, Array<Record<string, string>>> }> };
  }>(readFileSync(directDeltaPath, "utf8"));
  context.assert(
    JSON.stringify(scenarioAmended.operations.ADDED["argument-driven-test-requirement"].scenarios["incremental-scenario-append"])
      .includes("conflicting scenario steps replace the artifact"),
    "amending one scenario replaces only that scenario's steps",
  );
  const scenarioAmendedBytes = readFileSync(directDeltaPath, "utf8");
  const sameInvocationScenarioConflict = cli([
    ...incrementalScenarioArgs,
    "--scenario", "incremental-scenario-append",
    "--given", "a different given",
    "--when", "a different when",
    "--then", "a different then",
  ], { cwd: generateTempDir });
  context.assert(
    sameInvocationScenarioConflict.status !== 0
      && sameInvocationScenarioConflict.stderr.includes("incremental-scenario-append"),
    "generate rejects one scenario id restated twice in a single invocation",
    `stderr: ${sameInvocationScenarioConflict.stderr.trim()}`,
  );
  context.assert(
    readFileSync(directDeltaPath, "utf8") === scenarioAmendedBytes,
    "a rejected same-invocation scenario conflict leaves the delta artifact unchanged",
  );
  const parsedDirectDelta = yamlModule.parseYamlDocument<{
    mapping: { implementation: string[] };
    operations: {
      ADDED: Record<string, { scenarios?: Record<string, unknown> }>;
      MODIFIED: Record<string, unknown>;
      REMOVED: Record<string, unknown>;
    };
  }>(readFileSync(directDeltaPath, "utf8"));
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
  context.assert(
    Object.keys(parsedDirectDelta.operations.ADDED["argument-driven-test-requirement"]?.scenarios ?? {}).join(",")
      === "argument-driven-command-populates-artifact,argument-driven-command-populates-questions,incremental-scenario-append",
    "generate preserves existing scenario order and appends compatible scenario ids in call order",
  );

  // Authoring one artifact of a bare change must create exactly that artifact and leave the rest
  // absent, with verify naming each unauthored one instead of grading placeholder content.
  const scaffoldRoundTripChange = "scaffold-round-trip-change";
  cli(["propose", scaffoldRoundTripChange], { cwd: generateTempDir });
  const scaffoldDesignWrite = cli([
    "generate", scaffoldRoundTripChange, "design", "--approach", "Authored into a change that had no artifacts.",
  ], { cwd: generateTempDir });
  context.assert(
    scaffoldDesignWrite.status === 0,
    "generate design authors an artifact into a change that holds none",
    `stderr: ${scaffoldDesignWrite.stderr.trim()}`,
  );
  const scaffoldVerify = JSON.parse(
    cli(["verify", scaffoldRoundTripChange], { cwd: generateTempDir }).stdout.trim(),
  );
  const missingArtifactPaths = scaffoldVerify.diagnostics
    .filter((d: { source: string }) => d.source === "missing_artifact")
    .map((d: { artifactPath: string }) => d.artifactPath.split("/").pop());
  context.assert(
    missingArtifactPaths.sort().join(",") === "proposal.yaml,questions.yaml,tasks.yaml",
    "verify reports every unauthored artifact and not the one that was authored",
    JSON.stringify(missingArtifactPaths),
  );

  const emptyDeltaFromRemoval = cli([
    "generate", scaffoldRoundTripChange, "delta-spec",
    "--target-spec", "cli-foundation",
    "--spec-path", "cli/empty-removal.yaml",
    "--remove-implementation", "src/not-recorded.ts",
  ], { cwd: generateTempDir });
  context.assert(
    emptyDeltaFromRemoval.status !== 0
      && emptyDeltaFromRemoval.stderr.includes("named removals cannot create an empty artifact")
      && !existsSync(path.join(generateTempDir, ".strict-spec-driven", "changes", scaffoldRoundTripChange, "specs", "cli", "empty-removal.yaml")),
    "named removals cannot create an empty delta artifact",
    `stderr: ${emptyDeltaFromRemoval.stderr.trim()}`,
  );

  // Proposal writes merge, so an invocation that restates only one scope entry keeps the others.
  cli([
    "generate", scaffoldRoundTripChange, "proposal",
    "--what", "Merge check.", "--why", "Merge rationale.",
    "--in", "First recorded scope entry.", "--in", "Second recorded scope entry.",
    "--unchanged", "Recorded unchanged behavior.",
  ], { cwd: generateTempDir });
  cli([
    "generate", scaffoldRoundTripChange, "proposal",
    "--what", "Merge check.", "--why", "Merge rationale.",
    "--in", "Third recorded scope entry.",
  ], { cwd: generateTempDir });
  const mergedProposal = yamlModule.parseYamlDocument<{
    scope: { in: string[] };
    unchanged_behavior: string[];
  }>(readFileSync(path.join(generateTempDir, ".strict-spec-driven", "changes", scaffoldRoundTripChange, "proposal.yaml"), "utf8"));
  context.assert(
    ["First recorded scope entry.", "Second recorded scope entry.", "Third recorded scope entry."]
      .every((entry) => mergedProposal.scope.in.includes(entry))
      && mergedProposal.unchanged_behavior.includes("Recorded unchanged behavior."),
    "generate proposal merges a later invocation into the recorded scope instead of replacing it",
    JSON.stringify(mergedProposal.scope.in),
  );

  // Substring removal must resolve to exactly one entry, and refuse rather than guess.
  const ambiguousRemoval = cli([
    "generate", scaffoldRoundTripChange, "proposal",
    "--what", "Merge check.", "--why", "Merge rationale.",
    "--remove-in", "recorded scope entry",
  ], { cwd: generateTempDir });
  context.assert(
    ambiguousRemoval.status !== 0 && ambiguousRemoval.stderr.includes("matched 3 entries"),
    "generate proposal refuses an ambiguous substring removal and names the candidates",
    `stderr: ${ambiguousRemoval.stderr.trim()}`,
  );
  const exactRemoval = cli([
    "generate", scaffoldRoundTripChange, "proposal",
    "--what", "Merge check.", "--why", "Merge rationale.",
    "--remove-in", "Second recorded scope entry.",
  ], { cwd: generateTempDir });
  const afterExactRemoval = yamlModule.parseYamlDocument<{ scope: { in: string[] } }>(
    readFileSync(path.join(generateTempDir, ".strict-spec-driven", "changes", scaffoldRoundTripChange, "proposal.yaml"), "utf8"),
  );
  context.assert(
    exactRemoval.status === 0
      && !afterExactRemoval.scope.in.includes("Second recorded scope entry.")
      && afterExactRemoval.scope.in.includes("First recorded scope entry.")
      && afterExactRemoval.scope.in.includes("Third recorded scope entry."),
    "generate proposal removes exactly the named scope entry and leaves its siblings",
    JSON.stringify(afterExactRemoval.scope.in),
  );

  // --delete removes the whole artifact, but never alongside an editing flag.
  const deleteWithEdit = cli([
    "generate", scaffoldRoundTripChange, "design", "--delete", "--approach", "Should not be written.",
  ], { cwd: generateTempDir });
  const designPath = path.join(generateTempDir, ".strict-spec-driven", "changes", scaffoldRoundTripChange, "design.yaml");
  context.assert(
    deleteWithEdit.status !== 0
      && deleteWithEdit.stderr.includes("cannot be combined with editing argument")
      && existsSync(designPath),
    "generate --delete is rejected alongside an editing flag and leaves the artifact in place",
    `stderr: ${deleteWithEdit.stderr.trim()}`,
  );
  const deleteAlone = cli(["generate", scaffoldRoundTripChange, "design", "--delete"], { cwd: generateTempDir });
  context.assert(
    deleteAlone.status === 0 && !existsSync(designPath),
    "generate --delete removes the target artifact file",
    `stderr: ${deleteAlone.stderr.trim()}`,
  );

  const missingArgument = cli([
    "generate", directChangeName, "proposal", "--remove-what", "Populate artifacts",
  ], { cwd: generateTempDir });
  context.assert(missingArgument.status !== 0, "generate rejects removing the last required proposal summary entry");
  context.assert(
    missingArgument.stderr.includes("at least one --what"),
    "generate required-summary failure names the missing summary field",
    `stderr: ${missingArgument.stderr.trim()}`,
  );

  clearScaffoldPlaceholders(directChangeName, generateTempDir);
  // The technical question recorded above is resolved by removing it: no flag rebuilds the list.
  const removeTechnicalQuestion = cli([
    "generate", directChangeName, "questions", "--remove-question", "open-cli-contract",
  ], { cwd: generateTempDir });
  context.assert(
    removeTechnicalQuestion.status === 0,
    "generate questions --remove-question drops a technical question",
    `stderr: ${removeTechnicalQuestion.stderr.trim()}`,
  );
  const verifyDirectGenerated = cli(["verify", directChangeName], { cwd: generateTempDir });
  context.assert(verifyDirectGenerated.status === 0, "argument-driven generated complete change passes verify", `stderr: ${verifyDirectGenerated.stderr.trim()} stdout: ${verifyDirectGenerated.stdout.trim()}`);

  const newStandardDeltaTech = cli([
    "generate",
    directChangeName,
    "delta-tech",
    "--target-standard",
    "error-handling",
    "--title",
    "Error Handling",
    "--category",
    "coding",
    "--implementation",
    "src/errors.ts",
    "--operation",
    "ADDED",
    "--rule",
    "wrap-errors",
    "--strength",
    "MUST",
    "--statement",
    "Errors MUST be wrapped with context.",
    "--rationale",
    "Context aids debugging.",
    "--method",
    "review",
    "--example-good",
    "throw a wrapped error",
    "--exception",
    "Top-level handlers may rethrow.",
  ], { cwd: generateTempDir });
  context.assert(newStandardDeltaTech.status === 0, "generate writes a new-standard delta tech from one command", `stderr: ${newStandardDeltaTech.stderr.trim()}`);

  const mergeDeltaTech = cli([
    "generate",
    directChangeName,
    "delta-tech",
    "--target-standard",
    "error-handling",
    "--operation",
    "MODIFIED",
    "--rule",
    "wrap-errors",
    "--strength",
    "MUST",
    "--statement",
    "Errors MUST be wrapped with a code.",
    "--rationale",
    "Codes enable handling.",
    "--method",
    "ci",
    "--detail",
    "lint rule err/wrap",
    "--operation",
    "REMOVED",
    "--rule",
    "legacy-rule",
    "--reason",
    "Superseded by wrap-errors.",
  ], { cwd: generateTempDir });
  context.assert(mergeDeltaTech.status === 0, "generate merges additional delta tech operations into the existing file", `stderr: ${mergeDeltaTech.stderr.trim()}`);

  const parsedDeltaTech = yamlModule.parseYamlDocument<{
    target_standard: string;
    standard?: { title: string; category: string };
    mapping: { implementation: string[]; enforcement: string[] };
    operations: {
      ADDED: Record<string, { enforcement: { method: string }; examples?: { good?: string[] }; exceptions?: string[] }>;
      MODIFIED: Record<string, { enforcement: { method: string; detail?: string } }>;
      REMOVED: Record<string, { reason: string }>;
    };
  }>(readFileSync(path.join(directChangeDir, "tech", "error-handling.yaml"), "utf8"));
  context.assert(parsedDeltaTech.standard?.category === "coding", "generate delta-tech writes the new-standard block");
  context.assert(
    parsedDeltaTech.operations.ADDED["wrap-errors"]?.enforcement.method === "review"
      && parsedDeltaTech.operations.ADDED["wrap-errors"]?.examples?.good?.length === 1
      && parsedDeltaTech.operations.ADDED["wrap-errors"]?.exceptions?.length === 1,
    "generate delta-tech writes ADDED rule with enforcement, examples, and exceptions",
  );
  context.assert(
    parsedDeltaTech.operations.MODIFIED["wrap-errors"]?.enforcement.detail === "lint rule err/wrap"
      && parsedDeltaTech.operations.REMOVED["legacy-rule"]?.reason === "Superseded by wrap-errors.",
    "generate delta-tech merges MODIFIED and REMOVED operations across invocations",
  );

  const deltaTechMissingRationale = cli([
    "generate",
    directChangeName,
    "delta-tech",
    "--target-standard",
    "error-handling",
    "--operation",
    "ADDED",
    "--rule",
    "no-rationale",
    "--strength",
    "MUST",
    "--statement",
    "A rule without a rationale.",
    "--method",
    "review",
  ], { cwd: generateTempDir });
  context.assert(deltaTechMissingRationale.status !== 0, "generate delta-tech rejects a rule missing --rationale");
  context.assert(
    deltaTechMissingRationale.stderr.includes("--rationale"),
    "generate delta-tech missing rationale failure names the flag",
    `stderr: ${deltaTechMissingRationale.stderr.trim()}`,
  );

  const deltaTechRemovedExtra = cli([
    "generate",
    directChangeName,
    "delta-tech",
    "--target-standard",
    "error-handling",
    "--operation",
    "REMOVED",
    "--rule",
    "bad-removed",
    "--reason",
    "Some reason.",
    "--strength",
    "MUST",
  ], { cwd: generateTempDir });
  context.assert(deltaTechRemovedExtra.status !== 0, "generate delta-tech rejects a REMOVED rule carrying non-reason fields");

  const verifyWithDeltaTech = cli(["verify", directChangeName], { cwd: generateTempDir });
  context.assert(verifyWithDeltaTech.status === 0, "change with generated delta tech still passes verify", `stderr: ${verifyWithDeltaTech.stderr.trim()} stdout: ${verifyWithDeltaTech.stdout.trim()}`);
} finally {
  rmSync(generateTempDir, { recursive: true, force: true });
}

// verify's task-list completeness gate: unauthored artifacts and empty required sections.
const verifyCompletenessDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-driven-verify-completeness-"));
try {
  const completenessChange = "verify-completeness-change";
  const proposeCompleteness = cli(["propose", completenessChange], { cwd: verifyCompletenessDir });
  context.assert(proposeCompleteness.status === 0, "verify completeness setup creates a change container", `stderr: ${proposeCompleteness.stderr.trim()}`);

  // A change with nothing authored yet reports every required artifact as absent by name.
  const placeholderVerify = cli(["verify", completenessChange], { cwd: verifyCompletenessDir });
  const placeholderVerifyJson = JSON.parse(placeholderVerify.stdout.trim());
  context.assert(
    placeholderVerifyJson.diagnostics.filter(
      (d: { source: string }) => d.source === "missing_artifact",
    ).length === 4,
    "verify reports each unauthored required artifact rather than grading placeholder content",
    placeholderVerify.stdout.trim(),
  );

  // Authoring only an Implementation task leaves Testing and Verification empty.
  const emptyRebuild = cli([
    "generate", completenessChange, "tasks",
    "--section", "Implementation", "--task", "only-impl", "--text", "Only implementation.",
  ], { cwd: verifyCompletenessDir });
  context.assert(emptyRebuild.status === 0, "verify completeness setup authors only an Implementation task", `stderr: ${emptyRebuild.stderr.trim()}`);
  const emptySectionVerify = cli(["verify", completenessChange], { cwd: verifyCompletenessDir });
  const emptySectionJson = JSON.parse(emptySectionVerify.stdout.trim());
  context.assert(
    emptySectionJson.diagnostics.some(
      (d: { source: string; fieldPath: string }) => d.source === "task_completeness" && d.fieldPath === "$.sections.Testing",
    ) && emptySectionJson.diagnostics.some(
      (d: { source: string; fieldPath: string }) => d.source === "task_completeness" && d.fieldPath === "$.sections.Verification",
    ),
    "verify reports empty required sections as completeness diagnostics",
    emptySectionVerify.stdout.trim(),
  );

  // A fully authored task list in all three sections produces no completeness diagnostics.
  cli([
    "generate", completenessChange, "tasks",
    "--section", "Testing", "--task", "run-suite", "--text", "Run the suite.", "--command", "bun test/run.ts",
    "--section", "Verification", "--task", "verify-it", "--text", "Verify the scope.",
    "--validation-task", "run-suite", "--unit-test-task", "run-suite",
  ], { cwd: verifyCompletenessDir });
  const completeVerify = cli(["verify", completenessChange], { cwd: verifyCompletenessDir });
  const completeVerifyJson = JSON.parse(completeVerify.stdout.trim());
  context.assert(
    !completeVerifyJson.diagnostics.some((d: { source: string }) => d.source === "task_completeness"),
    "verify reports no completeness diagnostics for a fully authored task list",
    completeVerify.stdout.trim(),
  );
} finally {
  rmSync(verifyCompletenessDir, { recursive: true, force: true });
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
    existsSync(path.join(firstCopiedWorkspace.workspaceRoot, copiedWorkspaceChangePath, "specs")),
    "copied workspace records the new change container inside the temp copy",
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
    existsSync(path.join(secondCopiedWorkspace.workspaceRoot, copiedWorkspaceChangePath, "specs")),
    "repeat copied workspace run creates the same change container again",
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
      existsSync(path.join(workspaceRoot, copiedWorkspaceCliChangePath, "specs")),
      "copied workspace propose records the change container inside the temp workspace",
    );
    context.assert(
      !existsSync(path.join(workspaceRoot, copiedWorkspaceCliChangePath, "proposal.yaml")),
      "copied workspace propose writes no placeholder planning artifact",
    );

    // The interrogation gate arrives with the questions artifact, which is authored rather than
    // scaffolded, so the change only becomes blocked once that artifact exists.
    const copiedQuestions = projectWorkspaceCli(workspaceRoot, [
      "generate", "copied-workspace-cli-change", "questions",
      "--open", "copied-workspace-question",
      "--question", "Does the copied workspace behave like a real project?",
      "--context", "Recorded so the change has an authored questions artifact.",
    ]);
    context.assert(
      copiedQuestions.status === 0,
      "copied workspace authors the questions artifact through generate",
      `stderr: ${copiedQuestions.stderr.trim()}`,
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
      copiedListStdout.includes("copied-workspace-cli-change    blocked"),
      "copied workspace list reports the freshly proposed change as blocked by its seeded requirement questions",
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

context.section("[8] native CLI executable build planning");

const nativeBuildModule = await import(pathToFileURL(path.join(ROOT, "scripts", "build-native-cli.ts")).href) as {
  resolveNativeTarget(platform: NodeJS.Platform, arch: NodeJS.Architecture): string;
  executableNameForTarget(target: string): string;
  defaultUserBinDir(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string;
  createNativePlan(options: {
    platform?: NodeJS.Platform;
    arch?: NodeJS.Architecture;
    target?: string;
    binDir?: string | null;
    env?: NodeJS.ProcessEnv;
  }): {
    target: string;
    executableName: string;
    outputPath: string;
    installPath: string | null;
    buildArgs: string[];
    binDirOnPath: boolean | null;
  };
};

context.assert(
  nativeBuildModule.resolveNativeTarget("win32", "x64") === "bun-windows-x64"
    && nativeBuildModule.executableNameForTarget("bun-windows-x64") === "strict-spec-cli.exe",
  "native build helper plans a Windows x64 executable target",
);
context.assert(
  nativeBuildModule.resolveNativeTarget("linux", "arm64") === "bun-linux-arm64"
    && nativeBuildModule.executableNameForTarget("bun-linux-arm64") === "strict-spec-cli",
  "native build helper plans a Linux ARM64 executable target",
);
const plannedWindowsInstall = nativeBuildModule.createNativePlan({
  platform: "win32",
  arch: "x64",
  binDir: path.join(os.tmpdir(), "strict-native-bin"),
  env: { PATH: "" },
});
context.assert(
  plannedWindowsInstall.buildArgs.includes("--compile")
    && plannedWindowsInstall.buildArgs.includes("--target=bun-windows-x64")
    && plannedWindowsInstall.installPath?.endsWith("strict-spec-cli.exe") === true
    && plannedWindowsInstall.binDirOnPath === false,
  "native build helper reports Windows compile args, .exe install path, and PATH miss diagnostics",
  JSON.stringify(plannedWindowsInstall),
);
const defaultWindowsBinDir = nativeBuildModule.defaultUserBinDir("win32", {
  LOCALAPPDATA: "C:\\Users\\tester\\AppData\\Local",
});
context.assert(
  defaultWindowsBinDir.endsWith(path.join("strict-spec-driven", "bin")),
  "native build helper defaults Windows installs to a user-level strict-spec-cli bin directory",
  defaultWindowsBinDir,
);
const dryRunNativeBuild = runCommand("bun", [
  "scripts/build-native-cli.ts",
  "--dry-run",
  "--platform",
  "win32",
  "--arch",
  "x64",
  "--bin-dir",
  path.join(os.tmpdir(), "strict-native-dry-run-bin"),
], { cwd: ROOT });
context.assert(dryRunNativeBuild.status === 0, "native build helper dry-run exits zero", dryRunNativeBuild.stderr.trim());
const dryRunNativeBuildJson = JSON.parse(dryRunNativeBuild.stdout) as { target: string; executableName: string; buildArgs: string[] };
context.assert(
  dryRunNativeBuildJson.target === "bun-windows-x64"
    && dryRunNativeBuildJson.executableName === "strict-spec-cli.exe"
    && dryRunNativeBuildJson.buildArgs.includes("--compile"),
  "native build helper dry-run emits parseable Windows compile plan",
  dryRunNativeBuild.stdout,
);
const nativeSmokeRoot = mkdtempSync(path.join(os.tmpdir(), "strict-native-smoke-"));
try {
  const nativeSmokeBuild = runCommand("bun", ["scripts/build-native-cli.ts", "--output-root", nativeSmokeRoot], { cwd: ROOT });
  context.assert(nativeSmokeBuild.status === 0, "native build helper compiles the current-platform executable", nativeSmokeBuild.stderr.trim());
  const nativeSmokePlan = nativeBuildModule.createNativePlan({
    outputRoot: nativeSmokeRoot,
  });
  const nativeSmokeCli = runCommand(nativeSmokePlan.outputPath, ["check-workflow-state"], { cwd: ROOT });
  context.assert(
    nativeSmokeCli.status === 0 && nativeSmokeCli.stdout.includes("strict workflow state exists"),
    "current-platform native executable runs the strict CLI entrypoint",
    `stdout: ${nativeSmokeCli.stdout.trim()} stderr: ${nativeSmokeCli.stderr.trim()}`,
  );
} finally {
  rmSync(nativeSmokeRoot, { recursive: true, force: true });
}
const installShContent = readFileSync(path.join(ROOT, "install.sh"), "utf8");
const installPsContent = readFileSync(path.join(ROOT, "install.ps1"), "utf8");
context.assert(
  installShContent.includes("bun scripts/build-native-cli.ts --install --bin-dir")
    && installShContent.includes("bun run build"),
  "Unix installer builds and installs the native CLI executable when npm is unavailable or the npm-global install fails on permissions",
);
context.assert(
  installPsContent.includes("bun scripts/build-native-cli.ts --install --bin-dir")
    && installPsContent.includes("bun run build"),
  "Windows installer builds and installs the native CLI executable when npm is unavailable",
);
context.assert(
  installPsContent.includes("npm install -g .")
    && installPsContent.includes("npm uninstall -g strict-spec-driven")
    && installPsContent.includes("Test-NpmAvailable"),
  "Windows installer installs/uninstalls the CLI via npm global when npm is available",
);
context.assert(
  installShContent.includes("npm install -g .")
    && installShContent.includes("npm uninstall -g strict-spec-driven")
    && installShContent.includes("command -v npm"),
  "Unix installer installs/uninstalls the CLI via npm global when npm is available",
);
context.assert(
  installShContent.includes("supersedes any native executable"),
  "Unix installer removes a stale native executable when npm-global install succeeds",
);
context.assert(
  installPsContent.includes("supersedes any native executable"),
  "Windows installer removes a stale native executable when npm-global install succeeds",
);
context.assert(
  installPsContent.includes("[System.Environment]::SetEnvironmentVariable('Path', $newPath, 'User')")
    && installPsContent.includes("Add-UserPathEntry $ResolvedBinDir")
    && installPsContent.includes("[switch]$NoPathUpdate"),
  "Windows installer adds the native CLI bin directory to the user PATH by default with an opt-out switch",
);
context.assert(
  installPsContent.includes("Remove-UserPathEntry $ResolvedBinDir")
    && installPsContent.includes("[switch]$KeepPathOnUninstall")
    && installPsContent.includes("Leaving user PATH unchanged because -KeepPathOnUninstall was provided"),
  "Windows installer removes the native CLI bin directory from user PATH on uninstall unless kept",
);
context.assert(
  installPsContent.includes("Open a new terminal before invoking strict-spec-cli by name outside this session."),
  "Windows installer reports that a new terminal may be needed after PATH updates",
);
const rootPackageJson = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as { bin?: Record<string, string> };
context.assert(
  typeof rootPackageJson.bin === "object"
    && rootPackageJson.bin !== null
    && rootPackageJson.bin["strict-spec-cli"] === "dist/scripts/strict-spec-driven.js",
  "package.json declares a strict-spec-cli bin entry pointing at the bundled CLI",
);
const installerReadmeContent = readFileSync(path.join(ROOT, "README.md"), "utf8");
context.assert(
  installerReadmeContent.includes("npm install -g")
    && installerReadmeContent.includes("-NoPathUpdate")
    && installerReadmeContent.includes("-KeepPathOnUninstall"),
  "README documents the npm global install path and the native-exe PATH controls",
);

context.section("[9] bundled template assets in dist");

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

// Change planning artifacts are authored from typed defaults, so no change template ships at all.
context.assert(
  !existsSync(path.join(distScaffoldDir, "changes")),
  "dist scaffold bundle ships no change planning artifact templates",
);

const distSchemaFiles = [
  "harness-session.yaml",
  "harness.yaml",
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
const distHarnessSessionScaffoldPath = path.join(distScaffoldDir, "harness-sessions", "session.yaml");
context.assert(existsSync(distHarnessSessionScaffoldPath), "dist harness-session scaffold template exists");
context.assert(statSync(distHarnessSessionScaffoldPath).isFile(), "dist harness-session scaffold template is a file");

context.assert(!existsSync(distExamplesDir), "dist/templates/strict-spec-driven/examples is not bundled after build");

context.section("[9a] YAML mutation inventory coverage");

const repositoryInventory = validateYamlMutationInventory({ rootDir: ROOT });
context.assert(repositoryInventory.valid, "checked-in YAML mutation inventory covers the repository", JSON.stringify(repositoryInventory.diagnostics));
context.assert(repositoryInventory.yamlPathCount >= 1_400, "inventory examines active, archived, bundled, example, and fixture YAML paths");
context.assert(repositoryInventory.mutationPathCount >= 50, "inventory examines code and guidance mutation surfaces");
context.assert(repositoryInventory.familyCount >= 15, "inventory records stable YAML family identities");
context.assert(repositoryInventory.surfaceCount >= 8, "inventory separates filesystem, CLI, MCP, skill, and documentation surfaces");

const uncoveredYaml = validateYamlMutationInventory({
  rootDir: ROOT,
  inventory: cloneYamlMutationInventory(),
  yamlPaths: ["unclassified/new-family.yaml"],
  mutationPaths: [],
});
context.assert(
  hasInventoryDiagnostic(uncoveredYaml.diagnostics, "uncovered-yaml-path", "unclassified/new-family.yaml"),
  "an unclassified YAML family produces a path-specific diagnostic",
);

const uncoveredMutation = validateYamlMutationInventory({
  rootDir: ROOT,
  inventory: cloneYamlMutationInventory(),
  yamlPaths: [],
  mutationPaths: ["src/new-yaml-writer.ts"],
});
context.assert(
  hasInventoryDiagnostic(uncoveredMutation.diagnostics, "uncovered-mutation-path", "src/new-yaml-writer.ts"),
  "an unaccounted direct-write surface produces a path-specific diagnostic",
);

const staleEvidenceInventory = cloneYamlMutationInventory();
const staleFamilies = staleEvidenceInventory.artifact_families as Record<string, Record<string, unknown>>;
(staleFamilies["workflow-config"].evidence as string[]).push("missing/inventory-evidence.yaml");
const staleEvidence = validateYamlMutationInventory({ rootDir: ROOT, inventory: staleEvidenceInventory, yamlPaths: [], mutationPaths: [] });
context.assert(
  hasInventoryDiagnostic(staleEvidence.diagnostics, "stale-evidence", "workflow-config"),
  "a stale evidence path names the owning family",
);

const invalidEnumsInventory = cloneYamlMutationInventory();
const invalidFamilies = invalidEnumsInventory.artifact_families as Record<string, Record<string, unknown>>;
(invalidFamilies["workflow-config"].operations as Record<string, unknown>).create = "unsafe-replace";
const invalidSurfaces = invalidEnumsInventory.mutation_surfaces as Record<string, Record<string, unknown>>;
invalidSurfaces["change-filesystem-writers"].classification = "unreviewed";
(invalidSurfaces["change-filesystem-writers"].operations as string[]).push("truncate");
const invalidEnums = validateYamlMutationInventory({ rootDir: ROOT, inventory: invalidEnumsInventory, yamlPaths: [], mutationPaths: [] });
context.assert(hasInventoryDiagnostic(invalidEnums.diagnostics, "invalid-operation-state"), "invalid family operation states are rejected");
context.assert(hasInventoryDiagnostic(invalidEnums.diagnostics, "invalid-surface-classification"), "invalid surface classifications are rejected");
context.assert(hasInventoryDiagnostic(invalidEnums.diagnostics, "invalid-surface-operation"), "invalid surface operations are rejected");

const missingOwnerInventory = cloneYamlMutationInventory();
const missingOwnerFamilies = missingOwnerInventory.artifact_families as Record<string, Record<string, unknown>>;
missingOwnerFamilies["workflow-config"].cli_owners = [];
missingOwnerFamilies["workflow-config"].direct_write_paths = ["src/migrate.ts"];
const missingOwner = validateYamlMutationInventory({ rootDir: ROOT, inventory: missingOwnerInventory, yamlPaths: [], mutationPaths: [] });
context.assert(
  hasInventoryDiagnostic(missingOwner.diagnostics, "missing-cli-owner", "workflow-config.operations.create"),
  "a cli-owned operation with no declared owner names the family and the operation",
);
context.assert(
  hasInventoryDiagnostic(missingOwner.diagnostics, "unowned-direct-write-path", "workflow-config.direct_write_paths"),
  "a direct-write path in a family with no CLI owner is reported as unowned",
);

const unknownOwnerInventory = cloneYamlMutationInventory();
const unknownOwnerFamilies = unknownOwnerInventory.artifact_families as Record<string, Record<string, unknown>>;
(unknownOwnerFamilies["workflow-config"].cli_owners as string[]).push("config-rewrite");
const unknownOwner = validateYamlMutationInventory({ rootDir: ROOT, inventory: unknownOwnerInventory, yamlPaths: [], mutationPaths: [] });
context.assert(
  hasInventoryDiagnostic(unknownOwner.diagnostics, "unknown-cli-owner", "workflow-config.cli_owners")
    && unknownOwner.diagnostics.some((diagnostic) => diagnostic.message.includes("config-rewrite")),
  "an owner the CLI does not register is reported with the offending command name",
);

const nonWritingSurfaceInventory = cloneYamlMutationInventory();
const nonWritingFamilies = nonWritingSurfaceInventory.artifact_families as Record<string, Record<string, unknown>>;
nonWritingFamilies["workflow-config"].direct_write_paths = ["skills/strict-spec-verify/SKILL.md"];
const nonWritingSurface = validateYamlMutationInventory({
  rootDir: ROOT,
  inventory: nonWritingSurfaceInventory,
  yamlPaths: [],
  mutationPaths: [],
});
context.assert(
  hasInventoryDiagnostic(nonWritingSurface.diagnostics, "non-writing-direct-write-surface", "workflow-config.direct_write_paths"),
  "a direct-write path covered only by a read-only surface is reported as contradicted",
);

const duplicateInventoryRoot = mkdtempSync(path.join(os.tmpdir(), "strict-yaml-inventory-duplicate-"));
try {
  const duplicateInventoryPath = path.join(duplicateInventoryRoot, "inventory.yaml");
  writeFileSync(duplicateInventoryPath, [
    "schema: strict-spec-driven/yaml-mutation-inventory/v1",
    "schema_version: 1",
    "artifact_type: yaml_mutation_inventory",
    "artifact_families:",
    "  duplicate-id: {}",
    "  duplicate-id: {}",
    "mutation_surfaces: {}",
    "",
  ].join("\n"));
  const duplicateId = validateYamlMutationInventory({ rootDir: duplicateInventoryRoot, inventoryPath: "inventory.yaml" });
  context.assert(hasInventoryDiagnostic(duplicateId.diagnostics, "invalid-yaml"), "duplicate stable ids are rejected by YAML parsing");
  context.assert(
    duplicateId.diagnostics.some((diagnostic) => diagnostic.message.includes("duplicated mapping key")),
    "duplicate-id diagnostic explains the conflicting mapping key",
  );
} finally {
  rmSync(duplicateInventoryRoot, { recursive: true, force: true });
}

context.section("[10] init from dist-only environment");

const distOnlyDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-dist-only-init-"));
try {
  const distOnlyInit = cli(["init"], { cwd: distOnlyDir });
  context.assert(distOnlyInit.status === 0, "init succeeds from dist-only temp directory", `got exit code ${distOnlyInit.status}`);
  const strictRoot = path.join(distOnlyDir, ".strict-spec-driven");
  context.assert(existsSync(strictRoot), "init from dist creates .strict-spec-driven directory");
  for (const artifact of ["config.yaml", "harness.yaml", "specs/INDEX.yaml", "roadmap/INDEX.yaml"]) {
    context.assert(existsSync(path.join(strictRoot, artifact)), `init from dist creates artifact (${artifact})`);
  }
  context.assert(
    listFilesRecursive(strictRoot).every((filePath) => filePath.endsWith(".yaml")),
    "init from dist creates only YAML files under .strict-spec-driven",
  );
} finally {
  rmSync(distOnlyDir, { recursive: true, force: true });
}

context.section("[11] propose from dist-only environment");

const distOnlyProposeDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-dist-only-propose-"));
try {
  const distOnlyPropose = cli(["propose", "test-change"], { cwd: distOnlyProposeDir });
  context.assert(distOnlyPropose.status === 0, "propose succeeds from dist-only temp directory", `got exit code ${distOnlyPropose.status}`);
  const changeDir = path.join(distOnlyProposeDir, ".strict-spec-driven", "changes", "test-change");
  context.assert(existsSync(changeDir), "propose from dist creates change directory");
  for (const artifact of ["proposal.yaml", "design.yaml", "tasks.yaml", "questions.yaml"]) {
    context.assert(
      !existsSync(path.join(changeDir, artifact)),
      `propose from dist writes no placeholder artifact (${artifact})`,
    );
  }
  context.assert(existsSync(path.join(changeDir, "specs")), "propose from dist creates specs directory");

  // Authoring must also work from dist-only output, since that is where the typed defaults live now
  // that no template file backs them.
  const distOnlyGenerate = cli(
    ["generate", "test-change", "design", "--approach", "Authored from a dist-only environment."],
    { cwd: distOnlyProposeDir },
  );
  context.assert(
    distOnlyGenerate.status === 0 && existsSync(path.join(changeDir, "design.yaml")),
    "generate authors an artifact from dist-only output",
    `stderr: ${distOnlyGenerate.stderr.trim()}`,
  );
} finally {
  rmSync(distOnlyProposeDir, { recursive: true, force: true });
}

context.section("[12] harness user documentation smoke coverage");

const harnessGuidePath = path.join(ROOT, "HARNESS.md");
context.assert(existsSync(harnessGuidePath), "HARNESS.md guide exists");

const harnessGuide = readFileSync(harnessGuidePath, "utf8");
const harnessGuideNormalized = harnessGuide.replace(/\s+/g, " ");

context.assert(
  harnessGuideNormalized.includes("harness.yaml"),
  "HARNESS.md covers the declaration file path",
);
context.assert(
  harnessGuideNormalized.includes("harness-infer")
    && harnessGuideNormalized.includes("harness-doctor")
    && harnessGuideNormalized.includes("harness-plan")
    && harnessGuideNormalized.includes("harness-start")
    && harnessGuideNormalized.includes("harness-status")
    && harnessGuideNormalized.includes("harness-logs")
    && harnessGuideNormalized.includes("harness-stop")
    && harnessGuideNormalized.includes("harness-session"),
  "HARNESS.md covers harness CLI commands",
);

context.assert(
  harnessGuideNormalized.includes("scripts/harness-infer")
    && harnessGuideNormalized.includes("scripts/harness-doctor")
    && harnessGuideNormalized.includes("scripts/harness-plan")
    && harnessGuideNormalized.includes("scripts/harness-session"),
  "HARNESS.md covers generated project-local scripts",
);
context.assert(
  harnessGuideNormalized.includes("evidence_labels")
    || (harnessGuideNormalized.includes("evidence") && harnessGuideNormalized.includes("replay")),
  "HARNESS.md covers harness evidence and replay",
);
context.assert(
  (harnessGuideNormalized.toLowerCase().includes("secret") || harnessGuideNormalized.toLowerCase().includes("variable name"))
    && harnessGuideNormalized.toLowerCase().includes("environment"),
  "HARNESS.md covers secret-handling rules for environment variables",
);
context.assert(
  harnessGuideNormalized.includes("production")
    && harnessGuideNormalized.includes("requires_confirmation")
    && harnessGuideNormalized.includes("allow_stateful_lifecycle"),
  "HARNESS.md covers production and stateful safety policy",
);

const readmePath = path.join(ROOT, "README.md");
const readmeContent = readFileSync(readmePath, "utf8");
context.assert(
  readmeContent.includes("HARNESS.md") && readmeContent.includes("Harness"),
  "README.md includes a Harness section and link to HARNESS.md",
);

const quickstartPath = path.join(ROOT, "QUICKSTART.md");
const quickstartContent = readFileSync(quickstartPath, "utf8");
context.assert(
  quickstartContent.includes("harness") && quickstartContent.includes("HARNESS.md"),
  "QUICKSTART.md includes harness guidance and a link to HARNESS.md",
);


// --- Bundled repository asset editing -------------------------------------------------------

type BundledAssetModule = typeof import("../../src/bundled-asset-mutation.js");
const bundledAssets = await loadDistModule<BundledAssetModule>("bundled-asset-mutation.js");

/** A synthetic checkout carrying only the markers and assets a bundled-asset test needs. */
function createSyntheticCheckout(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(path.join(os.tmpdir(), "strict-bundled-asset-"));
  mkdirSync(path.join(root, "templates", "strict-spec-driven", "schemas"), { recursive: true });
  mkdirSync(path.join(root, "templates", "strict-spec-driven", "scaffold"), { recursive: true });
  mkdirSync(path.join(root, "examples", "strict-spec-driven"), { recursive: true });
  mkdirSync(path.join(root, "inventory"), { recursive: true });
  mkdirSync(path.join(root, "test", "fixtures", "validation"), { recursive: true });
  mkdirSync(path.join(root, "src"), { recursive: true });
  writeFileSync(path.join(root, "templates", "strict-spec-driven", "schemas", "registry.yaml"), "entries: []\n");
  writeFileSync(path.join(root, "inventory", "yaml-mutation-surfaces.yaml"), "artifact_families: {}\n");
  writeFileSync(
    path.join(root, "src", "embedded-templates.ts"),
    "export const EMBEDDED_TEMPLATES: Record<string, string> = {\n"
      + '  "strict-spec-driven/schemas/registry.yaml": `entries: []\n`,\n};\n',
  );
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

{
  const checkout = createSyntheticCheckout();
  try {
    const fixtureFile = path.join(checkout.root, "test", "fixtures", "validation", "schema-check.valid.yaml");
    writeFileSync(fixtureFile, "id: sample\nkind: alpha\ntags:\n  - core\n");

    const created = bundledAssets.mutateBundledAsset({
      family: "validation-fixtures",
      assetName: "created-check.valid.yaml",
      rootDir: checkout.root,
      edits: [{ kind: "set", fieldPath: "id", value: "created" }],
    });
    context.assert(
      created.valid && created.committed
        && existsSync(path.join(checkout.root, "test", "fixtures", "validation", "created-check.valid.yaml")),
      "fixture-edit creates a new fixture from field edits alone",
    );

    const updated = bundledAssets.mutateBundledAsset({
      family: "validation-fixtures",
      assetName: "schema-check.valid.yaml",
      rootDir: checkout.root,
      edits: [{ kind: "append", fieldPath: "tags", value: "extra" }],
    });
    const afterUpdate = load(readFileSync(fixtureFile, "utf8")) as Record<string, unknown>;
    context.assert(
      updated.valid && Array.isArray(afterUpdate.tags) && (afterUpdate.tags as string[]).join(",") === "core,extra"
        && afterUpdate.id === "sample" && afterUpdate.kind === "alpha",
      "fixture-edit appends to the addressed sequence and leaves every sibling field unchanged",
    );

    const removed = bundledAssets.mutateBundledAsset({
      family: "validation-fixtures",
      assetName: "schema-check.valid.yaml",
      rootDir: checkout.root,
      edits: [{ kind: "remove", fieldPath: "kind" }],
    });
    const afterRemove = load(readFileSync(fixtureFile, "utf8")) as Record<string, unknown>;
    context.assert(
      removed.valid && afterRemove.kind === undefined && afterRemove.id === "sample",
      "fixture-edit named removal deletes only the addressed entry",
    );

    const deleted = bundledAssets.mutateBundledAsset({
      family: "validation-fixtures",
      assetName: "created-check.valid.yaml",
      rootDir: checkout.root,
      delete: true,
    });
    context.assert(
      deleted.valid && !existsSync(path.join(checkout.root, "test", "fixtures", "validation", "created-check.valid.yaml")),
      "fixture-edit deletes an unreferenced fixture",
    );

    const escaped = bundledAssets.mutateBundledAsset({
      family: "validation-fixtures",
      assetName: "../../../etc/passwd.yaml",
      rootDir: checkout.root,
      edits: [{ kind: "set", fieldPath: "id", value: "escaped" }],
    });
    context.assert(
      !escaped.valid && escaped.diagnostics.some((entry) => entry.code === "unknown-asset"),
      "a bundled-asset name that escapes its family is rejected rather than normalized",
    );

    const missingField = bundledAssets.mutateBundledAsset({
      family: "validation-fixtures",
      assetName: "schema-check.valid.yaml",
      rootDir: checkout.root,
      edits: [{ kind: "remove", fieldPath: "not-present" }],
    });
    context.assert(
      !missingField.valid && missingField.diagnostics.some((entry) => entry.code === "field-path-missing"),
      "removing an absent field path is a deterministic error rather than a silent no-op",
    );
  } finally {
    checkout.cleanup();
  }
}

{
  const checkout = createSyntheticCheckout();
  try {
    const examplePath = path.join(checkout.root, "examples", "strict-spec-driven", "config.yaml");
    const exampleSource = readFileSync(path.join(ROOT, "examples", "strict-spec-driven", "config.yaml"), "utf8");
    writeFileSync(examplePath, exampleSource);
    const bundlePath = path.join(checkout.root, "src", "embedded-templates.ts");
    const bundleBefore = readFileSync(bundlePath, "utf8");

    const written = bundledAssets.mutateBundledAsset({
      family: "bundled-reference-examples",
      assetName: "config.yaml",
      rootDir: checkout.root,
      edits: [{ kind: "set", fieldPath: "preferred_human_language", value: "English" }],
    });
    const bundleAfter = readFileSync(bundlePath, "utf8");
    context.assert(
      written.valid && bundleAfter !== bundleBefore
        && bundleAfter.includes("examples/strict-spec-driven/config.yaml")
        && written.changes.some((change) => change.artifactPath === "src/embedded-templates.ts" && change.role === "generated"),
      "an accepted example write regenerates the embedded bundle inside the same transaction",
    );

    const bundleBeforeFailure = readFileSync(bundlePath, "utf8");
    const exampleBeforeFailure = readFileSync(examplePath, "utf8");
    const rolledBack = bundledAssets.mutateBundledAsset({
      family: "bundled-reference-examples",
      assetName: "config.yaml",
      rootDir: checkout.root,
      edits: [{ kind: "set", fieldPath: "preferred_human_language", value: "Japanese" }],
      regenerateEmbeddedBundle: () => {
        throw new Error("injected regeneration failure");
      },
    });
    context.assert(
      !rolledBack.valid && !rolledBack.committed
        && rolledBack.diagnostics.some((entry) => entry.code === "bundle-regeneration-failed")
        && readFileSync(examplePath, "utf8") === exampleBeforeFailure
        && readFileSync(bundlePath, "utf8") === bundleBeforeFailure,
      "a failed embedded-bundle regeneration leaves both the asset and the bundle byte-identical",
    );

    const invalidExample = bundledAssets.mutateBundledAsset({
      family: "bundled-reference-examples",
      assetName: "config.yaml",
      rootDir: checkout.root,
      edits: [{ kind: "remove", fieldPath: "artifact_type" }],
    });
    context.assert(
      !invalidExample.valid && readFileSync(examplePath, "utf8").includes("artifact_type"),
      "an example edit that breaks its registered schema is rejected and the example is unchanged",
    );
  } finally {
    checkout.cleanup();
  }
}

{
  const checkout = createSyntheticCheckout();
  try {
    const malformedPath = path.join(checkout.root, "test", "fixtures", "validation", "schema-check.invalid.malformed.yaml");
    writeFileSync(malformedPath, "id: malformed\ntags:\n  - bad: [\n");
    const before = readFileSync(malformedPath, "utf8");

    const refused = bundledAssets.mutateBundledAsset({
      family: "validation-fixtures",
      assetName: "schema-check.invalid.malformed.yaml",
      rootDir: checkout.root,
      edits: [{ kind: "set", fieldPath: "id", value: "repaired" }],
    });
    context.assert(
      !refused.valid && refused.diagnostics.some((entry) => entry.code === "fixture-intent-not-field-editable")
        && readFileSync(malformedPath, "utf8") === before,
      "field edits to a must-not-parse fixture are refused with a lifecycle diagnostic and change nothing",
    );

    const enumPath = path.join(checkout.root, "test", "fixtures", "validation", "schema-check.invalid.enum.yaml");
    writeFileSync(enumPath, "id: invalid-enum\nkind: gamma\n");
    const enumEdit = bundledAssets.mutateBundledAsset({
      family: "validation-fixtures",
      assetName: "schema-check.invalid.enum.yaml",
      rootDir: checkout.root,
      edits: [{ kind: "set", fieldPath: "id", value: "still-invalid-enum" }],
    });
    const enumAfter = load(readFileSync(enumPath, "utf8")) as Record<string, unknown>;
    context.assert(
      enumEdit.valid && enumAfter.kind === "gamma",
      "an intentionally schema-invalid fixture stays invalid after a fixture-edit write",
    );

    const deletedMalformed = bundledAssets.mutateBundledAsset({
      family: "validation-fixtures",
      assetName: "schema-check.invalid.malformed.yaml",
      rootDir: checkout.root,
      delete: true,
    });
    context.assert(
      deletedMalformed.valid && !existsSync(malformedPath),
      "deletion remains supported for a must-not-parse fixture",
    );
  } finally {
    checkout.cleanup();
  }
}

{
  // The generated-participant seam is the only way non-YAML content reaches the mutation boundary,
  // so the guard that keeps it out of the artifact families themselves needs its own coverage.
  const guardRoot = mkdtempSync(path.join(os.tmpdir(), "strict-generated-guard-"));
  try {
    const targetPath = path.join(guardRoot, "artifact.yaml");
    writeFileSync(targetPath, "id: original\n");
    const rejected = yamlMutationModule.commitYamlMutation({
      rootDir: guardRoot,
      mutations: [{
        artifactFamily: "test-family",
        artifactId: "artifact.yaml",
        schemaId: "test-schema",
        familyRoot: guardRoot,
        absolutePath: targetPath,
        operation: "update",
        content: "id: smuggled\n",
      }],
    });
    context.assert(
      !rejected.valid && rejected.diagnostics.some((entry) => entry.code === "content-not-generated")
        && readFileSync(targetPath, "utf8") === "id: original\n",
      "pre-serialized content is refused for an artifact-role participant and changes nothing",
    );
  } finally {
    rmSync(guardRoot, { recursive: true, force: true });
  }
}

{
  const absentTree = mkdtempSync(path.join(os.tmpdir(), "strict-no-bundled-tree-"));
  try {
    const refused = bundledAssets.mutateBundledAsset({
      family: "bundled-schema-assets",
      assetName: "main-spec.yaml",
      rootDir: absentTree,
      edits: [{ kind: "set", fieldPath: "schema_version", value: "2" }],
    });
    context.assert(
      !refused.valid && refused.diagnostics.some((entry) => entry.code === "bundled-source-tree-absent")
        && readdirSync(absentTree).length === 0,
      "a bundled-asset write refuses deterministically where the bundled source tree is absent and creates nothing",
    );
  } finally {
    rmSync(absentTree, { recursive: true, force: true });
  }
}

{
  const referenced = bundledAssets.findAssetReferences("test/fixtures/validation/schema-check.valid.yaml", ROOT);
  context.assert(
    referenced.includes("test/suites/foundation-and-fixtures.ts"),
    "reference discovery finds the test suite that asserts against a fixture",
  );
  const schemaReferences = bundledAssets.findAssetReferences("templates/strict-spec-driven/schemas/main-spec.yaml", ROOT);
  context.assert(
    schemaReferences.includes("templates/strict-spec-driven/schemas/registry.yaml"),
    "reference discovery finds the schema registry entry that names a bundled schema",
  );

  const inventoryBefore = readFileSync(YAML_MUTATION_INVENTORY_PATH, "utf8");
  const gated = bundledAssets.mutateBundledAsset({
    family: "yaml-mutation-inventory",
    rootDir: ROOT,
    edits: [{ kind: "remove", fieldPath: "artifact_families.validation-fixtures" }],
  });
  context.assert(
    !gated.valid && !gated.committed
      && gated.diagnostics.some((entry) => entry.code === "uncovered-yaml-path")
      && readFileSync(YAML_MUTATION_INVENTORY_PATH, "utf8") === inventoryBefore,
    "an inventory write that would leave a tracked YAML path uncovered is rejected by the coverage gate",
  );

  const stillReferenced = bundledAssets.mutateBundledAsset({
    family: "validation-fixtures",
    assetName: "schema-check.valid.yaml",
    rootDir: ROOT,
    delete: true,
  });
  context.assert(
    !stillReferenced.valid
      && stillReferenced.diagnostics.some((entry) =>
        entry.code === "asset-still-referenced" && entry.message.includes("test/suites/foundation-and-fixtures.ts"))
      && existsSync(fixturePath("schema-check.valid.yaml")),
    "deletion is refused while a test suite still references the asset, naming the referencing path",
  );
}

{
  const helpResult = cli(["--help", "--json"]);
  const helpPayload = JSON.parse(helpResult.stdout) as {
    groups: { id: string; title: string }[];
    commands: { name: string; group: string }[];
  };
  const maintenanceCommands = helpPayload.commands.filter((entry) => entry.group === "maintenance").map((entry) => entry.name).sort();
  context.assert(
    helpPayload.groups.some((group) => group.id === "maintenance" && group.title.includes("this checkout only"))
      && maintenanceCommands.join(",") === "fixture-edit,inventory-edit,sample-edit,schema-edit,template-edit",
    "the five bundled-asset editing commands are grouped as repository maintenance scoped to this checkout",
  );

  const mcpToolsSource = readFileSync(path.join(ROOT, "src", "mcp", "tools.ts"), "utf8");
  context.assert(
    !["schema-edit", "template-edit", "sample-edit", "fixture-edit", "inventory-edit"]
      .some((commandName) => mcpToolsSource.includes(`"${commandName}"`)),
    "the bundled-asset editing commands are excluded from the MCP tool set",
  );

  for (const commandName of ["schema-edit", "template-edit", "sample-edit", "fixture-edit", "inventory-edit"]) {
    const commandHelp = cli([commandName, "--help"]);
    context.assert(
      commandHelp.status === 0 && commandHelp.stdout.includes("--set") && commandHelp.stdout.includes("--remove-entry")
        && commandHelp.stdout.includes("--delete"),
      `${commandName} help documents its editing flag semantics`,
    );
  }

  const usageError = cli(["fixture-edit", "schema-check.valid.yaml", "--set", "id"]);
  context.assert(
    usageError.status === 1 && usageError.stdout.includes("usage-error"),
    "a bundled-asset editing command reports a usage error when an edit is missing its value",
  );
}

{
  // A dash-leading value is ordinary YAML, so it must be reachable through the repository's
  // documented --flag=value form rather than being swallowed as the next flag.
  const checkout = createSyntheticCheckout();
  try {
    const fixtureFile = path.join(checkout.root, "test", "fixtures", "validation", "offsets.valid.yaml");
    writeFileSync(fixtureFile, "id: offsets\n");
    const written = bundledAssets.mutateBundledAsset({
      family: "validation-fixtures",
      assetName: "offsets.valid.yaml",
      rootDir: checkout.root,
      edits: [{ kind: "set", fieldPath: "offset", value: "-3" }, { kind: "set", fieldPath: "label", value: "-dash-leading" }],
    });
    const stored = load(readFileSync(fixtureFile, "utf8")) as Record<string, unknown>;
    context.assert(
      written.valid && stored.offset === -3 && stored.label === "-dash-leading",
      "a dash-leading value is written as its YAML scalar rather than parsed as a flag",
    );
  } finally {
    checkout.cleanup();
  }

  const inlineForm = cli(["fixture-edit", "--help"]);
  context.assert(
    inlineForm.stdout.includes("--flag=value"),
    "bundled-asset editing help documents the --flag=value form for dash-leading values",
  );
}

}
