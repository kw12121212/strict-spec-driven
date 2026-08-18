import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
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

type SkillContentModule = {
  validateCommandSection: (
    skillName: string,
    content: string,
    skillPath: string,
    diagnostics: Array<{ code: string }>,
  ) => void;
};

type CliRegistryModule = {
  COMMAND_REGISTRATION_ORDER: string[];
};

type SkillModelModule = {
  CORE_STRICT_SKILL_EXPECTATIONS: Record<string, { requiredSnippets?: string[] }>;
};

type YamlAuthoringProtocolModule = {
  YAML_AUTHORING_PROTOCOL_STEPS: ReadonlyArray<{ order: number; id: string; title: string }>;
  YAML_AUTHORING_PROTOCOL_BOUNDARY: { id: string; title: string; statement: string; reportContains: string[] };
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

type ArtifactSurfaceEntry = {
  artifactKind: string;
  artifactTypes: string[];
  schemaKeys: string[];
  declaredSchemaFiles: string[];
  exampleKeys: string[];
  inspectWith: string[];
  discoverWith: string[];
  operations: Array<{ operation: string; state: string; cliOwned: boolean; ownedBy: string[] }>;
  unsupportedOperations: string[];
  crossFileEffects: string[];
};

type CommandMetadataModule = {
  getAllCommandMetadata: () => CommandMetadataEntry[];
  getCommandArtifactSurface: (commandName: string) => ArtifactSurfaceEntry[];
  getArtifactCacheContext: () => { schemaCacheRoot: string; schemaCacheAvailable: boolean };
  formatCommandHelp: (commandName: string) => string;
  buildCommandHelpPayload: (commandName: string) => {
    artifactSurface: ArtifactSurfaceEntry[];
    artifactCache: { schemaCacheRoot: string; schemaCacheAvailable: boolean };
  };
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
  "config-edit",
  "propose",
  "generate",
  "apply",
  "verify",
  "ready",
  "next",
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
  "yaml-authoring-protocol",
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
  "roadmap-delete-planned-change",
  "roadmap-recommend",
  "roadmap-archive",
  "roadmap-reopen",
  "roadmap-pause",
  "roadmap-resume",
  "roadmap-defer",
  "roadmap-refine",
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
 * An MCP description opens with the metadata summary and, for a command that authors
 * repository-owned YAML, must carry every asset reference the shared projection reports. The
 * expectation lists the facts rather than rebuilding the sentence, so the test proves agreement
 * with the projection instead of restating the production wording.
 */
const missingMcpDescriptionFacts = (cliCommand: string, description: string): string[] => {
  const metadata = metadataEntries.find((entry) => entry.name === cliCommand);
  if (metadata === undefined) return ["<no metadata entry>"];
  const base = metadata.mcpDescription ?? metadata.summary;
  const surface = commandMetadata.getCommandArtifactSurface(cliCommand);
  const required = [
    base,
    ...surface.flatMap((entry) => [
      entry.artifactKind,
      ...entry.schemaKeys,
      ...entry.exampleKeys,
      ...entry.inspectWith,
      `yaml-surface-show ${entry.artifactKind}`,
    ]),
    ...(surface.length === 0 ? [] : [commandMetadata.getArtifactCacheContext().schemaCacheRoot]),
  ];
  return required.filter((fact) => !description.includes(fact));
};

context.assert(
  mcpTools.every((tool) => missingMcpDescriptionFacts(tool.cliCommand, tool.description).length === 0),
  "every MCP tool description carries its command metadata summary and full artifact projection",
  `mismatched: ${
    mcpTools
      .filter((tool) => missingMcpDescriptionFacts(tool.cliCommand, tool.description).length > 0)
      .map((tool) => `${tool.name} missing ${missingMcpDescriptionFacts(tool.cliCommand, tool.description).join(" | ")}`)
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

// Workflow config update and named removal are now CLI-owned by config-edit.
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
  configFamily.operations.update.state === "cli-owned"
    && configFamily.operations.update.cliOwned
    && configFamily.operations.update.commands.includes("config-edit")
    && configFamily.operations.named_remove.commands.includes("config-edit"),
  "yaml-surface-show reports config update and named removal as owned by config-edit",
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

// Same denial as above: help skips cache synchronization, but a mutation does not, so the blocked
// path is what keeps both halves of this check exercising the genuinely unavailable cache.
const deniedCacheRoot = path.join(mkdtempSync(path.join(os.tmpdir(), "strict-denied-cache-")), "cache-root");
writeFileSync(deniedCacheRoot, "not a cache directory\n", "utf8");
const deniedCacheProject = mkdtempSync(path.join(os.tmpdir(), "strict-denied-cache-project-"));
try {
  const deniedEnv = { STRICT_SPEC_SCHEMA_CACHE_DIR: deniedCacheRoot };

  const deniedHelpJson = cli(["spec-edit", "--help", "--json"], { cwd: ROOT, env: deniedEnv });
  const deniedHelpPayload = JSON.parse(deniedHelpJson.stdout) as {
    artifactSurface: ArtifactSurfaceEntry[];
    artifactCache: { schemaCacheAvailable: boolean };
  };
  const deniedSpecEntry = deniedHelpPayload.artifactSurface.find((entry) => entry.artifactKind === "spec-state");
  context.assert(
    deniedHelpJson.status === 0
      && deniedHelpJson.stderr.length === 0
      && deniedHelpPayload.artifactCache.schemaCacheAvailable === false
      && deniedSpecEntry !== undefined
      && deniedSpecEntry.schemaKeys.includes("strict-spec-driven/schemas/main-spec.yaml")
      && deniedSpecEntry.exampleKeys.includes("examples/strict-spec-driven/main-spec.yaml")
      && deniedSpecEntry.inspectWith.includes("schema-show main-spec"),
    "help still reports bundled schema and example keys when the shared schema cache is unavailable",
    `stdout: ${deniedHelpJson.stdout.trim()} stderr: ${deniedHelpJson.stderr.trim()}`,
  );

  const deniedHelpText = cli(["spec-edit", "--help"], { cwd: ROOT, env: deniedEnv });
  context.assert(
    deniedHelpText.status === 0
      && deniedHelpText.stdout.includes("strict-spec-driven/schemas/main-spec.yaml")
      && deniedHelpText.stdout.includes("cache unavailable here"),
    "text help names the bundled assets and says the cache is unavailable rather than omitting them",
    `stdout: ${deniedHelpText.stdout.trim()}`,
  );

  cli(["init"], { cwd: deniedCacheProject, env: deniedEnv });
  cli([
    "spec-edit",
    "denied-cache-spec",
    "--title",
    "Denied Cache Spec",
    "--requirement",
    "r1",
    "--strength",
    "MUST",
    "--statement",
    "The system MUST report recovery assets without a cache.",
    "--scenario",
    "s1",
    "--given",
    "g",
    "--when",
    "w",
    "--then",
    "t",
  ], { cwd: deniedCacheProject, env: deniedEnv });

  const deniedMutation = cli(["spec-edit", "denied-cache-spec", "--delete", "--title", "x"], {
    cwd: deniedCacheProject,
    env: deniedEnv,
  });
  const deniedMutationPayload = JSON.parse(deniedMutation.stdout) as {
    committed: boolean;
    diagnostics: Array<{
      artifactKind?: string;
      schemaKey?: string;
      schemaFilePath?: string;
      exampleKey?: string;
      inspectWith?: string[];
    }>;
  };
  context.assert(
    deniedMutation.status === 1
      && deniedMutationPayload.committed === false
      && deniedMutationPayload.diagnostics.some(
        (diagnostic) =>
          diagnostic.artifactKind === "spec-state"
          && diagnostic.schemaKey === "strict-spec-driven/schemas/main-spec.yaml"
          && diagnostic.exampleKey === "examples/strict-spec-driven/main-spec.yaml"
          && diagnostic.schemaFilePath === undefined
          && (diagnostic.inspectWith ?? []).includes("schema-show main-spec"),
      ),
    "a rejected mutation without a usable cache still names the bundled assets and their inspection commands",
    `stdout: ${deniedMutation.stdout.trim()}`,
  );
} finally {
  rmSync(path.dirname(deniedCacheRoot), { recursive: true, force: true });
  rmSync(deniedCacheProject, { recursive: true, force: true });
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
    && generateHelpText.stdout.includes("schema-show change-proposal")
    && generateHelpText.stdout.includes("strict-spec-driven/schemas/change-proposal.yaml")
    && generateHelpText.stdout.includes("examples/strict-spec-driven/change-proposal.yaml"),
  "text help renders the same artifact surface as JSON help",
  `stdout: ${generateHelpText.stdout.trim()}`,
);
context.assert(
  generateHelpText.stdout.includes("yaml-surface-show change-planning-state"),
  "text help names the command that returns the rest of the artifact contract",
  `stdout: ${generateHelpText.stdout.trim()}`,
);

/**
 * Every authoring command, checked against the module rather than through a subprocess each: the
 * point is that no surface silently drops a projection field, and a per-command spawn would buy
 * nothing the two rendered-CLI checks above do not already prove.
 */
const authoringCommands = metadataEntries
  .map((entry) => entry.name)
  .filter((name) => commandMetadata.getCommandArtifactSurface(name).length > 0);
context.assert(
  authoringCommands.length > 0,
  "at least one registered command authors repository-owned YAML",
);

const surfaceRenderingGaps = authoringCommands.flatMap((name) => {
  const surface = commandMetadata.getCommandArtifactSurface(name);
  const text = commandMetadata.formatCommandHelp(name);
  const payload = commandMetadata.buildCommandHelpPayload(name);
  const cache = commandMetadata.getArtifactCacheContext();
  const gaps: string[] = [];

  if (JSON.stringify(payload.artifactSurface) !== JSON.stringify(surface)) {
    gaps.push(`${name}: JSON help artifactSurface differs from the projection`);
  }
  if (JSON.stringify(payload.artifactCache) !== JSON.stringify(cache)) {
    gaps.push(`${name}: JSON help artifactCache differs from the projection`);
  }
  if (!text.includes(cache.schemaCacheRoot)) {
    gaps.push(`${name}: text help omits the shared schema cache root`);
  }

  for (const entry of surface) {
    const facts = [
      entry.artifactKind,
      ...entry.schemaKeys,
      ...entry.declaredSchemaFiles,
      ...entry.exampleKeys,
      ...entry.inspectWith,
      ...entry.discoverWith,
      ...entry.crossFileEffects,
      ...entry.operations.map((operation) => operation.operation),
      ...entry.operations.flatMap((operation) => operation.ownedBy),
      ...entry.operations.filter((operation) => !operation.cliOwned).map((operation) => operation.state),
    ];
    gaps.push(...facts.filter((fact) => !text.includes(fact)).map((fact) => `${name}: text help omits '${fact}'`));
  }

  return gaps;
});
context.assert(
  surfaceRenderingGaps.length === 0,
  "text help and JSON help render the whole artifact projection for every authoring command",
  surfaceRenderingGaps.slice(0, 8).join("; "),
);

/**
 * The projection must not overstate ownership, so what help prints for a family is compared
 * against what the inventory reports for that same family through yaml-surface-show.
 */
const configSurfaceEntry = commandMetadata
  .getCommandArtifactSurface("config-edit")
  .find((entry) => entry.artifactKind === "workflow-config");
context.assert(
  configSurfaceEntry !== undefined
    && configSurfaceEntry.operations.every(
      (operation) =>
        operation.state === configFamily.operations[operation.operation]?.state
        && operation.cliOwned === configFamily.operations[operation.operation]?.cliOwned
        && JSON.stringify(operation.ownedBy) === JSON.stringify(configFamily.operations[operation.operation]?.commands),
    )
    && configSurfaceEntry.unsupportedOperations.includes("delete"),
  "help operation states and owners match the mutation inventory and claim no unowned operation",
  `entry: ${JSON.stringify(configSurfaceEntry?.operations)}`,
);

const configEditHelpText = commandMetadata.formatCommandHelp("config-edit");
context.assert(
  configEditHelpText.includes("delete (human-only, not CLI-owned)"),
  "text help reports an operation the inventory does not route through the CLI with its inventoried state",
  `stdout: ${configEditHelpText}`,
);

const rootTextHelp = cli(["--help"], { cwd: ROOT });
context.assert(
  rootTextHelp.stdout.includes("schema-list")
    && rootTextHelp.stdout.includes("sample-list")
    && rootTextHelp.stdout.includes("yaml-surface-list"),
  "root help names the artifact contract discovery commands",
  `stdout: ${rootTextHelp.stdout.trim()}`,
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
// The preferred-human-language guidance is no longer re-read here per skill. validate-skills owns
// that check now, which is what the cli-foundation scenario always claimed and what makes the
// guidance enforced for a project that runs the command without this suite. Package validation
// reporting zero diagnostics above is the positive case; the negative cases that prove the check
// is not passing vacuously run with the other fixture-driven probes below.

/**
 * Copies the bundled skill packages into a throwaway root and returns the marketplace entries that
 * describe them, so a validation root is a realistic skill set rather than a single package.
 *
 * The entries come from the committed marketplace manifest rather than from a family guessed off
 * the directory name, so a seeded root stays valid if the family taxonomy ever changes.
 */
function seedBundledSkillPackages(root: string): Array<{ name: string; family: string }> {
  mkdirSync(path.join(root, "dist", "scripts"), { recursive: true });
  mkdirSync(path.join(root, "skills"), { recursive: true });
  for (const name of strictSkillNames) {
    const target = path.join(root, "skills", name);
    mkdirSync(target, { recursive: true });
    copyFileSync(path.join(ROOT, "skills", name, "SKILL.md"), path.join(target, "SKILL.md"));
    symlinkSync("../../dist/scripts", path.join(target, "scripts"));
  }
  const manifest = JSON.parse(readFileSync(path.join(ROOT, "skills", "marketplace.json"), "utf8")) as {
    skills: Array<{ name: string; family: string }>;
  };
  return manifest.skills.map((entry) => ({ ...entry }));
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
  const roadmapTransitionSkillContent = readFileSync(path.join(ROOT, "skills", "strict-roadmap-transition", "SKILL.md"), "utf8");
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
  const normalizedRoadmapTransitionSkillContent = roadmapTransitionSkillContent.replace(/\s+/g, " ");
  const normalizedRoadmapRecommendSkillContent = roadmapRecommendSkillContent.replace(/\s+/g, " ");
  const normalizedRoadmapReviewSkillContent = roadmapReviewSkillContent.replace(/\s+/g, " ");
  const normalizedHarnessInitSkillContent = harnessInitSkillContent.replace(/\s+/g, " ");
  const normalizedHarnessSessionSkillContent = harnessSessionSkillContent.replace(/\s+/g, " ");
  const normalizedInitSkillContent = initSkillContent.replace(/\s+/g, " ");
  const normalizedWorkflowConfigContent = workflowConfigContent.replace(/\s+/g, " ");
  /**
   * The regression-evidence carve-out: a write the suite neither compiles nor reads — a delta-tech
   * artifact or a lesson — does not cost a regression rerun. This suite asserts the wording reaches
   * the shipped skill packages, and validate-skills requires it through its own snippet registry.
   * Two declarations of one sentence drift silently unless they are compared, so the cross-check
   * below reads the registry rather than trusting it.
   */
  const REGRESSION_EVIDENCE_CARVE_OUT_WORDING =
    "a write the configured regression command neither compiles nor reads — currently a change-local"
    + " delta-tech artifact or a lesson — does not invalidate passing complete project regression evidence";
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
      && normalizedSkillContent.includes("the implementation and test files the change touches")
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
      && normalizedProposeSkillContent.includes("scope, unchanged behavior, design decisions, task coverage, unresolved-question impact, delta spec scenarios, and delta tech use when applicable")
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
      && normalizedProposeFromRoadmapSkillContent.includes("scope, unchanged behavior, design decisions, task coverage, unresolved-question impact, delta spec scenarios, and delta tech use when applicable")
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
      && normalizedAutoSkillContent.includes("scope, unchanged behavior, design decisions, task coverage, unresolved-question impact, delta spec scenarios, and delta tech use when applicable")
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
      && normalizedTechSyncSkillContent.includes("selected change's proposal, design, tasks, questions, delta specs, delta tech")
      && normalizedTechSyncSkillContent.includes("attributable tracked and untracked files")
      && normalizedTechSyncSkillContent.includes("explicitly approves both the normative content and its strength")
      && normalizedTechSyncSkillContent.includes("generate <change-name> delta-tech")
      && normalizedTechSyncSkillContent.includes("never edit a live main standard directly")
      && normalizedTechSyncSkillContent.includes("use `tech-edit` for live standards only in standalone mode")
      && normalizedTechSyncSkillContent.includes("Never hand-edit main-tech or tech-index YAML")
      && normalizedTechSyncSkillContent.includes(REGRESSION_EVIDENCE_CARVE_OUT_WORDING)
      && normalizedArchiveSkillContent.includes("final current-change tech sync")
      && normalizedArchiveSkillContent.includes("explicitly classifies the pattern as not reusable")
      && normalizedArchiveSkillContent.includes("Never defer a confirmed reusable convention until after archive")
      && normalizedArchiveSkillContent.includes(REGRESSION_EVIDENCE_CARVE_OUT_WORDING)
      && normalizedArchiveSkillContent.includes("raw command only as the deterministic")
      && normalizedAutoSkillContent.includes("Run the final current-change tech sync")
      && normalizedAutoSkillContent.includes("explicitly classify the pattern as not reusable")
      && normalizedAutoSkillContent.includes("confirmed as reusable cannot be deferred until after archive")
      && normalizedAutoSkillContent.includes(REGRESSION_EVIDENCE_CARVE_OUT_WORDING),
    "tech sync, archive, and automatic workflows enforce bounded current-change delta-tech capture before deterministic archive",
  );
  /**
   * Review and bugfix both collect complete regression evidence and then write a lesson before
   * archive, so they are where the rerun decision is actually made. Asserting the wording in the
   * archive-time packages alone would leave the two skills that caused the wasted rerun free of it.
   */
  context.assert(
    normalizedReviewSkillContent.includes(REGRESSION_EVIDENCE_CARVE_OUT_WORDING)
      && normalizedBugfixSkillContent.includes(REGRESSION_EVIDENCE_CARVE_OUT_WORDING),
    "the skills that record a lesson after their regression evidence state the carve-out at that step",
  );
  const skillModel = await loadDistModule<SkillModelModule>("skills/model.js");
  const carveOutRegistrySkills = [
    "strict-spec-archive",
    "strict-spec-auto",
    "strict-spec-bugfix",
    "strict-spec-review",
    "strict-tech-sync",
  ];
  const registryMissingCarveOut = carveOutRegistrySkills.filter(
    (skillName) => !(skillModel.CORE_STRICT_SKILL_EXPECTATIONS[skillName]?.requiredSnippets ?? [])
      .includes(REGRESSION_EVIDENCE_CARVE_OUT_WORDING),
  );
  context.assert(
    registryMissingCarveOut.length === 0,
    "validate-skills requires the regression-evidence carve-out wording for every skill this suite asserts it in",
    registryMissingCarveOut.join(", "),
  );
  const registryCarveOutSkills = Object.entries(skillModel.CORE_STRICT_SKILL_EXPECTATIONS)
    .filter(([, expectation]) => (expectation.requiredSnippets ?? []).includes(REGRESSION_EVIDENCE_CARVE_OUT_WORDING))
    .map(([skillName]) => skillName)
    .sort();
  context.assert(
    registryCarveOutSkills.join(",") === [...carveOutRegistrySkills].sort().join(","),
    "no skill requires the carve-out wording without this suite asserting it reaches that package",
    registryCarveOutSkills.join(", "),
  );
  context.assert(
    normalizedBrainstormSkillContent.includes("proposal checkpoint")
      && normalizedBrainstormSkillContent.includes("before validation")
      && normalizedBrainstormSkillContent.includes("semantic self-check")
      && normalizedBrainstormSkillContent.includes("confirmed brainstorm summary")
      && normalizedBrainstormSkillContent.includes("decision-ready detail")
      && normalizedBrainstormSkillContent.includes("scope, unchanged behavior, design decisions, task coverage, unresolved-question impact, delta spec scenarios, and delta tech use when applicable")
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
      && normalizedBugfixSkillContent.includes("strict-spec-harness-session")
      && normalizedBugfixSkillContent.includes("strict-spec-brainstorm")
      && normalizedBugfixSkillContent.includes("proposal checkpoint")
      && normalizedBugfixSkillContent.includes("fix safe, in-scope documentation gaps")
      && normalizedBugfixSkillContent.includes("direct review")
      && normalizedBugfixSkillContent.includes("Automatically fix safe in-scope review findings")
      && normalizedBugfixSkillContent.includes("rerun strict verification plus the configured complete regression command after review-time changes")
      && normalizedBugfixSkillContent.includes("Do not call or rely on a `strict-spec-cli review` command")
      && !bugfixSkillContent.includes("strict-spec-cli review <change-name>"),
    "strict-spec-bugfix is constrained to known bugs with reproduction, regression coverage, minimal fixes, and harness-session handoff for unclear issues",
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
    roadmapTransitionSkillContent.includes("roadmap-archive: strict-spec-cli roadmap-archive [milestone-id]")
      && normalizedRoadmapTransitionSkillContent.includes("default to all unarchived milestones")
      && normalizedRoadmapTransitionSkillContent.includes("only milestones whose derived status is complete")
      && normalizedRoadmapTransitionSkillContent.includes("completed standalone planned-change")
      && !roadmapTransitionSkillContent.includes("strict-spec-cli init"),
    "strict-roadmap-transition carries the default-all completed milestone archive guidance the deleted strict-roadmap-archive skill asserted",
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
      && normalizedRoadmapRecommendSkillContent.includes("scope, unchanged behavior, design decisions, task coverage, unresolved-question impact, delta spec scenarios, and delta tech use when applicable")
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
  // The demo package routes an operator to /strict-spec-init, as every valid strict skill must, so
  // the bundled set is seeded alongside it; without it the root would be a set in which that
  // routing points at nothing and the assertion below would fail on the seeding rather than on the
  // templates symlink it is about.
  const noTemplateMarketplace = seedBundledSkillPackages(noTemplateSymlinkRoot);
  noTemplateMarketplace.push({ name: "strict-spec-demo", family: "strict-spec" });
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
      "## Preferred Human Language",
      "",
      "Comply with `preferred_human_language` from `.strict-spec-driven/config.yaml` — the user's common human language, not a programming language — for all user-facing and generated operator-facing text, unless that file is absent or the active user message asks otherwise.",
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
        skills: noTemplateMarketplace,
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
      "## Preferred Human Language",
      "",
      "Comply with `preferred_human_language` from `.strict-spec-driven/config.yaml` — the user's common human language, not a programming language — for all user-facing and generated operator-facing text, unless that file is absent or the active user message asks otherwise.",
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

// The governed set is derived by scanning content, so the fixture skill is named something the
// check has never heard of: only its task-authoring text can bring it under the requirement.
const taskOrderGuidanceRoot = mkdtempSync(path.join(os.tmpdir(), "strict-skill-task-order-"));
try {
  const taskOrderSkillName = "strict-spec-unlisted-authoring-fixture";
  const taskOrderSkillDir = path.join(taskOrderGuidanceRoot, "skills", taskOrderSkillName);
  mkdirSync(path.join(taskOrderGuidanceRoot, "dist", "scripts"), { recursive: true });
  mkdirSync(path.join(taskOrderGuidanceRoot, "dist", "templates"), { recursive: true });
  mkdirSync(taskOrderSkillDir, { recursive: true });
  symlinkSync("../../dist/scripts", path.join(taskOrderSkillDir, "scripts"));
  symlinkSync("../../dist/templates", path.join(taskOrderSkillDir, "templates"));
  writeFileSync(
    path.join(taskOrderGuidanceRoot, "skills", "marketplace.json"),
    JSON.stringify(
      {
        schema: "strict-spec-driven/skill-marketplace/v1",
        namespace: "strict-spec-driven",
        skills: [{ name: taskOrderSkillName, family: "strict-spec" }],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const taskAuthoringLine = "Populate the list with `strict-spec-cli generate <change-name> tasks --section <section>`.";
  const placementGuidanceLines = [
    "Place a task with `--before <task-id>` or `--after <task-id>` instead of letting it append;",
    "task order is the order `apply` walks, so a task that must run before existing pending work",
    "is anchored rather than appended.",
  ];

  const authoringCommandLine = "generate: strict-spec-cli generate <change-name> tasks --<named-args>";
  const readOnlyCommandLine = "verify: strict-spec-cli verify <change-name>";

  function writeTaskOrderSkill(bodyLines: string[], commandLine = authoringCommandLine): void {
    writeFileSync(
      path.join(taskOrderSkillDir, "SKILL.md"),
      [
        "---",
        `name: ${taskOrderSkillName}`,
        "description: stub",
        "metadata:",
        "  skill_id: strict_spec_unlisted_authoring_fixture",
        "  author: strict-spec-driven",
        "  type: agent_skill",
        "  version: 1.0.0",
        "---",
        "",
        `# ${taskOrderSkillName}`,
        "",
        "## This Skill's Commands",
        "",
        "```yaml",
        commandLine,
        "```",
        "",
        ...bodyLines,
      ].join("\n") + "\n",
      "utf8",
    );
  }

  const taskOrderDiagnostics = (): Array<{ code: string; path: string; expected?: string }> =>
    skillValidationModule
      .validateStrictSkillPackaging(taskOrderGuidanceRoot)
      .diagnostics.filter((diagnostic) => diagnostic.code.startsWith("skill.task_order."));

  // Negative case: a task-authoring skill with the guidance removed must fail, naming its file.
  writeTaskOrderSkill(["## Steps", "", taskAuthoringLine]);
  const missingPlacement = taskOrderDiagnostics();
  context.assert(
    missingPlacement.length > 0
      && missingPlacement.every((diagnostic) => diagnostic.code === "skill.task_order.placement_guidance.missing"),
    "validate-skills rejects a task-authoring skill whose ordering guidance was removed",
    `diagnostics: ${JSON.stringify(missingPlacement)}`,
  );
  context.assert(
    missingPlacement.every((diagnostic) => diagnostic.path.includes(taskOrderSkillName)),
    "the task-order diagnostic names the offending skill file",
    `diagnostics: ${JSON.stringify(missingPlacement)}`,
  );
  for (const expected of [
    "`--before <task-id>` or `--after <task-id>`",
    "task order is the order `apply` walks",
    "must run before existing pending work is anchored rather than appended",
  ]) {
    context.assert(
      missingPlacement.some((diagnostic) => diagnostic.expected === expected),
      `each task-order matcher category fires on realistic input (${expected})`,
      `diagnostics: ${JSON.stringify(missingPlacement)}`,
    );
  }

  // Positive case: the scan governs a skill no list names, purely from its task-authoring text.
  writeTaskOrderSkill(["## Steps", "", taskAuthoringLine, "", ...placementGuidanceLines]);
  context.assert(
    taskOrderDiagnostics().length === 0,
    "validate-skills accepts a scanned task-authoring skill that carries the ordering guidance",
    `diagnostics: ${JSON.stringify(taskOrderDiagnostics())}`,
  );

  // Second signal: a skill that prescribes the artifact's section content is governed even when it
  // never names the generator, so rewording away from the command cannot drop it from the set.
  writeTaskOrderSkill(
    [
      "## Steps",
      "",
      "Populate `tasks.yaml` with concrete Implementation, Testing, and Verification entries.",
    ],
    readOnlyCommandLine,
  );
  const sectionProseOnly = taskOrderDiagnostics();
  context.assert(
    sectionProseOnly.length > 0
      && sectionProseOnly.every((diagnostic) => diagnostic.code === "skill.task_order.placement_guidance.missing"),
    "a skill that prescribes task-list section content is governed even without naming the generator",
    `diagnostics: ${JSON.stringify(sectionProseOnly)}`,
  );

  // A skill that never authors task lists stays outside the governed set.
  writeTaskOrderSkill(
    ["## Steps", "", "Read the change and report on it without writing tasks."],
    readOnlyCommandLine,
  );
  context.assert(
    taskOrderDiagnostics().length === 0,
    "a skill that does not direct task-list authoring is not governed by the ordering requirement",
    `diagnostics: ${JSON.stringify(taskOrderDiagnostics())}`,
  );
} finally {
  rmSync(taskOrderGuidanceRoot, { recursive: true, force: true });
}

