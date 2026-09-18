// Repository-maintenance mutation surface for the bundled YAML assets this repository ships:
// schemas and the registry, init scaffolds and SOP category templates, reference examples,
// validation fixtures, and the mutation inventory itself. These are the families the mutation
// inventory classified human-only, because each is reachable only from this repository's checkout.
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { tmpdir } from "os";
import path from "path";
import { fileURLToPath } from "url";
import { loadBundledSchemaRegistry, loadBundledSchemaBySchemaId, validateWithSchema } from "./validation.js";
import { parseYamlDocument, stringifyYamlDocument } from "./yaml.js";
import {
  commitYamlMutation,
  type YamlMutationRequest,
  type YamlMutationResult,
  type YamlMutationValidationIssue,
} from "./yaml-mutation.js";

/** The five inventory families this module owns, named exactly as the inventory names them. */
export const BUNDLED_ASSET_FAMILIES = [
  "bundled-schema-assets",
  "bundled-scaffold-assets",
  "bundled-reference-examples",
  "validation-fixtures",
  "yaml-mutation-inventory",
] as const;
export type BundledAssetFamily = (typeof BUNDLED_ASSET_FAMILIES)[number];

/** How a candidate is judged, which differs per family because each serves a different contract. */
type ValidationMode = "registered-schema" | "fixture-intent" | "inventory-check";

type FamilyDescriptor = {
  family: BundledAssetFamily;
  /** Repository-relative directory every asset in the family must resolve inside. */
  familyRoot: string;
  /** Additional roots the family owns, resolved in order when the first does not hold the asset. */
  extraRoots?: string[];
  validation: ValidationMode;
  /** Whether a write invalidates src/embedded-templates.ts and must regenerate it in-transaction. */
  feedsEmbeddedBundle: boolean;
  /** Fixed single asset, for a family whose whole population is one file. */
  singleton?: string;
};

const FAMILIES: Record<BundledAssetFamily, FamilyDescriptor> = {
  "bundled-schema-assets": {
    family: "bundled-schema-assets",
    familyRoot: "templates/strict-spec-driven/schemas",
    validation: "registered-schema",
    feedsEmbeddedBundle: true,
  },
  "bundled-scaffold-assets": {
    family: "bundled-scaffold-assets",
    familyRoot: "templates/strict-spec-driven/scaffold",
    extraRoots: ["templates/strict-spec-driven/sop-categories"],
    validation: "registered-schema",
    feedsEmbeddedBundle: true,
  },
  "bundled-reference-examples": {
    family: "bundled-reference-examples",
    familyRoot: "examples/strict-spec-driven",
    validation: "registered-schema",
    feedsEmbeddedBundle: true,
  },
  "validation-fixtures": {
    family: "validation-fixtures",
    familyRoot: "test/fixtures/validation",
    validation: "fixture-intent",
    feedsEmbeddedBundle: false,
  },
  "yaml-mutation-inventory": {
    family: "yaml-mutation-inventory",
    familyRoot: "inventory",
    validation: "inventory-check",
    feedsEmbeddedBundle: true,
    singleton: "yaml-mutation-surfaces.yaml",
  },
};

/** Paths that together prove a directory is this repository's checkout rather than a consumer project. */
const CHECKOUT_MARKERS = [
  "templates/strict-spec-driven/schemas/registry.yaml",
  "examples/strict-spec-driven",
  "inventory/yaml-mutation-surfaces.yaml",
];

export const EMBEDDED_BUNDLE_PATH = "src/embedded-templates.ts";

export type BundledAssetEdit =
  | { kind: "set"; fieldPath: string; value: string }
  | { kind: "append"; fieldPath: string; value: string }
  | { kind: "create-list"; fieldPath: string }
  | { kind: "remove"; fieldPath: string };

