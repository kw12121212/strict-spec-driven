import { existsSync, readFileSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readEmbeddedTemplate } from "./embedded-templates.js";
import { getSharedSchemaCacheRoot } from "./shared-schema-cache.js";
import { loadBundledSchemaRegistry } from "./validation.js";
import { parseYamlDocument } from "./yaml.js";

/** Repository-relative location of the checked-in mutation inventory, and its embedded asset key. */
export const YAML_MUTATION_INVENTORY_PATH = "inventory/yaml-mutation-surfaces.yaml";

const SCHEMA_KEY_PREFIX = "strict-spec-driven/schemas/";
const SCHEMA_DECLARED_DIR = "templates/strict-spec-driven/schemas";

/** Inventory operation slots, in the order the mutation contract states them. */
export const YAML_SURFACE_OPERATIONS = ["create", "update", "named_remove", "delete"] as const;
export type YamlSurfaceOperationName = (typeof YAML_SURFACE_OPERATIONS)[number];

/**
 * An operation not yet routed through a CLI command. The inventory state is reported verbatim so
 * the surface never claims coverage the repository has not delivered; the note distinguishes a
 * missing command from a deliberate human-only or read-only classification.
 */
export const NOT_YET_CLI_OWNED_NOTE = "not yet CLI-owned";

export type YamlSurfaceAssets = {
  /** Bundled asset key accepted by `schema-show`, absent when no registered schema covers the type. */
  schemaKey?: string;
  /** The artifact's declared `schema_file` value, relative to the shared cache root. */
  declaredSchemaFile?: string;
  /** Absolute cached schema path, present only when the shared cache actually holds the file. */
  schemaFilePath?: string;
  /** Bundled asset key accepted by `sample-show`. */
  exampleKey?: string;
  /** Absolute cached example path, present only when the shared cache actually holds the file. */
  exampleFilePath?: string;
  /** Ready-to-run commands that print the schema and example content. */
  inspectWith: string[];
};

export type YamlSurfaceArtifactType = YamlSurfaceAssets & {
  artifactType: string;
  schemaId?: string;
};

export type YamlSurfaceOperation = {
  /** The inventory state, reported verbatim. */
  state: string;
  cliOwned: boolean;
  commands: string[];
  note?: string;
};

export type YamlSurfaceFamily = YamlSurfaceAssets & {
  kind: string;
  ownership: string;
  artifactTypes: YamlSurfaceArtifactType[];
  pathPatterns: string[];
  cliOwners: string[];
  operations: Record<YamlSurfaceOperationName, YamlSurfaceOperation>;
  referenceSideEffects: string[];
};

export type YamlMutationSurface = {
  inventoryPath: string;
  schemaCacheRoot: string;
  schemaCacheAvailable: boolean;
  families: YamlSurfaceFamily[];
};

type RawRecord = Record<string, unknown>;

function asRecord(value: unknown): RawRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RawRecord) : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function repositoryRoot(): string {
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(thisDir, "..");
}

function readInventoryContent(): string {
  const embedded = readEmbeddedTemplate(YAML_MUTATION_INVENTORY_PATH);
  if (embedded !== undefined) return embedded;
  return readFileSync(path.join(repositoryRoot(), YAML_MUTATION_INVENTORY_PATH), "utf8");
}

function isReadableFile(candidatePath: string): boolean {
  try {
    return existsSync(candidatePath) && statSync(candidatePath).isFile();
  } catch {
    return false;
  }
}

/** The cache root counts as available only as a directory; a stray file there is not a cache. */
function isCacheDirectory(candidatePath: string): boolean {
  try {
    return existsSync(candidatePath) && statSync(candidatePath).isDirectory();
  } catch {
    return false;
  }
}

function bareAssetName(assetKey: string): string {
  return path.posix.basename(assetKey, ".yaml");
}

/**
 * The registry stores `primary_example` relative to the schema directory; normalizing it against
 * that directory yields the same `examples/strict-spec-driven/<name>.yaml` key `sample-show` takes.
 */
function exampleKeyFromRegistry(primaryExample: string): string | undefined {
  const normalized = path.posix.normalize(path.posix.join(SCHEMA_DECLARED_DIR, primaryExample));
  return normalized.startsWith("examples/strict-spec-driven/") ? normalized : undefined;
}

