import { listYamlSurfaceFamilies } from "../yaml-mutation-surface.js";
import { COMMAND_METADATA_ENTRIES } from "./command-metadata-entries.js";

export const COMMAND_GROUP_ORDER = [
  "workflow",
  "change",
  "generation",
  "assets",
  "maintenance",
  "harness",
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
  harness: "Harness",
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

/** One artifact kind a command authors, with the assets a caller needs to supply valid content. */
export type CliCommandArtifactSurfaceEntry = {
  artifactKind: string;
  artifactTypes: string[];
  schemaKeys: string[];
  declaredSchemaFiles: string[];
  exampleKeys: string[];
  inspectWith: string[];
};

/**
 * Derived from the mutation inventory's `cli_owners` rather than restated per command, so a family
 * that gains or loses a CLI owner updates text help, JSON help, and MCP descriptions together and
 * no metadata entry can claim ownership the inventory does not record.
 */
export function getCommandArtifactSurface(commandName: string): CliCommandArtifactSurfaceEntry[] {
  return listYamlSurfaceFamilies()
    .filter((family) => family.cliOwners.includes(commandName))
    .map((family) => ({
      artifactKind: family.kind,
      artifactTypes: family.artifactTypes.map((artifactType) => artifactType.artifactType),
      schemaKeys: family.artifactTypes.flatMap((artifactType) => artifactType.schemaKey ?? []),
      declaredSchemaFiles: family.artifactTypes.flatMap((artifactType) => artifactType.declaredSchemaFile ?? []),
      exampleKeys: family.artifactTypes.flatMap((artifactType) => artifactType.exampleKey ?? []),
      inspectWith: [...new Set(family.artifactTypes.flatMap((artifactType) => artifactType.inspectWith))],
    }));
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
    lines.push("", "Artifacts written:");
    lines.push(
      ...formatDefinitionList(
        artifactSurface.map((entry) => [
          entry.artifactKind,
          `${entry.artifactTypes.join(", ")} — inspect with ${entry.inspectWith.join(", ")}`,
        ]),
      ),
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
  };
}

export function buildRootHelpPayload(commandNames: string[]): unknown {
  return {
    cli: "strict-spec-cli",
    usage: "strict-spec-cli <command> [arguments]",
    commandHelp: "strict-spec-cli <command> --help [--json]",
    groups: COMMAND_GROUP_ORDER.filter((group) =>
      commandNames.some((name) => COMMAND_METADATA_ENTRIES[name]?.group === group)
    ).map((group) => ({ id: group, title: COMMAND_GROUP_TITLES[group] })),
    commands: commandNames.map((name) => {
      const metadata = getCommandMetadata(name);
      return { name: metadata.name, group: metadata.group, summary: metadata.summary };
    }),
  };
}