export type BundledAssetMutationOptions = {
  family: BundledAssetFamily;
  /** Asset name within the family; omitted for a singleton family. */
  assetName?: string;
  edits?: readonly BundledAssetEdit[];
  delete?: boolean;
  rootDir?: string;
  /** Injection seam so regeneration failure is reachable in tests without corrupting the checkout. */
  regenerateEmbeddedBundle?: (rootDir: string) => string;
};

export type BundledAssetMutationOutcome = YamlMutationResult & {
  family: BundledAssetFamily;
  assetPath?: string;
};

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function moduleRepositoryRoot(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
}

/**
 * Resolve the checkout that holds the bundled source tree. Every marker must be present: a consumer
 * project can easily have an `examples/` directory of its own, and writing into it would be worse
 * than refusing.
 */
export function resolveCheckoutRoot(candidateRoot?: string): string | undefined {
  const candidates = candidateRoot ? [candidateRoot] : [process.cwd(), moduleRepositoryRoot()];
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (CHECKOUT_MARKERS.every((marker) => existsSync(path.join(resolved, marker)))) return resolved;
  }
  return undefined;
}

function issue(fieldPath: string, message: string, code: string, extra: Partial<YamlMutationValidationIssue> = {}): YamlMutationValidationIssue {
  return { code, fieldPath, message, ...extra };
}

function refusal(family: BundledAssetFamily, code: string, message: string, assetPath?: string): BundledAssetMutationOutcome {
  return {
    family,
    ...(assetPath ? { assetPath } : {}),
    valid: false,
    committed: false,
    exitStatus: 1,
    changes: [],
    diagnostics: [{
      artifactPath: assetPath ?? `<${family}>`,
      phase: "planning",
      code,
      fieldPath: "$",
      message,
    }],
  };
}

/** Every asset key the family currently holds, as repository-relative posix paths. */
export function listFamilyAssets(family: BundledAssetFamily, rootDir: string): string[] {
  const descriptor = FAMILIES[family];
  const roots = [descriptor.familyRoot, ...(descriptor.extraRoots ?? [])];
  const found: string[] = [];
  for (const root of roots) {
    const absoluteRoot = path.join(rootDir, root);
    if (!existsSync(absoluteRoot)) continue;
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory).sort()) {
        const full = path.join(directory, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry.endsWith(".yaml") || entry.endsWith(".yml")) found.push(toPosix(path.relative(rootDir, full)));
      }
    };
    walk(absoluteRoot);
  }
  return found.sort();
}

/**
 * Resolve a caller-supplied asset name inside its family. The name is a key within the family, never
 * a path into the repository: anything that escapes the family's roots is rejected rather than
 * normalized, so the command's destination stays owned by the command.
 */
export function resolveAssetPath(
  family: BundledAssetFamily,
  assetName: string | undefined,
  rootDir: string,
): { assetPath: string; familyRoot: string } | { error: string } {
  const descriptor = FAMILIES[family];
  if (descriptor.singleton) {
    if (assetName && assetName !== descriptor.singleton && assetName !== toPosix(path.join(descriptor.familyRoot, descriptor.singleton))) {
      return { error: `${family} holds only ${descriptor.singleton}` };
    }
    return { assetPath: toPosix(path.join(descriptor.familyRoot, descriptor.singleton)), familyRoot: descriptor.familyRoot };
  }
  if (!assetName) return { error: `${family} requires an asset name` };
  if (path.isAbsolute(assetName) || assetName.split(/[\\/]/).includes("..")) {
    return { error: `asset name must stay inside ${family}, and '${assetName}' does not` };
  }

  const normalized = assetName.endsWith(".yaml") || assetName.endsWith(".yml") ? assetName : `${assetName}.yaml`;
  const roots = [descriptor.familyRoot, ...(descriptor.extraRoots ?? [])];
  // A name already carrying its family root is accepted, so the keys `schema-show` and the inventory
  // print can be pasted straight back into the editing command.
  for (const root of roots) {
    const stripped = normalized.startsWith(`${root}/`) ? normalized.slice(root.length + 1) : undefined;
    if (stripped !== undefined) return { assetPath: toPosix(path.join(root, stripped)), familyRoot: root };
  }
  for (const root of roots) {
    if (existsSync(path.join(rootDir, root, normalized))) {
      return { assetPath: toPosix(path.join(root, normalized)), familyRoot: root };
    }
  }
  return { assetPath: toPosix(path.join(descriptor.familyRoot, normalized)), familyRoot: descriptor.familyRoot };
}

