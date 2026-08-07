/**
 * The single source of the AI CLI-only YAML authoring protocol.
 *
 * Every AI-facing surface that presents the protocol renders this module. Nothing here is restated
 * as a surface-local literal: a surface that abbreviated or reordered these steps would teach an
 * agent a different workflow, and the step most likely to be dropped is the terminal boundary that
 * forbids falling back to editing YAML by hand — which is the rule the protocol exists to carry.
 */

import {
  YAML_SURFACE_OPERATIONS,
  type YamlSurfaceFamily,
  type YamlSurfaceOperationName,
} from "./yaml-mutation-surface.js";

/** Protocol step ids, in the order an agent performs them. */
export const YAML_AUTHORING_PROTOCOL_STEP_IDS = [
  "read-command-help",
  "resolve-schema",
  "inspect-example",
  "translate-to-named-arguments",
  "execute-owning-command",
  "inspect-structured-result",
  "validate-artifact",
] as const;

export type YamlAuthoringProtocolStepId = (typeof YAML_AUTHORING_PROTOCOL_STEP_IDS)[number];

export type YamlAuthoringProtocolStep = {
  /** 1-based position, so a surface that reformats the list cannot silently reorder it. */
  order: number;
  id: YamlAuthoringProtocolStepId;
  title: string;
  /** Why the step exists, stated so an agent can tell when it has actually been satisfied. */
  intent: string;
  /**
   * Commands in their unbound form. An artifact-bound rendering replaces these with the concrete
   * commands for one family; it never adds a step or drops one.
   */
  commands: string[];
};

/**
 * The terminal behavior of the protocol. This is a step-independent rule rather than an eighth
 * step: it applies the moment any step cannot be completed, not only at the end of the sequence.
 */
export type YamlAuthoringProtocolBoundary = {
  id: "no-direct-edit-fallback";
  title: string;
  statement: string;
  /** What an agent reports instead of proceeding, so stopping stays actionable rather than silent. */
  reportContains: string[];
};

export const YAML_AUTHORING_PROTOCOL_STEPS: readonly YamlAuthoringProtocolStep[] = [
  {
    order: 1,
    id: "read-command-help",
    title: "Read the owning command's machine-readable help",
    intent:
      "Learn the command that owns the operation and its documented named arguments, output keys, and exit codes before shaping any input. Help is the contract; a remembered flag is not.",
    commands: ["<owning-command> --help --json"],
  },
  {
    order: 2,
    id: "resolve-schema",
    title: "Resolve the target artifact's schema",
    intent:
      "Confirm the artifact's required fields, enums, and relationships from its registered schema rather than inferring them from a similar artifact.",
    commands: ["schema-list", "schema-show <schema-key>"],
  },
  {
    order: 3,
    id: "inspect-example",
    title: "Inspect the registered minimal example",
    intent:
      "See one known-valid document of this artifact type, which resolves shape questions the schema states abstractly. The example is read-only reference; it is never copied into place as a starting file.",
    commands: ["sample-list", "sample-show <example-key>"],
  },
  {
    order: 4,
    id: "translate-to-named-arguments",
    title: "Translate confirmed facts into documented named arguments",
    intent:
      "Express the intended change as the command's own semantic arguments. Every value must trace to something confirmed in the request, the schema, or repository evidence — an unconfirmed field is an open question, not a default.",
    commands: [],
  },
  {
    order: 5,
    id: "execute-owning-command",
    title: "Execute the owning command with those arguments",
    intent:
      "Perform the mutation through the command that owns it. Raw YAML payloads, heredocs, temporary artifact files, arbitrary output paths, and direct file edits are not part of this protocol.",
    commands: ["<owning-command> --<named-args>"],
  },
  {
    order: 6,
    id: "inspect-structured-result",
    title: "Inspect the structured result and changed paths",
    intent:
      "Read the returned result rather than assuming success. A result reporting incompleteness is a successful write with more work to do, not a failure to retry; diagnostics name what is missing.",
    commands: [],
  },
  {
    order: 7,
    id: "validate-artifact",
    title: "Run the artifact's validation command",
    intent:
      "Confirm the artifact and the state it participates in are valid after the write, which catches cross-file consequences a single mutation's own result cannot report.",
    commands: ["<validation-command>"],
  },
];

