import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { ROOT, TestContext, cli, loadDistModule, runCommand } from "../support/harness.js";

/**
 * Coverage for the AI CLI-only YAML authoring protocol surface.
 *
 * The protocol's value is that every surface teaches the same ordered workflow, so these assertions
 * are mostly about agreement and about the boundary step surviving: a surface that quietly dropped
 * the no-fallback rule would still look correct field by field.
 */

const EXPECTED_STEP_IDS = [
  "read-command-help",
  "resolve-schema",
  "inspect-example",
  "translate-to-named-arguments",
  "execute-owning-command",
  "inspect-structured-result",
  "validate-artifact",
];

type ProtocolStep = {
  order: number;
  id: string;
  title: string;
  intent: string;
  commands: string[];
  unavailable?: string;
};

type ProtocolResult = {
  valid: boolean;
  schemaCacheRoot: string;
  schemaCacheAvailable: boolean;
  steps?: ProtocolStep[];
  boundary?: { id: string; statement: string; reportContains: string[] };
  artifactKind?: string;
  artifactTypes?: Array<{ artifactType: string; schemaKey?: string; schemaFilePath?: string; exampleKey?: string; exampleFilePath?: string }>;
  schemaKey?: string;
  schemaFilePath?: string;
  exampleKey?: string;
  exampleFilePath?: string;
  validationCommand?: string;
  operations?: Array<{ operation: string; state: string; cliOwned: boolean; commands: string[] }>;
  diagnostics: Array<{ code: string; message: string; actual?: string }>;
};

function parse(stdout: string): ProtocolResult {
  return JSON.parse(stdout) as ProtocolResult;
}