function splitFieldPath(fieldPath: string): string[] {
  return fieldPath.replace(/^\$\.?/, "").split(".").filter((segment) => segment.length > 0);
}

/** Coerce a flag string into the scalar the document should hold, so numbers and booleans round-trip. */
function coerceScalar(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
  if (/^-?\d*\.\d+$/.test(value)) return Number.parseFloat(value);
  return value;
}

type EditFailure = { fieldPath: string; message: string; code: string };

function isMapping(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEmptySequence(value: unknown): boolean {
  return Array.isArray(value) && value.length === 0;
}

/**
 * Whether the segment addresses the position one past the last entry. Addressing it creates the
 * entry, so a new sequence item is authored with the same field addressing that edits an existing
 * one; any further position stays refused, because it would leave a hole in the sequence.
 */
function isAppendPosition(container: readonly unknown[], segment: string): boolean {
  const index = Number.parseInt(segment, 10);
  return Number.isInteger(index) && index === container.length && segment === String(index);
}

/**
 * Apply field-addressed edits to a parsed document. Only the addressed field is touched; every
 * sibling key, sequence entry, and unaddressed branch is left as parsed.
 */
export function applyFieldEdits(
  document: unknown,
  edits: readonly BundledAssetEdit[],
): { document: unknown; failures: EditFailure[] } {
  const failures: EditFailure[] = [];
  let root = document;
  if (root === undefined || root === null) root = {};

  for (const edit of edits) {
    const segments = splitFieldPath(edit.fieldPath);
    if (segments.length === 0) {
      failures.push({ fieldPath: edit.fieldPath, message: "field path must name a field", code: "empty-field-path" });
      continue;
    }
    let cursor = root;
    let failed = false;
    for (const segment of segments.slice(0, -1)) {
      if (cursor === null || typeof cursor !== "object") {
        failures.push({ fieldPath: edit.fieldPath, message: `'${segment}' cannot be addressed under a scalar value`, code: "field-path-not-traversable" });
        failed = true;
        break;
      }
      const container = cursor as Record<string, unknown>;
      if (Array.isArray(container)) {
        const index = Number.parseInt(segment, 10);
        if (!Number.isInteger(index) || index < 0 || index >= container.length) {
          if (edit.kind !== "remove" && isAppendPosition(container, segment)) {
            container.push({});
            cursor = container[container.length - 1];
            continue;
          }
          failures.push({ fieldPath: edit.fieldPath, message: `sequence index '${segment}' is out of range`, code: "field-path-out-of-range" });
          failed = true;
          break;
        }
        cursor = container[index];
        continue;
      }
      if (container[segment] === undefined) {
        if (edit.kind === "remove") {
          failures.push({ fieldPath: edit.fieldPath, message: `'${segment}' does not exist`, code: "field-path-missing" });
          failed = true;
          break;
        }
        container[segment] = {};
      }
      cursor = container[segment];
    }
    if (failed) continue;

    const leaf = segments[segments.length - 1] as string;
    if (cursor === null || typeof cursor !== "object") {
      failures.push({ fieldPath: edit.fieldPath, message: `'${leaf}' cannot be addressed under a scalar value`, code: "field-path-not-traversable" });
      continue;
    }
    if (Array.isArray(cursor)) {
      const index = Number.parseInt(leaf, 10);
      if (!Number.isInteger(index) || index < 0 || index >= cursor.length) {
        // Only the two kinds that address a field create one. An --append naming an index rather
        // than its sequence would skip the duplicate check that appending to the sequence applies,
        // so it stays refused and the caller is left with the form that dedups.
        if (edit.kind === "set" && isAppendPosition(cursor, leaf)) {
          cursor.push(coerceScalar(edit.value));
          continue;
        }
        if (edit.kind === "create-list" && isAppendPosition(cursor, leaf)) {
          cursor.push([]);
          continue;
        }
        failures.push({ fieldPath: edit.fieldPath, message: `sequence index '${leaf}' is out of range`, code: "field-path-out-of-range" });
        continue;
      }
      if (edit.kind === "remove") cursor.splice(index, 1);
      else if (edit.kind === "create-list") {
        if (!isEmptySequence(cursor[index])) {
          failures.push({ fieldPath: edit.fieldPath, message: `sequence index '${leaf}' already records content, and empty-sequence creation only fills an absent or already-empty field`, code: "field-path-already-recorded" });
        }
      } else cursor[index] = coerceScalar(edit.value);
      continue;
    }

    const container = cursor as Record<string, unknown>;
    if (edit.kind === "remove") {
      if (container[leaf] === undefined) {
        failures.push({ fieldPath: edit.fieldPath, message: `'${leaf}' does not exist`, code: "field-path-missing" });
        continue;
      }
      delete container[leaf];
      continue;
    }
    if (edit.kind === "create-list") {
      // Creation only fills an absent field: overwriting recorded content here would be the
      // in-place rebuild that the artifact-writes rule keeps out of every editing command. An
      // already-empty sequence is left as it is rather than refused, so restating the edits that
      // authored an entry stays idempotent the way every other artifact write is.
      const existing = container[leaf];
      if (existing !== undefined) {
        if (!isEmptySequence(existing)) {
          failures.push({ fieldPath: edit.fieldPath, message: `'${leaf}' already records content, and empty-sequence creation only fills an absent or already-empty field`, code: "field-path-already-recorded" });
        }
        continue;
      }
      container[leaf] = [];
      continue;
    }
    if (edit.kind === "append") {
      const existing = container[leaf];
      const list = Array.isArray(existing) ? existing : existing === undefined ? [] : undefined;
      if (list === undefined) {
        failures.push({ fieldPath: edit.fieldPath, message: `'${leaf}' is not a sequence`, code: "field-path-not-a-sequence" });
        continue;
      }
      // A sequence whose recorded entries are mappings cannot hold a coerced scalar. Refusing it
      // here rather than at candidate validation is what lets the diagnostic name the runnable form
      // that does create an entry, which a schema-shaped diagnostic cannot state.
      if (list.length > 0 && list.every((entry) => isMapping(entry))) {
        failures.push({
          fieldPath: edit.fieldPath,
          message: `'${leaf}' holds mapping entries, so an appended scalar cannot be one of them; author the entry's fields at the next position instead, as --set ${edit.fieldPath}.${list.length}.<field> --value <text>`,
          code: "sequence-holds-mappings",
        });
        continue;
      }
      const value = coerceScalar(edit.value);
      if (!list.some((entry) => entry === value)) list.push(value);
      container[leaf] = list;
      continue;
    }
    container[leaf] = coerceScalar(edit.value);
  }

  return { document: root, failures };
}

/** Filename-declared fixture intent: what the fixture must be for its suite to keep testing anything. */
export type FixtureIntent = "must-parse" | "must-not-parse";

export function fixtureIntent(assetPath: string): FixtureIntent {
  return path.basename(assetPath).includes(".invalid.malformed.") ? "must-not-parse" : "must-parse";
}

function registeredSchemaFor(candidate: unknown, assetPath: string): { schema: object } | { error: YamlMutationValidationIssue } {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { error: issue("$", "a bundled asset must be a YAML mapping", "candidate-not-a-mapping", { artifactPath: assetPath }) };
  }
  const schemaId = (candidate as Record<string, unknown>).schema;
  if (typeof schemaId !== "string") {
    return { error: issue("$.schema", "a bundled asset must declare its schema id so it can be validated", "missing-schema-id", { artifactPath: assetPath }) };
  }
  try {
    return { schema: loadBundledSchemaBySchemaId(schemaId) };
  } catch (error) {
    return {
      error: issue("$.schema", error instanceof Error ? error.message : String(error), "unknown-schema-id", { artifactPath: assetPath }),
    };
  }
}

