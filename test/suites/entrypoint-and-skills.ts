import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import {
  ROOT,
  TestContext,
  cli,
  loadDistModule,
  type SkillValidationModule,
  type YamlModule,
} from "../support/harness.js";

type StrictCliModule = {
  commands: Record<string, unknown>;
};

type CliRegistryModule = {
  COMMAND_REGISTRATION_ORDER: string[];
};

type CommandMetadataEntry = {
  name: string;
  group: string;
  summary: string;
  mcpDescription?: string;
  flags: Array<{ name: string; description: string }>;
  output: { description: string };
  exitCodes: Array<{ code: number; meaning: string }>;
};

type CommandMetadataModule = {
  getAllCommandMetadata: () => CommandMetadataEntry[];
  getCommandArtifactSurface: (commandName: string) => Array<{
    artifactKind: string;
    artifactTypes: string[];
    schemaKeys: string[];
    declaredSchemaFiles: string[];
    exampleKeys: string[];
    inspectWith: string[];
  }>;
};

type McpInventoryModule = {
  MCP_READ_ONLY_TOOL_INVENTORY: Array<{ name: string; description: string; cliCommand: string; mutates: boolean }>;
  MCP_MUTATING_TOOL_INVENTORY: Array<{ name: string; description: string; cliCommand: string; mutates: boolean }>;
};

type EmbeddedTemplatesModule = {
  getEmbeddedTemplateKeys: () => string[];
  readEmbeddedTemplate: (key: string) => string | undefined;
};

type SurfaceFamilyPayload = {
  kind: string;
  schemaKey?: string;
  declaredSchemaFile?: string;
  schemaFilePath?: string;
  exampleKey?: string;
  exampleFilePath?: string;
  artifactTypes: Array<{ artifactType: string; inspectWith: string[] }>;
  operations: Record<string, { state: string; cliOwned: boolean; commands: string[]; note?: string }>;
};

