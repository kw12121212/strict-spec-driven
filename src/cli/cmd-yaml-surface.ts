import {
  findYamlSurfaceFamily,
  loadYamlMutationSurface,
  type YamlSurfaceFamily,
} from "../yaml-mutation-surface.js";
import { handleHelpRequest } from "./argv.js";
import { getCommandUsage } from "./command-metadata.js";
import { writeJson, writeUsage } from "./output.js";

/**
 * List entries stay compact: the ownership class and the four operation states are what a caller
 * scans to decide where to look, and `yaml-surface-show` supplies the rest for one family.
 */
function toListEntry(family: YamlSurfaceFamily): unknown {
  return {
    kind: family.kind,
    ownership: family.ownership,
    artifactTypes: family.artifactTypes.map((artifactType) => artifactType.artifactType),
    operations: Object.fromEntries(
      Object.entries(family.operations).map(([operation, detail]) => [operation, detail.state]),
    ),
    ...(family.schemaKey !== undefined ? { schemaKey: family.schemaKey } : {}),
    ...(family.exampleKey !== undefined ? { exampleKey: family.exampleKey } : {}),
  };
}

export function runYamlSurfaceList(argv: string[]): number {
  if (handleHelpRequest("yaml-surface-list", argv)) {
    return 0;
  }
  if (argv.length > 0) {
    writeUsage(getCommandUsage("yaml-surface-list"));
    return 1;
  }

  const surface = loadYamlMutationSurface();
  writeJson({
    valid: true,
    inventoryPath: surface.inventoryPath,
    schemaCacheRoot: surface.schemaCacheRoot,
    schemaCacheAvailable: surface.schemaCacheAvailable,
    families: surface.families.map(toListEntry),
    diagnostics: [],
  });
  return 0;
}

export function runYamlSurfaceShow(argv: string[]): number {
  const [kind, ...extraArgs] = argv;
  const usage = getCommandUsage("yaml-surface-show");
  if (handleHelpRequest("yaml-surface-show", argv)) {
    return 0;
  }
  if (!kind || extraArgs.length > 0) {
    writeUsage(usage);
    return 1;
  }

  const surface = loadYamlMutationSurface();
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

  writeJson({
    valid: true,
    inventoryPath: surface.inventoryPath,
    schemaCacheRoot: surface.schemaCacheRoot,
    schemaCacheAvailable: surface.schemaCacheAvailable,
    family,
    diagnostics: [],
  });
  return 0;
}