/** Validate a candidate against the registered schema its own `schema` field names. */
function validateAgainstRegisteredSchema(candidate: unknown, assetPath: string): YamlMutationValidationIssue[] {
  const resolved = registeredSchemaFor(candidate, assetPath);
  if ("error" in resolved) return [resolved.error];
  const result = validateWithSchema(resolved.schema, candidate, assetPath);
  return result.diagnostics.map((entry) => issue(entry.fieldPath ?? "$", entry.message, "candidate-invalid", { artifactPath: assetPath }));
}

/**
 * A bundled schema document is a JSON Schema wrapper, not an instance of a registered artifact
 * schema, so it is judged on the wrapper contract the loader actually depends on.
 */
function validateSchemaDocument(candidate: unknown, assetPath: string): YamlMutationValidationIssue[] {
  const record = candidate as Record<string, unknown>;
  const issues: YamlMutationValidationIssue[] = [];
  if (path.basename(assetPath) === "registry.yaml") {
    if (!Array.isArray(record.entries)) {
      issues.push(issue("$.entries", "the schema registry must hold an entries sequence", "registry-entries-missing", { artifactPath: assetPath }));
      return issues;
    }
    // The registry is an instance of a registered artifact schema, unlike the schema documents it
    // indexes, so it is judged on that contract. A shape check over entries alone was strictly
    // weaker than what every registry reader depends on, and admitted an entry of any type.
    return validateAgainstRegisteredSchema(candidate, assetPath);
  }
  const jsonSchema = record.json_schema;
  if (!jsonSchema || typeof jsonSchema !== "object") {
    issues.push(issue("$.json_schema", "a bundled schema document must carry a json_schema mapping", "json-schema-missing", { artifactPath: assetPath }));
    return issues;
  }
  return issues;
}