export async function runEntrypointAndSkillsSuite(context: TestContext): Promise<void> {
context.section("[1] entrypoint smoke test");

const expectedCommandOrder = [
  "init",
  "check-workflow-state",
  "propose",
  "generate",
  "apply",
  "verify",
  "ready",
  "next",
  "verify-spec-mappings",
  "verify-tech-mappings",
  "tech-status",
  "spec-edit",
  "tech-edit",
  "architecture-edit",
  "architecture-generate",
  "architecture-status",
  "design-edit",
  "design-init",
  "design-generate",
  "design-status",
  "validate-skills",
  "schema-list",
  "schema-show",
  "sample-list",
  "sample-show",
  "template-list",
  "template-show",
  "yaml-surface-list",
  "yaml-surface-show",
  "schema-edit",
  "template-edit",
  "sample-edit",
  "fixture-edit",
  "inventory-edit",
  "harness-edit",
  "harness-infer",
  "harness-doctor",
  "harness-plan",
  "harness-start",
  "harness-stop",
  "harness-status",
  "harness-logs",
  "harness-scripts",
  "harness-session",
  "mcp-install",
  "migrate",
  "roadmap-generate",
  "roadmap-status",
  "roadmap-overview",
  "roadmap-sync",
  "roadmap-reorder",
  "roadmap-renumber",
  "roadmap-move-planned-change",
  "roadmap-recommend",
  "roadmap-archive",
  "roadmap-reopen",
  "roadmap-pause",
  "roadmap-resume",
  "sop-create",
  "sop-list",
  "sop-show",
  "sop-edit",
  "sop-validate",
  "sop-category-list",
  "sop-category-show",
  "lesson-create",
  "lesson-list",
  "lesson-show",
  "lesson-edit",
  "lesson-obsolete",
  "lesson-status",
  "maintenance",
  "ship",
  "commit-and-push",
  "archive",
  "list",
  "modify",
  "cancel",
];
const expectedCommandUsage = `Commands: ${expectedCommandOrder.join(", ")}`;

const noArgs = cli([]);
context.assert(noArgs.status !== 0, "no-arg invocation exits non-zero", `got exit code ${noArgs.status}`);
context.assert(
  noArgs.stderr.includes("Usage:"),
  "no-arg invocation prints usage hint to stderr",
  `stderr: ${noArgs.stderr.trim()}`,
);
context.assert(
  noArgs.stderr.includes(expectedCommandUsage),
  "no-arg invocation preserves canonical command listing order",
  `stderr: ${noArgs.stderr.trim()}`,
);

const unknownCmd = cli(["unknown-subcommand"]);
context.assert(unknownCmd.status !== 0, "unknown subcommand exits non-zero", `got exit code ${unknownCmd.status}`);
context.assert(
  unknownCmd.stderr.includes("Usage:"),
  "unknown subcommand prints usage hint to stderr",
  `stderr: ${unknownCmd.stderr.trim()}`,
);
context.assert(
  unknownCmd.stderr.includes(expectedCommandUsage),
  "unknown subcommand preserves canonical command listing order",
  `stderr: ${unknownCmd.stderr.trim()}`,
);

const rootHelp = cli(["--help"]);
context.assert(rootHelp.status === 0, "root help exits zero", `got exit code ${rootHelp.status}`);
context.assert(
  rootHelp.stdout.includes("Usage:") && expectedCommandOrder.every((name) => rootHelp.stdout.includes(`  ${name} `)),
  "root help lists every registered command with a summary",
  `stdout: ${rootHelp.stdout.trim()}`,
);
context.assert(rootHelp.stderr.length === 0, "root help keeps stderr empty", `stderr: ${rootHelp.stderr.trim()}`);

const commandMetadata = (await loadDistModule("cli/command-metadata.js")) as CommandMetadataModule;
const metadataEntries = commandMetadata.getAllCommandMetadata();

context.assert(
  expectedCommandOrder.every((name) => metadataEntries.some((entry) => entry.name === name)),
  "every registered command has a metadata entry",
  `missing: ${expectedCommandOrder.filter((name) => !metadataEntries.some((entry) => entry.name === name)).join(", ")}`,
);
context.assert(
  metadataEntries.every((entry) => entry.summary.trim().length > 0),
  "every command metadata entry carries a non-empty summary",
  `empty summaries: ${metadataEntries.filter((entry) => entry.summary.trim().length === 0).map((entry) => entry.name).join(", ")}`,
);
context.assert(
  metadataEntries.every((entry) => entry.flags.every((flag) => flag.description.trim().length > 0)),
  "every documented flag carries a description",
  `undocumented flags: ${
    metadataEntries
      .flatMap((entry) => entry.flags.filter((flag) => flag.description.trim().length === 0).map((flag) => `${entry.name} ${flag.name}`))
      .join(", ")
  }`,
);
context.assert(
  metadataEntries.every((entry) => entry.exitCodes.length > 0 && entry.output.description.trim().length > 0),
  "every command metadata entry documents its output and exit codes",
  `incomplete: ${
    metadataEntries.filter((entry) => entry.exitCodes.length === 0 || entry.output.description.trim().length === 0).map((entry) => entry.name).join(", ")
  }`,
);

for (const commandName of expectedCommandOrder) {
  const metadata = metadataEntries.find((entry) => entry.name === commandName);
  const commandHelp = cli([commandName, "--help"], { cwd: ROOT });
  context.assert(commandHelp.status === 0, `${commandName} --help exits zero`, `stderr: ${commandHelp.stderr.trim()}`);
  context.assert(
    commandHelp.stdout.includes(`Usage: strict-spec-cli ${commandName}`),
    `${commandName} --help prints command usage to stdout`,
    `stdout: ${commandHelp.stdout.trim()}`,
  );
  context.assert(
    metadata !== undefined
      && commandHelp.stdout.includes(metadata.summary)
      && commandHelp.stdout.includes("Exit codes:")
      && metadata.flags.every((flag) => commandHelp.stdout.includes(flag.description)),
    `${commandName} --help describes its summary, flags, and exit codes`,
    `stdout: ${commandHelp.stdout.trim()}`,
  );
  context.assert(commandHelp.stderr.length === 0, `${commandName} --help keeps stderr empty`, `stderr: ${commandHelp.stderr.trim()}`);

  const jsonHelp = cli([commandName, "--help", "--json"], { cwd: ROOT });
  context.assert(jsonHelp.status === 0, `${commandName} --help --json exits zero`, `stderr: ${jsonHelp.stderr.trim()}`);
  context.assert(jsonHelp.stderr.length === 0, `${commandName} --help --json keeps stderr empty`, `stderr: ${jsonHelp.stderr.trim()}`);

  let payload: Record<string, unknown> | undefined;
  try {
    payload = JSON.parse(jsonHelp.stdout) as Record<string, unknown>;
  } catch {
    payload = undefined;
  }
  context.assert(
    payload !== undefined
      && payload.command === commandName
      && typeof payload.summary === "string"
      && Array.isArray(payload.usage)
      && Array.isArray(payload.arguments)
      && Array.isArray(payload.flags)
      && Array.isArray(payload.exitCodes)
      && typeof payload.output === "object",
    `${commandName} --help --json emits a structured help payload`,
    `stdout: ${jsonHelp.stdout.trim()}`,
  );
}

const rootJsonHelp = cli(["--help", "--json"]);
context.assert(rootJsonHelp.status === 0, "root --help --json exits zero", `stderr: ${rootJsonHelp.stderr.trim()}`);
context.assert(rootJsonHelp.stderr.length === 0, "root --help --json keeps stderr empty", `stderr: ${rootJsonHelp.stderr.trim()}`);

let rootPayload: { commands?: Array<{ name?: string; group?: string; summary?: string }> } | undefined;
try {
  rootPayload = JSON.parse(rootJsonHelp.stdout) as typeof rootPayload;
} catch {
  rootPayload = undefined;
}
context.assert(
  rootPayload !== undefined
    && Array.isArray(rootPayload.commands)
    && expectedCommandOrder.every((name, index) =>
      rootPayload?.commands?.[index]?.name === name
      && typeof rootPayload.commands[index].group === "string"
      && typeof rootPayload.commands[index].summary === "string"
    ),
  "root --help --json describes every command in canonical order with group and summary",
  `stdout: ${rootJsonHelp.stdout.trim()}`,
);

const mcpInventory = (await loadDistModule("mcp/inventory.js")) as McpInventoryModule;
const mcpTools = [...mcpInventory.MCP_READ_ONLY_TOOL_INVENTORY, ...mcpInventory.MCP_MUTATING_TOOL_INVENTORY];

/**
 * An MCP description is the metadata summary plus, for a command that authors repository-owned
 * YAML, the artifact kinds derived from the mutation inventory. Both parts come from the shared
 * command-metadata module, so the expectation is rebuilt from it rather than restated here.
 */
const expectedMcpDescription = (cliCommand: string): string | undefined => {
  const metadata = metadataEntries.find((entry) => entry.name === cliCommand);
  if (metadata === undefined) return undefined;
  const base = metadata.mcpDescription ?? metadata.summary;
  const artifactKinds = commandMetadata.getCommandArtifactSurface(cliCommand).map((entry) => entry.artifactKind);
  return artifactKinds.length === 0 ? base : `${base} Writes YAML artifact kinds: ${artifactKinds.join(", ")}.`;
};

context.assert(
  mcpTools.every((tool) => tool.description === expectedMcpDescription(tool.cliCommand)),
  "every MCP tool description comes from its command metadata entry",
  `mismatched: ${
    mcpTools
      .filter((tool) => tool.description !== expectedMcpDescription(tool.cliCommand))
      .map((tool) => tool.name)
      .join(", ")
  }`,
);
context.assert(
  mcpTools.filter((tool) => tool.mutates).every((tool) => /^(Mutates|Performs)\b/.test(tool.description)),
  "every mutating MCP tool description states project-state mutation explicitly",
  `non-explicit: ${mcpTools.filter((tool) => tool.mutates && !/^(Mutates|Performs)\b/.test(tool.description)).map((tool) => tool.name).join(", ")}`,
);

const helpCacheRoot = mkdtempSync(path.join(os.tmpdir(), "strict-help-cache-"));
for (const [label, helpArgs] of [
  ["root text help", ["--help"]],
  ["root json help", ["--help", "--json"]],
  ["subcommand text help", ["verify", "--help"]],
  ["subcommand json help", ["verify", "--help", "--json"]],
] as Array<[string, string[]]>) {
  const cacheDir = path.join(helpCacheRoot, label.replaceAll(" ", "-"));
  const helpRun = cli(helpArgs, { cwd: ROOT, env: { STRICT_SPEC_SCHEMA_CACHE_DIR: cacheDir } });
  context.assert(helpRun.status === 0, `${label} exits zero`, `stderr: ${helpRun.stderr.trim()}`);
  context.assert(
    !existsSync(cacheDir),
    `${label} does not create the shared schema cache`,
    `cache directory was created at ${cacheDir}`,
  );
}
rmSync(helpCacheRoot, { recursive: true, force: true });

const roadmapArchiveInvalidArgs = cli(["roadmap-archive", "one", "two"], { cwd: ROOT });
context.assert(
  roadmapArchiveInvalidArgs.status !== 0,
  "roadmap-archive rejects extra positional arguments",
  `stdout: ${roadmapArchiveInvalidArgs.stdout.trim()} stderr: ${roadmapArchiveInvalidArgs.stderr.trim()}`,
);
context.assert(
  roadmapArchiveInvalidArgs.stderr.includes("Usage: strict-spec-cli roadmap-archive [milestone-id]"),
  "roadmap-archive invalid arguments print command usage",
  `stderr: ${roadmapArchiveInvalidArgs.stderr.trim()}`,
);

const workflowStateSuccess = cli(["check-workflow-state"], { cwd: ROOT });
context.assert(
  workflowStateSuccess.status === 0,
  "check-workflow-state exits zero when .strict-spec-driven/ exists",
  `stdout: ${workflowStateSuccess.stdout.trim()} stderr: ${workflowStateSuccess.stderr.trim()}`,
);
context.assert(
  workflowStateSuccess.stdout.includes("strict workflow state exists"),
  "check-workflow-state reports existing strict workflow state",
  `stdout: ${workflowStateSuccess.stdout.trim()}`,
);

const missingWorkflowStateRoot = mkdtempSync(path.join(os.tmpdir(), "strict-workflow-state-missing-"));
try {
  const workflowStateMissing = cli(["check-workflow-state"], { cwd: missingWorkflowStateRoot });
  context.assert(
    workflowStateMissing.status !== 0,
    "check-workflow-state exits non-zero when .strict-spec-driven/ is missing",
    `stdout: ${workflowStateMissing.stdout.trim()} stderr: ${workflowStateMissing.stderr.trim()}`,
  );
  context.assert(
    workflowStateMissing.stderr.includes("strict workflow state is missing")
      && workflowStateMissing.stderr.includes("/strict-spec-init"),
    "check-workflow-state reports missing state and init guidance",
    `stderr: ${workflowStateMissing.stderr.trim()}`,
  );
} finally {
  rmSync(missingWorkflowStateRoot, { recursive: true, force: true });
}

const validateSkillsDispatch = cli(["validate-skills"], { cwd: ROOT });
context.assert(
  validateSkillsDispatch.status === 0,
  "known subcommand dispatches through the entrypoint",
  `stdout: ${validateSkillsDispatch.stdout.trim()} stderr: ${validateSkillsDispatch.stderr.trim()}`,
);
const validateSkillsDispatchJson = JSON.parse(validateSkillsDispatch.stdout.trim());
context.assert(
  validateSkillsDispatchJson.valid === true,
  "known subcommand preserves JSON stdout through the entrypoint",
);

const schemaList = cli(["schema-list"], { cwd: ROOT });
context.assert(schemaList.status === 0, "schema-list exits zero", `stderr: ${schemaList.stderr.trim()}`);
context.assert(
  schemaList.stdout.includes("strict-spec-driven/schemas/change-proposal.yaml"),
  "schema-list includes bundled schema asset keys",
  `stdout: ${schemaList.stdout.trim()}`,
);

const schemaShow = cli(["schema-show", "change-proposal"], { cwd: ROOT });
context.assert(schemaShow.status === 0, "schema-show exits zero for schema name", `stderr: ${schemaShow.stderr.trim()}`);
context.assert(
  schemaShow.stdout.includes("schema_id: strict-spec-driven/change-proposal/v1"),
  "schema-show prints embedded schema content",
  `stdout: ${schemaShow.stdout.trim()}`,
);

const sampleList = cli(["sample-list"], { cwd: ROOT });
context.assert(sampleList.status === 0, "sample-list exits zero", `stderr: ${sampleList.stderr.trim()}`);
context.assert(
  sampleList.stdout.includes("examples/strict-spec-driven/change-proposal.yaml"),
  "sample-list includes bundled sample asset keys",
  `stdout: ${sampleList.stdout.trim()}`,
);

const sampleShow = cli(["sample-show", "change-proposal"], { cwd: ROOT });
context.assert(sampleShow.status === 0, "sample-show exits zero for sample name", `stderr: ${sampleShow.stderr.trim()}`);
context.assert(
  sampleShow.stdout.includes("schema: strict-spec-driven/change-proposal/v1"),
  "sample-show prints embedded sample content",
  `stdout: ${sampleShow.stdout.trim()}`,
);

const unknownSampleShow = cli(["sample-show", "not-a-sample"], { cwd: ROOT });
context.assert(unknownSampleShow.status !== 0, "sample-show rejects unknown samples");
context.assert(
  unknownSampleShow.stderr.includes("embedded template asset 'examples/strict-spec-driven/not-a-sample.yaml' not found")
    && unknownSampleShow.stderr.includes("Usage: strict-spec-cli sample-show <sample-name|sample-key>"),
  "sample-show prints deterministic not-found diagnostics and usage",
  `stderr: ${unknownSampleShow.stderr.trim()}`,
);

const templateShow = cli(["template-show", "scaffold/config.yaml"], { cwd: ROOT });
context.assert(templateShow.status === 0, "template-show exits zero for scaffold key", `stderr: ${templateShow.stderr.trim()}`);
context.assert(
  templateShow.stdout.includes("artifact_type: workflow_config"),
  "template-show prints embedded scaffold content",
  `stdout: ${templateShow.stdout.trim()}`,
);

const strictCliModule = await loadDistModule<StrictCliModule>("strict-spec-cli.js");
context.assert(
  JSON.stringify(Object.keys(strictCliModule.commands)) === JSON.stringify(expectedCommandOrder),
  "exported command table preserves canonical registration order",
);

context.section("[3b] YAML mutation surface");

// Read the inventory directly rather than through the surface module, so completeness is asserted
// against the checked-in evidence instead of against the code under test.
const yamlModule = await loadDistModule<YamlModule>("yaml.js");
const inventoryArtifact = yamlModule.parseYamlDocument<{ artifact_families?: Record<string, unknown> }>(
  readFileSync(path.join(ROOT, "inventory", "yaml-mutation-surfaces.yaml"), "utf8"),
);
const inventoryFamilyNames = Object.keys(inventoryArtifact.artifact_families ?? {}).sort();

// The CLI runs inside other projects where this repository's working tree is absent, so the
// inventory must reach it through the bundled asset set rather than a checkout-only path.
const embeddedTemplates = await loadDistModule<EmbeddedTemplatesModule>("embedded-templates.js");
context.assert(
  embeddedTemplates.getEmbeddedTemplateKeys().includes("inventory/yaml-mutation-surfaces.yaml")
    && (embeddedTemplates.readEmbeddedTemplate("inventory/yaml-mutation-surfaces.yaml") ?? "").includes(
      "artifact_families:",
    ),
  "the mutation inventory is embedded in the bundled asset set rather than read only from the checkout",
);

const surfaceList = cli(["yaml-surface-list"], { cwd: ROOT });
context.assert(surfaceList.status === 0, "yaml-surface-list exits zero", `stderr: ${surfaceList.stderr.trim()}`);

const surfaceListPayload = JSON.parse(surfaceList.stdout) as {
  valid: boolean;
  inventoryPath: string;
  families: Array<{ kind: string; ownership: string; operations: Record<string, string> }>;
};
context.assert(
  JSON.stringify(surfaceListPayload.families.map((family) => family.kind)) === JSON.stringify(inventoryFamilyNames),
  "yaml-surface-list reports every inventoried artifact family exactly once",
  `surface: ${surfaceListPayload.families.map((family) => family.kind).join(",")}`,
);
context.assert(
  surfaceListPayload.families.every((family) =>
    ["create", "update", "named_remove", "delete"].every((operation) => typeof family.operations[operation] === "string")
  ),
  "yaml-surface-list reports all four operation states for every family",
);

// The inventory records config update as direct-write, so the surface must not claim an owner for
// it while the artifact-coverage milestone is still outstanding.
const surfaceShowConfig = cli(["yaml-surface-show", "workflow-config"], { cwd: ROOT });
context.assert(surfaceShowConfig.status === 0, "yaml-surface-show exits zero for a known artifact kind", `stderr: ${surfaceShowConfig.stderr.trim()}`);

const configFamily = (JSON.parse(surfaceShowConfig.stdout) as { family: SurfaceFamilyPayload }).family;
context.assert(
  configFamily.operations.create.state === "cli-owned"
    && configFamily.operations.create.cliOwned
    && configFamily.operations.create.commands.includes("init"),
  "yaml-surface-show names the owning command for a cli-owned operation",
  `create: ${JSON.stringify(configFamily.operations.create)}`,
);
context.assert(
  configFamily.operations.update.state === "direct-write"
    && configFamily.operations.update.cliOwned === false
    && configFamily.operations.update.commands.length === 0
    && configFamily.operations.update.note === "not yet CLI-owned",
  "yaml-surface-show reports a direct-write operation verbatim without claiming an owner",
  `update: ${JSON.stringify(configFamily.operations.update)}`,
);
context.assert(
  configFamily.schemaKey === "strict-spec-driven/schemas/config.yaml"
    && configFamily.declaredSchemaFile === "templates/strict-spec-driven/schemas/config.yaml"
    && configFamily.exampleKey === "examples/strict-spec-driven/config.yaml"
    && configFamily.artifactTypes[0]?.inspectWith.includes("schema-show config")
    && configFamily.artifactTypes[0]?.inspectWith.includes("sample-show config"),
  "yaml-surface-show identifies the schema key, declared schema_file, example key, and asset commands",
  `assets: ${JSON.stringify({ schemaKey: configFamily.schemaKey, exampleKey: configFamily.exampleKey })}`,
);

const unknownSurfaceShow = cli(["yaml-surface-show", "not-an-artifact-kind"], { cwd: ROOT });
const unknownSurfacePayload = JSON.parse(unknownSurfaceShow.stdout) as {
  valid: boolean;
  family?: unknown;
  diagnostics: Array<{ code: string; actual?: string }>;
};
context.assert(
  unknownSurfaceShow.status === 1
    && unknownSurfacePayload.valid === false
    && unknownSurfacePayload.family === undefined
    && unknownSurfacePayload.diagnostics.some(
      (diagnostic) => diagnostic.code === "unknown-artifact-kind" && diagnostic.actual === "not-an-artifact-kind",
    ),
  "yaml-surface-show rejects an unknown artifact kind with a deterministic diagnostic and no partial result",
  `stdout: ${unknownSurfaceShow.stdout.trim()}`,
);

// The CLI synchronizes the shared cache on startup, so an unusable cache is modelled by an
// existing regular file at the cache root: synchronization cannot create a directory there.
const blockedCacheRoot = path.join(mkdtempSync(path.join(os.tmpdir(), "strict-blocked-cache-")), "cache-root");
writeFileSync(blockedCacheRoot, "not a cache directory\n", "utf8");
try {
  const surfaceWithoutCache = cli(["yaml-surface-show", "workflow-config"], {
    cwd: ROOT,
    env: { STRICT_SPEC_SCHEMA_CACHE_DIR: blockedCacheRoot },
  });
  const withoutCachePayload = JSON.parse(surfaceWithoutCache.stdout) as {
    schemaCacheAvailable: boolean;
    family: SurfaceFamilyPayload;
  };
  context.assert(
    surfaceWithoutCache.status === 0
      && withoutCachePayload.schemaCacheAvailable === false
      && withoutCachePayload.family.schemaKey === "strict-spec-driven/schemas/config.yaml"
      && withoutCachePayload.family.exampleKey === "examples/strict-spec-driven/config.yaml"
      && withoutCachePayload.family.schemaFilePath === undefined
      && withoutCachePayload.family.exampleFilePath === undefined,
    "an unavailable shared schema cache still reports bundled keys and omits unresolved paths",
    `payload: ${surfaceWithoutCache.stdout.trim()}`,
  );
} finally {
  rmSync(path.dirname(blockedCacheRoot), { recursive: true, force: true });
}

const generateHelpJson = cli(["generate", "--help", "--json"], { cwd: ROOT });
const generateHelpPayload = JSON.parse(generateHelpJson.stdout) as {
  artifactSurface: Array<{ artifactKind: string; schemaKeys: string[]; exampleKeys: string[]; inspectWith: string[] }>;
};
context.assert(
  generateHelpPayload.artifactSurface.some(
    (entry) =>
      entry.artifactKind === "change-planning-state"
      && entry.schemaKeys.includes("strict-spec-driven/schemas/change-proposal.yaml")
      && entry.exampleKeys.includes("examples/strict-spec-driven/change-proposal.yaml")
      && entry.inspectWith.includes("schema-show change-proposal"),
  ),
  "JSON help for an artifact-authoring command names its artifact kinds, schema keys, example keys, and asset commands",
  `artifactSurface: ${JSON.stringify(generateHelpPayload.artifactSurface)}`,
);

const generateHelpText = cli(["generate", "--help"], { cwd: ROOT });
context.assert(
  generateHelpText.stdout.includes("Artifacts written:")
    && generateHelpText.stdout.includes("change-planning-state")
    && generateHelpText.stdout.includes("schema-show change-proposal"),
  "text help renders the same artifact surface as JSON help",
  `stdout: ${generateHelpText.stdout.trim()}`,
);

const surfaceMcpInventory = await loadDistModule<McpInventoryModule>("mcp/inventory.js");
const generateTool = surfaceMcpInventory.MCP_MUTATING_TOOL_INVENTORY.find((tool) => tool.cliCommand === "generate");
context.assert(
  generateTool !== undefined
    && generateTool.description.includes("Mutates")
    && generateTool.description.includes("change-planning-state"),
  "MCP tool descriptions state project-state mutation and the artifact kinds written",
  `description: ${generateTool?.description ?? "<missing>"}`,
);

const readOnlySurfaceTool = surfaceMcpInventory.MCP_READ_ONLY_TOOL_INVENTORY.find(
  (tool) => tool.cliCommand === "check-workflow-state",
);
context.assert(
  readOnlySurfaceTool !== undefined && !readOnlySurfaceTool.description.includes("Writes YAML artifact kinds"),
  "a command that authors no repository-owned YAML carries no artifact-surface clause",
  `description: ${readOnlySurfaceTool?.description ?? "<missing>"}`,
);

const cliRegistryModule = await loadDistModule<CliRegistryModule>("cli/registry.js");
context.assert(
  JSON.stringify(cliRegistryModule.COMMAND_REGISTRATION_ORDER) === JSON.stringify(expectedCommandOrder),
  "registry module preserves canonical command order",
);

context.section("[2] strict skill packaging validation");

const skillValidationModule = await loadDistModule<SkillValidationModule>("skills.js");
const packageValidation = skillValidationModule.validateStrictSkillPackaging(ROOT);
context.assert(packageValidation.valid, "strict skill package validation passes in repository state");
context.assert(packageValidation.summary.skillCount > 0, "strict skill package validation reports non-zero skill count");
context.assert(
  packageValidation.summary.skillCount === packageValidation.summary.marketplaceCount,
  "marketplace metadata count matches discovered strict skills",
);

const strictSkillNames = readdirSync(path.join(ROOT, "skills"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right));
context.assert(
  strictSkillNames.length === packageValidation.summary.skillCount,
  "skill directory count matches validation summary",
);
for (const skillName of strictSkillNames) {
  const skillContent = readFileSync(path.join(ROOT, "skills", skillName, "SKILL.md"), "utf8");
  const normalizedSkillContent = skillContent.replace(/\s+/g, " ");
  context.assert(
    normalizedSkillContent.includes("## Preferred Human Language")
      && normalizedSkillContent.includes("`.strict-spec-driven/config.yaml`")
      && normalizedSkillContent.includes("`preferred_human_language`")
      && normalizedSkillContent.includes("common human language")
      && normalizedSkillContent.includes("not a programming language")
      && normalizedSkillContent.includes("Comply with that configured common human language"),
    `${skillName} skill names and enforces preferred_human_language guidance`,
  );
}


const roadmapGuideContent = readFileSync(path.join(ROOT, "ROADMAP_GUIDE.md"), "utf8");
const normalizedRoadmapGuideContent = roadmapGuideContent.replace(/\s+/g, " ");
context.assert(
  normalizedRoadmapGuideContent.includes("## Change Intake Question Gate")
    && normalizedRoadmapGuideContent.includes("What do you want changed?")
    && normalizedRoadmapGuideContent.includes("What existing behavior must stay the same?")
    && normalizedRoadmapGuideContent.includes("Which existing technical rules apply, or do we need a new rule for this change?")
    && normalizedRoadmapGuideContent.includes("use the active request, selected roadmap planned-change details, main specs, technical standards, existing change artifacts, repository search results, and deterministic CLI output as evidence")
    && normalizedRoadmapGuideContent.includes("records it in `questions.yaml.open`")
    && normalizedRoadmapGuideContent.includes("Human-facing question text, context, recommendations, options, and summaries must use the `preferred_human_language`")
    && normalizedRoadmapGuideContent.includes("Stable technical values such as question ids, artifact fields, schema names, command names, and file paths remain stable identifiers")
    && normalizedRoadmapGuideContent.includes("Implementation handoff stops while required entries remain in `questions.yaml.open`")
    && normalizedRoadmapGuideContent.includes("Roadmap-backed proposal flows treat the selected standalone planned-change")
    && normalizedRoadmapGuideContent.includes("Complete roadmap detail should be carried into generated proposal artifacts instead of becoming a duplicate human question")
    && normalizedRoadmapGuideContent.includes("Thin roadmap detail, missing implementation/test/spec impact, dependency uncertainty, or technical-standard uncertainty should become localized `questions.yaml.open` blockers"),
  "roadmap guide documents the change-intake question gate checklist, evidence rule, localization rule, and handoff stop",
);

const readmeContent = readFileSync(path.join(ROOT, "README.md"), "utf8");
const readmeZhContent = readFileSync(path.join(ROOT, "README.zh.md"), "utf8");
const roadmapGuideZhContent = readFileSync(path.join(ROOT, "ROADMAP_GUIDE.zh.md"), "utf8");
const normalizedReadmeContent = readmeContent.replace(/\s+/g, " ");
const normalizedReadmeZhContent = readmeZhContent.replace(/\s+/g, " ");
const normalizedRoadmapGuideZhContent = roadmapGuideZhContent.replace(/\s+/g, " ");
context.assert(
  normalizedReadmeContent.includes("## Change Intake Question Gate")
    && normalizedReadmeContent.includes("does not ask the human again")
    && normalizedReadmeContent.includes("questions.yaml.open")
    && normalizedReadmeContent.includes("questions.yaml.resolved")
    && normalizedReadmeContent.includes("preferred_human_language")
    && normalizedReadmeContent.includes("Stable technical values such as question ids, artifact fields, schema names, command names, and file paths remain language-neutral identifiers"),
  "README documents the change-intake question gate, blocking behavior, resolution path, localization rule, and stable technical identifiers",
);
context.assert(
  normalizedReadmeZhContent.includes("## 变更接收问题门")
    && normalizedReadmeZhContent.includes("不会再向人重复提问")
    && normalizedReadmeZhContent.includes("questions.yaml.open")
    && normalizedReadmeZhContent.includes("questions.yaml.resolved")
    && normalizedReadmeZhContent.includes("preferred_human_language")
    && normalizedReadmeZhContent.includes("稳定技术值保持为不随语言变化的标识符"),
  "localized README documents the change-intake question gate and localization boundary",
);
context.assert(
  normalizedRoadmapGuideZhContent.includes("## 变更接收问题门")
    && normalizedRoadmapGuideZhContent.includes("检查清单意图包括")
    && normalizedRoadmapGuideZhContent.includes("选中的独立 planned-change `summary`")
    && normalizedRoadmapGuideZhContent.includes("`details`")
    && normalizedRoadmapGuideZhContent.includes("`depends_on`")
    && normalizedRoadmapGuideZhContent.includes("labels")
    && normalizedRoadmapGuideZhContent.includes("本地化的 `questions.yaml.open` 阻塞项")
    && normalizedRoadmapGuideZhContent.includes("面向人的问题文本、上下文、建议、选项和摘要必须使用")
    && normalizedRoadmapGuideZhContent.includes("稳定技术值保持为稳定标识符，不做本地化")
    && normalizedRoadmapGuideZhContent.includes("resolved question 状态"),
  "localized roadmap guide documents roadmap-backed question-gate evidence and blockers",
);

const validateSkillsCli = validateSkillsDispatch;
context.assert(validateSkillsCli.status === 0, "validate-skills CLI exits zero for valid strict skill packaging");
const validateSkillsJson = validateSkillsDispatchJson;
context.assert(validateSkillsJson.valid === true, "validate-skills CLI emits valid=true JSON");

  const reviewSkillContent = readFileSync(path.join(ROOT, "skills", "strict-spec-review", "SKILL.md"), "utf8");
  const archiveSkillContent = readFileSync(path.join(ROOT, "skills", "strict-spec-archive", "SKILL.md"), "utf8");
  const techSyncSkillContent = readFileSync(path.join(ROOT, "skills", "strict-tech-sync", "SKILL.md"), "utf8");
  const applySkillContent = readFileSync(path.join(ROOT, "skills", "strict-spec-apply", "SKILL.md"), "utf8");
  const proposeSkillContent = readFileSync(path.join(ROOT, "skills", "strict-spec-propose", "SKILL.md"), "utf8");
  const proposeFromRoadmapSkillContent = readFileSync(path.join(ROOT, "skills", "strict-spec-propose-from-roadmap", "SKILL.md"), "utf8");
  const autoSkillContent = readFileSync(path.join(ROOT, "skills", "strict-spec-auto", "SKILL.md"), "utf8");
  const brainstormSkillContent = readFileSync(path.join(ROOT, "skills", "strict-spec-brainstorm", "SKILL.md"), "utf8");
  const bugfixSkillContent = readFileSync(path.join(ROOT, "skills", "strict-spec-bugfix", "SKILL.md"), "utf8");
  const modifySkillContent = readFileSync(path.join(ROOT, "skills", "strict-spec-modify", "SKILL.md"), "utf8");
  const roadmapPlanSkillContent = readFileSync(path.join(ROOT, "skills", "strict-roadmap-plan", "SKILL.md"), "utf8");
  const roadmapArchiveSkillContent = readFileSync(path.join(ROOT, "skills", "strict-roadmap-archive", "SKILL.md"), "utf8");
  const roadmapRecommendSkillContent = readFileSync(path.join(ROOT, "skills", "strict-roadmap-recommend", "SKILL.md"), "utf8");
  const roadmapReviewSkillContent = readFileSync(path.join(ROOT, "skills", "strict-roadmap-review", "SKILL.md"), "utf8");
  const harnessInitSkillContent = readFileSync(path.join(ROOT, "skills", "strict-spec-harness-init", "SKILL.md"), "utf8");
  const harnessSessionSkillContent = readFileSync(path.join(ROOT, "skills", "strict-spec-harness-session", "SKILL.md"), "utf8");
  const initSkillContent = readFileSync(path.join(ROOT, "skills", "strict-spec-init", "SKILL.md"), "utf8");
  const workflowConfigContent = readFileSync(path.join(ROOT, ".strict-spec-driven", "config.yaml"), "utf8");
  const normalizedApplySkillContent = applySkillContent.replace(/\s+/g, " ");
  const normalizedReviewSkillContent = reviewSkillContent.replace(/\s+/g, " ");
  const normalizedArchiveSkillContent = archiveSkillContent.replace(/\s+/g, " ");
  const normalizedTechSyncSkillContent = techSyncSkillContent.replace(/\s+/g, " ");
  const normalizedProposeSkillContent = proposeSkillContent.replace(/\s+/g, " ");
  const normalizedProposeFromRoadmapSkillContent = proposeFromRoadmapSkillContent.replace(/\s+/g, " ");
  const normalizedAutoSkillContent = autoSkillContent.replace(/\s+/g, " ");
  const normalizedBrainstormSkillContent = brainstormSkillContent.replace(/\s+/g, " ");
  const normalizedBugfixSkillContent = bugfixSkillContent.replace(/\s+/g, " ");
  const normalizedModifySkillContent = modifySkillContent.replace(/\s+/g, " ");
  const normalizedRoadmapPlanSkillContent = roadmapPlanSkillContent.replace(/\s+/g, " ");
  const normalizedRoadmapArchiveSkillContent = roadmapArchiveSkillContent.replace(/\s+/g, " ");
  const normalizedRoadmapRecommendSkillContent = roadmapRecommendSkillContent.replace(/\s+/g, " ");
  const normalizedRoadmapReviewSkillContent = roadmapReviewSkillContent.replace(/\s+/g, " ");
  const normalizedHarnessInitSkillContent = harnessInitSkillContent.replace(/\s+/g, " ");
  const normalizedHarnessSessionSkillContent = harnessSessionSkillContent.replace(/\s+/g, " ");
  const normalizedInitSkillContent = initSkillContent.replace(/\s+/g, " ");
  const normalizedWorkflowConfigContent = workflowConfigContent.replace(/\s+/g, " ");
const questionGateSkillChecks: Array<[string, string]> = [
  [normalizedProposeSkillContent, "strict-spec-propose"],
  [normalizedAutoSkillContent, "strict-spec-auto"],
  [normalizedBugfixSkillContent, "strict-spec-bugfix"],
  [normalizedBrainstormSkillContent, "strict-spec-brainstorm"],
];
for (const [normalizedSkillContent, skillName] of questionGateSkillChecks) {
  context.assert(
    normalizedSkillContent.includes("Change Intake Question Gate")
      && normalizedSkillContent.includes("plain change-intake checklist")
      && normalizedSkillContent.includes("Do not ask the human for information already recoverable from the request or repository evidence")
      && normalizedSkillContent.includes("Do ask when a required answer remains absent after discovery")
      && normalizedSkillContent.includes("mapped implementation and test files")
      && normalizedSkillContent.includes("focused code search")
      && normalizedSkillContent.includes("questions.yaml.open")
      && normalizedSkillContent.includes("stable language-neutral ids")
      && normalizedSkillContent.includes("`preferred_human_language` question text")
      && normalizedSkillContent.includes("context that includes impact analysis and a recommended answer or options")
      && normalizedSkillContent.includes("The `questions` generator has no `--impact` or `--recommendation` flags")
      && normalizedSkillContent.includes("Stop before implementation while `questions.yaml.open` is non-empty")
      && normalizedSkillContent.includes("questions.yaml.resolved")
      && normalizedSkillContent.includes("where the work likely lives, how it will be tested, and which technical rules apply"),
    `${skillName} runs the change-intake question gate before implementation handoff`,
  );
}
const roadmapBackedIntakeSkillChecks: Array<[string, string]> = [
  [normalizedRoadmapRecommendSkillContent, "strict-roadmap-recommend"],
  [normalizedProposeFromRoadmapSkillContent, "strict-spec-propose-from-roadmap"],
];
for (const [normalizedSkillContent, skillName] of roadmapBackedIntakeSkillChecks) {
  context.assert(
    normalizedSkillContent.includes("Roadmap-Backed Intake Evidence")
      && normalizedSkillContent.includes("planned-change `summary`, `details`, `depends_on`, labels, and owning milestone")
      && normalizedSkillContent.includes("owning milestone `details`")
      && normalizedSkillContent.includes("Carry those answers into generated proposal, design, task, question, and delta artifacts instead of asking the human again")
      && normalizedSkillContent.includes("chooses exactly one eligible planned change through the scripted command")
      && normalizedSkillContent.includes("Do not mutate roadmap planned-change files during proposal creation")
      && normalizedSkillContent.includes("questions.yaml.open")
      && normalizedSkillContent.includes("preferred_human_language")
      && normalizedSkillContent.includes("proposal scope, spec delta, implementation files, tests, dependencies, or technical standards")
      && normalizedSkillContent.includes("thin roadmap details")
      && normalizedSkillContent.includes("missing implementation/test/spec impact"),
    `${skillName} uses roadmap-backed detail as change-intake evidence`,
  );
}
context.assert(
  normalizedAutoSkillContent.includes("When resuming a roadmap-backed scaffold")
    && normalizedAutoSkillContent.includes("selected standalone planned-change `summary`, `details`, `depends_on`, labels, and owning milestone `details` as valid intake evidence")
    && normalizedAutoSkillContent.includes("For roadmap-backed scaffolds, make the context say whether the uncertainty affects proposal scope, spec delta, implementation files, tests, dependencies, or technical standards")
    && normalizedAutoSkillContent.includes("preserve selected planned-change provenance as intake evidence"),
  "strict-spec-auto preserves roadmap-backed intake evidence when resuming populated scaffolds",
);
context.assert(
  normalizedReviewSkillContent.includes("complete project-level regression test evidence")
    && normalizedReviewSkillContent.includes("actionable setup or waiting guidance")
    && normalizedReviewSkillContent.includes("direct code review evidence")
    && normalizedReviewSkillContent.includes("Automatically fix safe in-scope review findings")
    && normalizedReviewSkillContent.includes("rerun strict verification plus the configured complete regression command after review-time changes")
    && normalizedReviewSkillContent.includes("Do not call or rely on a `strict-spec-cli review` command")
    && !reviewSkillContent.includes("strict-spec-cli review <change-name>"),
  "strict-spec-review requires direct code review, automatic safe fixes, and regression evidence before archive recommendation",
);
  context.assert(
  normalizedApplySkillContent.includes("~/.strict-spec-schemas/")
    && normalizedApplySkillContent.includes("When a YAML artifact already declares `schema_file`")
    && normalizedApplySkillContent.includes("sample-show")
    && normalizedApplySkillContent.includes("do not rely on a local `examples` directory")
    && normalizedProposeSkillContent.includes("~/.strict-spec-schemas/")
    && normalizedProposeSkillContent.includes("When a YAML artifact already declares `schema_file`")
    && normalizedProposeSkillContent.includes("sample-show")
    && normalizedProposeSkillContent.includes("do not rely on a local `examples` directory")
    && normalizedProposeFromRoadmapSkillContent.includes("~/.strict-spec-schemas/")
    && normalizedProposeFromRoadmapSkillContent.includes("When a YAML artifact already declares `schema_file`")
    && normalizedProposeFromRoadmapSkillContent.includes("sample-show")
    && normalizedProposeFromRoadmapSkillContent.includes("do not rely on a local `examples` directory")
    && normalizedAutoSkillContent.includes("~/.strict-spec-schemas/")
    && normalizedAutoSkillContent.includes("When a YAML artifact already declares `schema_file`")
    && normalizedAutoSkillContent.includes("sample-show")
    && normalizedAutoSkillContent.includes("do not rely on a local `examples` directory")
    && normalizedModifySkillContent.includes("~/.strict-spec-schemas/")
    && normalizedModifySkillContent.includes("When a YAML artifact already declares `schema_file`")
    && normalizedModifySkillContent.includes("sample-show")
    && normalizedModifySkillContent.includes("do not rely on a local `examples` directory"),
  "core YAML authoring skills mention shared schema cache and sample lookup guidance",
);
context.assert(
  normalizedProposeSkillContent.includes("proposal checkpoint")
      && normalizedProposeSkillContent.includes("strict-spec-propose-from-roadmap")
      && normalizedProposeSkillContent.includes("Do not auto-invoke `/strict-spec-auto` during strict-spec-propose")
      && normalizedProposeSkillContent.includes("before validation")
      && normalizedProposeSkillContent.includes("semantic self-check")
      && normalizedProposeSkillContent.includes("decision-ready detail")
      && normalizedProposeSkillContent.includes("scope, unchanged behavior, design decisions, task coverage, unresolved-question impact, delta spec scenarios, delta tech use when applicable, and structured mapping fields")
      && normalizedProposeSkillContent.includes("fix safe, in-scope documentation gaps")
      && normalizedProposeSkillContent.includes("Do not expand scope or answer unresolved human questions")
      && normalizedProposeSkillContent.includes("proposal checkpoint refinements made")
      && !normalizedProposeSkillContent.includes("roadmap-recommend")
      && !normalizedProposeSkillContent.includes("proposal review"),
    "strict-spec-propose runs a proposal checkpoint over generated planning artifacts before ready/verify handoff",
  );
  context.assert(
    normalizedProposeFromRoadmapSkillContent.includes("roadmap-recommend")
      && normalizedProposeFromRoadmapSkillContent.includes("treat the command's selected planned change as authoritative")
      && normalizedProposeFromRoadmapSkillContent.includes("roadmap-recommend: strict-spec-cli roadmap-recommend [--milestone <milestone-id>]")
      && normalizedProposeFromRoadmapSkillContent.includes("matching numeric prefix after ignoring leading zeros")
      && normalizedProposeFromRoadmapSkillContent.includes("strict-spec-cli roadmap-recommend --milestone <resolved-milestone-id>")
      && normalizedProposeFromRoadmapSkillContent.includes("matches zero milestones or more than one milestone")
      && normalizedProposeFromRoadmapSkillContent.includes("before reading broad roadmap context")
      && normalizedProposeFromRoadmapSkillContent.includes("candidates[].skipReasons")
      && normalizedProposeFromRoadmapSkillContent.includes("recommendation.changeName")
      && normalizedProposeFromRoadmapSkillContent.includes("`details` field")
      && normalizedProposeFromRoadmapSkillContent.includes("active strict change conflicts")
      && normalizedProposeFromRoadmapSkillContent.includes("standalone planned-change")
      && normalizedProposeFromRoadmapSkillContent.includes("Do not auto-invoke `/strict-spec-auto` during strict-spec-propose-from-roadmap")
      && normalizedProposeFromRoadmapSkillContent.includes("proposal checkpoint")
      && normalizedProposeFromRoadmapSkillContent.includes("decision-ready detail")
      && normalizedProposeFromRoadmapSkillContent.includes("scope, unchanged behavior, design decisions, task coverage, unresolved-question impact, delta spec scenarios, delta tech use when applicable, and structured mapping fields")
      && normalizedProposeFromRoadmapSkillContent.includes("fix safe, in-scope documentation gaps")
      && normalizedProposeFromRoadmapSkillContent.includes("ready <change-name>")
      && normalizedProposeFromRoadmapSkillContent.includes("verify <change-name>")
      && !normalizedProposeFromRoadmapSkillContent.includes("immediately invoke the /strict-spec-auto <change-name> skill")
      && !normalizedProposeFromRoadmapSkillContent.includes("proposal review"),
    "strict-spec-propose-from-roadmap handles scripted roadmap recommendation as proposal-only handoff",
  );
  context.assert(
    normalizedAutoSkillContent.includes("complete project-level regression test evidence")
      && normalizedAutoSkillContent.includes("stop before archive")
      && normalizedAutoSkillContent.includes("actionable setup or waiting guidance")
      && normalizedAutoSkillContent.includes("direct code review evidence")
      && normalizedAutoSkillContent.includes("Automatically fix safe in-scope review findings")
      && normalizedAutoSkillContent.includes("rerun strict verification plus the configured complete regression command after review-time changes")
      && normalizedAutoSkillContent.includes("correctness, spec alignment")
      && normalizedAutoSkillContent.includes("dedicated lint Testing task before full unit or regression test tasks")
      && normalizedAutoSkillContent.includes("Reset context from targeted files")
      && normalizedAutoSkillContent.includes("resume the existing populated strict change scaffold without regenerating planning artifacts")
      && normalizedAutoSkillContent.includes("exactly matches the configured complete project regression command")
      && normalizedAutoSkillContent.includes("proposal checkpoint")
      && normalizedAutoSkillContent.includes("semantic self-check")
      && normalizedAutoSkillContent.includes("decision-ready detail")
      && normalizedAutoSkillContent.includes("scope, unchanged behavior, design decisions, task coverage, unresolved-question impact, delta spec scenarios, delta tech use when applicable, and structured mapping fields")
      && normalizedAutoSkillContent.includes("fix safe, in-scope documentation gaps")
      && normalizedAutoSkillContent.includes("Do not expand scope or answer unresolved human questions")
      && !autoSkillContent.includes("strict-spec-cli review <change-name>"),
    "strict-spec-auto runs proposal checkpoints, resumes populated scaffolds, and blocks archive without automatic safe fixes, complete regression, and direct code review evidence",
  );
  const techConventionReflectionAnchor =
    "reusable engineering convention not yet captured under `.strict-spec-driven/tech/`";
  context.assert(
    normalizedReviewSkillContent.includes(techConventionReflectionAnchor)
      && normalizedReviewSkillContent.includes("(non-blocking)")
      && normalizedReviewSkillContent.includes("mandatory final current-change tech sync")
      && normalizedReviewSkillContent.includes("may not be deferred until after archive")
      && normalizedAutoSkillContent.includes(techConventionReflectionAnchor)
      && normalizedAutoSkillContent.includes("early reflection does not by itself block")
      && normalizedAutoSkillContent.includes("mandatory final current-change tech sync")
      && normalizedAutoSkillContent.includes("may not be deferred until after the change is archived"),
    "strict-spec-review and strict-spec-auto keep early convention reflection non-blocking while deferring only to the final pre-archive sync",
  );
  context.assert(
    normalizedTechSyncSkillContent.includes("active-change sync")
      && normalizedTechSyncSkillContent.includes("selected change's proposal, design, tasks, questions, delta specs, delta tech, structured mappings")
      && normalizedTechSyncSkillContent.includes("attributable tracked and untracked files")
      && normalizedTechSyncSkillContent.includes("explicitly approves both the normative content and its strength")
      && normalizedTechSyncSkillContent.includes("generate <change-name> delta-tech")
      && normalizedTechSyncSkillContent.includes("never edit a live main standard directly")
      && normalizedTechSyncSkillContent.includes("use `tech-edit` for live standards only in standalone mode")
      && normalizedTechSyncSkillContent.includes("Never hand-edit main-tech or tech-index YAML")
      && normalizedArchiveSkillContent.includes("final current-change tech sync")
      && normalizedArchiveSkillContent.includes("explicitly classifies the pattern as not reusable")
      && normalizedArchiveSkillContent.includes("Never defer a confirmed reusable convention until after archive")
      && normalizedArchiveSkillContent.includes("rerun the configured complete project regression evidence")
      && normalizedArchiveSkillContent.includes("raw command only as the deterministic")
      && normalizedAutoSkillContent.includes("Run the final current-change tech sync")
      && normalizedAutoSkillContent.includes("explicitly classify the pattern as not reusable")
      && normalizedAutoSkillContent.includes("confirmed as reusable cannot be deferred until after archive")
      && normalizedAutoSkillContent.includes("rerun the configured complete project regression evidence"),
    "tech sync, archive, and automatic workflows enforce bounded current-change delta-tech capture before deterministic archive",
  );
  context.assert(
    normalizedBrainstormSkillContent.includes("proposal checkpoint")
      && normalizedBrainstormSkillContent.includes("before validation")
      && normalizedBrainstormSkillContent.includes("semantic self-check")
      && normalizedBrainstormSkillContent.includes("confirmed brainstorm summary")
      && normalizedBrainstormSkillContent.includes("decision-ready detail")
      && normalizedBrainstormSkillContent.includes("scope, unchanged behavior, design decisions, task coverage, unresolved-question impact, delta spec scenarios, delta tech use when applicable, and structured mapping fields")
      && normalizedBrainstormSkillContent.includes("fix safe, in-scope documentation gaps")
      && normalizedBrainstormSkillContent.includes("Do not expand scope or answer unresolved human questions")
      && normalizedBrainstormSkillContent.includes("proposal checkpoint refinements made")
      && !normalizedBrainstormSkillContent.includes("proposal review"),
    "strict-spec-brainstorm runs a proposal checkpoint over generated planning artifacts before ready/verify handoff",
  );
  context.assert(
    normalizedBrainstormSkillContent.includes("A strict change may legitimately have no delta spec")
      && normalizedBrainstormSkillContent.includes("Do not invent a `delta-spec` just to satisfy artifact shape")
      && normalizedBrainstormSkillContent.includes("script or tooling edits")
      && normalizedBrainstormSkillContent.includes("validation commands")
      && normalizedBrainstormSkillContent.includes("`ready`/`verify` checks")
      && normalizedBrainstormSkillContent.includes("archive-readiness checks")
      && normalizedBrainstormSkillContent.includes("archive or archive-merge checks"),
    "strict-spec-brainstorm explains technical-only changes can omit delta specs while still covering scripts, validation, verification, and archive checks",
  );
  const technicalOnlyChangeCreationSkillChecks: Array<[string, string]> = [
    [normalizedProposeSkillContent, "strict-spec-propose"],
    [normalizedAutoSkillContent, "strict-spec-auto"],
    [normalizedProposeFromRoadmapSkillContent, "strict-spec-propose-from-roadmap"],
    [normalizedRoadmapRecommendSkillContent, "strict-roadmap-recommend"],
  ];
  const incrementalDeltaScenarioGuidanceChecks: Array<[string, string]> = [
    [normalizedProposeSkillContent, "strict-spec-propose"],
    [normalizedProposeFromRoadmapSkillContent, "strict-spec-propose-from-roadmap"],
    [normalizedAutoSkillContent, "strict-spec-auto"],
    [normalizedBrainstormSkillContent, "strict-spec-brainstorm"],
    [normalizedBugfixSkillContent, "strict-spec-bugfix"],
    [normalizedRoadmapRecommendSkillContent, "strict-roadmap-recommend"],
  ];
  for (const [normalizedSkillContent, skillName] of incrementalDeltaScenarioGuidanceChecks) {
    context.assert(
      normalizedSkillContent.includes("One requirement can include multiple scenario groups by repeating `--scenario`")
        && normalizedSkillContent.includes("later compatible call for the same operation, requirement id, strength, and statement appends new scenario ids")
        && normalizedSkillContent.includes("remains idempotent for equivalent scenarios")
        && normalizedSkillContent.includes("Scenarios append on their own, so nothing needs rebuilding or hand-editing to add one")
        && normalizedSkillContent.includes("Drop a single scenario with `--remove-scenario <requirement-id>:<scenario-id>`"),
      `${skillName} documents non-destructive incremental delta scenario generation`,
    );
  }
  for (const [normalizedSkillContent, skillName] of technicalOnlyChangeCreationSkillChecks) {
    context.assert(
      normalizedSkillContent.includes("A strict change may legitimately have no delta spec")
        && normalizedSkillContent.includes("Do not invent a `delta-spec` just to satisfy artifact shape")
        && normalizedSkillContent.includes("only when the change has observable spec impact")
        && normalizedSkillContent.includes("leave the `specs/` directory empty rather than inventing a prose-only file")
        && normalizedSkillContent.includes("script or tooling")
        && normalizedSkillContent.includes("validation commands")
        && normalizedSkillContent.includes("`ready`/`verify`")
        && normalizedSkillContent.includes("archive or archive-merge checks"),
      `${skillName} explains technical-only changes can omit delta specs while still covering scripts, validation, verification, and archive checks`,
    );
  }
  context.assert(
    normalizedBugfixSkillContent.includes("A bugfix may legitimately have no delta spec")
      && normalizedBugfixSkillContent.includes("Do not invent a `delta-spec` just to satisfy artifact shape")
      && normalizedBugfixSkillContent.includes("purely internal defects in scripts, validation flows, archive behavior")
      && normalizedBugfixSkillContent.includes("reproduction evidence")
      && normalizedBugfixSkillContent.includes("validation commands")
      && normalizedBugfixSkillContent.includes("`ready`/`verify`")
      && normalizedBugfixSkillContent.includes("archive or archive-merge checks"),
    "strict-spec-bugfix explains internal technical bugfixes can omit delta specs while still covering reproduction, validation, verification, and archive checks",
  );
  context.assert(
    normalizedBugfixSkillContent.includes("known bug")
      && normalizedBugfixSkillContent.includes("Reproduce before fixing")
      && normalizedBugfixSkillContent.includes("failing regression")
      && normalizedBugfixSkillContent.includes("minimal fix")
      && normalizedBugfixSkillContent.includes("strict-spec-debug-session")
      && normalizedBugfixSkillContent.includes("strict-spec-brainstorm")
      && normalizedBugfixSkillContent.includes("proposal checkpoint")
      && normalizedBugfixSkillContent.includes("fix safe, in-scope documentation gaps")
      && normalizedBugfixSkillContent.includes("direct review")
      && normalizedBugfixSkillContent.includes("Automatically fix safe in-scope review findings")
      && normalizedBugfixSkillContent.includes("rerun strict verification plus the configured complete regression command after review-time changes")
      && normalizedBugfixSkillContent.includes("Do not call or rely on a `strict-spec-cli review` command")
      && !bugfixSkillContent.includes("strict-spec-cli review <change-name>"),
    "strict-spec-bugfix is constrained to known bugs with reproduction, regression coverage, minimal fixes, and debug-session handoff for unclear issues",
  );
  context.assert(
    roadmapPlanSkillContent.includes("check-workflow-state: strict-spec-cli check-workflow-state")
      && roadmapPlanSkillContent.includes("roadmap-generate-milestone: strict-spec-cli roadmap-generate milestone --<named-args>")
      && roadmapPlanSkillContent.includes("roadmap-generate-planned-change: strict-spec-cli roadmap-generate planned-change")
      && normalizedRoadmapPlanSkillContent.includes("Before any other step, run `strict-spec-cli check-workflow-state`")
      && normalizedRoadmapPlanSkillContent.includes("stop immediately and tell the user to run `/strict-spec-init`")
      && normalizedRoadmapPlanSkillContent.includes("roadmap-generate milestone")
      && normalizedRoadmapPlanSkillContent.includes("<milestone-id>-<planned-change-id>.yaml")
      && normalizedRoadmapPlanSkillContent.includes("never choose or edit planned-change filenames by hand")
      && normalizedRoadmapPlanSkillContent.includes("roadmap-sync --fix-names")
      && normalizedRoadmapPlanSkillContent.includes("executable planning context")
      && normalizedRoadmapPlanSkillContent.includes("Review the roadmap plan before handoff")
      && !roadmapPlanSkillContent.includes("strict-spec-cli init"),
    "strict-roadmap-plan requires existing strict workflow state, CLI-owned planned-change naming, executable detail guidance, and review guidance",
  );
  context.assert(
    roadmapArchiveSkillContent.includes("roadmap-archive: strict-spec-cli roadmap-archive [milestone-id]")
      && normalizedRoadmapArchiveSkillContent.includes("default to all unarchived milestones")
      && normalizedRoadmapArchiveSkillContent.includes("only milestones whose derived status is complete")
      && normalizedRoadmapArchiveSkillContent.includes("completed standalone planned-change")
      && !roadmapArchiveSkillContent.includes("strict-spec-cli init"),
    "strict-roadmap-archive validates default-all completed milestone guidance",
  );
  context.assert(
    roadmapRecommendSkillContent.includes("roadmap-recommend: strict-spec-cli roadmap-recommend [--milestone <milestone-id>]")
      && normalizedRoadmapRecommendSkillContent.includes("treat the command's selected planned change as authoritative")
      && normalizedRoadmapRecommendSkillContent.includes("matching numeric prefix after ignoring leading zeros")
      && normalizedRoadmapRecommendSkillContent.includes("strict-spec-cli roadmap-recommend --milestone <resolved-milestone-id>")
      && normalizedRoadmapRecommendSkillContent.includes("matches zero milestones or more than one milestone")
      && normalizedRoadmapRecommendSkillContent.includes("before reading broad roadmap context")
      && normalizedRoadmapRecommendSkillContent.includes("Use `ready` as the proposal handoff validation")
      && normalizedRoadmapRecommendSkillContent.includes("populated change scaffold")
      && normalizedRoadmapRecommendSkillContent.includes("proposal checkpoint")
      && normalizedRoadmapRecommendSkillContent.includes("decision-ready detail")
      && normalizedRoadmapRecommendSkillContent.includes("scope, unchanged behavior, design decisions, task coverage, unresolved-question impact, delta spec scenarios, delta tech use when applicable, and structured mapping fields")
      && normalizedRoadmapRecommendSkillContent.includes("fix safe, in-scope documentation gaps")
      && normalizedRoadmapRecommendSkillContent.includes("instead of manually choosing among planned changes"),
    "strict-roadmap-recommend requires scripted-first recommendation, proposal checkpoint, ready handoff, and populated auto resume guidance",
  );
  context.assert(
    !existsSync(path.join(ROOT, "skills", "strict-roadmap-propose")),
    "strict-roadmap-propose skill package is not part of the repository",
  );
  context.assert(
    roadmapReviewSkillContent.includes("roadmap-status: strict-spec-cli roadmap-status")
      && roadmapReviewSkillContent.includes("roadmap-generate-milestone: strict-spec-cli roadmap-generate milestone --<named-args>")
      && roadmapReviewSkillContent.includes("roadmap-generate-planned-change: strict-spec-cli roadmap-generate planned-change")
      && roadmapReviewSkillContent.includes("roadmap-sync: strict-spec-cli roadmap-sync")
      && normalizedRoadmapReviewSkillContent.includes("all milestones whose status is not complete")
      && normalizedRoadmapReviewSkillContent.includes("use roadmap-generate milestone for milestone YAML shape")
      && normalizedRoadmapReviewSkillContent.includes("<milestone-id>-<planned-change-id>.yaml")
      && normalizedRoadmapReviewSkillContent.includes("roadmap-sync --fix-names")
      && normalizedRoadmapReviewSkillContent.includes("concrete and executable")
      && normalizedRoadmapReviewSkillContent.includes("check milestone intake_questions for answer evidence")
      && normalizedRoadmapReviewSkillContent.includes("goal`, `scope`, `done_criteria`, `dependencies`, `risks`, `details`, `notes`")
      && normalizedRoadmapReviewSkillContent.includes("owned planned-change `summary`, `details`, `depends_on`, and metadata")
      && normalizedRoadmapReviewSkillContent.includes("Do not record milestone-level intake gaps in change-level `questions.yaml`"),
    "strict-roadmap-review validates all-incomplete milestone, direct-fix, and intake-answer guidance",
  );
  context.assert(
    harnessInitSkillContent.includes("check-workflow-state: strict-spec-cli check-workflow-state")
      && normalizedHarnessInitSkillContent.includes("Before any other step, run `strict-spec-cli check-workflow-state`")
      && normalizedHarnessInitSkillContent.includes("template-show scaffold/harness.yaml")
      && normalizedHarnessInitSkillContent.includes("harness-infer")
      && normalizedHarnessInitSkillContent.includes("harness-doctor")
      && normalizedHarnessInitSkillContent.includes("harness-scripts generate")
      && normalizedHarnessInitSkillContent.includes("Treat `harness-infer` output as a draft")
      && normalizedHarnessInitSkillContent.includes("stop immediately and tell the user to run `/strict-spec-init`")
      && !harnessInitSkillContent.includes("strict-spec-cli init"),
    "strict-spec-harness-init requires existing strict workflow state and generates harness scripts",
  );
  context.assert(
    normalizedHarnessSessionSkillContent.includes("harness-session create")
      && normalizedHarnessSessionSkillContent.includes("harness-session validate")
      && normalizedHarnessSessionSkillContent.includes("harness-plan")
      && normalizedHarnessSessionSkillContent.includes("harness-start")
      && normalizedHarnessSessionSkillContent.includes("harness-stop")
      && normalizedHarnessSessionSkillContent.includes("human_checkpoints")
      && normalizedHarnessSessionSkillContent.includes("secrets_recorded: false")
      && normalizedHarnessSessionSkillContent.includes("generated `scripts/harness-*` wrappers")
      && !normalizedHarnessSessionSkillContent.includes("debug-session artifacts"),
    "strict-spec-harness-session covers creation, validation, harness lifecycle, human checkpoints, and secret boundaries",
  );
  context.assert(
    normalizedInitSkillContent.includes("Ensure AGENTS.md exists")
      && normalizedInitSkillContent.includes("generate a concise `AGENTS.md`")
      && normalizedInitSkillContent.includes("never overwrite an existing `AGENTS.md`"),
    "strict-spec-init directs the agent to generate AGENTS.md when missing and never overwrite an existing one",
  );
  context.assert(
    cli(["dev-session-plan"], { cwd: ROOT }).status !== 0
      && cli(["debug-session-create", "legacy"], { cwd: ROOT }).status !== 0,
    "retired dev-session and debug-session commands are not compatibility aliases",
  );
  context.assert(
    normalizedWorkflowConfigContent.includes("review_evidence:")
      && normalizedWorkflowConfigContent.includes("command: bun scripts/coverage-gate.ts --threshold 78")
    && normalizedWorkflowConfigContent.includes("complete project-level regression suite"),
  "workflow config documents the coverage-enforcing complete project regression command and review meaning",
);

const noTemplateSymlinkRoot = mkdtempSync(path.join(os.tmpdir(), "strict-skill-no-template-symlink-"));
try {
  const noTemplateSkillDir = path.join(noTemplateSymlinkRoot, "skills", "strict-spec-demo");
  mkdirSync(path.join(noTemplateSymlinkRoot, "dist", "scripts"), { recursive: true });
  mkdirSync(noTemplateSkillDir, { recursive: true });
  symlinkSync("../../dist/scripts", path.join(noTemplateSkillDir, "scripts"));

  writeFileSync(
    path.join(noTemplateSkillDir, "SKILL.md"),
    [
      "---",
      "name: strict-spec-demo",
      "description: demo",
      "metadata:",
      "  skill_id: strict_spec_demo",
      "  author: strict-spec-driven",
      "  type: agent_skill",
      "  version: 1.0.0",
      "---",
      "",
      "# strict-spec-demo",
      "",
      "## This Skill's Commands",
      "",
      "```yaml",
      "check-workflow-state: strict-spec-cli check-workflow-state",
      "demo: strict-spec-cli verify demo",
      "```",
      "",
      "## Prerequisites",
      "",
      "Run `strict-spec-cli check-workflow-state` before any workflow work. If `.strict-spec-driven/` is missing, stop immediately and tell the user to run `/strict-spec-init`. Do not run `init` from this skill.",
      "",
      "## Steps",
      "",
      "Before any other step, run `strict-spec-cli check-workflow-state`. If `.strict-spec-driven/` is missing, stop immediately and tell the user to run `/strict-spec-init`. Do not run `init` from this skill.",
      "",
      "1. **Run the demo command** — inspect strict workflow artifacts under `.strict-spec-driven/`.",
      "",
      "## Rules",
      "",
      "- Use strict workflow artifacts under `.strict-spec-driven/`.",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(noTemplateSymlinkRoot, "skills", "marketplace.json"),
    JSON.stringify(
      {
        schema: "strict-spec-driven/skill-marketplace/v1",
        namespace: "strict-spec-driven",
        skills: [{ name: "strict-spec-demo", family: "strict-spec" }],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const noTemplateResult = skillValidationModule.validateStrictSkillPackaging(noTemplateSymlinkRoot);
  context.assert(
    noTemplateResult.valid,
    "strict skill package validation permits missing templates symlink",
    JSON.stringify(noTemplateResult.diagnostics),
  );
} finally {
  rmSync(noTemplateSymlinkRoot, { recursive: true, force: true });
}

const staleMarketplaceEntryRoot = mkdtempSync(path.join(os.tmpdir(), "strict-skill-stale-marketplace-entry-"));
try {
  const staleMarketplaceSkillDir = path.join(staleMarketplaceEntryRoot, "skills", "strict-spec-demo");
  mkdirSync(path.join(staleMarketplaceEntryRoot, "dist", "scripts"), { recursive: true });
  mkdirSync(staleMarketplaceSkillDir, { recursive: true });
  symlinkSync("../../dist/scripts", path.join(staleMarketplaceSkillDir, "scripts"));

  writeFileSync(
    path.join(staleMarketplaceSkillDir, "SKILL.md"),
    [
      "---",
      "name: strict-spec-demo",
      "description: demo",
      "metadata:",
      "  skill_id: strict_spec_demo",
      "  author: strict-spec-driven",
      "  type: agent_skill",
      "  version: 1.0.0",
      "---",
      "",
      "# strict-spec-demo",
      "",
      "## This Skill's Commands",
      "",
      "```yaml",
      "check-workflow-state: strict-spec-cli check-workflow-state",
      "demo: strict-spec-cli verify demo",
      "```",
      "",
      "## Prerequisites",
      "",
      "Run `strict-spec-cli check-workflow-state` before any workflow work. If `.strict-spec-driven/` is missing, stop immediately and tell the user to run `/strict-spec-init`. Do not run `init` from this skill.",
      "",
      "## Steps",
      "",
      "Before any other step, run `strict-spec-cli check-workflow-state`. If `.strict-spec-driven/` is missing, stop immediately and tell the user to run `/strict-spec-init`. Do not run `init` from this skill.",
      "",
      "1. **Run the demo command** — inspect strict workflow artifacts under `.strict-spec-driven/`.",
      "",
      "## Rules",
      "",
      "- Use strict workflow artifacts under `.strict-spec-driven/`.",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(staleMarketplaceEntryRoot, "skills", "marketplace.json"),
    JSON.stringify(
      {
        schema: "strict-spec-driven/skill-marketplace/v1",
        namespace: "strict-spec-driven",
        skills: [
          { name: "strict-spec-demo", family: "strict-spec" },
          { name: "strict-roadmap-propose", family: "strict-roadmap" },
          { name: "spec-driven-propose", family: "spec-driven" },
          { family: "strict-spec" },
          ["strict-spec-list-entry"],
        ],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const staleMarketplaceResult = skillValidationModule.validateStrictSkillPackaging(staleMarketplaceEntryRoot);
  context.assert(
    !staleMarketplaceResult.valid,
    "strict skill package validation fails when marketplace metadata lists a removed skill",
  );
  context.assert(
    staleMarketplaceResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skills.marketplace.skills.mismatch"
        && typeof diagnostic.actual === "string"
        && diagnostic.actual.includes("strict-roadmap-propose"),
    ),
    "stale marketplace entry reports a marketplace/skill-directory mismatch diagnostic naming the removed skill",
  );
  context.assert(
    staleMarketplaceResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skills.marketplace.skills.entry.name.legacy"
        && diagnostic.actual === "spec-driven-propose",
    ),
    "legacy-prefixed marketplace entry reports a strict-name-prefix diagnostic",
  );
  context.assert(
    staleMarketplaceResult.diagnostics.some(
      (diagnostic) => diagnostic.code === "skills.marketplace.skills.entry.name.missing",
    ),
    "marketplace entry without a name reports a missing-name diagnostic",
  );
  context.assert(
    staleMarketplaceResult.diagnostics.some(
      (diagnostic) => diagnostic.code === "skills.marketplace.skills.entry.invalid",
    ),
    "non-object marketplace entry reports an invalid-entry diagnostic",
  );

  const staleMarketplaceCli = cli(["validate-skills"], { cwd: staleMarketplaceEntryRoot });
  context.assert(
    staleMarketplaceCli.status !== 0,
    "validate-skills CLI exits non-zero when marketplace metadata lists a removed skill",
  );
  const staleMarketplaceCliJson = JSON.parse(staleMarketplaceCli.stdout.trim());
  context.assert(
    staleMarketplaceCliJson.valid === false
      && Array.isArray(staleMarketplaceCliJson.diagnostics)
      && staleMarketplaceCliJson.diagnostics.some(
        (diagnostic: { code?: string }) => diagnostic.code === "skills.marketplace.skills.mismatch",
      )
      && staleMarketplaceCliJson.diagnostics.some(
        (diagnostic: { code?: string }) => diagnostic.code === "skills.marketplace.skills.entry.name.legacy",
      )
      && staleMarketplaceCliJson.diagnostics.some(
        (diagnostic: { code?: string }) => diagnostic.code === "skills.marketplace.skills.entry.name.missing",
      )
      && staleMarketplaceCliJson.diagnostics.some(
        (diagnostic: { code?: string }) => diagnostic.code === "skills.marketplace.skills.entry.invalid",
      ),
    "validate-skills CLI surfaces marketplace mismatch and entry diagnostics for stale metadata",
  );
} finally {
  rmSync(staleMarketplaceEntryRoot, { recursive: true, force: true });
}

const invalidSkillsRoot = mkdtempSync(path.join(os.tmpdir(), "strict-skill-validation-invalid-"));
try {
  const invalidSkillsDir = path.join(invalidSkillsRoot, "skills", "strict-spec-demo");
  mkdirSync(invalidSkillsDir, { recursive: true });

  writeFileSync(
    path.join(invalidSkillsDir, "SKILL.md"),
    [
      "---",
      "name: strict-spec-demo",
      "description: demo",
      "metadata:",
      "  skill_id: strict_spec_demo",
      "  author: strict-spec-driven",
      "  type: agent_skill",
      "  version: 1.0.0",
      "---",
      "",
      "# strict-spec-demo",
      "",
      "## This Skill's Commands",
      "",
      "```yaml",
      "init: strict-spec-cli init",
      "demo: strict-spec-cli verify demo",
      "```",
      "",
      "## Notes",
      "",
      "Legacy reference: .spec-driven/changes",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(invalidSkillsRoot, "skills", "marketplace.json"),
    JSON.stringify(
      {
        schema: "strict-spec-driven/skill-marketplace/v1",
        namespace: "strict-spec-driven",
        skills: [{ name: "strict-spec-demo", family: "strict-spec" }],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const invalidResultA = skillValidationModule.validateStrictSkillPackaging(invalidSkillsRoot);
  const invalidResultB = skillValidationModule.validateStrictSkillPackaging(invalidSkillsRoot);
  context.assert(!invalidResultA.valid, "strict skill package validation fails for invalid packaging state");
  context.assert(
    invalidResultA.diagnostics.some((diagnostic) => diagnostic.code === "skill.scripts_symlink.missing"),
    "invalid packaging reports missing scripts symlink diagnostic",
  );
  context.assert(
    invalidResultA.diagnostics.some((diagnostic) => diagnostic.code === "skill.reference.legacy_workflow_dir"),
    "invalid packaging reports stale legacy workflow reference diagnostic",
  );
  context.assert(
    invalidResultA.diagnostics.some((diagnostic) => diagnostic.code === "skill.strict_workflow.precheck.missing"),
    "invalid packaging reports missing strict workflow precheck guidance",
  );
  context.assert(
    invalidResultA.diagnostics.some((diagnostic) => diagnostic.code === "skill.strict_workflow.check_command.missing"),
    "invalid packaging reports missing strict workflow check command mapping",
  );
  context.assert(
    invalidResultA.diagnostics.some((diagnostic) => diagnostic.code === "skill.strict_workflow.init_command.forbidden"),
    "invalid packaging reports forbidden init fallback command usage",
  );
  context.assert(
    JSON.stringify(invalidResultA) === JSON.stringify(invalidResultB),
    "strict skill package diagnostics are deterministic across runs",
  );

  const invalidValidateSkillsCliA = cli(["validate-skills"], { cwd: invalidSkillsRoot });
  const invalidValidateSkillsCliB = cli(["validate-skills"], { cwd: invalidSkillsRoot });
  context.assert(invalidValidateSkillsCliA.status !== 0, "validate-skills CLI exits non-zero for invalid packaging state");
  context.assert(
    invalidValidateSkillsCliA.stdout.trim() === invalidValidateSkillsCliB.stdout.trim(),
    "validate-skills CLI preserves diagnostic ordering across repeated invalid runs",
  );
} finally {
  rmSync(invalidSkillsRoot, { recursive: true, force: true });
}

const malformedSkillsRoot = mkdtempSync(path.join(os.tmpdir(), "strict-skill-validation-malformed-"));
try {
  const malformedSkillDir = path.join(malformedSkillsRoot, "skills", "strict-spec-malformed");
  mkdirSync(path.join(malformedSkillsRoot, "dist", "scripts"), { recursive: true });
  mkdirSync(path.join(malformedSkillsRoot, "dist", "templates"), { recursive: true });
  mkdirSync(malformedSkillDir, { recursive: true });

  symlinkSync("../../dist/scripts", path.join(malformedSkillDir, "scripts"));
  symlinkSync("../../dist/templates", path.join(malformedSkillDir, "templates"));

  writeFileSync(
    path.join(malformedSkillDir, "SKILL.md"),
    [
      "---",
      "name: strict-spec-malformed",
      "\tdescription: malformed frontmatter",
      "metadata:",
      "  skill_id: strict_spec_malformed",
      "  author: strict-spec-driven",
      "  type: agent_skill",
      "  version: 1.0.0",
      "---",
      "",
      "# strict-spec-malformed",
      "",
      "## This Skill's Commands",
      "",
      "```yaml",
      "demo: strict-spec-cli verify demo",
      "```",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(malformedSkillsRoot, "skills", "marketplace.json"),
    JSON.stringify(
      {
        schema: "strict-spec-driven/skill-marketplace/v1",
        namespace: "strict-spec-driven",
        skills: [{ name: "strict-spec-malformed", family: "strict-spec" }],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const malformedResult = skillValidationModule.validateStrictSkillPackaging(malformedSkillsRoot);
  const malformedDiagnostic = malformedResult.diagnostics.find(
    (diagnostic) => diagnostic.code === "skill.frontmatter.parse_error",
  );
  context.assert(!malformedResult.valid, "validate-skills fails for malformed YAML frontmatter");
  context.assert(Boolean(malformedDiagnostic), "validate-skills surfaces malformed frontmatter parse diagnostics");
  context.assert(
    malformedDiagnostic?.line === 2 && malformedDiagnostic.column === 1,
    "validate-skills malformed YAML diagnostics include line and column",
    `line: ${malformedDiagnostic?.line ?? "missing"} column: ${malformedDiagnostic?.column ?? "missing"}`,
  );
  context.assert(
    malformedDiagnostic?.offendingCharacter?.includes("tab") === true,
    "validate-skills malformed YAML diagnostics identify the offending special character",
    `offending character: ${malformedDiagnostic?.offendingCharacter ?? "missing"}`,
  );
  context.assert(
    Boolean(malformedDiagnostic?.snippet?.includes("description")),
    "validate-skills malformed YAML diagnostics include a YAML snippet",
  );
} finally {
  rmSync(malformedSkillsRoot, { recursive: true, force: true });
}

const invalidCoreSkillRoot = mkdtempSync(path.join(os.tmpdir(), "strict-core-skill-validation-invalid-"));
try {
  const invalidCoreSkillDir = path.join(invalidCoreSkillRoot, "skills", "strict-spec-init");
  mkdirSync(path.join(invalidCoreSkillRoot, "dist", "scripts"), { recursive: true });
  mkdirSync(path.join(invalidCoreSkillRoot, "dist", "templates"), { recursive: true });
  mkdirSync(invalidCoreSkillDir, { recursive: true });

  symlinkSync("../../dist/scripts", path.join(invalidCoreSkillDir, "scripts"));
  symlinkSync("../../dist/templates", path.join(invalidCoreSkillDir, "templates"));

  writeFileSync(
    path.join(invalidCoreSkillDir, "SKILL.md"),
    [
      "---",
      "name: strict-spec-init",
      "description: stub",
      "metadata:",
      "  skill_id: strict_spec_init",
      "  author: strict-spec-driven",
      "  type: agent_skill",
      "  version: 1.0.0",
      "---",
      "",
      "# strict-spec-init",
      "",
      "## This Skill's Commands",
      "",
      "```yaml",
      "cli: strict-spec-cli <command>",
      "```",
      "",
      "## Prerequisites",
      "",
      "Use strict workflow artifacts under .strict-spec-driven/.",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(invalidCoreSkillRoot, "skills", "marketplace.json"),
    JSON.stringify(
      {
        schema: "strict-spec-driven/skill-marketplace/v1",
        namespace: "strict-spec-driven",
        skills: [{ name: "strict-spec-init", family: "strict-spec" }],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const invalidCoreResult = skillValidationModule.validateStrictSkillPackaging(invalidCoreSkillRoot);
  context.assert(!invalidCoreResult.valid, "strict skill package validation fails for placeholder core skill content");
  context.assert(
    invalidCoreResult.diagnostics.some((diagnostic) => diagnostic.code === "skill.core.placeholder_command"),
    "placeholder core skill reports generic command placeholder diagnostic",
  );
  context.assert(
    invalidCoreResult.diagnostics.some((diagnostic) => diagnostic.code === "skill.core.required_heading.missing"),
    "placeholder core skill reports missing workflow heading diagnostic",
  );
} finally {
  rmSync(invalidCoreSkillRoot, { recursive: true, force: true });
}

const interrogationGuidanceRoot = mkdtempSync(path.join(os.tmpdir(), "strict-skill-interrogation-guidance-"));
try {
  const interrogationSkillDir = path.join(interrogationGuidanceRoot, "skills", "strict-spec-brainstorm");
  mkdirSync(path.join(interrogationGuidanceRoot, "dist", "scripts"), { recursive: true });
  mkdirSync(path.join(interrogationGuidanceRoot, "dist", "templates"), { recursive: true });
  mkdirSync(interrogationSkillDir, { recursive: true });
  symlinkSync("../../dist/scripts", path.join(interrogationSkillDir, "scripts"));
  symlinkSync("../../dist/templates", path.join(interrogationSkillDir, "templates"));
  writeFileSync(
    path.join(interrogationGuidanceRoot, "skills", "marketplace.json"),
    JSON.stringify(
      {
        schema: "strict-spec-driven/skill-marketplace/v1",
        namespace: "strict-spec-driven",
        skills: [{ name: "strict-spec-brainstorm", family: "strict-spec" }],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const canonicalIdLines = [
    "- `requirement-problem` — what is going wrong",
    "- `requirement-outcome` — what proves it solved",
    "- `requirement-trigger` — why now",
    "- `requirement-non-goals` — what must not change",
    "- `requirement-interpretation` — which reading is meant",
  ];
  const askingTechniqueLines = [
    "Ask one question at a time.",
    "Carry a concrete guess into every question.",
    "Reject an answer that names a solution.",
  ];
  const explanationDutyLines = [
    "Always explain why the question matters before posing it.",
    "When an answer cannot be used, state the reason for the pushback.",
  ];

  function writeInterrogationSkill(bodyLines: string[]): void {
    writeFileSync(
      path.join(interrogationSkillDir, "SKILL.md"),
      [
        "---",
        "name: strict-spec-brainstorm",
        "description: stub",
        "metadata:",
        "  skill_id: strict_spec_brainstorm",
        "  author: strict-spec-driven",
        "  type: agent_skill",
        "  version: 1.0.0",
        "---",
        "",
        "# strict-spec-brainstorm",
        "",
        "## This Skill's Commands",
        "",
        "```yaml",
        "propose: strict-spec-cli propose <change-name>",
        "```",
        "",
        ...bodyLines,
      ].join("\n") + "\n",
      "utf8",
    );
  }

  function interrogationDiagnostics(): Array<{ code: string; expected?: string }> {
    return skillValidationModule
      .validateStrictSkillPackaging(interrogationGuidanceRoot)
      .diagnostics.filter((diagnostic) => diagnostic.code.startsWith("skill.requirement_interrogation."));
  }

  writeInterrogationSkill(["## Steps", "", "Do the work."]);
  const missingSection = interrogationDiagnostics();
  context.assert(
    missingSection.some((diagnostic) => diagnostic.code === "skill.requirement_interrogation.heading.missing"),
    "validate-skills rejects a proposal-oriented skill missing the requirement-interrogation section",
  );

  writeInterrogationSkill([
    "## Requirement Interrogation",
    "",
    "Requirement answers are never answered from repository evidence.",
    ...canonicalIdLines,
    ...explanationDutyLines,
  ]);
  const missingTechnique = interrogationDiagnostics();
  context.assert(
    missingTechnique.length > 0
      && missingTechnique.every((diagnostic) => diagnostic.code === "skill.requirement_interrogation.guidance.missing"),
    "validate-skills rejects interrogation guidance that omits the asking technique",
  );
  context.assert(
    missingTechnique.some((diagnostic) => diagnostic.expected === "one question at a time"),
    "the asking-technique diagnostic names the missing rule",
    `diagnostics: ${JSON.stringify(missingTechnique)}`,
  );

  writeInterrogationSkill([
    "## Requirement Interrogation",
    "",
    "Requirement answers are never answered from repository evidence.",
    ...canonicalIdLines,
    ...askingTechniqueLines,
  ]);
  const missingExplanation = interrogationDiagnostics();
  context.assert(
    missingExplanation.some((diagnostic) => diagnostic.expected === "explain why the question matters"),
    "validate-skills rejects interrogation guidance that omits the explain-before-asking duty",
    `diagnostics: ${JSON.stringify(missingExplanation)}`,
  );
  context.assert(
    missingExplanation.some((diagnostic) => diagnostic.expected === "state the reason for the pushback"),
    "validate-skills rejects interrogation guidance that omits the explained-pushback duty",
  );

  writeInterrogationSkill([
    "## Requirement Interrogation",
    "",
    "Requirement answers are never answered from repository evidence.",
    ...canonicalIdLines,
    ...askingTechniqueLines,
    ...explanationDutyLines,
  ]);
  context.assert(
    interrogationDiagnostics().length === 0,
    "validate-skills accepts complete requirement-interrogation guidance",
    `diagnostics: ${JSON.stringify(interrogationDiagnostics())}`,
  );
} finally {
  rmSync(interrogationGuidanceRoot, { recursive: true, force: true });
}

const invalidGenericCommandSkillRoot = mkdtempSync(path.join(os.tmpdir(), "strict-skill-generic-command-invalid-"));
try {
  const invalidGenericCommandSkillDir = path.join(invalidGenericCommandSkillRoot, "skills", "strict-spec-placeholder-fixture");
  mkdirSync(path.join(invalidGenericCommandSkillRoot, "dist", "scripts"), { recursive: true });
  mkdirSync(path.join(invalidGenericCommandSkillRoot, "dist", "templates"), { recursive: true });
  mkdirSync(invalidGenericCommandSkillDir, { recursive: true });

  symlinkSync("../../dist/scripts", path.join(invalidGenericCommandSkillDir, "scripts"));
  symlinkSync("../../dist/templates", path.join(invalidGenericCommandSkillDir, "templates"));

  writeFileSync(
    path.join(invalidGenericCommandSkillDir, "SKILL.md"),
    [
      "---",
      "name: strict-spec-placeholder-fixture",
      "description: Handle a strict placeholder fixture task.",
      "metadata:",
      "  skill_id: strict_spec_placeholder_fixture",
      "  author: strict-spec-driven",
      "  type: agent_skill",
      "  version: 1.0.0",
      "---",
      "",
      "You are helping the user with a strict placeholder fixture task.",
      "",
      "## This Skill's Commands",
      "",
      "```yaml",
      "cli: strict-spec-cli <command>",
      "```",
      "",
      "## Prerequisites",
      "",
      "Use strict workflow artifacts under .strict-spec-driven/.",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(invalidGenericCommandSkillRoot, "skills", "marketplace.json"),
    JSON.stringify(
      {
        schema: "strict-spec-driven/skill-marketplace/v1",
        namespace: "strict-spec-driven",
        skills: [{ name: "strict-spec-placeholder-fixture", family: "strict-spec" }],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const invalidGenericCommandResult = skillValidationModule.validateStrictSkillPackaging(invalidGenericCommandSkillRoot);
  context.assert(!invalidGenericCommandResult.valid, "strict skill package validation fails for generic command placeholder in any skill");
  context.assert(
    invalidGenericCommandResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.commands_section.command.placeholder"
        && diagnostic.path === "skills/strict-spec-placeholder-fixture/SKILL.md#commands.cli",
    ),
    "generic command placeholder reports explicit subcommand diagnostic for non-core skill",
  );
} finally {
  rmSync(invalidGenericCommandSkillRoot, { recursive: true, force: true });
}

const invalidMachinePathCommandSkillRoot = mkdtempSync(path.join(os.tmpdir(), "strict-skill-machine-path-command-invalid-"));
try {
  const invalidMachinePathCommandSkillDir = path.join(invalidMachinePathCommandSkillRoot, "skills", "strict-spec-machine-path-fixture");
  mkdirSync(path.join(invalidMachinePathCommandSkillRoot, "dist", "scripts"), { recursive: true });
  mkdirSync(invalidMachinePathCommandSkillDir, { recursive: true });

  symlinkSync("../../dist/scripts", path.join(invalidMachinePathCommandSkillDir, "scripts"));

  writeFileSync(
    path.join(invalidMachinePathCommandSkillDir, "SKILL.md"),
    [
      "---",
      "name: strict-spec-machine-path-fixture",
      "description: Handle a strict machine path fixture task.",
      "metadata:",
      "  skill_id: strict_spec_machine_path_fixture",
      "  author: strict-spec-driven",
      "  type: agent_skill",
      "  version: 1.0.0",
      "---",
      "",
      "You are helping the user with a strict machine path fixture task.",
      "",
      "## This Skill's Commands",
      "",
      "```yaml",
      "check-workflow-state: node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state",
      "```",
      "",
      "## Prerequisites",
      "",
      "Use strict workflow artifacts under .strict-spec-driven/.",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(invalidMachinePathCommandSkillRoot, "skills", "marketplace.json"),
    JSON.stringify(
      {
        schema: "strict-spec-driven/skill-marketplace/v1",
        namespace: "strict-spec-driven",
        skills: [{ name: "strict-spec-machine-path-fixture", family: "strict-spec" }],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const invalidMachinePathCommandResult = skillValidationModule.validateStrictSkillPackaging(invalidMachinePathCommandSkillRoot);
  context.assert(!invalidMachinePathCommandResult.valid, "strict skill package validation rejects skill-relative CLI command paths");
  context.assert(
    invalidMachinePathCommandResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.commands_section.command.machine_path"
        && diagnostic.path === "skills/strict-spec-machine-path-fixture/SKILL.md#commands.check-workflow-state",
    ),
    "skill-relative CLI command paths report a machine-path diagnostic",
  );
} finally {
  rmSync(invalidMachinePathCommandSkillRoot, { recursive: true, force: true });
}

const invalidRoadmapPlanGuidanceRoot = mkdtempSync(path.join(os.tmpdir(), "strict-roadmap-plan-guidance-invalid-"));
try {
  const invalidRoadmapPlanSkillDir = path.join(invalidRoadmapPlanGuidanceRoot, "skills", "strict-roadmap-plan");
  mkdirSync(path.join(invalidRoadmapPlanGuidanceRoot, "dist", "scripts"), { recursive: true });
  mkdirSync(path.join(invalidRoadmapPlanGuidanceRoot, "dist", "templates"), { recursive: true });
  mkdirSync(invalidRoadmapPlanSkillDir, { recursive: true });

  symlinkSync("../../dist/scripts", path.join(invalidRoadmapPlanSkillDir, "scripts"));
  symlinkSync("../../dist/templates", path.join(invalidRoadmapPlanSkillDir, "templates"));

  writeFileSync(
    path.join(invalidRoadmapPlanSkillDir, "SKILL.md"),
    [
      "---",
      "name: strict-roadmap-plan",
      "description: stub",
      "metadata:",
      "  skill_id: strict_roadmap_plan",
      "  author: strict-spec-driven",
      "  type: agent_skill",
      "  version: 1.0.0",
      "---",
      "",
      "You are helping with strict roadmap work under .strict-spec-driven/roadmap/.",
      "",
      "## This Skill's Commands",
      "",
      "```yaml",
      "roadmap-status: strict-spec-cli roadmap-status",
      "roadmap-sync: strict-spec-cli roadmap-sync",
      "```",
      "",
      "## Prerequisites",
      "",
      "The `.strict-spec-driven/` directory must exist at the project root. If it is missing, stop immediately and tell the user to run `/strict-spec-init`. Do not run `init` from this skill.",
      "",
      "## Steps",
      "",
      "Before any other step, confirm `.strict-spec-driven/` exists at the project root. If it is missing, stop immediately and tell the user to run `/strict-spec-init`. Do not run `init` from this skill.",
      "",
      "1. Run roadmap-status and update roadmap YAML under .strict-spec-driven/roadmap/.",
      "2. Run roadmap-sync and summarize the result.",
      "",
      "## Rules",
      "",
      "- Keep all roadmap state under .strict-spec-driven/roadmap/.",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(invalidRoadmapPlanGuidanceRoot, "skills", "marketplace.json"),
    JSON.stringify(
      {
        schema: "strict-spec-driven/skill-marketplace/v1",
        namespace: "strict-spec-driven",
        skills: [{ name: "strict-roadmap-plan", family: "strict-roadmap" }],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const invalidRoadmapPlanGuidanceResult = skillValidationModule.validateStrictSkillPackaging(invalidRoadmapPlanGuidanceRoot);
  context.assert(!invalidRoadmapPlanGuidanceResult.valid, "strict skill validation fails when roadmap plan omits detail and review guidance");
  context.assert(
    invalidRoadmapPlanGuidanceResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.roadmap.required_snippet.missing"
        && diagnostic.path === "skills/strict-roadmap-plan/SKILL.md"
        && diagnostic.expected === "executable planning context",
    ),
    "roadmap plan skill validation requires executable detail guidance",
  );
  context.assert(
    invalidRoadmapPlanGuidanceResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.roadmap.required_snippet.missing"
        && diagnostic.path === "skills/strict-roadmap-plan/SKILL.md"
        && diagnostic.expected === "Review the roadmap plan before handoff",
    ),
    "roadmap plan skill validation requires post-sync review guidance",
  );
} finally {
  rmSync(invalidRoadmapPlanGuidanceRoot, { recursive: true, force: true });
}

const invalidRoadmapReviewRoot = mkdtempSync(path.join(os.tmpdir(), "strict-roadmap-review-invalid-"));
try {
  const invalidRoadmapReviewSkillDir = path.join(invalidRoadmapReviewRoot, "skills", "strict-roadmap-review");
  mkdirSync(invalidRoadmapReviewSkillDir, { recursive: true });

  writeFileSync(
    path.join(invalidRoadmapReviewSkillDir, "SKILL.md"),
    [
      "---",
      "name: strict-roadmap-review",
      "description: stub",
      "metadata:",
      "  skill_id: strict_roadmap_review",
      "  author: strict-spec-driven",
      "  type: agent_skill",
      "  version: 1.0.0",
      "---",
      "",
      "You are reviewing roadmap work under .strict-spec-driven/roadmap/.",
      "",
      "## This Skill's Commands",
      "",
      "```yaml",
      "check-workflow-state: strict-spec-cli check-workflow-state",
      "roadmap-status: strict-spec-cli roadmap-status",
      "```",
      "",
      "## Prerequisites",
      "",
      "Run `strict-spec-cli check-workflow-state` before any workflow work. If `.strict-spec-driven/` is missing, stop immediately and tell the user to run `/strict-spec-init`. Do not run `init` from this skill.",
      "",
      "## Steps",
      "",
      "Before any other step, run `strict-spec-cli check-workflow-state`. If `.strict-spec-driven/` is missing, stop immediately and tell the user to run `/strict-spec-init`. Do not run `init` from this skill.",
      "",
      "1. Load roadmap context and summarize it.",
      "",
      "## Rules",
      "",
      "- Keep roadmap state under .strict-spec-driven/roadmap/.",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(invalidRoadmapReviewRoot, "skills", "marketplace.json"),
    JSON.stringify(
      {
        schema: "strict-spec-driven/skill-marketplace/v1",
        namespace: "strict-spec-driven",
        skills: [{ name: "strict-roadmap-review-broken", family: "strict-roadmap" }],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const invalidRoadmapReviewResultA = skillValidationModule.validateStrictSkillPackaging(invalidRoadmapReviewRoot);
  const invalidRoadmapReviewResultB = skillValidationModule.validateStrictSkillPackaging(invalidRoadmapReviewRoot);
  context.assert(!invalidRoadmapReviewResultA.valid, "strict skill validation fails for broken strict-roadmap-review packaging");
  context.assert(
    JSON.stringify(invalidRoadmapReviewResultA) === JSON.stringify(invalidRoadmapReviewResultB),
    "strict-roadmap-review diagnostics stay deterministic across repeated invalid runs",
  );
  context.assert(
    invalidRoadmapReviewResultA.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skills.marketplace.skills.mismatch"
        && diagnostic.path === "skills/marketplace.json",
    ),
    "strict-roadmap-review invalid packaging reports marketplace metadata mismatch",
  );
  context.assert(
    invalidRoadmapReviewResultA.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.scripts_symlink.missing"
        && diagnostic.path === "skills/strict-roadmap-review/scripts",
    ),
    "strict-roadmap-review invalid packaging reports a path-specific scripts symlink diagnostic",
  );
  context.assert(
    invalidRoadmapReviewResultA.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.roadmap.command.missing"
        && diagnostic.path === "skills/strict-roadmap-review/SKILL.md#commands.roadmap-sync",
    ),
    "strict-roadmap-review invalid packaging requires the roadmap-sync command mapping",
  );
  context.assert(
    invalidRoadmapReviewResultA.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.roadmap.required_snippet.missing"
        && diagnostic.path === "skills/strict-roadmap-review/SKILL.md"
        && diagnostic.expected === "all milestones whose status is not complete",
    ),
    "strict-roadmap-review invalid packaging requires all-incomplete-milestones scope guidance",
  );
  context.assert(
    invalidRoadmapReviewResultA.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.roadmap.required_snippet.missing"
        && diagnostic.path === "skills/strict-roadmap-review/SKILL.md"
        && diagnostic.expected === "use roadmap-generate milestone for milestone YAML shape",
    ),
    "strict-roadmap-review invalid packaging requires milestone command guidance",
  );
  context.assert(
    invalidRoadmapReviewResultA.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.roadmap.required_snippet.missing"
        && diagnostic.path === "skills/strict-roadmap-review/SKILL.md"
        && diagnostic.expected === "check milestone intake_questions for answer evidence",
    ),
    "strict-roadmap-review invalid packaging requires intake-answer review guidance",
  );

  const invalidRoadmapReviewCliA = cli(["validate-skills"], { cwd: invalidRoadmapReviewRoot });
  const invalidRoadmapReviewCliB = cli(["validate-skills"], { cwd: invalidRoadmapReviewRoot });
  context.assert(invalidRoadmapReviewCliA.status !== 0, "validate-skills CLI exits non-zero for broken strict-roadmap-review packaging");
  context.assert(
    invalidRoadmapReviewCliA.stdout.trim() === invalidRoadmapReviewCliB.stdout.trim(),
    "validate-skills CLI keeps strict-roadmap-review diagnostic ordering deterministic",
  );
} finally {
  rmSync(invalidRoadmapReviewRoot, { recursive: true, force: true });
}

const invalidSharedSchemaGuidanceRoot = mkdtempSync(path.join(os.tmpdir(), "strict-shared-schema-guidance-invalid-"));
try {
  const invalidSharedSchemaSkillDir = path.join(invalidSharedSchemaGuidanceRoot, "skills", "strict-spec-propose");
  mkdirSync(path.join(invalidSharedSchemaGuidanceRoot, "dist", "scripts"), { recursive: true });
  mkdirSync(invalidSharedSchemaSkillDir, { recursive: true });

  symlinkSync("../../dist/scripts", path.join(invalidSharedSchemaSkillDir, "scripts"));

  const proposeSkillWithoutSharedCacheGuidance = readFileSync(
    path.join(ROOT, "skills", "strict-spec-propose", "SKILL.md"),
    "utf8",
  )
    .split("\n")
    .filter((line) =>
      !line.startsWith("- Shared schema cache root:")
      && !line.includes("sample-show")
      && !line.includes("local `examples` directory")
    )
    .join("\n") + "\n";

  writeFileSync(
    path.join(invalidSharedSchemaSkillDir, "SKILL.md"),
    proposeSkillWithoutSharedCacheGuidance,
    "utf8",
  );

  writeFileSync(
    path.join(invalidSharedSchemaGuidanceRoot, "skills", "marketplace.json"),
    JSON.stringify(
      {
        schema: "strict-spec-driven/skill-marketplace/v1",
        namespace: "strict-spec-driven",
        skills: [{ name: "strict-spec-propose", family: "strict-spec" }],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const invalidSharedSchemaGuidanceResult = skillValidationModule.validateStrictSkillPackaging(invalidSharedSchemaGuidanceRoot);
  context.assert(
    !invalidSharedSchemaGuidanceResult.valid,
    "strict skill validation fails when core YAML authoring guidance omits the shared schema cache reminder",
  );
  context.assert(
    invalidSharedSchemaGuidanceResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.core.required_snippet.missing"
        && diagnostic.path === "skills/strict-spec-propose/SKILL.md"
        && diagnostic.expected === "~/.strict-spec-schemas/",
    ),
    "validate-skills requires the shared schema cache root in core YAML authoring skills",
  );
  context.assert(
    invalidSharedSchemaGuidanceResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.core.required_snippet.missing"
        && diagnostic.path === "skills/strict-spec-propose/SKILL.md"
        && diagnostic.expected === "When a YAML artifact already declares `schema_file`, resolve that relative path under the shared cache root",
    ),
    "validate-skills requires schema_file-based shared cache lookup guidance in core YAML authoring skills",
  );
  context.assert(
    invalidSharedSchemaGuidanceResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.core.required_snippet.missing"
        && diagnostic.path === "skills/strict-spec-propose/SKILL.md"
        && diagnostic.expected === "sample-show",
    ),
    "validate-skills requires sample-show guidance in core YAML authoring skills",
  );
  context.assert(
    invalidSharedSchemaGuidanceResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.core.required_snippet.missing"
        && diagnostic.path === "skills/strict-spec-propose/SKILL.md"
        && diagnostic.expected === "do not rely on a local `examples` directory",
    ),
    "validate-skills requires local examples directory guidance in core YAML authoring skills",
  );

  const invalidSharedSchemaGuidanceCli = cli(["validate-skills"], { cwd: invalidSharedSchemaGuidanceRoot });
  context.assert(
    invalidSharedSchemaGuidanceCli.status !== 0,
    "validate-skills CLI exits non-zero when shared schema cache guidance is missing from a core YAML authoring skill",
  );
} finally {
  rmSync(invalidSharedSchemaGuidanceRoot, { recursive: true, force: true });
}

const invalidSemanticSkillRoot = mkdtempSync(path.join(os.tmpdir(), "strict-core-skill-semantics-invalid-"));
try {
  const semanticSkillNames = ["strict-spec-propose", "strict-spec-propose-from-roadmap", "strict-spec-archive", "strict-spec-review", "strict-spec-auto", "strict-tech-sync"];
  mkdirSync(path.join(invalidSemanticSkillRoot, "dist", "scripts"), { recursive: true });
  mkdirSync(path.join(invalidSemanticSkillRoot, "dist", "templates"), { recursive: true });

  for (const skillName of semanticSkillNames) {
    const skillDir = path.join(invalidSemanticSkillRoot, "skills", skillName);
    mkdirSync(skillDir, { recursive: true });
    symlinkSync("../../dist/scripts", path.join(skillDir, "scripts"));
    symlinkSync("../../dist/templates", path.join(skillDir, "templates"));
  }

  writeFileSync(
    path.join(invalidSemanticSkillRoot, "skills", "strict-spec-propose", "SKILL.md"),
    [
      "---",
      "name: strict-spec-propose",
      "description: Propose a new strict change. Scaffolds proposal.yaml, design.yaml, tasks.yaml, questions.yaml, and strict YAML delta specs under .strict-spec-driven/changes/<name>/.",
      "metadata:",
      "  skill_id: strict_spec_propose",
      "  author: strict-spec-driven",
      "  type: agent_skill",
      "  version: 1.0.0",
      "---",
      "",
      "You are helping the user create a strict YAML change proposal under .strict-spec-driven/.",
      "",
      "## This Skill's Commands",
      "",
      "```yaml",
      "propose: strict-spec-cli propose <change-name>",
      "verify: strict-spec-cli verify <change-name>",
      "```",
      "",
      "## Prerequisites",
      "",
      "Use strict workflow artifacts under .strict-spec-driven/.",
      "",
      "## Steps",
      "",
      "1. Draft the proposal.",
      "",
      "## Rules",
      "",
      "- Keep the proposal aligned with the strict CLI.",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(invalidSemanticSkillRoot, "skills", "strict-spec-propose-from-roadmap", "SKILL.md"),
    [
      "---",
      "name: strict-spec-propose-from-roadmap",
      "description: Propose a strict change from roadmap work.",
      "metadata:",
      "  skill_id: strict_spec_propose_from_roadmap",
      "  author: strict-spec-driven",
      "  type: agent_skill",
      "  version: 1.0.0",
      "---",
      "",
      "You are helping the user create a strict YAML change proposal under .strict-spec-driven/roadmap/.",
      "",
      "## This Skill's Commands",
      "",
      "```yaml",
      "propose: strict-spec-cli propose <change-name>",
      "generate: strict-spec-cli generate <change-name> <proposal|design|questions|delta-spec|delta-tech> --<named-args>",
      "ready: strict-spec-cli ready <change-name>",
      "verify: strict-spec-cli verify <change-name>",
      "```",
      "",
      "## Prerequisites",
      "",
      "Use strict workflow artifacts under .strict-spec-driven/.",
      "",
      "## Steps",
      "",
      "1. Read roadmap context and choose a planned change manually.",
      "",
      "## Rules",
      "",
      "- Keep the proposal aligned with the strict CLI.",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(invalidSemanticSkillRoot, "skills", "strict-spec-archive", "SKILL.md"),
    [
      "---",
      "name: strict-spec-archive",
      "description: Archive a completed strict YAML change.",
      "metadata:",
      "  skill_id: strict_spec_archive",
      "  author: strict-spec-driven",
      "  type: agent_skill",
      "  version: 1.0.0",
      "---",
      "",
      "You are helping the user archive a strict YAML change under .strict-spec-driven/.",
      "",
      "## This Skill's Commands",
      "",
      "```yaml",
      "modify: strict-spec-cli modify [change-name|archive-dir]",
      "verify: strict-spec-cli verify <change-name>",
      "verify-spec-mappings: strict-spec-cli verify-spec-mappings",
      "archive: strict-spec-cli archive <change-name>",
      "```",
      "",
      "## Prerequisites",
      "",
      "Use strict workflow artifacts under .strict-spec-driven/.",
      "",
      "## Steps",
      "",
      "1. Confirm the result.",
      "   - any change to roadmap state caused by archive",
      "",
      "## Rules",
      "",
      "- Use the strict archive command.",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(invalidSemanticSkillRoot, "skills", "strict-spec-review", "SKILL.md"),
    [
      "---",
      "name: strict-spec-review",
      "description: Review the code quality of a completed strict YAML change.",
      "metadata:",
      "  skill_id: strict_spec_review",
      "  author: strict-spec-driven",
      "  type: agent_skill",
      "  version: 1.0.0",
      "---",
      "",
      "You are reviewing the code quality of a completed strict YAML change.",
      "",
      "## This Skill's Commands",
      "",
      "```yaml",
      "modify: strict-spec-cli modify [change-name|archive-dir]",
      "verify: strict-spec-cli verify <change-name>",
      "```",
      "",
      "## Prerequisites",
      "",
      "The `.strict-spec-driven/` directory must exist at the project root.",
      "",
      "## Steps",
      "",
      "Before any other step, confirm `.strict-spec-driven/` exists. If it is missing, stop immediately and tell the user to run `/strict-spec-init`. Do not run `init` from this skill.",
      "1. Read every changed file and require direct code review evidence.",
      "2. Confirm harness-plan guidance when harness evidence exists.",
      "3. Do not call or rely on a `strict-spec-cli review` command.",
      "",
      "## Harness Guidance",
      "",
      "Use harness-plan to evaluate harness evidence.",
      "",
      "## Rules",
      "",
      "- Require direct code review evidence.",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(invalidSemanticSkillRoot, "skills", "strict-spec-auto", "SKILL.md"),
    [
      "---",
      "name: strict-spec-auto",
      "description: Run the strict workflow end to end without extra confirmation unless open questions or empty-spec-impact decisions block progress.",
      "metadata:",
      "  skill_id: strict_spec_auto",
      "  author: strict-spec-driven",
      "  type: agent_skill",
      "  version: 1.0.0",
      "---",
      "",
      "You are running the strict workflow end to end for a single strict YAML change.",
      "",
      "## This Skill's Commands",
      "",
      "```yaml",
      "propose: strict-spec-cli propose <change-name>",
      "apply: strict-spec-cli apply <change-name>",
      "verify: strict-spec-cli verify <change-name>",
      "review: strict-spec-cli review <change-name>",
      "verify-spec-mappings: strict-spec-cli verify-spec-mappings",
      "archive: strict-spec-cli archive <change-name>",
      "```",
      "",
      "## Prerequisites",
      "",
      "Use strict workflow artifacts under .strict-spec-driven/.",
      "",
      "## Steps",
      "",
      "1. Run the workflow.",
      "2. If the change verifies and reviews cleanly, and any empty-spec-impact decision has been explicitly confirmed, archive it.",
      "",
      "## Rules",
      "",
      "- The workflow is automatic except when open questions or empty-spec-impact decisions block progress.",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(invalidSemanticSkillRoot, "skills", "strict-tech-sync", "SKILL.md"),
    [
      "---",
      "name: strict-tech-sync",
      "description: Synchronize technical standards.",
      "metadata:",
      "  skill_id: strict_tech_sync",
      "  author: strict-spec-driven",
      "  type: agent_skill",
      "  version: 1.0.0",
      "---",
      "",
      "You are synchronizing technical standards under .strict-spec-driven/.",
      "",
      "## This Skill's Commands",
      "",
      "```yaml",
      "check-workflow-state: strict-spec-cli check-workflow-state",
      "tech-status: strict-spec-cli tech-status",
      "verify-tech-mappings: strict-spec-cli verify-tech-mappings",
      "```",
      "",
      "## Prerequisites",
      "",
      "Run the strict workflow state check.",
      "",
      "## Steps",
      "",
      "1. Scan the whole repository and edit live standards directly.",
      "",
      "## Rules",
      "",
      "- Ask before changing a MUST rule.",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(invalidSemanticSkillRoot, "skills", "marketplace.json"),
    JSON.stringify(
      {
        schema: "strict-spec-driven/skill-marketplace/v1",
        namespace: "strict-spec-driven",
        skills: semanticSkillNames.map((name) => ({
          name,
          family: name.startsWith("strict-tech-") ? "strict-tech" : "strict-spec",
        })),
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const invalidSemanticResult = skillValidationModule.validateStrictSkillPackaging(invalidSemanticSkillRoot);
  context.assert(!invalidSemanticResult.valid, "strict skill package validation fails for misleading core skill claims");
  context.assert(
    invalidSemanticResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.core.command.missing"
        && diagnostic.path === "skills/strict-spec-propose-from-roadmap/SKILL.md#commands.roadmap-recommend",
    ),
    "roadmap-backed propose-from-roadmap guidance requires the roadmap-recommend command mapping",
  );
  context.assert(
    invalidSemanticResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.core.forbidden_snippet.present"
        && diagnostic.path === "skills/strict-spec-propose/SKILL.md",
    ),
    "misleading propose scaffold claim reports forbidden snippet diagnostic",
  );
  context.assert(
    invalidSemanticResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.core.forbidden_snippet.present"
        && diagnostic.path === "skills/strict-spec-archive/SKILL.md",
    ),
    "misleading archive roadmap claim reports forbidden snippet diagnostic",
  );
  context.assert(
    invalidSemanticResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.core.forbidden_snippet.present"
        && diagnostic.path === "skills/strict-spec-auto/SKILL.md",
    ),
    "misleading auto empty-spec-impact claim reports forbidden snippet diagnostic",
  );
  context.assert(
    invalidSemanticResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.core.required_snippet.missing"
        && diagnostic.path === "skills/strict-spec-review/SKILL.md"
        && diagnostic.expected === "Automatically fix safe in-scope review findings",
    ),
    "review skill missing review auto-fix guidance reports required snippet diagnostic",
  );
  context.assert(
    invalidSemanticResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.core.required_snippet.missing"
        && diagnostic.path === "skills/strict-spec-review/SKILL.md"
        && diagnostic.expected === "rerun strict verification plus the configured complete regression command after review-time changes",
    ),
    "review skill missing post-review-fix regression guidance reports required snippet diagnostic",
  );
  context.assert(
    invalidSemanticResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.core.required_snippet.missing"
        && diagnostic.path === "skills/strict-spec-auto/SKILL.md"
        && diagnostic.expected === "/strict-spec-ship <change-name>",
    ),
    "auto skill missing optional ship handoff reports required snippet diagnostic",
  );
  context.assert(
    invalidSemanticResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.core.required_snippet.missing"
        && diagnostic.path === "skills/strict-spec-auto/SKILL.md"
        && diagnostic.expected === "Automatically fix safe in-scope review findings",
    ),
    "auto skill missing review auto-fix guidance reports required snippet diagnostic",
  );
  context.assert(
    invalidSemanticResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.core.required_snippet.missing"
        && diagnostic.path === "skills/strict-spec-auto/SKILL.md"
        && diagnostic.expected === "rerun strict verification plus the configured complete regression command after review-time changes",
    ),
    "auto skill missing post-review-fix regression guidance reports required snippet diagnostic",
  );
  context.assert(
    invalidSemanticResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.core.required_snippet.missing"
        && diagnostic.path === "skills/strict-spec-auto/SKILL.md"
        && diagnostic.expected === "resume the existing populated strict change scaffold without regenerating planning artifacts",
    ),
    "auto skill missing populated scaffold resume guidance reports required snippet diagnostic",
  );
  context.assert(
    invalidSemanticResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.core.required_snippet.missing"
        && diagnostic.path === "skills/strict-tech-sync/SKILL.md"
        && diagnostic.expected === "active-change sync",
    ),
    "tech sync skill missing active-change synchronization guidance reports required snippet diagnostic",
  );
  context.assert(
    invalidSemanticResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.core.required_snippet.missing"
        && diagnostic.path === "skills/strict-spec-archive/SKILL.md"
        && diagnostic.expected === "final current-change tech sync",
    ) && invalidSemanticResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.core.required_snippet.missing"
        && diagnostic.path === "skills/strict-spec-auto/SKILL.md"
        && diagnostic.expected === "final current-change tech sync",
    ),
    "archive and auto skills missing the final current-change tech-sync gate report required snippet diagnostics",
  );
} finally {
  rmSync(invalidSemanticSkillRoot, { recursive: true, force: true });
}

}
