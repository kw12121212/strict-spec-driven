import {
  bindYamlAuthoringProtocol,
  getYamlAuthoringProtocol,
} from "../yaml-authoring-protocol.js";
import { findYamlSurfaceFamily, loadYamlMutationSurface } from "../yaml-mutation-surface.js";
import { handleHelpRequest } from "./argv.js";
import { getCommandUsage } from "./command-metadata.js";
import { writeJson, writeUsage } from "./output.js";

/**
 * Prints the AI CLI-only YAML authoring protocol: the generic step order with no argument, or that
 * order bound to one inventoried artifact kind. Read-only in both forms — an agent must be able to
 * consult the protocol at any point in a workflow without side effects.
 */
export function runYamlAuthoringProtocol(argv: string[]): number {
  const [kind, ...extraArgs] = argv;
  if (handleHelpRequest("yaml-authoring-protocol", argv)) {
    return 0;
  }
  if (extraArgs.length > 0) {
    writeUsage(getCommandUsage("yaml-authoring-protocol"));
    return 1;
  }

  const surface = loadYamlMutationSurface();
  const context = {
    inventoryPath: surface.inventoryPath,
    schemaCacheRoot: surface.schemaCacheRoot,
    schemaCacheAvailable: surface.schemaCacheAvailable,
  };

  if (kind === undefined) {
    const protocol = getYamlAuthoringProtocol();
    writeJson({
      valid: true,
      ...context,
      steps: protocol.steps,
      boundary: protocol.boundary,
      diagnostics: [],
    });
    return 0;
  }

  const family = findYamlSurfaceFamily(kind);
  if (!family) {
    writeJson({
      valid: false,
      inventoryPath: surface.inventoryPath,
      diagnostics: [
        {
          code: "unknown-artifact-kind",
          fieldPath: "$.artifact_families",
          message: `no inventoried artifact kind '${kind}'`,
          expected: `one of: ${surface.families.map((entry) => entry.kind).join(", ")}`,
          actual: kind,
        },
      ],
    });
    return 1;
  }

  const bound = bindYamlAuthoringProtocol(family);
  writeJson({
    valid: true,
    ...context,
    ...bound,
    diagnostics: [],
  });
  return 0;
}