function validateCandidateFor(
  descriptor: FamilyDescriptor,
  assetPath: string,
  rootDir: string,
): (candidate: unknown) => readonly YamlMutationValidationIssue[] {
  return (candidate) => {
    if (descriptor.family === "bundled-schema-assets") return validateSchemaDocument(candidate, assetPath);
    if (descriptor.validation === "inventory-check") return runInventoryChecker(rootDir, assetPath, candidate);
    if (descriptor.validation === "fixture-intent") {
      // Fixtures are generic documents with no registered schema; the contract they serve is that a
      // .valid. fixture parses and an .invalid. one still reaches the checker being tested.
      return [];
    }
    return validateAgainstRegisteredSchema(candidate, assetPath);
  };
}

/**
 * Every reference that would dangle if the named asset disappeared, as human-readable paths. Used
 * to gate deletion, because none of these references is expressed in a schema the write could check.
 */
export function findAssetReferences(assetPath: string, rootDir: string): string[] {
  const references: string[] = [];
  const base = path.basename(assetPath);
  const schemaFileName = base;

  if (assetPath.startsWith("templates/strict-spec-driven/schemas/") && base !== "registry.yaml") {
    try {
      const registry = loadBundledSchemaRegistry();
      if (registry.entries.some((entry) => entry.schema_file === schemaFileName)) {
        references.push("templates/strict-spec-driven/schemas/registry.yaml");
      }
    } catch {
      // A registry that cannot be read cannot be shown to reference the asset.
    }
  }
  if (assetPath.startsWith("examples/strict-spec-driven/")) {
    try {
      const registry = loadBundledSchemaRegistry();
      // primary_example is registry data the shared entry type does not declare, so it is read positionally.
      const primaryExampleOf = (entry: unknown): unknown => (entry as Record<string, unknown>).primary_example;
      if (registry.entries.some((entry) => {
        const primaryExample = primaryExampleOf(entry);
        return typeof primaryExample === "string" && primaryExample.endsWith(`/${base}`);
      })) {
        references.push("templates/strict-spec-driven/schemas/registry.yaml");
      }
    } catch {
      // As above.
    }
  }
  const inventoryPath = path.join(rootDir, "inventory", "yaml-mutation-surfaces.yaml");
  if (assetPath !== "inventory/yaml-mutation-surfaces.yaml" && existsSync(inventoryPath)) {
    const inventoryText = readFileSync(inventoryPath, "utf8");
    if (inventoryText.includes(assetPath)) references.push("inventory/yaml-mutation-surfaces.yaml");
  }
  const suitesDir = path.join(rootDir, "test", "suites");
  if (existsSync(suitesDir)) {
    for (const entry of readdirSync(suitesDir).sort()) {
      if (!entry.endsWith(".ts")) continue;
      const suitePath = path.join(suitesDir, entry);
      if (readFileSync(suitePath, "utf8").includes(base)) references.push(toPosix(path.relative(rootDir, suitePath)));
    }
  }
  const scaffoldSources = [path.join(rootDir, "src", "scaffold.ts"), path.join(rootDir, "src", "sop-categories.ts")];
  for (const source of scaffoldSources) {
    if (existsSync(source) && readFileSync(source, "utf8").includes(base)) {
      references.push(toPosix(path.relative(rootDir, source)));
    }
  }
  return [...new Set(references)].sort();
}