// The apply skill carries the out-of-order completion guidance rather than the placement guidance,
// so its branch needs its own negative case.
const applyGuidanceRoot = mkdtempSync(path.join(os.tmpdir(), "strict-skill-apply-order-"));
try {
  const applySkillDir = path.join(applyGuidanceRoot, "skills", "strict-spec-apply");
  mkdirSync(path.join(applyGuidanceRoot, "dist", "scripts"), { recursive: true });
  mkdirSync(path.join(applyGuidanceRoot, "dist", "templates"), { recursive: true });
  mkdirSync(applySkillDir, { recursive: true });
  symlinkSync("../../dist/scripts", path.join(applySkillDir, "scripts"));
  symlinkSync("../../dist/templates", path.join(applySkillDir, "templates"));
  writeFileSync(
    path.join(applyGuidanceRoot, "skills", "marketplace.json"),
    JSON.stringify(
      {
        schema: "strict-spec-driven/skill-marketplace/v1",
        namespace: "strict-spec-driven",
        skills: [{ name: "strict-spec-apply", family: "strict-spec" }],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  function writeApplySkill(bodyLines: string[]): void {
    writeFileSync(
      path.join(applySkillDir, "SKILL.md"),
      [
        "---",
        "name: strict-spec-apply",
        "description: stub",
        "metadata:",
        "  skill_id: strict_spec_apply",
        "  author: strict-spec-driven",
        "  type: agent_skill",
        "  version: 1.0.0",
        "---",
        "",
        "# strict-spec-apply",
        "",
        "## This Skill's Commands",
        "",
        "```yaml",
        "apply: strict-spec-cli apply <change-name>",
        "```",
        "",
        ...bodyLines,
      ].join("\n") + "\n",
      "utf8",
    );
  }

  const applyOrderDiagnostics = (): Array<{ code: string; path: string; expected?: string }> =>
    skillValidationModule
      .validateStrictSkillPackaging(applyGuidanceRoot)
      .diagnostics.filter((diagnostic) => diagnostic.code.startsWith("skill.task_order."));

  writeApplySkill(["## Steps", "", "Run the apply command after finishing a task."]);
  const missingApplyGuidance = applyOrderDiagnostics();
  context.assert(
    missingApplyGuidance.length > 0
      && missingApplyGuidance.every((diagnostic) => diagnostic.code === "skill.task_order.apply_guidance.missing"),
    "validate-skills rejects an apply skill missing the out-of-order completion guidance",
    `diagnostics: ${JSON.stringify(missingApplyGuidance)}`,
  );
  context.assert(
    missingApplyGuidance.some((diagnostic) => diagnostic.expected === "`apply` is positional, not addressed"),
    "the apply-guidance diagnostic names the positional-versus-addressed rule",
    `diagnostics: ${JSON.stringify(missingApplyGuidance)}`,
  );

  writeApplySkill([
    "## Steps",
    "",
    "`apply` is positional, not addressed: it completes whichever task is next in list order.",
    "Record work finished out of order with `--task <id> --status complete`, and fix a wrong",
    "sequence with `--before <task-id>` or `--after <task-id>`.",
  ]);
  context.assert(
    applyOrderDiagnostics().length === 0,
    "validate-skills accepts an apply skill carrying the out-of-order completion guidance",
    `diagnostics: ${JSON.stringify(applyOrderDiagnostics())}`,
  );
} finally {
  rmSync(applyGuidanceRoot, { recursive: true, force: true });
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
      "## Preferred Human Language",
      "",
      "Comply with `preferred_human_language` from `.strict-spec-driven/config.yaml` — the user's common human language, not a programming language — for all user-facing and generated operator-facing text, unless that file is absent or the active user message asks otherwise.",
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

// The merged roadmap state-transition skill replaces nine single-command skills, and only four of
// them ever had validate-skills expectations. This drives the shipped validator over the real
// SKILL.md with one operation's evidence removed at a time, so each of the nine — including
// pause, resume, defer, refine, and reopen, which no expectation reached before — is proven to
// fail rather than assumed to be covered. The positive case runs first: without it, a harness that
// reported diagnostics for an unrelated reason would make every negative assertion pass vacuously.
const TRANSITION_SKILL_NAME = "strict-roadmap-transition";
const TRANSITION_OPERATION_EVIDENCE: { operation: string; commandKey: string; snippet: string }[] = [
  { operation: "pause", commandKey: "roadmap-pause", snippet: "milestone-paused" },
  { operation: "resume", commandKey: "roadmap-resume", snippet: "Resume deletes the `paused` field" },
  { operation: "defer", commandKey: "roadmap-defer", snippet: "**Deferral is not a pause.**" },
  {
    operation: "refine",
    commandKey: "roadmap-refine",
    snippet: "whether the recorded precondition is now true",
  },
  {
    operation: "reorder",
    commandKey: "roadmap-reorder",
    snippet: "Use `roadmap-status` or `roadmap-overview` order, never id-prefix order",
  },
  { operation: "move", commandKey: "roadmap-move-planned-change", snippet: "--allow-complete" },
  { operation: "reopen", commandKey: "roadmap-reopen", snippet: "frozenPlannedChanges" },
  {
    operation: "archive",
    commandKey: "roadmap-archive",
    snippet: "only milestones whose derived status is complete",
  },
  {
    operation: "sync",
    commandKey: "roadmap-sync",
    snippet: "Do not invent planned changes during a sync",
  },
];

const transitionSkillSource = readFileSync(
  path.join(ROOT, "skills", TRANSITION_SKILL_NAME, "SKILL.md"),
  "utf8",
);

function roadmapDiagnosticsForTransitionSkill(skillText: string) {
  const probeRoot = mkdtempSync(path.join(os.tmpdir(), "strict-roadmap-transition-probe-"));
  try {
    const probeSkillDir = path.join(probeRoot, "skills", TRANSITION_SKILL_NAME);
    mkdirSync(probeSkillDir, { recursive: true });
    writeFileSync(path.join(probeSkillDir, "SKILL.md"), skillText, "utf8");
    writeFileSync(
      path.join(probeRoot, "skills", "marketplace.json"),
      JSON.stringify(
        {
          schema: "strict-spec-driven/skill-marketplace/v1",
          namespace: "strict-spec-driven",
          skills: [{ name: TRANSITION_SKILL_NAME, family: "strict-roadmap" }],
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    return skillValidationModule
      .validateStrictSkillPackaging(probeRoot)
      .diagnostics
      .filter((diagnostic) => diagnostic.code.startsWith("skill.roadmap."));
  } finally {
    rmSync(probeRoot, { recursive: true, force: true });
  }
}

context.assert(
  roadmapDiagnosticsForTransitionSkill(transitionSkillSource).length === 0,
  "the merged roadmap transition skill satisfies its content expectation as authored",
);

for (const { operation, commandKey, snippet } of TRANSITION_OPERATION_EVIDENCE) {
  const withoutCommand = transitionSkillSource
    .split("\n")
    .filter((line) => !line.startsWith(`${commandKey}: `))
    .join("\n");
  context.assert(
    withoutCommand !== transitionSkillSource,
    `the merged roadmap transition skill declares a '${commandKey}' command mapping to remove`,
  );
  const stripped = withoutCommand.split(snippet).join("[removed]");
  context.assert(
    stripped !== withoutCommand,
    `the merged roadmap transition skill carries the '${operation}' guidance snippet to remove`,
  );

  const diagnostics = roadmapDiagnosticsForTransitionSkill(stripped);
  context.assert(
    diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.roadmap.command.missing"
        && diagnostic.path === `skills/${TRANSITION_SKILL_NAME}/SKILL.md#commands.${commandKey}`,
    ),
    `dropping the '${operation}' command mapping fails strict skill content validation`,
  );
  context.assert(
    diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.roadmap.required_snippet.missing"
        && diagnostic.path === `skills/${TRANSITION_SKILL_NAME}/SKILL.md`
        && diagnostic.expected === snippet,
    ),
    `dropping the '${operation}' guidance fails strict skill content validation`,
  );
}

// The operation argument is the merged skill's whole invocation contract: nine transitions behind
// one entry point are only deterministic while the skill refuses to guess which one was meant.
for (const contractSnippet of [
  "**The operation must be explicit.**",
  "stop and ask the user which of the nine is intended",
  "Perform exactly one operation per invocation, through its one owning command",
]) {
  const withoutContract = transitionSkillSource.split(contractSnippet).join("[removed]");
  context.assert(
    withoutContract !== transitionSkillSource,
    `the merged roadmap transition skill states '${contractSnippet}'`,
  );
  context.assert(
    roadmapDiagnosticsForTransitionSkill(withoutContract).some(
      (diagnostic) =>
        diagnostic.code === "skill.roadmap.required_snippet.missing"
        && diagnostic.expected === contractSnippet,
    ),
    `dropping '${contractSnippet}' fails strict skill content validation`,
  );
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
  const semanticSkillNames = ["strict-spec-propose", "strict-spec-propose-from-roadmap", "strict-spec-archive", "strict-spec-review", "strict-spec-auto", "strict-spec-bugfix", "strict-tech-sync"];
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
    path.join(invalidSemanticSkillRoot, "skills", "strict-spec-bugfix", "SKILL.md"),
    [
      "---",
      "name: strict-spec-bugfix",
      "description: Fix a known bug through a narrow strict YAML change.",
      "metadata:",
      "  skill_id: strict_spec_bugfix",
      "  author: strict-spec-driven",
      "  type: agent_skill",
      "  version: 1.0.0",
      "---",
      "",
      "You are fixing a known bug through a narrow strict YAML change under `.strict-spec-driven/`.",
      "",
      "## This Skill's Commands",
      "",
      "```yaml",
      "propose: strict-spec-cli propose <change-name>",
      "verify: strict-spec-cli verify <change-name>",
      "archive: strict-spec-cli archive <change-name>",
      "```",
      "",
      "## Prerequisites",
      "",
      "The `.strict-spec-driven/` directory must exist at the project root.",
      "",
      "## Steps",
      "",
      "1. Reproduce before fixing the known bug and keep the minimal fix scoped to a failing regression.",
      "2. Run the configured complete project regression command, then declare the lesson outcome and archive.",
      "",
      "## Harness Guidance",
      "",
      "Use harness-plan when reproduction needs declared components.",
      "",
      "## Rules",
      "",
      "- Archive only after direct review and regression evidence pass.",
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
  // The carve-out is what stops a delta-tech capture or a lesson from costing a regression rerun. A
  // skill that silently loses the sentence would send the agent back to the old rule, so each
  // governed package is checked against a body that omits it rather than only against the shipped
  // text.
  for (const carveOutSkillName of [
    "strict-spec-archive",
    "strict-spec-auto",
    "strict-spec-bugfix",
    "strict-spec-review",
    "strict-tech-sync",
  ]) {
    context.assert(
      invalidSemanticResult.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "skill.core.required_snippet.missing"
          && diagnostic.path === `skills/${carveOutSkillName}/SKILL.md`
          && diagnostic.expected === REGRESSION_EVIDENCE_CARVE_OUT_WORDING,
      ),
      `${carveOutSkillName} missing the regression-evidence carve-out reports required snippet diagnostic`,
    );
  }
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

context.section("[2c] CLI-only YAML authoring protocol in mutation-capable skills");

// The migrated set is derived from the same inventory the protocol command reads, so the checked
// set and the protocol an agent is taught cannot drift apart. cli_owners mixes writers with
// inspectors, so read-only lookups are excluded before a skill is called mutation-capable.
const INVENTORY_INSPECTOR_COMMANDS = new Set(["lesson-list", "lesson-show", "lesson-status"]);
// migrate creates .strict-spec-driven/ YAML but the inventory registers it only against
// legacy-migration-input, the one family it reads rather than writes; see the change design.
const PROTOCOL_SKILL_EXCEPTIONS = new Set(["strict-spec-migrate"]);

const inventoryFamilies = (inventoryArtifact.artifact_families ?? {}) as Record<
  string,
  { operations?: Record<string, string>; cli_owners?: string[] }
>;
const mutatingOwnerCommands = new Set<string>();
for (const family of Object.values(inventoryFamilies)) {
  const operations = family.operations ?? {};
  const hasCliOwnedOperation = ["create", "update", "named_remove", "delete"].some(
    (operation) => operations[operation] === "cli-owned",
  );
  if (!hasCliOwnedOperation) continue;
  for (const owner of family.cli_owners ?? []) {
    if (!INVENTORY_INSPECTOR_COMMANDS.has(owner)) mutatingOwnerCommands.add(owner);
  }
}
context.assert(
  mutatingOwnerCommands.size > 0,
  "the mutation inventory yields at least one CLI-owned mutation command",
);

const protocolModule = await loadDistModule<YamlAuthoringProtocolModule>("yaml-authoring-protocol.js");
const protocolStepTitles = protocolModule.YAML_AUTHORING_PROTOCOL_STEPS.map((step) => step.title);
const protocolBoundary = protocolModule.YAML_AUTHORING_PROTOCOL_BOUNDARY;
const PROTOCOL_HEADING = "## CLI-Only YAML Authoring Protocol";

// The protocol section itself names owning commands, so classifying from the whole file would be
// circular: deleting the section could drop a skill's only command mention and silently reclassify
// it as read-only, passing the "carries no section" branch instead of failing the missing one.
// Membership is therefore decided from the skill body with the section removed.
function bodyWithoutProtocolSection(skillText: string): string {
  const start = skillText.indexOf(PROTOCOL_HEADING);
  if (start === -1) return skillText;
  const next = skillText.indexOf("\n## ", start + PROTOCOL_HEADING.length);
  // slice(0, start) already ends with the blank line before the heading, so skip the matched "\n".
  return skillText.slice(0, start) + (next === -1 ? "" : skillText.slice(next + 1));
}

const expectedProtocolSkills: string[] = [];
const expectedReadOnlySkills: string[] = [];
for (const skillName of strictSkillNames) {
  const skillText = readFileSync(path.join(ROOT, "skills", skillName, "SKILL.md"), "utf8");
  const skillBody = bodyWithoutProtocolSection(skillText);
  const directsMutation =
    PROTOCOL_SKILL_EXCEPTIONS.has(skillName)
    || [...mutatingOwnerCommands].some((command) =>
      new RegExp(`strict-spec-cli\\s+${command}(?![a-z0-9-])`).test(skillBody),
    );
  (directsMutation ? expectedProtocolSkills : expectedReadOnlySkills).push(skillName);
}
context.assert(
  bodyWithoutProtocolSection(`intro\n\n${PROTOCOL_HEADING}\n\nstrict-spec-cli spec-edit\n\n## Next\n\ntail`)
    === "intro\n\n## Next\n\ntail",
  "the membership scan removes the protocol section before looking for owning commands",
);
context.assert(
  expectedProtocolSkills.length > 0 && expectedReadOnlySkills.length > 0,
  "the derivation separates mutation-capable skills from read-only skills",
);

// The protocol section a skill carries, so the pointer requirement is checked against the region
// the rule governs rather than against incidental wording elsewhere in the file.
function protocolSectionOf(skillText: string): string | undefined {
  const start = skillText.indexOf(PROTOCOL_HEADING);
  if (start === -1) return undefined;
  const next = skillText.indexOf("\n## ", start + PROTOCOL_HEADING.length);
  return next === -1 ? skillText.slice(start) : skillText.slice(start, next);
}

const inventoryArtifactKinds = Object.keys(inventoryFamilies);
const inventoryValidationCommands = new Map<string, string>();
for (const [kind, family] of Object.entries(
  inventoryFamilies as Record<string, { validation_command?: string }>,
)) {
  if (family.validation_command) inventoryValidationCommands.set(kind, family.validation_command);
}
context.assert(
  inventoryArtifactKinds.length > 0 && inventoryValidationCommands.size > 0,
  "the inventory yields artifact kinds and their validation commands for the pointer assertions",
);

for (const skillName of expectedProtocolSkills) {
  const skillText = readFileSync(path.join(ROOT, "skills", skillName, "SKILL.md"), "utf8");
  const section = protocolSectionOf(skillText);
  context.assert(
    section !== undefined,
    `${skillName} presents the CLI-only YAML authoring pointer section`,
  );
  if (section === undefined) continue;
  const normalized = section.replace(/\s+/g, " ");
  const declaredCommands = [...skillText.matchAll(/strict-spec-cli\s+([a-z0-9-]+)/g)].map(
    (match) => match[1],
  );

  context.assert(
    normalized.includes("strict-spec-cli yaml-authoring-protocol"),
    `${skillName} names the live yaml-authoring-protocol lookup`,
  );
  // The kinds are read from the inventory rather than from the skill, so a skill naming an
  // artifact kind nobody registers does not satisfy the requirement.
  const namedKinds = inventoryArtifactKinds.filter((kind) => normalized.includes(`\`${kind}\``));
  context.assert(
    namedKinds.length > 0,
    `${skillName} names at least one registered artifact kind it writes (named: ${namedKinds.join(", ") || "none"})`,
  );
  const acceptedValidationCommands = new Set<string>(
    declaredCommands.filter((command) => !mutatingOwnerCommands.has(command)),
  );
  for (const kind of namedKinds) {
    const command = inventoryValidationCommands.get(kind);
    if (command !== undefined) acceptedValidationCommands.add(command);
  }
  context.assert(
    [...acceptedValidationCommands].some((command) =>
      normalized.includes(`strict-spec-cli ${command}`),
    ),
    `${skillName} names the validation command it runs after the write`,
  );
  context.assert(
    normalized.includes(protocolBoundary.statement.replace(/\s+/g, " ")),
    `${skillName} restates the no-direct-edit-fallback boundary verbatim`,
  );
  // The negative half of the requirement. The pointer replaces the restatement rather than
  // sitting beside it, so a section that still lists a step title is a partial migration.
  const restatedStepTitle = protocolStepTitles.find((title) =>
    normalized.includes(title.replace(/\s+/g, " ")),
  );
  context.assert(
    restatedStepTitle === undefined,
    `${skillName} restates no protocol step title (found: ${restatedStepTitle ?? "none"})`,
  );
}

// A sweep over every bundled skill, not only the mutation-capable ones, because a step title that
// survived outside a protocol section would leave a stale copy the pointer was meant to retire.
// The full survivor list is reported rather than the first hit, so a partial migration is visible.
const stepTitleSurvivors: string[] = [];
for (const skillName of strictSkillNames) {
  const normalized = readFileSync(path.join(ROOT, "skills", skillName, "SKILL.md"), "utf8")
    .replace(/\s+/g, " ");
  for (const title of protocolStepTitles) {
    if (normalized.includes(title.replace(/\s+/g, " "))) stepTitleSurvivors.push(`${skillName}: ${title}`);
  }
}
context.assert(
  stepTitleSurvivors.length === 0,
  `no bundled skill restates a protocol step title (${stepTitleSurvivors.length} found: ${stepTitleSurvivors.join(" | ") || "none"})`,
);
// The sweep is only evidence if it can fire, and the titles are ordinary English phrases that a
// substring search could miss after a rewording, so a synthetic positive is run through it.
context.assert(
  protocolStepTitles.some((title) =>
    `intro ${title.replace(/\s+/g, " ")} tail`.includes(title.replace(/\s+/g, " ")),
  ),
  "the step-title sweep matches a section that does restate a step title",
);

// Each pointer diagnostic is proved to fire against a realistic mutation of a real skill, because
// a green run over compliant text is not evidence that the check works. The subject is a skill
// whose mutation-capable classification comes from its command mapping, so removing the section
// entirely still leaves the check in scope rather than exempting the package.
const skillContentModule = await loadDistModule<SkillContentModule>("skills/content.js");
const pointerSubjectName = "strict-tech-edit";
const pointerSubject = readFileSync(path.join(ROOT, "skills", pointerSubjectName, "SKILL.md"), "utf8");
function pointerDiagnosticCodes(text: string): string[] {
  const diagnostics: Array<{ code: string }> = [];
  skillContentModule.validateCommandSection(
    pointerSubjectName,
    text,
    `skills/${pointerSubjectName}/SKILL.md`,
    diagnostics,
  );
  return diagnostics
    .map((diagnostic) => diagnostic.code)
    .filter((code) => code.startsWith("skill.authoring_protocol."));
}
const pointerNegativeCases: Array<{ label: string; code: string; text: string }> = [
  {
    label: "a skill with no pointer section",
    code: "skill.authoring_protocol.section.missing",
    text: pointerSubject.replace(/## CLI-Only YAML Authoring Protocol[\s\S]*?(?=\n## )/, ""),
  },
  {
    label: "a skill that names no pointer command",
    code: "skill.authoring_protocol.pointer.missing",
    text: pointerSubject.replace("yaml-authoring-protocol tech-state", "the protocol documentation"),
  },
  {
    label: "a skill that names no registered artifact kind",
    code: "skill.authoring_protocol.artifact_kind.missing",
    text: pointerSubject.replace(/`tech-state`/g, "the artifact"),
  },
  {
    label: "a skill that names no validation command",
    code: "skill.authoring_protocol.validation_command.missing",
    text: pointerSubject.replace(/`strict-spec-cli tech-status`/g, "the validator"),
  },
  {
    label: "a skill that drops the no-fallback boundary",
    code: "skill.authoring_protocol.boundary.missing",
    text: pointerSubject.replace(
      /When a required command, argument, or\s+artifact kind is unavailable[\s\S]*?improvise\./,
      "Do not improvise.",
    ),
  },
  {
    label: "a skill that restates a protocol step title",
    code: "skill.authoring_protocol.step.restated",
    text: pointerSubject.replace(
      "**Stop rather than edit",
      `1. **${protocolStepTitles[0]}**\n\n**Stop rather than edit`,
    ),
  },
];
context.assert(
  pointerDiagnosticCodes(pointerSubject).length === 0,
  `${pointerSubjectName} reports no authoring-pointer diagnostic in repository state`,
);
for (const negativeCase of pointerNegativeCases) {
  const codes = pointerDiagnosticCodes(negativeCase.text);
  context.assert(
    codes.includes(negativeCase.code),
    `validate-skills reports ${negativeCase.code} for ${negativeCase.label} (got: ${codes.join(", ") || "none"})`,
  );
  context.assert(
    negativeCase.text !== pointerSubject,
    `the ${negativeCase.label} fixture actually differs from the compliant skill`,
  );
}

for (const skillName of expectedReadOnlySkills) {
  context.assert(
    !readFileSync(path.join(ROOT, "skills", skillName, "SKILL.md"), "utf8").includes(PROTOCOL_HEADING),
    `${skillName} directs no YAML mutation and carries no authoring protocol section`,
  );
}

// A skill may forbid these constructs; none may instruct one. The distinction is the direction of
// the sentence, so the check targets imperative writes to a YAML path rather than the bare words.
const FORBIDDEN_WRITE_INSTRUCTIONS: Array<{ label: string; pattern: RegExp }> = [
  { label: "apply_patch on YAML", pattern: /apply_patch[^.\n]{0,80}\.ya?ml/gi },
  { label: "heredoc into YAML", pattern: /<<\s*'?EOF'?[^\n]{0,80}\.ya?ml/gi },
  { label: "shell redirect into YAML", pattern: /(?:cat|echo|printf)\s[^\n|]{0,80}>\s*[^\s|]*\.ya?ml/gi },
  { label: "fallback to direct editing", pattern: /(?:fall\s?back|otherwise|instead)[^.\n]{0,60}(?:edit|write)[^.\n]{0,40}\.ya?ml/gi },
  { label: "constructed payload file", pattern: /(?:create|write|build)\s+(?:a\s+)?(?:temporary\s+)?(?:YAML|JSON)\s+payload\s+file/gi },
];

// A skill is expected to forbid these constructs, so a match only counts when the surrounding
// clause is not itself a prohibition. Without this the protocol's own "do not create JSON payload
// files" wording would be read as an instruction to create one.
const NEGATION_BEFORE = /\b(?:do not|don't|never|no|without|rather than|instead of|not)\b[^.]{0,80}$/i;
function isProhibition(text: string, matchIndex: number): boolean {
  const clauseStart = Math.max(0, text.lastIndexOf(".", matchIndex) + 1);
  return NEGATION_BEFORE.test(text.slice(clauseStart, matchIndex));
}

for (const skillName of expectedProtocolSkills) {
  const skillText = readFileSync(path.join(ROOT, "skills", skillName, "SKILL.md"), "utf8");
  for (const { label, pattern } of FORBIDDEN_WRITE_INSTRUCTIONS) {
    pattern.lastIndex = 0;
    const instructing: string[] = [];
    for (const match of skillText.matchAll(pattern)) {
      if (match.index === undefined) continue;
      if (isProhibition(skillText, match.index)) continue;
      instructing.push(match[0]);
    }
    context.assert(
      instructing.length === 0,
      `${skillName} contains no ${label} instruction (found: ${instructing.join(" | ") || "none"})`,
    );
  }
}

// The negation guard must not blind the check: an unqualified instruction still fails.
context.assert(
  isProhibition("Do not create a JSON payload file", "Do not ".length + 0)
    && !isProhibition("Create a JSON payload file for the artifact", 0),
  "the prohibition guard distinguishes a forbidden instruction from a prohibition of it",
);


context.section("[2d] CLI-only YAML mutation policy enforcement");
// [2d] runs at suite scope; its own block below scopes the module and fixtures it introduces.

{

type CliOnlyYamlPolicyModule = {
  EXEMPT_PATH_PREFIXES: { prefix: string; reason: string }[];
  GENERATED_DOCUMENT_BANNER: string;
  exemptPathReason: (relativeFile: string) => string | undefined;
  isGeneratedDocument: (text: string) => boolean;
  scanTextForPolicyViolations: (file: string, text: string) => {
    matches: { file: string; line: number; category: string; excerpt: string; replacement: string }[];
    suppressions: { category: string; suppressedBy: string }[];
  };
  scanSourceForUnregisteredWriters: (rootDir: string, relativeDir: string) => {
    matches: { file: string; line: number; category: string }[];
    suppressions: { file: string; suppressedBy: string }[];
  };
  isMutationCapableSkill: (skillName: string, skillText: string) => boolean;
  findProseMutationFlags: (text: string) => { command: string; flag: string }[];
  loadPolicyRegistry: () => {
    mutatingOwnerCommands: Set<string>;
    registeredWriterPaths: Set<string>;
    declaredFlagsByCommand: Map<string, Set<string>>;
  };
};

const policy = (await loadDistModule("cli-only-yaml-policy.js")) as CliOnlyYamlPolicyModule;

// Each category must be observed firing on a seeded violation. A policy check that has never been
// seen to fail is not evidence of compliance, only of silence.
const SEEDED_VIOLATIONS: { category: string; text: string }[] = [
  { category: "direct-file-edit", text: "Run apply_patch on .strict-spec-driven/config.yaml to set the field." },
  { category: "shell-or-heredoc-yaml-write", text: "Write it with cat <<EOF > .strict-spec-driven/specs/x.yaml" },
  {
    category: "hand-edit-fallback",
    text: "If the command is unavailable, instead edit the .strict-spec-driven/specs/x.yaml by hand.",
  },
  { category: "raw-yaml-payload", text: "Create a temporary YAML payload file and pass it to the command." },
];

for (const { category, text } of SEEDED_VIOLATIONS) {
  const result = policy.scanTextForPolicyViolations("seeded.md", text);
  context.assert(
    result.matches.some((match) => match.category === category),
    `the policy scan reports a ${category} violation`,
    `got ${result.matches.map((match) => match.category).join(", ") || "no match"}`,
  );
  context.assert(
    result.matches.every((match) => match.replacement.length > 0 && match.line >= 1),
    `each ${category} match names a replacement and a line`,
  );
}

// Permitted surfaces must stay silent, and each silence must be attributable: a match that is
// suppressed records why, so a false negative can be traced to its exemption.
const PERMITTED_SURFACES: { label: string; text: string; expectSuppression: boolean }[] = [
  {
    label: "a prohibition of the construct",
    text: "Never edit .strict-spec-driven/config.yaml directly with apply_patch on config.yaml; use config-edit.",
    expectSuppression: true,
  },
  {
    label: "a prohibition wrapped across lines",
    text: "Generate every artifact with CLI invocations, and do not\ncreate JSON payload files.",
    expectSuppression: true,
  },
  {
    label: "a documented human-manual-edit note",
    text: "A human may use apply_patch on config.yaml (human-manual-edit).",
    expectSuppression: true,
  },
  {
    label: "read-only inspection guidance",
    text: "Inspect .strict-spec-driven/config.yaml with schema-show to confirm its shape.",
    expectSuppression: false,
  },
  {
    label: "an illustrative CLI command example",
    text: "Run strict-spec-cli config-edit --set preferred_human_language --value English.",
    expectSuppression: false,
  },
];

for (const { label, text, expectSuppression } of PERMITTED_SURFACES) {
  const result = policy.scanTextForPolicyViolations("permitted.md", text);
  context.assert(result.matches.length === 0, `${label} produces no policy violation`);
  if (expectSuppression) {
    context.assert(
      result.suppressions.length > 0 && result.suppressions.every((entry) => entry.suppressedBy.length > 0),
      `${label} records why the match was suppressed`,
    );
  }
}

// A negation in an earlier paragraph must not silence a later instruction, or one "never" at the
// top of a document would exempt everything below it.
context.assert(
  policy.scanTextForPolicyViolations(
    "paragraphs.md",
    "Do not improvise.\n\nCreate a temporary YAML payload file and pass it in.",
  ).matches.some((match) => match.category === "raw-yaml-payload"),
  "a prohibition in an earlier paragraph does not suppress a later instruction",
);

// Scope must come from the inventory, not from the guidance text, so removing a skill's protocol
// section cannot reclassify it as exempt and pass vacuously.
const mutationCapableSample = readFileSync(path.join(ROOT, "skills", "strict-spec-propose", "SKILL.md"), "utf8");
context.assert(
  policy.isMutationCapableSkill("strict-spec-propose", mutationCapableSample),
  "a skill that invokes an inventory-registered mutation command is classified mutation-capable",
);
const strippedOfProtocol = mutationCapableSample.replace(
  /## CLI-Only YAML Authoring Protocol[\s\S]*?(?=\n## )/,
  "",
);
context.assert(
  policy.isMutationCapableSkill("strict-spec-propose", strippedOfProtocol),
  "deleting the protocol section leaves the skill mutation-capable rather than exempting it",
);

// The classification set itself is pinned, not just its stability for one sample. Replacing the
// inlined protocol with a pointer rewrote the section this classifier strips before deciding, so
// "the same skills are still mutation-capable" is a claim that needs its own assertion rather than
// an argument in a review comment. The two lists are checked against the directory as well, so a
// skill added or removed later fails here instead of silently escaping classification.
const PINNED_MUTATION_CAPABLE_SKILLS = [
  "strict-roadmap-plan",
  "strict-roadmap-recommend",
  "strict-roadmap-review",
  "strict-roadmap-transition",
  "strict-spec-apply",
  "strict-spec-architecture",
  "strict-spec-archive",
  "strict-spec-auto",
  "strict-spec-brainstorm",
  "strict-spec-bugfix",
  "strict-spec-design",
  "strict-spec-design-sync",
  "strict-spec-harness-init",
  "strict-spec-harness-session",
  "strict-spec-init",
  "strict-spec-maintenance",
  "strict-spec-migrate",
  "strict-spec-modify",
  "strict-spec-propose",
  "strict-spec-propose-from-roadmap",
  "strict-spec-review",
  "strict-spec-sop",
  "strict-spec-spec-edit",
  "strict-spec-sync-specs",
  "strict-tech-edit",
  "strict-tech-sync",
];
const PINNED_READ_ONLY_SKILLS = ["strict-spec-ship", "strict-spec-verify"];

const classifiedMutationCapable: string[] = [];
const classifiedReadOnly: string[] = [];
for (const skillName of strictSkillNames) {
  const skillText = readFileSync(path.join(ROOT, "skills", skillName, "SKILL.md"), "utf8");
  (policy.isMutationCapableSkill(skillName, skillText) ? classifiedMutationCapable : classifiedReadOnly)
    .push(skillName);
}
context.assert(
  JSON.stringify(classifiedMutationCapable) === JSON.stringify(PINNED_MUTATION_CAPABLE_SKILLS),
  "isMutationCapableSkill classifies exactly the pinned set of mutation-capable skills",
  `classified: ${classifiedMutationCapable.join(", ")}`,
);
context.assert(
  JSON.stringify(classifiedReadOnly) === JSON.stringify(PINNED_READ_ONLY_SKILLS),
  "isMutationCapableSkill classifies exactly the pinned set of read-only skills",
  `classified: ${classifiedReadOnly.join(", ")}`,
);
context.assert(
  JSON.stringify([...PINNED_MUTATION_CAPABLE_SKILLS, ...PINNED_READ_ONLY_SKILLS].sort())
    === JSON.stringify([...strictSkillNames].sort()),
  "the pinned classification accounts for every bundled skill package on disk",
);
// The surface reduction this milestone exists to produce is pinned here rather than asserted in a
// change record, so a skill added back later fails a test instead of quietly restoring the count.
context.assert(
  packageValidation.summary.skillCount === 28
    && packageValidation.summary.marketplaceCount === 28
    && packageValidation.summary.diagnosticsCount === 0,
  "validate-skills reports 28 bundled skills with marketplace parity and no diagnostics",
  `skillCount: ${packageValidation.summary.skillCount}, marketplaceCount: ${packageValidation.summary.marketplaceCount}, diagnosticsCount: ${packageValidation.summary.diagnosticsCount}`,
);

// The budget is per skill rather than a repository-wide total. A single total couples every
// skill's headroom to every other skill's growth: with 5630 lines measured against a 5700-line cap,
// an unrelated skill addition failed a check that was measuring something else, and the file whose
// author could act on it was never named. A per-skill bound fails only the skill that actually
// grew.
//
// Measured across the 28 packages at 5630 lines total, largest strict-spec-auto at 515 and mean
// 201. The bound is that largest measurement plus headroom, not a target any skill was trimmed to
// reach, so raising it is a deliberate decision carrying a new measurement rather than a silent
// drift upward.
const BUNDLED_SKILL_LINE_BUDGET_PER_SKILL = 560;
const bundledSkillLineCounts = strictSkillNames.map((skillName) => ({
  skillName,
  lines: readFileSync(path.join(ROOT, "skills", skillName, "SKILL.md"), "utf8").split("\n").length - 1,
}));
// The selection is a named function so the probe below drives the same code the assertion does.
// Re-filtering the list inline would restate the comparison instead of exercising it, and an
// inverted or mis-measured real comparison would then still report a passing probe.
const skillsOverBudget = (counts: Array<{ skillName: string; lines: number }>): string[] =>
  counts
    .filter((entry) => entry.lines > BUNDLED_SKILL_LINE_BUDGET_PER_SKILL)
    .map((entry) => `${entry.skillName}: ${entry.lines}`);
const oversizedSkills = skillsOverBudget(bundledSkillLineCounts);
context.assert(
  oversizedSkills.length === 0,
  `every bundled skill stays within the measured ${BUNDLED_SKILL_LINE_BUDGET_PER_SKILL}-line per-skill budget`,
  oversizedSkills.join(", "),
);
// A budget observed only over compliant files has not been observed at all: the comparison could be
// inverted, or the measurement could read the wrong file, and both report zero oversized skills.
// The probe adds one synthetic over-budget entry and one synthetic entry exactly at the bound, so a
// comparison that fired on neither, or on both, fails here.
const probedOverBudget = skillsOverBudget([
  ...bundledSkillLineCounts,
  { skillName: "strict-spec-probe-at-bound", lines: BUNDLED_SKILL_LINE_BUDGET_PER_SKILL },
  { skillName: "strict-spec-probe-oversized", lines: BUNDLED_SKILL_LINE_BUDGET_PER_SKILL + 1 },
]);
context.assert(
  JSON.stringify(probedOverBudget)
    === JSON.stringify([`strict-spec-probe-oversized: ${BUNDLED_SKILL_LINE_BUDGET_PER_SKILL + 1}`]),
  "the per-skill budget names the one skill that exceeds it, and leaves the one sitting exactly at the bound alone",
  probedOverBudget.join(", "),
);

// A skill name pointing at no skill directory fails nothing on its own: the slash command is
// simply missing when someone types it. strict-spec-bugfix routed unclear issues to a retired
// investigation skill for several milestones and no check noticed, which is the failure this scan
// exists to make loud.
//
// The matcher, its allowlist, and the resolver are imported from the shipped module rather than
// restated here, because a matcher that lives only in a suite proves the pattern fires and never
// that the command an operator runs reports anything. The end-to-end proof through validate-skills
// lives with the policy fixtures below; this scan covers the two surfaces that command cannot see.
//
// Governed scope is what ships and routes an agent or operator to a skill: bundled skills,
// operator documentation, and source. The routing surfaces are matched in the bare form as well,
// because a name in a sentence is a command an operator will type whether or not it is backticked.
// Source files are matched only in the prefixed forms: a comment naming a deleted skill while
// explaining that it was deleted states a fact, and the same is true of the two neighbouring trees
// left outside the scan entirely — .strict-spec-driven/ workflow state records which skills existed
// when a change was archived, and test suites name deleted skills to assert their absence, so
// spec-tech-authoring.ts must spell out the deleted mapping-repair skill it forbids.
type SkillReferencesModule = {
  ROUTING_SKILL_REFERENCE_PATTERN: RegExp;
  SOURCE_SKILL_REFERENCE_PATTERN: RegExp;
  NON_SKILL_STRICT_IDENTIFIERS: ReadonlySet<string>;
  findUnpackagedSkillReferences: (
    text: string,
    packagedSkillNames: Iterable<string>,
    pattern?: RegExp,
  ) => Array<{ name: string; line: number }>;
  withoutRetirementSections: (text: string) => string;
  RETIRED_NAMES_MARKER: string;
};
const skillReferences = (await loadDistModule("skills/references.js")) as SkillReferencesModule;
const {
  ROUTING_SKILL_REFERENCE_PATTERN,
  SOURCE_SKILL_REFERENCE_PATTERN,
  NON_SKILL_STRICT_IDENTIFIERS,
  findUnpackagedSkillReferences,
  withoutRetirementSections,
  RETIRED_NAMES_MARKER,
} = skillReferences;

const danglingSkillNamesIn = (text: string, pattern = ROUTING_SKILL_REFERENCE_PATTERN): string[] =>
  findUnpackagedSkillReferences(text, strictSkillNames, pattern).map((reference) => reference.name);

// Negative case first, on synthetic text rather than the tree: a scan reporting nothing over a
// clean repository proves nothing until the same matcher has been observed firing. The probe
// names are assembled at runtime rather than written as literals, because this file is inside the
// governed scope and a literal reference here would be a real finding rather than a fixture.
const RETIRED_INVESTIGATION_SKILL = `strict-spec-${"debug"}-session`;
const RETIRED_SYNC_SKILL = `strict-roadmap-${"sync"}`;
const RETIRED_ARCHIVE_SKILL = `strict-roadmap-${"archive"}`;
const RETIRED_REORDER_SKILL = `strict-roadmap-${"reorder"}`;
context.assert(
  JSON.stringify(
    danglingSkillNamesIn(`route unclear investigations to \`${RETIRED_INVESTIGATION_SKILL}\` first`),
  ) === JSON.stringify([RETIRED_INVESTIGATION_SKILL]),
  "the dangling-reference matcher flags the backticked retired investigation-skill form that shipped unnoticed",
);
context.assert(
  JSON.stringify(danglingSkillNamesIn(`run \`/${RETIRED_SYNC_SKILL}\` after merges`))
    === JSON.stringify([RETIRED_SYNC_SKILL])
    && JSON.stringify(danglingSkillNamesIn(`see skills/${RETIRED_ARCHIVE_SKILL}/SKILL.md`))
      === JSON.stringify([RETIRED_ARCHIVE_SKILL]),
  "the matcher fires on the slash-command and skills-path reference forms as well as the backticked one",
);
// The bare form is the half that used to escape. A sentence naming a retired skill with no
// backtick and no slash reads to an operator exactly like the backticked one, and before this the
// scan saw only the punctuation.
context.assert(
  JSON.stringify(danglingSkillNamesIn(`the deleted ${RETIRED_REORDER_SKILL} entry moved here`))
    === JSON.stringify([RETIRED_REORDER_SKILL]),
  "the routing matcher fires on a bare prose mention that carries no backtick or slash",
);
// The source form must not fire on that same bare sentence, or scoping it to the routing surfaces
// would be a claim with nothing behind it; it must still fire on a diagnostic that routes a reader.
context.assert(
  danglingSkillNamesIn(
    `the deleted ${RETIRED_REORDER_SKILL} entry moved here`,
    SOURCE_SKILL_REFERENCE_PATTERN,
  ).length === 0,
  "the source matcher leaves a bare prose mention unreported, which is what keeps source commentary out of scope",
);
context.assert(
  JSON.stringify(
    danglingSkillNamesIn(`run the \`${RETIRED_SYNC_SKILL}\` skill`, SOURCE_SKILL_REFERENCE_PATTERN),
  ) === JSON.stringify([RETIRED_SYNC_SKILL]),
  "the source matcher still fires on a diagnostic message that routes a reader to a retired skill",
);
// Positive case: a live skill name and an allowlisted identifier must both pass, or the scan would
// report every file in the repository and its clean result below would be meaningless.
context.assert(
  danglingSkillNamesIn(
    "run `/strict-spec-auto`, then `strict-spec-cli verify`, per skills/strict-spec-apply/SKILL.md, "
      + "resolving schemas beneath ~/.strict-spec-schemas/",
  ).length === 0,
  "the matcher accepts existing skill names and the non-skill identifiers on its allowlist",
);

// The marker is a scope carve-out, so it needs both halves proven: it must silence the section it
// marks, and it must stop at the next heading rather than blinding the rest of the document.
const markedDocument = `## Upgrading\n\n${RETIRED_NAMES_MARKER}\n\n| \`/${RETIRED_SYNC_SKILL}\` | gone |\n`
  + `\n## Steps\n\nrun \`/${RETIRED_ARCHIVE_SKILL}\` next\n`;
context.assert(
  JSON.stringify(danglingSkillNamesIn(withoutRetirementSections(markedDocument)))
    === JSON.stringify([RETIRED_ARCHIVE_SKILL]),
  "the retirement marker silences its own section and nothing past the next heading",
  danglingSkillNamesIn(withoutRetirementSections(markedDocument)).join(", "),
);

// The governed file set comes from walking the tree, not from a hand-maintained list and not from
// git, so a file deleted but not yet staged is absent here exactly as it is on disk.
const SCANNED_TEXT_EXTENSIONS = new Set([".md", ".ts", ".js", ".json", ".yaml", ".yml"]);
function walkTextFiles(relativeDir: string, collected: string[]): string[] {
  const absoluteDir = path.join(ROOT, relativeDir);
  if (!existsSync(absoluteDir)) return collected;
  for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walkTextFiles(relativePath, collected);
      continue;
    }
    if (entry.isFile() && SCANNED_TEXT_EXTENSIONS.has(path.extname(entry.name))) collected.push(relativePath);
  }
  return collected;
}
const rootOperatorDocuments = readdirSync(ROOT, { withFileTypes: true })
  .filter((entry) => entry.isFile() && path.extname(entry.name) === ".md")
  .map((entry) => entry.name);
const routingReferenceFiles = walkTextFiles("skills", [...rootOperatorDocuments]);
const sourceReferenceFiles = walkTextFiles("src", []);
const governedReferenceFiles: Array<{ relativePath: string; pattern: RegExp }> = [
  ...routingReferenceFiles.map((relativePath) => ({ relativePath, pattern: ROUTING_SKILL_REFERENCE_PATTERN })),
  ...sourceReferenceFiles.map((relativePath) => ({ relativePath, pattern: SOURCE_SKILL_REFERENCE_PATTERN })),
];
context.assert(
  routingReferenceFiles.length > 0 && sourceReferenceFiles.length > 0,
  "the dangling-reference scan discovered files to check on both governed surfaces",
);
// An upgrade note names the commands it retires, or it cannot tell a reader which invocation
// stopped working. Those sections are marked in the document and removed here, which keeps the
// carve-out local to the marked section instead of allowlisting a name everywhere it appears.
//
// The carve-out reaches operator documentation only. A bundled skill has no upgrade note to write,
// and honouring the marker inside skills/ would hand guidance a way to exempt itself from the scan;
// the shipped validate-skills check draws the same line for the same reason.
const operatorDocumentPaths = new Set(rootOperatorDocuments);
const scannedTextOf = (relativePath: string): string => {
  const text = readFileSync(path.join(ROOT, relativePath), "utf8");
  return operatorDocumentPaths.has(relativePath) ? withoutRetirementSections(text) : text;
};

const danglingReferences: string[] = [];
for (const { relativePath, pattern } of governedReferenceFiles) {
  const text = scannedTextOf(relativePath);
  for (const { name, line } of findUnpackagedSkillReferences(text, strictSkillNames, pattern)) {
    danglingReferences.push(`${relativePath}:${line}: ${name}`);
  }
}
context.assert(
  danglingReferences.length === 0,
  "no bundled skill, operator document, or source file names a skill directory that does not exist",
  danglingReferences.join(", "),
);
// An allowlist entry that outlives the reference it excused is how this check goes quiet: the
// stale entry sits there until a real finding happens to match it. Every entry must still be
// earned by a reference somewhere in the governed scope, under whichever matcher governs its file.
const allowlistEntriesSeen = new Set<string>();
for (const { relativePath, pattern } of governedReferenceFiles) {
  const text = scannedTextOf(relativePath);
  for (const match of text.matchAll(pattern)) {
    const name = match[1] as string;
    if (NON_SKILL_STRICT_IDENTIFIERS.has(name)) allowlistEntriesSeen.add(name);
  }
}
const unusedAllowlistEntries = [...NON_SKILL_STRICT_IDENTIFIERS].filter(
  (identifier) => !allowlistEntriesSeen.has(identifier),
);
context.assert(
  unusedAllowlistEntries.length === 0,
  "every non-skill identifier on the allowlist is still referenced by a governed file",
  unusedAllowlistEntries.join(", "),
);
// The pin is only a regression guard if a reclassification would break it. The probes are
// synthetic rather than a real skill with one command removed: a bundled skill names many
// commands in passing, so removing the one it is named for leaves it mutation-capable through an
// unrelated mention, and the probe would report the classifier as broken when it is working.
const oneMutatingCommand = [...policy.loadPolicyRegistry().mutatingOwnerCommands][0];
context.assert(
  oneMutatingCommand !== undefined,
  "the inventory yields a mutating command for the classification probes",
);
context.assert(
  policy.isMutationCapableSkill("strict-probe-writer", `Run \`strict-spec-cli ${oneMutatingCommand}\` to write it.`),
  "a skill naming an inventory-registered mutation command is classified mutation-capable",
);
context.assert(
  !policy.isMutationCapableSkill(
    "strict-probe-reader",
    "Run `strict-spec-cli check-workflow-state` and read the result.",
  ),
  "a skill naming only inspection commands is not classified mutation-capable",
);

const registry = policy.loadPolicyRegistry();
context.assert(
  registry.mutatingOwnerCommands.size > 0 && registry.registeredWriterPaths.size > 0,
  "the policy registry derives both mutation commands and registered writers from the inventory",
);

// The writer allowlist reads both places the inventory records a writer. Reading only
// artifact_families would report every CLI-owned writer module as an unregistered bypass.
context.assert(
  registry.registeredWriterPaths.has("src/bundled-asset-mutation.ts")
    && registry.registeredWriterPaths.has("src/apply.ts"),
  "registered writers include both mutation_surfaces and artifact_families entries",
);

const sourceScan = policy.scanSourceForUnregisteredWriters(ROOT, "src");
context.assert(
  sourceScan.matches.length === 0,
  "no src module writes repository-owned YAML without inventory registration",
  sourceScan.matches.map((match) => `${match.file}:${match.line}`).join(", "),
);
context.assert(
  sourceScan.suppressions.length > 0
    && sourceScan.suppressions.every((entry) => entry.suppressedBy.includes("registered")),
  "registered YAML writers are recognised and recorded as suppressed rather than silently skipped",
);

// Global help flags are not mutation arguments; treating them as undeclared would flag every
// documented '--help --json' lookup the authoring protocol itself requires.
const globalFlagProse = policy.findProseMutationFlags("strict-spec-cli generate --help --json");
context.assert(
  globalFlagProse.length === 0,
  "global help flags are not reported as command mutation flags",
);

// A wrapped invocation's flags belong to that invocation, not to a command named on an earlier line.
const wrapped = policy.findProseMutationFlags(
  "run `strict-spec-cli init` first, then `strict-spec-cli spec-edit <spec-id>\n  --spec-path <path> --title <text>`",
);
context.assert(
  wrapped.every((entry) => entry.command === "spec-edit"),
  "flags on a continuation line attach to their own invocation",
  wrapped.map((entry) => `${entry.command}${entry.flag}`).join(", "),
);

// Every flag the bundled skills name for a mutation command must exist in the command metadata,
// which is what makes an undocumented mutation argument a build-time failure rather than a
// surprise at invocation time.
for (const skillName of readdirSync(path.join(ROOT, "skills"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)) {
  const skillFile = path.join(ROOT, "skills", skillName, "SKILL.md");
  if (!existsSync(skillFile)) continue;
  const text = readFileSync(skillFile, "utf8");
  if (!policy.isMutationCapableSkill(skillName, text)) continue;
  for (const { command, flag } of policy.findProseMutationFlags(text)) {
    if (!registry.mutatingOwnerCommands.has(command)) continue;
    const declared = registry.declaredFlagsByCommand.get(command);
    if (declared === undefined) continue;
    context.assert(
      declared.has(flag),
      `${skillName} names only flags the '${command}' metadata declares (${flag})`,
    );
  }
}

// The assertions above call the policy module directly. That proves the matcher fires; it does not
// prove the command an operator or agent actually runs reports the failure. validate-skills could
// stop classifying a package as mutation-capable, stop rendering the match as a diagnostic, or stop
// exiting non-zero, and every assertion above would still pass. The fixtures below close that gap by
// driving the shipped CLI over committed non-compliant packages.

const POLICY_FIXTURE_ROOT = path.join(ROOT, "test", "fixtures", "policy-skills");

/** Each committed fixture package, the category it must produce, and the text that must produce it. */
const NEGATIVE_FIXTURES: { pkg: string; category: string; violation: string }[] = [
  {
    pkg: "strict-spec-fixture-direct-file-edit",
    category: "direct-file-edit",
    violation: "Run apply_patch on .strict-spec-driven/config.yaml to set the field.",
  },
  {
    pkg: "strict-spec-fixture-shell-heredoc",
    category: "shell-or-heredoc-yaml-write",
    violation: "Write it with cat <<EOF > .strict-spec-driven/specs/x.yaml",
  },
  {
    pkg: "strict-spec-fixture-hand-edit-fallback",
    category: "hand-edit-fallback",
    violation: "If the command is unavailable, instead edit the .strict-spec-driven/specs/x.yaml by hand.",
  },
  {
    pkg: "strict-spec-fixture-raw-yaml-payload",
    category: "raw-yaml-payload",
    violation: "Create a temporary YAML payload file and pass it to the command.",
  },
];

// The manifest above is hand-written, so it is checked against the directory rather than trusted: a
// fixture added without an entry would otherwise sit on disk proving nothing.
const fixturePackagesOnDisk = readdirSync(POLICY_FIXTURE_ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
context.assert(
  JSON.stringify(fixturePackagesOnDisk) === JSON.stringify(NEGATIVE_FIXTURES.map((f) => f.pkg).sort()),
  "every committed policy fixture package is claimed by the negative-fixture manifest",
  `on disk: ${fixturePackagesOnDisk.join(", ")}`,
);

// Both enumerations of the text-scan categories must stay in lockstep, so adding a category to the
// seeded list without an end-to-end fixture fails here rather than shipping unproven at CLI level.
context.assert(
  JSON.stringify([...new Set(NEGATIVE_FIXTURES.map((f) => f.category))].sort())
    === JSON.stringify([...new Set(SEEDED_VIOLATIONS.map((v) => v.category))].sort()),
  "every seeded policy category also has an end-to-end fixture package",
);

type SkillDiagnostic = { code?: string; path?: string; message?: string };

/**
 * Runs the shipped validate-skills against a throwaway root holding the whole bundled skill set
 * plus the package under test, complete with the scripts symlink and marketplace entry a valid
 * package needs. The other packages are seeded rather than omitted because every valid strict skill
 * routes an operator to `/strict-spec-init`, so a root holding one package is a set in which that
 * routing is genuinely dead: the absent-reference check would report it, and the report would be
 * about the fixture's isolation rather than about the guidance under test. With a realistic set and
 * no other defect left, the exit status and the diagnostic list are attributable to the guidance
 * text alone, which is what makes the control run below meaningful.
 */
function validateSkillsOverPackage(pkg: string, skillText: string): { status: number; diagnostics: SkillDiagnostic[] } {
  const root = mkdtempSync(path.join(os.tmpdir(), "strict-policy-fixture-"));
  try {
    const marketplaceEntries = seedBundledSkillPackages(root);
    const packageDir = path.join(root, "skills", pkg);
    if (!existsSync(packageDir)) {
      mkdirSync(packageDir, { recursive: true });
      symlinkSync("../../dist/scripts", path.join(packageDir, "scripts"));
      marketplaceEntries.push({ name: pkg, family: "strict-spec" });
    }
    writeFileSync(path.join(packageDir, "SKILL.md"), skillText, "utf8");
    writeFileSync(
      path.join(root, "skills", "marketplace.json"),
      JSON.stringify(
        {
          schema: "strict-spec-driven/skill-marketplace/v1",
          namespace: "strict-spec-driven",
          skills: marketplaceEntries,
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    const result = cli(["validate-skills"], { cwd: root });
    let diagnostics: SkillDiagnostic[] = [];
    try {
      diagnostics = (JSON.parse(result.stdout.trim()) as { diagnostics?: SkillDiagnostic[] }).diagnostics ?? [];
    } catch {
      diagnostics = [];
    }
    return { status: result.status, diagnostics };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const describeDiagnostics = (diagnostics: SkillDiagnostic[]): string =>
  diagnostics.map((diagnostic) => `${diagnostic.code}@${diagnostic.path}`).join(", ") || "none";

for (const { pkg, category, violation } of NEGATIVE_FIXTURES) {
  const fixtureFile = path.join(POLICY_FIXTURE_ROOT, pkg, "SKILL.md");
  const fixtureText = readFileSync(fixtureFile, "utf8");

  const violationIndex = fixtureText.indexOf(violation);
  context.assert(
    violationIndex !== -1,
    `fixture ${pkg} still contains the violation text the manifest claims`,
  );
  if (violationIndex === -1) continue;
  const expectedLine = fixtureText.slice(0, violationIndex).split("\n").length;
  const expectedCode = `skill.cli_only_yaml.${category.replace(/-/g, "_")}`;
  const expectedPath = `skills/${pkg}/SKILL.md:${expectedLine}`;

  const violating = validateSkillsOverPackage(pkg, fixtureText);
  context.assert(
    violating.status !== 0,
    `validate-skills exits non-zero for a package instructing a ${category} mutation`,
  );
  context.assert(
    violating.diagnostics.length === 1
      && violating.diagnostics[0]?.code === expectedCode
      && violating.diagnostics[0]?.path === expectedPath,
    `validate-skills reports ${category} at the exact fixture path and line, and nothing else`,
    `expected only ${expectedCode} at ${expectedPath}; got ${describeDiagnostics(violating.diagnostics)}`,
  );

  // The control run is the same package with the one forbidden line removed. It must come back
  // clean and exit zero, which attributes both the failure and its diagnostic to that line rather
  // than to anything else about the fixture.
  const compliantText = fixtureText.split("\n").filter((line) => !line.includes(violation)).join("\n");
  const compliant = validateSkillsOverPackage(pkg, compliantText);
  context.assert(
    compliant.status === 0 && compliant.diagnostics.length === 0,
    `removing the ${category} instruction makes the same package validate cleanly`,
    `status ${compliant.status}; ${describeDiagnostics(compliant.diagnostics)}`,
  );
}

// --- Shipped guidance-check fixtures ---------------------------------------------------------
// The two checks below govern text the bundled skills already satisfy, so the clean repository run
// above is not evidence either one can fail. Each is driven through the shipped command over a
// committed fixture carrying exactly one defect, with the paired control run attributing the
// failure to that line rather than to anything else about the package.

const GUIDANCE_FIXTURE_ROOT = path.join(ROOT, "test", "fixtures", "guidance-skills");

/** Each committed fixture package, the diagnostic code it must produce, and the line that produces it. */
const GUIDANCE_FIXTURES: { pkg: string; code: string; violation: string }[] = [
  {
    pkg: "strict-spec-fixture-absent-skill-reference",
    code: "skill.reference.unpackaged",
    violation: "2. **Hand off** — when the roadmap needs reconciling, run",
  },
  {
    pkg: "strict-spec-fixture-restated-precondition",
    code: "skill.strict_workflow.precondition.restated",
    violation: "- Restated here on purpose:",
  },
];

// The manifest is hand-written, so it is checked against the directory rather than trusted: a
// fixture added without an entry would otherwise sit on disk proving nothing.
const guidanceFixturesOnDisk = readdirSync(GUIDANCE_FIXTURE_ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
context.assert(
  JSON.stringify(guidanceFixturesOnDisk) === JSON.stringify(GUIDANCE_FIXTURES.map((f) => f.pkg).sort()),
  "every committed guidance fixture package is claimed by the guidance-fixture manifest",
  `on disk: ${guidanceFixturesOnDisk.join(", ")}`,
);

for (const { pkg, code, violation } of GUIDANCE_FIXTURES) {
  const fixtureText = readFileSync(path.join(GUIDANCE_FIXTURE_ROOT, pkg, "SKILL.md"), "utf8");
  context.assert(
    fixtureText.includes(violation),
    `guidance fixture ${pkg} still contains the line the manifest claims`,
  );

  const violating = validateSkillsOverPackage(pkg, fixtureText);
  context.assert(
    violating.status !== 0,
    `validate-skills exits non-zero for a package carrying a ${code} defect`,
  );
  context.assert(
    violating.diagnostics.length > 0 && violating.diagnostics.every((diagnostic) => diagnostic.code === code),
    `validate-skills reports ${code} for that package and nothing else`,
    describeDiagnostics(violating.diagnostics),
  );

  // The control run is the same package with the one offending line removed. It must come back
  // clean and exit zero, which attributes both the failure and its diagnostic to that line.
  const compliantText = fixtureText.split("\n").filter((line) => !line.includes(violation)).join("\n");
  const compliant = validateSkillsOverPackage(pkg, compliantText);
  context.assert(
    compliant.status === 0 && compliant.diagnostics.length === 0,
    `removing the offending line makes the ${pkg} package validate cleanly`,
    `status ${compliant.status}; ${describeDiagnostics(compliant.diagnostics)}`,
  );
}

// The absent-reference diagnostic has to locate the reference, not just name the file: a skill names
// many things, and a reader given only the path has to search for the one that no longer resolves.
const absentReferenceText = readFileSync(
  path.join(GUIDANCE_FIXTURE_ROOT, "strict-spec-fixture-absent-skill-reference", "SKILL.md"),
  "utf8",
);
const absentReferenceLine = absentReferenceText
  .split("\n")
  .findIndex((line) => line.includes("when the roadmap needs reconciling")) + 1;
const absentReferenceRun = validateSkillsOverPackage(
  "strict-spec-fixture-absent-skill-reference",
  absentReferenceText,
);
context.assert(
  absentReferenceRun.diagnostics[0]?.path
    === `skills/strict-spec-fixture-absent-skill-reference/SKILL.md:${absentReferenceLine}`
    && (absentReferenceRun.diagnostics[0]?.message ?? "").includes("strict-roadmap-sync"),
  "the absent-reference diagnostic carries the fixture path, the reference line, and the missing skill name",
  `${absentReferenceRun.diagnostics[0]?.path}: ${absentReferenceRun.diagnostics[0]?.message}`,
);

// --- Collapsed shared-guidance checks --------------------------------------------------------
// Both checks below govern text this same change rewrote across every bundled skill, so a green
// run over that text proves nothing on its own. Each element is therefore removed from a real
// bundled skill and the shipped command is observed to fail, which is what separates an enforced
// requirement from a deleted one.

type SkillsModelModule = {
  PREFERRED_HUMAN_LANGUAGE_SNIPPETS: ReadonlyArray<{ snippet: string; element: string }>;
  STRICT_WORKFLOW_SHARED_ELEMENTS: ReadonlyArray<{ snippet: string; element: string }>;
  PREREQUISITES_HEADING: string;
  PREFERRED_HUMAN_LANGUAGE_HEADING: string;
};
const skillsModel = (await loadDistModule("skills/model.js")) as SkillsModelModule;

const PROBE_SKILL = "strict-spec-apply";
const probeSkillText = readFileSync(path.join(ROOT, "skills", PROBE_SKILL, "SKILL.md"), "utf8");

// Skills wrap prose, so a snippet the checks match after whitespace normalization is usually split
// across two lines in the file. Probes that edit the raw text must therefore match the same way, or
// they silently change nothing and the negative case passes for the wrong reason.
const escapeForRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const flexibleWhitespace = (text: string): RegExp =>
  new RegExp(text.split(/\s+/).map(escapeForRegExp).join("\\s+"), "gi");

// The control: the unmodified skill must validate cleanly, or every failure below is attributable
// to something other than the element removed from it.
const probeControl = validateSkillsOverPackage(PROBE_SKILL, probeSkillText);
context.assert(
  probeControl.status === 0 && probeControl.diagnostics.length === 0,
  "the unmodified probe skill validates cleanly, so the removals below are the only variable",
  `status ${probeControl.status}; ${describeDiagnostics(probeControl.diagnostics)}`,
);

context.assert(
  skillsModel.PREFERRED_HUMAN_LANGUAGE_SNIPPETS.length > 0,
  "the preferred-human-language element list is not empty, so the probes below are not vacuous",
);
for (const { snippet, element } of skillsModel.PREFERRED_HUMAN_LANGUAGE_SNIPPETS) {
  const withoutElement = probeSkillText.replace(flexibleWhitespace(snippet), "REMOVED");
  context.assert(
    withoutElement !== probeSkillText,
    `the probe skill carries ${element}, so removing it is a real change`,
  );
  const probed = validateSkillsOverPackage(PROBE_SKILL, withoutElement);
  context.assert(
    probed.status !== 0
      && probed.diagnostics.some((diagnostic) => diagnostic.code === "skill.preferred_human_language.element.missing"),
    `removing ${element} makes validate-skills report the missing preferred-human-language element`,
    `status ${probed.status}; ${describeDiagnostics(probed.diagnostics)}`,
  );
}

// Deleting the whole section must fail too, so the collapsed sentence cannot be dropped entirely.
const languageStart = probeSkillText.indexOf(skillsModel.PREFERRED_HUMAN_LANGUAGE_HEADING);
const languageEnd = probeSkillText.indexOf("\n## ", languageStart + skillsModel.PREFERRED_HUMAN_LANGUAGE_HEADING.length);
const withoutLanguageSection = probeSkillText.slice(0, languageStart) + probeSkillText.slice(languageEnd + 1);
const languageSectionRemoved = validateSkillsOverPackage(PROBE_SKILL, withoutLanguageSection);
context.assert(
  languageSectionRemoved.diagnostics.some((diagnostic) => diagnostic.code === "skill.preferred_human_language.section.missing"),
  "deleting the preferred-human-language section makes validate-skills report the missing section",
  describeDiagnostics(languageSectionRemoved.diagnostics),
);

// Restating the guidance as a paragraph must fail, or the collapse is a one-time edit rather than
// an enforced shape and the nine-line copy can grow straight back.
const paragraphRestated = probeSkillText.replace(
  `${skillsModel.PREFERRED_HUMAN_LANGUAGE_HEADING}\n`,
  `${skillsModel.PREFERRED_HUMAN_LANGUAGE_HEADING}\n\nThis field is a human-language preference.\n`,
);
const paragraphProbe = validateSkillsOverPackage(PROBE_SKILL, paragraphRestated);
context.assert(
  paragraphProbe.diagnostics.some((diagnostic) => diagnostic.code === "skill.preferred_human_language.not_single_sentence"),
  "expanding the preferred-human-language guidance past one sentence makes validate-skills report it",
  describeDiagnostics(paragraphProbe.diagnostics),
);

// An ordinary abbreviation inside that one sentence is not a second sentence. Before the mask, a
// rider worded with `e.g.` would have been reported as two sentences, with a message naming the
// paragraph shape rather than the punctuation that actually tripped it.
const abbreviatedGuidance = probeSkillText.replace(
  "the active user message asks otherwise.",
  "the active user message asks otherwise, e.g. by naming another language.",
);
context.assert(
  abbreviatedGuidance !== probeSkillText,
  "the abbreviation probe found the preferred-human-language sentence to extend",
);
const abbreviatedProbe = validateSkillsOverPackage(PROBE_SKILL, abbreviatedGuidance);
context.assert(
  abbreviatedProbe.status === 0 && abbreviatedProbe.diagnostics.length === 0,
  "an abbreviation inside the preferred-human-language sentence is not counted as a sentence end",
  `status ${abbreviatedProbe.status}; ${describeDiagnostics(abbreviatedProbe.diagnostics)}`,
);
// The mask must not have disabled the count: a genuine second sentence in the same position, with
// the same terminator, must still be reported.
const secondSentenceGuidance = probeSkillText.replace(
  "the active user message asks otherwise.",
  "the active user message asks otherwise. Restate that rule in your own words first.",
);
const secondSentenceProbe = validateSkillsOverPackage(PROBE_SKILL, secondSentenceGuidance);
context.assert(
  secondSentenceProbe.diagnostics.some(
    (diagnostic) => diagnostic.code === "skill.preferred_human_language.not_single_sentence",
  ),
  "a genuine second sentence is still reported after the abbreviation mask",
  describeDiagnostics(secondSentenceProbe.diagnostics),
);

// The repetition check: reintroducing a Prerequisites section that restates guidance the Steps
// section already carries must fail, naming the skill.
context.assert(
  skillsModel.STRICT_WORKFLOW_SHARED_ELEMENTS.length > 0,
  "the shared workflow-state element list is not empty, so the probe below is not vacuous",
);
for (const { snippet, element } of skillsModel.STRICT_WORKFLOW_SHARED_ELEMENTS) {
  const restated = probeSkillText.replace(
    "## Steps\n",
    `${skillsModel.PREREQUISITES_HEADING}\n\n${snippet}\n\n## Steps\n`,
  );
  const restatedProbe = validateSkillsOverPackage(PROBE_SKILL, restated);
  context.assert(
    restatedProbe.status !== 0
      && restatedProbe.diagnostics.some((diagnostic) =>
        diagnostic.code === "skill.strict_workflow.precondition.restated"
        && diagnostic.path === `skills/${PROBE_SKILL}/SKILL.md`),
    `restating ${element} in a Prerequisites section makes validate-skills report the repetition and name the skill`,
    `status ${restatedProbe.status}; ${describeDiagnostics(restatedProbe.diagnostics)}`,
  );
}

// Placement is not constrained, only repetition: a skill that states the guidance once under
// Prerequisites and nowhere else must pass, which is the shape the four committed policy fixtures
// rely on. The Steps copy is stripped first so the guidance genuinely appears once.
const strippedOfStepsCopy = skillsModel.STRICT_WORKFLOW_SHARED_ELEMENTS.reduce(
  (text, { snippet }) => text.replace(flexibleWhitespace(snippet), ""),
  probeSkillText,
);
const statedOnlyInPrerequisites = strippedOfStepsCopy.replace(
  "## Steps\n",
  `${skillsModel.PREREQUISITES_HEADING}\n\n`
    + skillsModel.STRICT_WORKFLOW_SHARED_ELEMENTS.map(({ snippet }) => snippet).join(" ")
    + "\n\n## Steps\n",
);
const singleStatementProbe = validateSkillsOverPackage(PROBE_SKILL, statedOnlyInPrerequisites);
context.assert(
  !singleStatementProbe.diagnostics.some((diagnostic) => diagnostic.code === "skill.strict_workflow.precondition.restated"),
  "stating the workflow-state guidance only under Prerequisites is not reported as repetition",
  describeDiagnostics(singleStatementProbe.diagnostics),
);

// --- Exception audit -------------------------------------------------------------------------
// Every check above can be silenced by an exemption, and an exemption that nobody enumerates is
// indistinguishable from compliance: both report zero findings. The audit makes the exceptions
// themselves the subject, so one cannot be added without a reason or quietly stop applying.

context.assert(
  policy.EXEMPT_PATH_PREFIXES.length > 0,
  "the policy declares at least one exempt path prefix, so the audit below is not vacuous",
);

for (const { prefix, reason } of policy.EXEMPT_PATH_PREFIXES) {
  context.assert(
    reason.trim().length > 0,
    `the '${prefix}' path exemption records why it is exempt`,
  );
  // An exemption is only real while it still fires. Probing it with a path underneath the prefix
  // catches one that has been narrowed or misspelled into never matching anything.
  context.assert(
    policy.exemptPathReason(`${prefix}probe/example.md`) === reason,
    `the '${prefix}' path exemption still applies to paths beneath it`,
    String(policy.exemptPathReason(`${prefix}probe/example.md`)),
  );
}

// A path outside every prefix must not come back exempt, or the audit above would pass against an
// exemption that swallowed the whole repository.
context.assert(
  policy.exemptPathReason("src/cli-only-yaml-policy.ts") === undefined,
  "a governed source path is not reported as exempt",
);

// The generated-document skip is the other way a surface leaves the policy's scope. It is keyed on
// a banner, so both directions are probed: the banner exempts, and its absence does not.
context.assert(
  policy.GENERATED_DOCUMENT_BANNER.trim().length > 0
    && policy.isGeneratedDocument(`# Title\n\n${policy.GENERATED_DOCUMENT_BANNER}\n\nBody.`)
    && !policy.isGeneratedDocument("# Title\n\nHand-authored guidance.\n"),
  "the generated-document exemption applies to banner-marked text and to nothing else",
);

// Registered writers are the third exception: a module writing YAML is permitted only because the
// inventory names it. Each registration must still resolve to a file, so a deleted or renamed
// module cannot leave a permanent hole in the allowlist.
const registeredWriters = [...registry.registeredWriterPaths].sort();
context.assert(
  registeredWriters.length > 0,
  "the inventory registers at least one permitted YAML writer",
);
const staleRegistrations = registeredWriters.filter(
  (writerPath) => !writerPath.includes("*") && !existsSync(path.join(ROOT, writerPath)),
);
context.assert(
  staleRegistrations.length === 0,
  "every registered YAML writer path still resolves to a file in the repository",
  staleRegistrations.join(", "),
);

// Finally, the src scan must report every suppression it applied rather than dropping it, so the
// count of silenced matches is observable instead of implicit.
context.assert(
  sourceScan.suppressions.length > 0
    && sourceScan.suppressions.every(
      (entry) => entry.suppressedBy.trim().length > 0 && registry.registeredWriterPaths.has(entry.file),
    ),
  "every suppressed source-writer match names its reason and the registration that silenced it",
  sourceScan.suppressions
    .filter((entry) => !registry.registeredWriterPaths.has(entry.file))
    .map((entry) => entry.file)
    .join(", "),
);

}

}
