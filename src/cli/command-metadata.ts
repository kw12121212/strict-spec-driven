import {
  loadYamlMutationSurface,
  YAML_SURFACE_OPERATIONS,
  type YamlSurfaceOperationName,
} from "../yaml-mutation-surface.js";
import { COMMAND_METADATA_ENTRIES } from "./command-metadata-entries.js";

export const COMMAND_GROUP_ORDER = [
  "workflow",
  "change",
  "generation",
  "assets",
  "maintenance",
  "roadmap",
  "sop",
  "lessons",
  "operations",
  "migration",
  "mcp",
] as const;

export type CliCommandGroup = (typeof COMMAND_GROUP_ORDER)[number];

export const COMMAND_GROUP_TITLES: Record<CliCommandGroup, string> = {
  workflow: "Workflow state",
  change: "Change lifecycle",
  generation: "Artifact generation",
  assets: "Bundled assets",
  maintenance: "Repository maintenance (this checkout only)",
  roadmap: "Roadmap",
  sop: "Standard operating procedures",
  lessons: "Lessons",
  operations: "Operations",
  migration: "Migration and maintenance",
  mcp: "MCP",
};

export type CliCommandArgument = {
  name: string;
  description: string;
  required: boolean;
};

export type CliCommandFlag = {
  name: string;
  /** `value` flags consume the following argv token; `boolean` flags stand alone. */
  arity: "boolean" | "value";
  valueLabel?: string;
  description: string;
  required?: boolean;
  repeatable?: boolean;
  /** How repeated occurrences combine, stated only when repetition is meaningful. */
  repeatSemantics?: string;
};

export type CliExitCode = {
  code: number;
  meaning: string;
};

export type CliCommandOutput = {
  format: "json" | "text" | "none";
  keys?: string[];
  description: string;
};

export type CliCommandMetadata = {
  name: string;
  group: CliCommandGroup;
  summary: string;
  /**
   * Description surfaced by the MCP capability inventory. Mutating commands keep wording that
   * states project-state mutation explicitly, so it is stored separately from the CLI summary.
   */
  mcpDescription?: string;
  /** Exact usage text, including its trailing newline, reused verbatim for stderr usage hints. */
  usage: string;
  arguments: CliCommandArgument[];
  flags: CliCommandFlag[];
  output: CliCommandOutput;
  exitCodes: CliExitCode[];
  notes?: string[];
};

export function getCommandMetadata(commandName: string): CliCommandMetadata {
  const metadata = COMMAND_METADATA_ENTRIES[commandName];
  if (!metadata) {
    throw new Error(`no command metadata registered for '${commandName}'`);
  }
  return metadata;
}

export function getAllCommandMetadata(): CliCommandMetadata[] {
  return Object.values(COMMAND_METADATA_ENTRIES);
}

export function getCommandUsage(commandName: string): string {
  return getCommandMetadata(commandName).usage;
}

/** One of the four inventoried operations, reported with whoever owns it. */
export type CliCommandArtifactOperation = {
  operation: YamlSurfaceOperationName;
  /** The inventory state, reported verbatim so an unowned operation is never presented as owned. */
  state: string;
  cliOwned: boolean;
  /** Owning CLI commands, empty for an operation the inventory does not record as CLI-owned. */
  ownedBy: string[];
};

/** One artifact kind a command authors, with everything a caller needs to shape a valid write. */
export type CliCommandArtifactSurfaceEntry = {
  artifactKind: string;
  artifactTypes: string[];
  schemaKeys: string[];
  declaredSchemaFiles: string[];
  exampleKeys: string[];
  inspectWith: string[];
  /** Commands that enumerate the bundled assets and the family's own mutation contract. */
  discoverWith: string[];
  operations: CliCommandArtifactOperation[];
  /** Operations the inventory does not route through the CLI, named so a caller stops asking. */
  unsupportedOperations: string[];
  /** Sibling files and regenerated outputs a write to this family also affects. */
  crossFileEffects: string[];
};

/**
 * Where the declared `schema_file` and example paths resolve, and whether that cache is present.
 * Reported alongside the entries so every surface can state the installed-environment behavior
 * instead of implying the bundled keys are the only reachable form of the assets.
 */
export type CliCommandArtifactCacheContext = {
  schemaCacheRoot: string;
  schemaCacheAvailable: boolean;
};