export const YAML_AUTHORING_PROTOCOL_BOUNDARY: YamlAuthoringProtocolBoundary = {
  id: "no-direct-edit-fallback",
  title: "Stop rather than edit YAML directly",
  statement:
    "When a required command, argument, or artifact kind is unavailable, stop and report the missing capability. Editing the YAML directly, writing a raw payload, or scripting around the CLI is never an available fallback, and an unavailable command is a reason to stop rather than a reason to improvise.",
  reportContains: [
    "the operation that could not be completed",
    "the artifact kind and target artifact it would have written",
    "the command or argument that is missing",
    "the discovery commands already consulted",
  ],
};

/** The protocol as presented when no artifact kind is named. */
export type YamlAuthoringProtocol = {
  steps: readonly YamlAuthoringProtocolStep[];
  boundary: YamlAuthoringProtocolBoundary;
};

export function getYamlAuthoringProtocol(): YamlAuthoringProtocol {
  return {
    steps: YAML_AUTHORING_PROTOCOL_STEPS,
    boundary: YAML_AUTHORING_PROTOCOL_BOUNDARY,
  };
}

/** A protocol step with its placeholder commands replaced by one family's concrete commands. */
export type BoundYamlAuthoringProtocolStep = YamlAuthoringProtocolStep & {
  /**
   * Why a step carries no concrete command for this family — an operation the inventory does not
   * record as CLI-owned, or an asset the shared cache does not hold. Stated so an absent command
   * reads as a known gap rather than an omission.
   */
  unavailable?: string;
};

/**
 * One artifact type in the family, with its own assets. A family may register several types, so
 * the assets are reported per type rather than collapsed — collapsing them would make a
 * multi-type family look like it had no registered schema at all.
 */
export type BoundYamlAuthoringProtocolArtifactType = {
  artifactType: string;
  schemaId?: string;
  schemaKey?: string;
  schemaFilePath?: string;
  exampleKey?: string;
  exampleFilePath?: string;
  inspectWith: string[];
};

export type BoundYamlAuthoringProtocol = YamlAuthoringProtocol & {
  artifactKind: string;
  ownership: string;
  artifactTypes: BoundYamlAuthoringProtocolArtifactType[];
  pathPatterns: string[];
  schemaKey?: string;
  schemaFilePath?: string;
  exampleKey?: string;
  exampleFilePath?: string;
  validationCommand?: string;
  operations: {
    operation: YamlSurfaceOperationName;
    state: string;
    cliOwned: boolean;
    commands: string[];
  }[];
  steps: readonly BoundYamlAuthoringProtocolStep[];
};

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Builds a schema or example step from every artifact type in the family. A family registering
 * several artifact types names one show command per type, so an agent writing any of them can find
 * its own contract.
 */
function assetStep(
  step: YamlAuthoringProtocolStep,
  listCommand: string,
  showCommandPrefix: string,
  artifactTypes: readonly BoundYamlAuthoringProtocolArtifactType[],
  keyOf: (entry: BoundYamlAuthoringProtocolArtifactType) => string | undefined,
  cachedPathOf: (entry: BoundYamlAuthoringProtocolArtifactType) => string | undefined,
  assetLabel: string,
): BoundYamlAuthoringProtocolStep {
  const withKey = artifactTypes.filter((entry) => keyOf(entry) !== undefined);
  const showCommands = unique(
    withKey.flatMap((entry) => entry.inspectWith.filter((command) => command.startsWith(showCommandPrefix))),
  );

  if (withKey.length === 0 || showCommands.length === 0) {
    return {
      ...step,
      commands: [listCommand],
      unavailable: `no registered ${assetLabel} covers this artifact kind`,
    };
  }

  // The bundled keys are always reported; a cached path is claimed only for the types the cache
  // actually holds, so an unsynchronized cache never presents a path as resolved.
  const uncached = withKey.filter((entry) => cachedPathOf(entry) === undefined);
  return {
    ...step,
    commands: showCommands,
    ...(uncached.length === 0
      ? {}
      : {
        unavailable: `the shared schema cache does not hold the ${assetLabel} for ${
          uncached.map((entry) => entry.artifactType).join(", ")
        }; use the bundled key`,
      }),
  };
}