function emptyAssets(): YamlSurfaceAssets {
  return { inspectWith: [] };
}

function resolveAssets(
  schemaFile: string | undefined,
  primaryExample: string | undefined,
  cacheRoot: string,
): YamlSurfaceAssets {
  if (schemaFile === undefined) return emptyAssets();

  const schemaKey = `${SCHEMA_KEY_PREFIX}${schemaFile}`;
  const declaredSchemaFile = path.posix.join(SCHEMA_DECLARED_DIR, schemaFile);
  const cachedSchemaPath = path.join(cacheRoot, declaredSchemaFile);
  const exampleKey = primaryExample === undefined ? undefined : exampleKeyFromRegistry(primaryExample);
  const cachedExamplePath = exampleKey === undefined ? undefined : path.join(cacheRoot, exampleKey);

  return {
    schemaKey,
    declaredSchemaFile,
    ...(isReadableFile(cachedSchemaPath) ? { schemaFilePath: cachedSchemaPath } : {}),
    ...(exampleKey !== undefined ? { exampleKey } : {}),
    ...(cachedExamplePath !== undefined && isReadableFile(cachedExamplePath)
      ? { exampleFilePath: cachedExamplePath }
      : {}),
    inspectWith: [
      `schema-show ${bareAssetName(schemaKey)}`,
      ...(exampleKey === undefined ? [] : [`sample-show ${bareAssetName(exampleKey)}`]),
    ],
  };
}

type RegistryLookup = Map<string, { schemaId: string; schemaFile: string; primaryExample?: string }>;

function buildRegistryLookup(): RegistryLookup {
  const lookup: RegistryLookup = new Map();
  const registry = loadBundledSchemaRegistry() as unknown as {
    entries: { schema_id?: unknown; artifact_type?: unknown; schema_file?: unknown; primary_example?: unknown }[];
  };

  for (const entry of registry.entries) {
    const artifactType = asString(entry.artifact_type);
    const schemaFile = asString(entry.schema_file);
    const schemaId = asString(entry.schema_id);
    if (artifactType === undefined || schemaFile === undefined || schemaId === undefined) continue;
    if (lookup.has(artifactType)) continue;
    const primaryExample = asString(entry.primary_example);
    lookup.set(artifactType, { schemaId, schemaFile, ...(primaryExample !== undefined ? { primaryExample } : {}) });
  }

  return lookup;
}

function buildOperation(state: string | undefined, cliOwners: string[]): YamlSurfaceOperation {
  const reportedState = state ?? "not-applicable";
  const cliOwned = reportedState === "cli-owned";
  return {
    state: reportedState,
    cliOwned,
    commands: cliOwned ? cliOwners : [],
    ...(reportedState === "direct-write" ? { note: NOT_YET_CLI_OWNED_NOTE } : {}),
  };
}

/**
 * Family-level asset fields are stated only when the family maps to exactly one artifact type; a
 * multi-type family would otherwise present one type's schema as if it described the whole family.
 */
function familyAssetsFrom(artifactTypes: readonly YamlSurfaceArtifactType[]): YamlSurfaceAssets {
  if (artifactTypes.length !== 1) return emptyAssets();
  const { artifactType: _artifactType, schemaId: _schemaId, ...assets } = artifactTypes[0];
  return assets;
}

function buildFamily(
  kind: string,
  rawFamily: RawRecord,
  registry: RegistryLookup,
  cacheRoot: string,
): YamlSurfaceFamily {
  const cliOwners = asStringArray(rawFamily.cli_owners);
  const operationStates = asRecord(rawFamily.operations) ?? {};
  const artifactTypes: YamlSurfaceArtifactType[] = asStringArray(rawFamily.artifact_types).map((artifactType) => {
    const entry = registry.get(artifactType);
    return {
      artifactType,
      ...(entry === undefined ? {} : { schemaId: entry.schemaId }),
      ...resolveAssets(entry?.schemaFile, entry?.primaryExample, cacheRoot),
    };
  });

  const familyAssets = familyAssetsFrom(artifactTypes);

  return {
    kind,
    ownership: asString(rawFamily.ownership) ?? "repository-owned",
    artifactTypes,
    pathPatterns: asStringArray(rawFamily.path_patterns),
    cliOwners,
    operations: Object.fromEntries(
      YAML_SURFACE_OPERATIONS.map((operation) => [operation, buildOperation(asString(operationStates[operation]), cliOwners)]),
    ) as Record<YamlSurfaceOperationName, YamlSurfaceOperation>,
    referenceSideEffects: asStringArray(rawFamily.reference_side_effects),
    ...familyAssets,
  };
}