/**
 * Every file the embedded bundle carries, as `[embeddedKey, absolutePath]`. `templates` keys drop
 * their root segment; every other root keeps it, so the key matches the repository-relative path
 * that schema-show, sample-show, and the mutation surface already use.
 */
export function listEmbeddedAssetFiles(rootDir: string): [string, string][] {
  const assetRoots = ["templates", "examples", "inventory"] as const;
  const found: [string, string][] = [];
  for (const assetRoot of assetRoots) {
    const assetRootDir = path.join(rootDir, assetRoot);
    if (!existsSync(assetRootDir)) continue;
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory).sort()) {
        const full = path.join(directory, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        const relativePath = path.relative(assetRootDir, full);
        found.push([toPosix(assetRoot === "templates" ? relativePath : path.join(assetRoot, relativePath)), full]);
      }
    };
    walk(assetRootDir);
  }
  return found;
}

/** Regenerate the embedded bundle content from the working tree, without writing it. */
export function renderEmbeddedBundle(rootDir: string): string {
  const entries: string[] = [];
  for (const [key, file] of listEmbeddedAssetFiles(rootDir)) {
    const content = readFileSync(file, "utf8");
    const escaped = content.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
    entries.push(`  ${JSON.stringify(key)}: \`${escaped}\``);
  }
  return `// Auto-generated by scripts/gen-templates-bundle.ts — do not edit manually
export const EMBEDDED_TEMPLATES: Record<string, string> = {
${entries.join(",\n")},
};

export function hasEmbeddedTemplate(key: string): boolean {
  return key in EMBEDDED_TEMPLATES;
}

export function getEmbeddedTemplateKeys(): string[] {
  return Object.keys(EMBEDDED_TEMPLATES).sort();
}

export function readEmbeddedTemplate(key: string): string | undefined {
  return EMBEDDED_TEMPLATES[key];
}
`;
}

/**
 * The inventory gate: run this repository's own inventory checker over a candidate tree. It is
 * spawned rather than imported because it is a Bun TypeScript script under scripts/, which the
 * compiled CLI cannot import — and spawning keeps the whole mutation path synchronous.
 */