/**
 * Binds the protocol to one inventoried family. Every family fact — owning commands, operation
 * states, asset keys and cached paths, validation command — is read from the mutation surface
 * rather than restated here, so this can never claim coverage the inventory does not record.
 */
export function bindYamlAuthoringProtocol(family: YamlSurfaceFamily): BoundYamlAuthoringProtocol {
  const mutatingCommands = family.cliOwners;
  const artifactTypes: BoundYamlAuthoringProtocolArtifactType[] = family.artifactTypes.map((entry) => ({
    artifactType: entry.artifactType,
    ...(entry.schemaId !== undefined ? { schemaId: entry.schemaId } : {}),
    ...(entry.schemaKey !== undefined ? { schemaKey: entry.schemaKey } : {}),
    ...(entry.schemaFilePath !== undefined ? { schemaFilePath: entry.schemaFilePath } : {}),
    ...(entry.exampleKey !== undefined ? { exampleKey: entry.exampleKey } : {}),
    ...(entry.exampleFilePath !== undefined ? { exampleFilePath: entry.exampleFilePath } : {}),
    inspectWith: entry.inspectWith,
  }));

  const steps: BoundYamlAuthoringProtocolStep[] = YAML_AUTHORING_PROTOCOL_STEPS.map((step) => {
    switch (step.id) {
      case "read-command-help":
      case "execute-owning-command":
        return mutatingCommands.length === 0
          ? {
            ...step,
            commands: [],
            unavailable: "the inventory records no CLI owner for this artifact kind",
          }
          : {
            ...step,
            commands: mutatingCommands.map((command) =>
              step.id === "read-command-help" ? `${command} --help --json` : `${command} --<named-args>`
            ),
          };
      case "resolve-schema":
        return assetStep(
          step,
          "schema-list",
          "schema-show ",
          artifactTypes,
          (entry) => entry.schemaKey,
          (entry) => entry.schemaFilePath,
          "schema",
        );
      case "inspect-example":
        return assetStep(
          step,
          "sample-list",
          "sample-show ",
          artifactTypes,
          (entry) => entry.exampleKey,
          (entry) => entry.exampleFilePath,
          "example",
        );
      case "validate-artifact":
        return family.validationCommand === undefined
          ? {
            ...step,
            commands: [],
            unavailable: "the inventory records no validation command for this artifact kind",
          }
          : { ...step, commands: [family.validationCommand] };
      default:
        return { ...step };
    }
  });

  return {
    artifactKind: family.kind,
    ownership: family.ownership,
    artifactTypes,
    pathPatterns: family.pathPatterns,
    ...(family.schemaKey !== undefined ? { schemaKey: family.schemaKey } : {}),
    ...(family.schemaFilePath !== undefined ? { schemaFilePath: family.schemaFilePath } : {}),
    ...(family.exampleKey !== undefined ? { exampleKey: family.exampleKey } : {}),
    ...(family.exampleFilePath !== undefined ? { exampleFilePath: family.exampleFilePath } : {}),
    ...(family.validationCommand !== undefined ? { validationCommand: family.validationCommand } : {}),
    operations: YAML_SURFACE_OPERATIONS.map((operation) => ({
      operation,
      state: family.operations[operation].state,
      cliOwned: family.operations[operation].cliOwned,
      commands: family.operations[operation].commands,
    })),
    steps,
    boundary: YAML_AUTHORING_PROTOCOL_BOUNDARY,
  };
}
