import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "fs";
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
      entry.schema_id === "strict-spec-driven/ticket/v1"
      && entry.artifact_type === "ticket"
      && entry.schema_file === "ticket.yaml"
      && entry.primary_example.endsWith("/ticket.yaml"),
  ),
  "schema registry includes ticket schema and primary example",
);
context.assert(
  bundledRegistry.entries.some(
    (entry) =>
      entry.schema_id === "strict-spec-driven/tickets-index/v1"
      && entry.artifact_type === "tickets_index"
      && entry.schema_file === "tickets-index.yaml"
      && entry.primary_example.endsWith("/tickets-index.yaml"),
  ),
  "schema registry includes tickets-index schema and primary example",
);
const ticketSchema = validationModule.loadBundledSchemaByArtifactType("ticket") as Record<string, unknown>;
const ticketSchemaProps = ticketSchema.properties as Record<string, unknown>;
context.assert(
  (ticketSchemaProps.requirement as Record<string, unknown>)?.properties !== undefined,
  "ticket schema resolves by artifact type and exposes pure-requirement fields",
);
context.assert(
  (ticketSchemaProps.dispatch_decision as Record<string, unknown>)?.properties !== undefined,
  "ticket schema exposes an embedded dispatch-decision record",
);
const ticketExample = yamlModule.parseYamlFile<{ status: string }>(
  path.join(ROOT, "examples", "strict-spec-driven", "ticket.yaml"),
);
context.assert(
  ((ticketSchemaProps.status as Record<string, unknown>).enum as string[]).includes(ticketExample.status),
  "ticket example status stays within ticket schema enums",
);
const ticketValidation = validationModule.validateArtifact(
  ticketSchema,
  ticketExample,
  "examples/strict-spec-driven/ticket.yaml",
);
context.assert(ticketValidation.valid, "ticket example validates against ticket schema");
const ticketsIndexSchema = validationModule.loadBundledSchemaByArtifactType("tickets_index") as Record<string, unknown>;
const ticketsIndexExample = yamlModule.parseYamlFile<Record<string, unknown>>(
  path.join(ROOT, "examples", "strict-spec-driven", "tickets-index.yaml"),
);
const ticketsIndexValidation = validationModule.validateArtifact(
  ticketsIndexSchema,
  ticketsIndexExample,
  "examples/strict-spec-driven/tickets-index.yaml",
);
context.assert(ticketsIndexValidation.valid, "tickets-index example validates against tickets-index schema");
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
context.assert(firstAssetList.length === 5, "required scaffold asset manifest includes five assets");
context.assert(
  firstAssetList.every((asset) => asset.endsWith(".yaml")),
  "required scaffold asset manifest contains only YAML files",
);
context.assert(firstAssetList.includes("harness.yaml"), "required scaffold asset manifest includes harness scaffold");

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
  const taskArtifact = readFileSync(path.join(changeDir, "tasks.yaml"), "utf8");
  context.assert(
    taskArtifact.includes("    run-project-regression:\n")
      && taskArtifact.includes("coverage contract")
      && !taskArtifact.includes("bun run build"),
    "propose scaffold carries a single project-regression Testing task instead of hardcoded toolchain commands",
  );
  context.assert(
    taskArtifact.includes('command: "REPLACE WITH the complete project regression command'),
    "propose scaffold without a configured regression command renders an explicit placeholder",
  );
  context.assert(
    taskArtifact.includes("  validation_task: run-project-regression\n")
      && taskArtifact.includes("  unit_test_task: run-project-regression\n"),
    "propose scaffold testing gates reference the project-regression task",
  );

  const configuredWorkspace = mkdtempSync(path.join(os.tmpdir(), "strict-spec-driven-propose-config-"));
  try {
    mkdirSync(path.join(configuredWorkspace, ".strict-spec-driven"), { recursive: true });
    writeFileSync(
      path.join(configuredWorkspace, ".strict-spec-driven", "config.yaml"),
      [
        "schema: strict-spec-driven/config/v1",
        "schema_version: 1",
        "artifact_type: workflow_config",
        "review_evidence:",
        "  project_regression:",
        "    method: complete_project_regression",
        "    command: npm run build && npm test -- --coverage",
        "",
      ].join("\n"),
      "utf8",
    );
    const configuredPropose = cli(["propose", "configured-change"], { cwd: configuredWorkspace });
    context.assert(configuredPropose.status === 0, "propose succeeds in a workspace with a configured regression command");
    const configuredTasks = readFileSync(
      path.join(configuredWorkspace, ".strict-spec-driven", "changes", "configured-change", "tasks.yaml"),
      "utf8",
    );
    context.assert(
      configuredTasks.includes('command: "npm run build && npm test -- --coverage"'),
      "propose scaffold renders the project's configured regression command into the testing gate task",
    );
  } finally {
    rmSync(configuredWorkspace, { recursive: true, force: true });
  }

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

  const cancelProposeChange = cli(["cancel", changeName], { cwd: proposeTempDir });
  context.assert(
    cancelProposeChange.status === 0,
    "cancel clears the active change so the single-active rule allows the next propose",
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
  const blockedDirectPropose = cli(["propose", directChangeName], { cwd: generateTempDir });
  context.assert(
    blockedDirectPropose.status !== 0 &&
      blockedDirectPropose.stderr.includes(`active change '${changeName}' already exists`) &&
      blockedDirectPropose.stderr.includes("archive or cancel"),
    "propose rejects a second active change and names the blocking change",
    `status: ${blockedDirectPropose.status} stderr: ${blockedDirectPropose.stderr.trim()}`,
  );
  context.assert(
    !existsSync(path.join(generateTempDir, ".strict-spec-driven", "changes", directChangeName)),
    "blocked propose writes no scaffold state",
  );
  const cancelScripted = cli(["cancel", changeName], { cwd: generateTempDir });
  context.assert(cancelScripted.status === 0, "single-active rule allows next propose after cancel", `stderr: ${cancelScripted.stderr.trim()}`);
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

context.section("[9] init from dist-only environment");

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

context.section("[11] harness user documentation smoke coverage");

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

}