export function getArtifactCacheContext(): CliCommandArtifactCacheContext {
  const surface = loadYamlMutationSurface();
  return { schemaCacheRoot: surface.schemaCacheRoot, schemaCacheAvailable: surface.schemaCacheAvailable };
}

/**
 * Derived from the mutation inventory's `cli_owners` rather than restated per command, so a family
 * that gains or loses a CLI owner updates text help, JSON help, and MCP descriptions together and
 * no metadata entry can claim ownership the inventory does not record.
 */
export function getCommandArtifactSurface(commandName: string): CliCommandArtifactSurfaceEntry[] {
  return loadYamlMutationSurface()
    .families.filter((family) => family.cliOwners.includes(commandName))
    .map((family) => {
      const operations: CliCommandArtifactOperation[] = YAML_SURFACE_OPERATIONS.map((operation) => ({
        operation,
        state: family.operations[operation].state,
        cliOwned: family.operations[operation].cliOwned,
        ownedBy: family.operations[operation].commands,
      }));

      return {
        artifactKind: family.kind,
        artifactTypes: family.artifactTypes.map((artifactType) => artifactType.artifactType),
        schemaKeys: family.artifactTypes.flatMap((artifactType) => artifactType.schemaKey ?? []),
        declaredSchemaFiles: family.artifactTypes.flatMap((artifactType) => artifactType.declaredSchemaFile ?? []),
        exampleKeys: family.artifactTypes.flatMap((artifactType) => artifactType.exampleKey ?? []),
        inspectWith: [...new Set(family.artifactTypes.flatMap((artifactType) => artifactType.inspectWith))],
        discoverWith: ["schema-list", "sample-list", `yaml-surface-show ${family.kind}`],
        operations,
        unsupportedOperations: operations.filter((entry) => !entry.cliOwned).map((entry) => entry.operation),
        crossFileEffects: family.referenceSideEffects,
      };
    });
}

function formatOperationSummary(operation: CliCommandArtifactOperation): string {
  return operation.cliOwned
    ? `${operation.operation} (${operation.ownedBy.join(", ")})`
    : `${operation.operation} (${operation.state}, not CLI-owned)`;
}

/**
 * Renders the whole projection for one artifact kind. Text help is the surface an agent reads
 * without a schema loaded, so it states the assets, the operation ownership, and the writes that
 * reach other files, and names the commands that return the rest rather than omitting anything.
 */
function formatArtifactEntryLines(entry: CliCommandArtifactSurfaceEntry, indent: string): string[] {
  const detail: Array<[string, string]> = [
    ["Schema:", entry.schemaKeys.join(", ")],
    ["Schema file:", entry.declaredSchemaFiles.join(", ")],
    ["Example:", entry.exampleKeys.join(", ")],
    ["Operations:", entry.operations.map(formatOperationSummary).join(", ")],
    ...(entry.crossFileEffects.length > 0
      ? ([["Also affects:", entry.crossFileEffects.join(" ")]] as Array<[string, string]>)
      : []),
    ["Inspect:", entry.inspectWith.join(", ")],
    ["Discover:", entry.discoverWith.join(", ")],
  ].filter(([, value]) => value.length > 0) as Array<[string, string]>;

  return [
    `${indent}${entry.artifactKind} (${entry.artifactTypes.join(", ")})`,
    ...formatDefinitionList(detail, `${indent}  `),
  ];
}

function formatFlagLabel(flag: CliCommandFlag): string {
  return flag.arity === "boolean" ? flag.name : `${flag.name} ${flag.valueLabel ?? "<value>"}`;
}

function formatFlagQualifiers(flag: CliCommandFlag): string {
  const qualifiers: string[] = [flag.required ? "required" : "optional"];
  if (flag.repeatable) qualifiers.push("repeatable");
  return `(${qualifiers.join(", ")})`;
}

function padColumn(label: string, width: number): string {
  return label.length >= width ? `${label} ` : label.padEnd(width + 1, " ");
}

const MINIMUM_LABEL_WIDTH = 14;
const MAXIMUM_LABEL_WIDTH = 34;

function formatDefinitionList(rows: Array<[string, string]>, indent = "  "): string[] {
  if (rows.length === 0) return [];
  const longest = Math.max(...rows.map(([label]) => label.length));
  const width = Math.min(Math.max(longest, MINIMUM_LABEL_WIDTH), MAXIMUM_LABEL_WIDTH);
  return rows.map(([label, description]) => `${indent}${padColumn(label, width)}${description}`);
}