let cachedSurface: YamlMutationSurface | undefined;

/**
 * Joins the checked-in mutation inventory to the bundled schema registry and the shared schema
 * cache. The inventory stays the single source of truth for which families and operations exist;
 * this only adds the schema and example references a caller needs to act on them.
 */
export function loadYamlMutationSurface(): YamlMutationSurface {
  if (cachedSurface !== undefined) return cachedSurface;

  const inventory = parseYamlDocument<RawRecord>(readInventoryContent(), { source: YAML_MUTATION_INVENTORY_PATH });
  const families = asRecord(inventory.artifact_families) ?? {};
  const registry = buildRegistryLookup();
  const cacheRoot = getSharedSchemaCacheRoot();

  cachedSurface = {
    inventoryPath: YAML_MUTATION_INVENTORY_PATH,
    schemaCacheRoot: cacheRoot,
    schemaCacheAvailable: isCacheDirectory(cacheRoot),
    families: Object.entries(families)
      .map(([kind, rawFamily]) => buildFamily(kind, asRecord(rawFamily) ?? {}, registry, cacheRoot))
      .sort((left, right) => left.kind.localeCompare(right.kind)),
  };

  return cachedSurface;
}

/** Clears the memoized surface so a test can observe a changed cache root or inventory. */
export function resetYamlMutationSurfaceCache(): void {
  cachedSurface = undefined;
}

export function listYamlSurfaceFamilies(): YamlSurfaceFamily[] {
  return loadYamlMutationSurface().families;
}

export function findYamlSurfaceFamily(kind: string): YamlSurfaceFamily | undefined {
  return loadYamlMutationSurface().families.find((family) => family.kind === kind);
}

/**
 * Resolves the surface entry for a mutation's `schemaId`, which callers state either as a
 * registered artifact type (`change_proposal`) or as a full schema id
 * (`strict-spec-driven/lesson/v1`).
 */
export function findYamlSurfaceByArtifactType(
  artifactTypeOrSchemaId: string,
): { family: YamlSurfaceFamily; artifactType: YamlSurfaceArtifactType } | undefined {
  for (const family of loadYamlMutationSurface().families) {
    for (const artifactType of family.artifactTypes) {
      if (artifactType.artifactType === artifactTypeOrSchemaId || artifactType.schemaId === artifactTypeOrSchemaId) {
        return { family, artifactType };
      }
    }
  }
  return undefined;
}

/**
 * The recovery route reported alongside a mutation outcome: which artifact kind was affected and
 * which schema and example describe its shape.
 */
export type YamlArtifactIdentifiers = {
  artifactKind?: string;
  schemaKey?: string;
  schemaFilePath?: string;
  exampleKey?: string;
  /** Ready-to-run commands that print the schema and example the reported keys name. */
  inspectWith?: string[];
};

/**
 * Resolves the identifiers for a mutation's declared schema id or artifact type. An unregistered
 * value yields no identifiers rather than a guess, so a caller never receives a schema key that
 * does not describe what it is writing.
 */
export function resolveYamlArtifactIdentifiers(artifactTypeOrSchemaId: string): YamlArtifactIdentifiers {
  const match = findYamlSurfaceByArtifactType(artifactTypeOrSchemaId);
  if (match === undefined) return {};

  return {
    artifactKind: match.family.kind,
    ...(match.artifactType.schemaKey !== undefined ? { schemaKey: match.artifactType.schemaKey } : {}),
    ...(match.artifactType.schemaFilePath !== undefined
      ? { schemaFilePath: match.artifactType.schemaFilePath }
      : {}),
    ...(match.artifactType.exampleKey !== undefined ? { exampleKey: match.artifactType.exampleKey } : {}),
    ...(match.artifactType.inspectWith.length > 0 ? { inspectWith: match.artifactType.inspectWith } : {}),
  };
}