function runInventoryChecker(rootDir: string, assetPath: string, candidate: unknown): YamlMutationValidationIssue[] {
  const checkerPath = path.join(rootDir, "scripts", "check-yaml-mutation-inventory.ts");
  if (!existsSync(checkerPath)) return [];
  // The candidate is handed to the checker as a file outside the repository, so coverage is judged
  // on the inventory that is about to be written rather than on the one still installed.
  const candidatePath = path.join(mkdtempSync(path.join(tmpdir(), "strict-spec-inventory-")), "candidate.yaml");
  writeFileSync(candidatePath, stringifyYamlDocument(candidate), "utf8");
  const completed = spawnSync("bun", [checkerPath, rootDir, "--candidate", candidatePath], { encoding: "utf8" });
  rmSync(path.dirname(candidatePath), { recursive: true, force: true });
  if (completed.error || typeof completed.stdout !== "string" || completed.stdout.trim() === "") {
    return [issue(
      "$.inventory.check",
      "the mutation inventory check could not be run, so the candidate inventory cannot be accepted",
      "inventory-check-unavailable",
      { artifactPath: assetPath },
    )];
  }
  let report: { valid: boolean; diagnostics?: { code: string; path: string; message: string }[] };
  try {
    report = JSON.parse(completed.stdout);
  } catch {
    return [issue("$.inventory.check", "the mutation inventory check produced unreadable output", "inventory-check-unreadable", { artifactPath: assetPath })];
  }
  if (report.valid) return [];
  return (report.diagnostics ?? []).map((entry) => issue(entry.path, entry.message, entry.code, { artifactPath: assetPath }));
}

/**
 * Plan, validate, and commit one bundled-asset mutation together with every participant it
 * invalidates. Returns a deterministic outcome; nothing is written unless the whole set validates.
 */
export function mutateBundledAsset(options: BundledAssetMutationOptions): BundledAssetMutationOutcome {
  const descriptor = FAMILIES[options.family];
  const rootDir = resolveCheckoutRoot(options.rootDir);
  if (!rootDir) {
    return refusal(
      options.family,
      "bundled-source-tree-absent",
      "the bundled source tree was not found; this command is repository-maintenance scoped and runs only inside the strict-spec-driven checkout",
    );
  }

  const resolved = resolveAssetPath(options.family, options.assetName, rootDir);
  if ("error" in resolved) return refusal(options.family, "unknown-asset", resolved.error);
  const { assetPath, familyRoot } = resolved;
  const absolutePath = path.join(rootDir, assetPath);
  const exists = existsSync(absolutePath);
  const edits = options.edits ?? [];

  if (options.delete) {
    if (edits.length > 0) {
      return refusal(options.family, "delete-with-edit", "deletion is an isolated operation and cannot be combined with field edits", assetPath);
    }
    if (!exists) return refusal(options.family, "target-missing", `no such asset: ${assetPath}`, assetPath);
    const references = findAssetReferences(assetPath, rootDir);
    if (references.length > 0) {
      return refusal(
        options.family,
        "asset-still-referenced",
        `${assetPath} is still referenced by ${references.join(", ")}; remove those references before deleting it`,
        assetPath,
      );
    }
  } else if (edits.length === 0) {
    return refusal(options.family, "no-edits", "supply at least one field edit, or --delete to remove the asset", assetPath);
  }

  const intent = descriptor.validation === "fixture-intent" ? fixtureIntent(assetPath) : undefined;
  if (intent === "must-not-parse" && !options.delete) {
    return refusal(
      options.family,
      "fixture-intent-not-field-editable",
      `${assetPath} declares the must-not-parse fixture intent, so it holds no addressable fields; deletion is its only supported mutation`,
      assetPath,
    );
  }

  let candidate: unknown;
  if (!options.delete) {
    let current: unknown = {};
    if (exists) {
      try {
        current = parseYamlDocument<unknown>(readFileSync(absolutePath, "utf8"), { source: assetPath });
      } catch (error) {
        return refusal(
          options.family,
          "target-unparseable",
          `${assetPath} could not be parsed, so its fields cannot be addressed: ${error instanceof Error ? error.message : String(error)}`,
          assetPath,
        );
      }
    }
    const applied = applyFieldEdits(current, edits);
    if (applied.failures.length > 0) {
      return {
        family: options.family,
        assetPath,
        valid: false,
        committed: false,
        exitStatus: 1,
        changes: [],
        diagnostics: applied.failures.map((failure) => ({
          artifactPath: assetPath,
          phase: "validation" as const,
          code: failure.code,
          fieldPath: failure.fieldPath,
          message: failure.message,
        })),
      };
    }
    candidate = applied.document;
  }

  const requests: YamlMutationRequest[] = [{
    artifactFamily: options.family,
    artifactId: assetPath,
    schemaId: options.family,
    familyRoot,
    absolutePath,
    operation: options.delete ? "delete" : exists ? "update" : "create",
    ...(options.delete
      ? {}
      : {
        candidate,
        validateCandidate: validateCandidateFor(descriptor, assetPath, rootDir),
      }),
  }];

  // The embedded bundle is what installed consumers actually read, so it rides in this transaction
  // rather than being left for a later build step that a caller can forget or that cannot roll back.
  if (descriptor.feedsEmbeddedBundle) {
    const bundleAbsolutePath = path.join(rootDir, EMBEDDED_BUNDLE_PATH);
    if (existsSync(bundleAbsolutePath)) {
      let bundleContent: string;
      try {
        const render = options.regenerateEmbeddedBundle ?? renderEmbeddedBundle;
        bundleContent = projectPendingBundle(render, rootDir, assetPath, options.delete ? undefined : candidate);
      } catch (error) {
        return refusal(
          options.family,
          "bundle-regeneration-failed",
          `failed to regenerate ${EMBEDDED_BUNDLE_PATH}: ${error instanceof Error ? error.message : String(error)}`,
          assetPath,
        );
      }
      requests.push({
        artifactFamily: options.family,
        artifactId: EMBEDDED_BUNDLE_PATH,
        schemaId: "generated-embedded-bundle",
        familyRoot: "src",
        absolutePath: bundleAbsolutePath,
        operation: "update",
        role: "generated",
        content: bundleContent,
      });
    }
  }

  const result = commitYamlMutation({ rootDir, mutations: requests });
  return { family: options.family, assetPath, ...result };
}