export function formatCommandHelp(commandName: string): string {
  const metadata = getCommandMetadata(commandName);
  const lines: string[] = [metadata.usage.replace(/\n$/, ""), "", metadata.summary];

  if (metadata.arguments.length > 0) {
    lines.push("", "Arguments:");
    lines.push(
      ...formatDefinitionList(
        metadata.arguments.map((argument) => [
          `<${argument.name}>`,
          `${argument.description} (${argument.required ? "required" : "optional"})`,
        ]),
      ),
    );
  }

  if (metadata.flags.length > 0) {
    lines.push("", "Flags:");
    lines.push(
      ...formatDefinitionList(
        metadata.flags.map((flag) => {
          const repeat = flag.repeatSemantics ? ` ${flag.repeatSemantics}` : "";
          return [formatFlagLabel(flag), `${flag.description}${repeat} ${formatFlagQualifiers(flag)}`];
        }),
      ),
    );
  }

  lines.push("", "Output:", `  ${metadata.output.description}`);
  if (metadata.output.keys && metadata.output.keys.length > 0) {
    lines.push(`  Keys: ${metadata.output.keys.join(", ")}`);
  }

  lines.push("", "Exit codes:");
  lines.push(...formatDefinitionList(metadata.exitCodes.map((exit) => [String(exit.code), exit.meaning])));

  const artifactSurface = getCommandArtifactSurface(commandName);
  if (artifactSurface.length > 0) {
    const cache = getArtifactCacheContext();
    lines.push("", "Artifacts written:");
    for (const entry of artifactSurface) {
      lines.push(...formatArtifactEntryLines(entry, "  "));
    }
    lines.push(
      `  Schema file and example paths resolve beneath ${cache.schemaCacheRoot}`,
      `  ${
        cache.schemaCacheAvailable
          ? "(cache present)."
          : "(cache unavailable here; the keys above still name the bundled assets)."
      }`,
    );
  }

  if (metadata.notes && metadata.notes.length > 0) {
    lines.push("", "Notes:");
    for (const note of metadata.notes) {
      lines.push(`  ${note}`);
    }
  }

  lines.push("", "Add --json to this help request for machine-readable help.");
  return lines.join("\n") + "\n";
}

export function formatRootHelp(commandNames: string[]): string {
  const lines: string[] = [
    "Usage: strict-spec-cli <command> [arguments]",
    "",
    "Run 'strict-spec-cli <command> --help' for full command help.",
    "Add --json to any help request for machine-readable help.",
    "Discover artifact contracts with schema-list, sample-list, and yaml-surface-list.",
  ];

  const width = Math.max(...commandNames.map((name) => name.length));
  for (const group of COMMAND_GROUP_ORDER) {
    const grouped = commandNames.filter((name) => COMMAND_METADATA_ENTRIES[name]?.group === group);
    if (grouped.length === 0) continue;
    lines.push("", `${COMMAND_GROUP_TITLES[group]}:`);
    for (const name of grouped) {
      lines.push(`  ${padColumn(name, width)}${getCommandMetadata(name).summary}`);
    }
  }

  return lines.join("\n") + "\n";
}

export function buildCommandHelpPayload(commandName: string): unknown {
  const metadata = getCommandMetadata(commandName);
  return {
    command: metadata.name,
    group: metadata.group,
    summary: metadata.summary,
    usage: metadata.usage.replace(/\n$/, "").split("\n"),
    arguments: metadata.arguments,
    flags: metadata.flags,
    output: metadata.output,
    exitCodes: metadata.exitCodes,
    notes: metadata.notes ?? [],
    artifactSurface: getCommandArtifactSurface(commandName),
    artifactCache: getArtifactCacheContext(),
  };
}

export function buildRootHelpPayload(commandNames: string[]): unknown {
  return {
    cli: "strict-spec-cli",
    usage: "strict-spec-cli <command> [arguments]",
    commandHelp: "strict-spec-cli <command> --help [--json]",
    artifactDiscovery: ["schema-list", "sample-list", "yaml-surface-list"],
    groups: COMMAND_GROUP_ORDER.filter((group) =>
      commandNames.some((name) => COMMAND_METADATA_ENTRIES[name]?.group === group)
    ).map((group) => ({ id: group, title: COMMAND_GROUP_TITLES[group] })),
    commands: commandNames.map((name) => {
      const metadata = getCommandMetadata(name);
      return { name: metadata.name, group: metadata.group, summary: metadata.summary };
    }),
  };
}