export async function runYamlAuthoringProtocolSuite(context: TestContext): Promise<void> {
  context.section("[yaml-authoring-protocol] generic protocol");

  const generic = cli(["yaml-authoring-protocol"]);
  const genericResult = parse(generic.stdout);

  context.assert(generic.status === 0, "generic protocol exits zero");
  context.assert(generic.stderr === "", "generic protocol keeps stderr empty on success", generic.stderr);
  context.assert(genericResult.valid, "generic protocol reports valid");
  context.assert(
    JSON.stringify(genericResult.steps?.map((step) => step.id)) === JSON.stringify(EXPECTED_STEP_IDS),
    "generic protocol reports every step in the fixed order",
    JSON.stringify(genericResult.steps?.map((step) => step.id)),
  );
  context.assert(
    (genericResult.steps ?? []).every((step, index) => step.order === index + 1),
    "generic protocol step order fields match their positions",
  );
  context.assert(
    (genericResult.steps ?? []).every((step) => step.intent.length > 0 && step.title.length > 0),
    "every generic protocol step states a title and an intent",
  );
  context.assert(
    genericResult.steps?.some((step) => step.id === "validate-artifact") === true,
    "generic protocol includes the validation step",
  );
  context.assert(
    genericResult.boundary?.id === "no-direct-edit-fallback",
    "generic protocol reports the no-fallback boundary",
  );
  context.assert(
    (genericResult.boundary?.statement ?? "").includes("stop and report the missing capability"),
    "the boundary states that an unavailable capability stops the workflow",
  );
  context.assert(
    (genericResult.boundary?.reportContains ?? []).length > 0,
    "the boundary names what an actionable missing-capability report contains",
  );

  // A protocol an agent may consult mid-workflow must be safe to call; a write here would make the
  // discovery step itself a mutation.
  const firstRequest = cli(["yaml-authoring-protocol"]).stdout;
  const secondRequest = cli(["yaml-authoring-protocol"]).stdout;
  context.assert(
    firstRequest === secondRequest,
    "repeated generic protocol requests are byte-identical and non-mutating",
  );

  context.section("[yaml-authoring-protocol] artifact-bound protocol");

  const bound = cli(["yaml-authoring-protocol", "workflow-config"]);
  const boundResult = parse(bound.stdout);

  context.assert(bound.status === 0, "bound protocol exits zero for an inventoried artifact kind");
  context.assert(boundResult.artifactKind === "workflow-config", "bound protocol names the artifact kind");
  context.assert(
    JSON.stringify(boundResult.steps?.map((step) => step.id)) === JSON.stringify(EXPECTED_STEP_IDS),
    "bound protocol reports the same steps in the same order as the generic protocol",
  );
  context.assert(
    boundResult.schemaKey === "strict-spec-driven/schemas/config.yaml",
    "bound protocol reports the bundled schema key",
    boundResult.schemaKey,
  );
  context.assert(
    boundResult.exampleKey === "examples/strict-spec-driven/config.yaml",
    "bound protocol reports the bundled example key",
    boundResult.exampleKey,
  );
  context.assert(
    boundResult.schemaFilePath !== undefined && existsSync(boundResult.schemaFilePath),
    "bound protocol resolves the schema beneath the shared schema cache",
    boundResult.schemaFilePath,
  );
  context.assert(
    boundResult.exampleFilePath !== undefined && existsSync(boundResult.exampleFilePath),
    "bound protocol resolves the example beneath the shared schema cache",
    boundResult.exampleFilePath,
  );
  context.assert(
    boundResult.validationCommand === "check-workflow-state",
    "bound protocol reports the inventoried validation command",
    boundResult.validationCommand,
  );

  const helpStep = boundResult.steps?.find((step) => step.id === "read-command-help");
  const executeStep = boundResult.steps?.find((step) => step.id === "execute-owning-command");
  const validateStep = boundResult.steps?.find((step) => step.id === "validate-artifact");
  context.assert(
    helpStep?.commands.includes("config-edit --help --json") === true,
    "the help step names the owning command's machine-readable help",
    JSON.stringify(helpStep?.commands),
  );
  context.assert(
    executeStep?.commands.some((command) => command.startsWith("config-edit ")) === true,
    "the execute step names the owning mutation command",
    JSON.stringify(executeStep?.commands),
  );
  context.assert(
    JSON.stringify(validateStep?.commands) === JSON.stringify(["check-workflow-state"]),
    "the validate step runs the family's inventoried validation command",
    JSON.stringify(validateStep?.commands),
  );
  context.assert(
    boundResult.steps?.find((step) => step.id === "resolve-schema")?.commands.includes("schema-show config") === true,
    "the schema step names the ready-to-run schema-show command",
  );
  context.assert(
    boundResult.steps?.find((step) => step.id === "inspect-example")?.commands.includes("sample-show config") === true,
    "the example step names the ready-to-run sample-show command",
  );

  // A family registering several artifact types must name every one of their schemas. Collapsing
  // them would report "no registered schema" for the most-used family in the workflow.
  const multiType = parse(cli(["yaml-authoring-protocol", "change-planning-state"]).stdout);
  const multiTypeNames = (multiType.artifactTypes ?? []).map((entry) => entry.artifactType);
  context.assert(
    multiTypeNames.length > 1,
    "the multi-type fixture family registers more than one artifact type",
    multiTypeNames.join(", "),
  );
  const multiTypeSchemaStep = multiType.steps?.find((step) => step.id === "resolve-schema");
  context.assert(
    multiTypeSchemaStep?.unavailable === undefined,
    "a multi-type family does not report its schemas as unavailable",
    multiTypeSchemaStep?.unavailable,
  );
  context.assert(
    (multiTypeSchemaStep?.commands ?? []).length === multiTypeNames.length,
    "a multi-type family names one schema-show command per artifact type",
    JSON.stringify(multiTypeSchemaStep?.commands),
  );
  context.assert(
    (multiType.artifactTypes ?? []).every(
      (entry) => entry.schemaKey !== undefined && entry.schemaFilePath !== undefined && existsSync(entry.schemaFilePath),
    ),
    "every artifact type in a multi-type family reports its own resolved schema",
  );

  const deleteOperation = boundResult.operations?.find((entry) => entry.operation === "delete");
  context.assert(
    deleteOperation?.state === "human-only" && deleteOperation.cliOwned === false,
    "bound protocol reports an operation state verbatim from the inventory",
    JSON.stringify(deleteOperation),
  );
  context.assert(
    (deleteOperation?.commands ?? []).length === 0,
    "bound protocol claims no owning command for an operation the inventory does not record as cli-owned",
  );

  context.section("[yaml-authoring-protocol] unknown artifact kind and cache degradation");

  const unknown = cli(["yaml-authoring-protocol", "not-an-artifact-kind"]);
  const unknownResult = parse(unknown.stdout);
  context.assert(unknown.status !== 0, "an artifact kind absent from the inventory exits non-zero");
  context.assert(!unknownResult.valid, "an unknown artifact kind reports valid false");
  context.assert(
    unknownResult.diagnostics.some((diagnostic) => diagnostic.code === "unknown-artifact-kind"),
    "an unknown artifact kind reports a deterministic diagnostic code",
  );
  context.assert(
    unknownResult.diagnostics.some((diagnostic) => diagnostic.actual === "not-an-artifact-kind"),
    "the diagnostic names the unknown artifact kind",
  );
  context.assert(
    unknownResult.steps === undefined && unknownResult.artifactKind === undefined,
    "an unknown artifact kind reports no partial protocol result",
  );

  // The CLI synchronizes the shared schema cache on startup, so an empty directory would simply be
  // populated; occupying the path with a regular file is the only durable way to deny the cache.
  const cacheTempRoot = mkdtempSync(path.join(os.tmpdir(), "strict-protocol-cache-"));
  const occupiedCachePath = path.join(cacheTempRoot, "not-a-directory");
  writeFileSync(occupiedCachePath, "this path is a file, so no cache directory can be created here\n", "utf8");

  try {
    const degraded = cli(["yaml-authoring-protocol", "workflow-config"], {
      env: { STRICT_SPEC_SCHEMA_CACHE_DIR: occupiedCachePath },
    });
    const degradedResult = parse(degraded.stdout);

    context.assert(degraded.status === 0, "an unavailable shared schema cache still succeeds");
    context.assert(
      degradedResult.schemaCacheAvailable === false,
      "an unavailable shared schema cache is reported as unavailable",
    );
    context.assert(
      degradedResult.schemaKey === "strict-spec-driven/schemas/config.yaml",
      "an unavailable cache still reports the bundled schema key",
      degradedResult.schemaKey,
    );
    context.assert(
      degradedResult.exampleKey === "examples/strict-spec-driven/config.yaml",
      "an unavailable cache still reports the bundled example key",
    );
    context.assert(
      degradedResult.schemaFilePath === undefined && degradedResult.exampleFilePath === undefined,
      "an unavailable cache presents no cache-derived path as resolved",
    );
    context.assert(
      degradedResult.steps?.find((step) => step.id === "resolve-schema")?.unavailable !== undefined,
      "an unavailable cache explains why the schema step carries no resolved path",
    );
    context.assert(
      JSON.stringify(degradedResult.steps?.map((step) => step.id)) === JSON.stringify(EXPECTED_STEP_IDS),
      "an unavailable cache does not drop or reorder any protocol step",
    );
    context.assert(
      degradedResult.boundary?.id === "no-direct-edit-fallback",
      "an unavailable cache still reports the no-fallback boundary",
    );
  } finally {
    rmSync(cacheTempRoot, { recursive: true, force: true });
  }

  context.section("[yaml-authoring-protocol] installed-environment resolution");

  // An installed Skill has no source-repository templates directory, so the protocol must resolve
  // its assets from the shared cache alone rather than from this checkout.
  const installedTempRoot = mkdtempSync(path.join(os.tmpdir(), "strict-protocol-installed-"));
  const installedCacheRoot = path.join(installedTempRoot, "schema-cache");

  try {
    const installed = cli(["yaml-authoring-protocol", "workflow-config"], {
      cwd: os.tmpdir(),
      env: { STRICT_SPEC_SCHEMA_CACHE_DIR: installedCacheRoot },
    });
    const installedResult = parse(installed.stdout);

    context.assert(installed.status === 0, "the protocol resolves outside the repository checkout");
    context.assert(
      installedResult.schemaCacheRoot === installedCacheRoot,
      "the protocol reports the configured cache root",
      installedResult.schemaCacheRoot,
    );
    context.assert(
      installedResult.schemaFilePath !== undefined
        && installedResult.schemaFilePath.startsWith(installedCacheRoot)
        && existsSync(installedResult.schemaFilePath),
      "the schema resolves beneath the configured cache root in an installed environment",
      installedResult.schemaFilePath,
    );
    context.assert(
      installedResult.exampleFilePath !== undefined
        && installedResult.exampleFilePath.startsWith(installedCacheRoot)
        && existsSync(installedResult.exampleFilePath),
      "the example resolves beneath the configured cache root in an installed environment",
      installedResult.exampleFilePath,
    );
    // Every asset the protocol references, across every inventoried family, must resolve there —
    // one family resolving is not evidence that the packaged set does.
    const surfaceModule = await loadDistModule<{
      listYamlSurfaceFamilies: () => Array<{ kind: string }>;
    }>("yaml-mutation-surface.js");
    const kinds = surfaceModule.listYamlSurfaceFamilies().map((family) => family.kind);
    const unresolved: string[] = [];
    for (const kind of kinds) {
      const perKind = parse(
        cli(["yaml-authoring-protocol", kind], {
          cwd: os.tmpdir(),
          env: { STRICT_SPEC_SCHEMA_CACHE_DIR: installedCacheRoot },
        }).stdout,
      );
      if (perKind.schemaKey !== undefined && (perKind.schemaFilePath === undefined || !existsSync(perKind.schemaFilePath))) {
        unresolved.push(`${kind}:schema`);
      }
      if (perKind.exampleKey !== undefined && (perKind.exampleFilePath === undefined || !existsSync(perKind.exampleFilePath))) {
        unresolved.push(`${kind}:example`);
      }
    }
    context.assert(
      kinds.length > 0 && unresolved.length === 0,
      "every referenced schema and example key resolves to a cached file in an installed environment",
      unresolved.join(", "),
    );
  } finally {
    rmSync(installedTempRoot, { recursive: true, force: true });
  }

  context.section("[yaml-authoring-protocol] surface agreement and inventory contract");

  const protocolModule = await loadDistModule<{
    YAML_AUTHORING_PROTOCOL_STEPS: ProtocolStep[];
    YAML_AUTHORING_PROTOCOL_BOUNDARY: { id: string; statement: string };
  }>("yaml-authoring-protocol.js");

  context.assert(
    JSON.stringify(protocolModule.YAML_AUTHORING_PROTOCOL_STEPS.map((step) => step.id))
      === JSON.stringify(genericResult.steps?.map((step) => step.id)),
    "the CLI renders the protocol module's step order rather than its own literal",
  );
  context.assert(
    protocolModule.YAML_AUTHORING_PROTOCOL_BOUNDARY.statement === genericResult.boundary?.statement,
    "the CLI renders the protocol module's boundary statement verbatim",
  );

  const mcpInventory = await loadDistModule<{
    MCP_READ_ONLY_TOOL_INVENTORY: Array<{ name: string; cliCommand: string; mutates: boolean; description: string }>;
    MCP_MUTATING_TOOL_INVENTORY: Array<{ name: string; cliCommand: string; description: string }>;
  }>("mcp/inventory.js");

  const protocolTool = mcpInventory.MCP_READ_ONLY_TOOL_INVENTORY.find(
    (tool) => tool.cliCommand === "yaml-authoring-protocol",
  );
  context.assert(protocolTool !== undefined, "MCP exposes the authoring protocol as a tool");
  context.assert(
    protocolTool?.mutates === false,
    "the MCP authoring protocol tool is declared read-only",
  );

  const mutatingWithoutProtocol = mcpInventory.MCP_MUTATING_TOOL_INVENTORY.filter(
    (tool) => tool.description.includes("Writes YAML artifact kinds:")
      && !tool.description.includes("yaml-authoring-protocol"),
  ).map((tool) => tool.name);
  context.assert(
    mutatingWithoutProtocol.length === 0,
    "every MCP mutating tool that writes YAML routes callers to the authoring protocol",
    mutatingWithoutProtocol.join(", "),
  );

  const metadataModule = await loadDistModule<{
    getCommandMetadata: (name: string) => { name: string; group: string; output: { keys?: string[] }; notes?: string[] };
  }>("cli/command-metadata.js");
  const metadata = metadataModule.getCommandMetadata("yaml-authoring-protocol");
  context.assert(metadata.group === "assets", "the protocol command is registered in the bundled-assets group");
  context.assert(
    (metadata.output.keys ?? []).includes("boundary") && (metadata.output.keys ?? []).includes("steps"),
    "command metadata documents the protocol output keys",
  );

  const rootHelp = cli(["--help"]);
  context.assert(
    rootHelp.stdout.includes("yaml-authoring-protocol"),
    "root help lists the protocol command",
  );

  context.section("[yaml-authoring-protocol] inventory validation command contract");

  const inventoryPath = path.join(ROOT, "inventory", "yaml-mutation-surfaces.yaml");
  const inventoryText = readFileSync(inventoryPath, "utf8");
  const inventoryTempRoot = mkdtempSync(path.join(os.tmpdir(), "strict-protocol-inventory-"));

  try {
    context.assert(
      inventoryText.includes("validation_command: check-workflow-state"),
      "the inventory records a validation command for a cli-owned family",
    );

    // Dropping one family's validation_command must fail the dedicated checker; without that the
    // protocol's final step could silently become unrunnable for a family.
    const strippedPath = path.join(inventoryTempRoot, "stripped.yaml");
    const strippedText = inventoryText.replace("    validation_command: check-workflow-state\n", "");
    context.assert(
      strippedText !== inventoryText,
      "the stripped inventory fixture actually removed the validation command",
    );
    writeFileSync(strippedPath, strippedText, "utf8");

    const checkerResult = runCommand(
      "bun",
      [path.join(ROOT, "scripts", "check-yaml-mutation-inventory.ts"), ROOT, "--candidate", strippedPath],
    );
    const checkerReport = JSON.parse(checkerResult.stdout) as {
      valid: boolean;
      diagnostics: Array<{ code: string; path: string }>;
    };
    context.assert(
      checkerResult.status !== 0 && !checkerReport.valid,
      "the inventory checker rejects a cli-owned family with no validation command",
    );
    context.assert(
      checkerReport.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "missing-validation-command"
          && diagnostic.path === "$.artifact_families.workflow-config.validation_command",
      ),
      "the checker reports a path-specific missing-validation-command diagnostic",
      JSON.stringify(checkerReport.diagnostics.map((diagnostic) => diagnostic.code)),
    );

    // A family with no cli-owned operation must stay exempt, or human-only families would be forced
    // to invent a command nobody would run.
    const humanOnlyExempt = runCommand(
      "bun",
      [path.join(ROOT, "scripts", "check-yaml-mutation-inventory.ts"), ROOT],
    );
    const exemptReport = JSON.parse(humanOnlyExempt.stdout) as { valid: boolean };
    context.assert(
      exemptReport.valid,
      "the committed inventory passes without a validation command on families that have no cli-owned operation",
    );
  } finally {
    rmSync(inventoryTempRoot, { recursive: true, force: true });
  }

  const surfaceShow = cli(["yaml-surface-show", "workflow-config"]);
  const surfaceFamily = JSON.parse(surfaceShow.stdout) as { family: { validationCommand?: string } };
  context.assert(
    surfaceFamily.family.validationCommand === "check-workflow-state",
    "the mutation surface reports the inventoried validation command verbatim",
    surfaceFamily.family.validationCommand,
  );
}