/**
 * Render the bundle as it will be once this mutation commits. The renderer reads the working tree,
 * which does not yet hold the pending write, so the pending asset is substituted into the result.
 */
function projectPendingBundle(
  render: (rootDir: string) => string,
  rootDir: string,
  assetPath: string,
  candidate: unknown,
): string {
  const currentBundle = render(rootDir);
  const embeddedKey = assetPath.startsWith("templates/") ? assetPath.slice("templates/".length) : assetPath;
  const entryPrefix = `  ${JSON.stringify(embeddedKey)}: \``;
  const serialized = candidate === undefined ? undefined : stringifyYamlDocument(candidate);
  const escaped = serialized?.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

  const startIndex = currentBundle.indexOf(entryPrefix);
  if (startIndex === -1) {
    if (escaped === undefined) return currentBundle;
    const insertAt = currentBundle.indexOf("\n};");
    if (insertAt === -1) throw new Error("embedded bundle has no recognizable entry table");
    return `${currentBundle.slice(0, insertAt)},\n${entryPrefix}${escaped}\``.concat(currentBundle.slice(insertAt));
  }
  const valueStart = startIndex + entryPrefix.length;
  let cursor = valueStart;
  while (cursor < currentBundle.length) {
    if (currentBundle[cursor] === "\\") {
      cursor += 2;
      continue;
    }
    if (currentBundle[cursor] === "`") break;
    cursor += 1;
  }
  if (cursor >= currentBundle.length) throw new Error("embedded bundle entry is unterminated");
  if (escaped === undefined) {
    const lineEnd = currentBundle.indexOf("\n", cursor);
    return currentBundle.slice(0, startIndex) + currentBundle.slice(lineEnd + 1);
  }
  return currentBundle.slice(0, valueStart) + escaped + currentBundle.slice(cursor);
}
