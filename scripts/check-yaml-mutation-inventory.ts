#!/usr/bin/env bun

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { COMMAND_REGISTRATION_ORDER } from "../src/cli/registry.js";

const INVENTORY_PATH = "inventory/yaml-mutation-surfaces.yaml";
const REGISTERED_COMMANDS = new Set<string>(COMMAND_REGISTRATION_ORDER);
const YAML_PATHSPECS = ["*.yaml", "*.yml"];
const MUTATION_PATHSPECS = ["*.ts", "*.js", "*.mjs", "*.cjs", "*.md", "*.sh", "*.ps1", "*.json"];
const OPERATION_KEYS = ["create", "update", "named_remove", "delete"] as const;
const SURFACE_OPERATIONS = new Set(["read", "create", "update", "named-remove", "delete", "copy", "rename"]);
const SURFACE_CLASSIFICATIONS = new Set([
  "cli-owned",
  "remaining-direct-writer",
  "read-only",
  "generated",
  "external",
  "legacy-input",
  "human-only",
]);
const WRITING_SURFACE_CLASSIFICATIONS = new Set(["cli-owned", "remaining-direct-writer", "generated"]);
const SURFACE_MECHANISMS = new Set([
  "filesystem-writer",
  "generated-output-writer",
  "cli-command",
  "mcp-cli-delegation",
  "agent-guidance",
  "documentation-guidance",
  "generated-documentation",
]);
const STABLE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export type InventoryDiagnostic = {
  code: string;
  path: string;
  message: string;
};

export type InventoryValidationResult = {
  valid: boolean;
  inventoryPath: string;
  yamlPathCount: number;
  mutationPathCount: number;
  familyCount: number;
  surfaceCount: number;
  diagnostics: InventoryDiagnostic[];
};

export type InventoryValidationOptions = {
  rootDir: string;
  inventoryPath?: string;
  inventory?: unknown;
  yamlPaths?: string[];
  mutationPaths?: string[];
};

type StringMap = Record<string, unknown>;

function asMap(value: unknown): StringMap | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as StringMap : null;
}

function asStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : null;
}

function normalizeRepoPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

/** Convert the inventory's small glob dialect to a repo-relative path matcher. */
export function inventoryPatternMatches(pattern: string, candidate: string): boolean {
  const normalizedPattern = normalizeRepoPath(pattern);
  let expression = "^";
  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const character = normalizedPattern[index];
    if (character === "*" && normalizedPattern[index + 1] === "*") {
      if (normalizedPattern[index + 2] === "/") {
        expression += "(?:.*/)?";
        index += 2;
      } else {
        expression += ".*";
        index += 1;
      }
    } else if (character === "*") {
      expression += "[^/]*";
    } else if (character === "?") {
      expression += "[^/]";
    } else {
      expression += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  expression += "$";
  return new RegExp(expression).test(normalizeRepoPath(candidate));
}

function gitVisiblePaths(rootDir: string, pathspecs: string[]): string[] {
  const result = spawnSync("git", ["ls-files", "-co", "--exclude-standard", "--", ...pathspecs], {
    cwd: rootDir,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ls-files exited ${String(result.status)}`);
  }
  return [...new Set(result.stdout.split(/\r?\n/u).filter(Boolean).map(normalizeRepoPath))].sort();
}

const FILESYSTEM_MUTATION = /\b(?:writeFileSync|appendFileSync|renameSync|rmSync|unlinkSync|copyFileSync|writeFile|rename|rm|unlink|copyFile)\s*\(/u;
const YAML_CONTEXT = /(?:ya?ml|strict-spec-driven|roadmap|planned.?change|schema|scaffold|lesson|sop|harness|architecture|design.?system|delta.?spec|delta.?tech)/iu;
const GUIDANCE_MUTATION = /(?:direct(?:ly)?\s+(?:edit|write|author)|(?:edit|write|create|delete|remove|rename|modify)(?:ing|s|ed)?[^.\n]{0,100}(?:\.ya?ml|YAML)|strict-spec-cli\s+(?:init|propose|generate|apply|archive|cancel|migrate|maintenance|design-init|harness-(?:infer|session)|mcp-install|roadmap-(?:generate|sync|move-planned-change|archive|reopen|pause|resume|reorder|renumber)|sop-(?:create|edit)|lesson-(?:create|edit|obsolete))|\/strict-(?:roadmap-(?:archive|move|pause|plan|recommend|reopen|reorder|resume|review|sync)|spec-(?:apply|architecture|archive|auto|brainstorm|bugfix|cancel|design(?:-sync)?|harness-(?:init|session)|init|maintenance|migrate|propose(?:-from-roadmap)?|sop|spec-edit|sync-specs)|tech-(?:edit|sync)))/iu;

export function discoverMutationPaths(rootDir: string): string[] {
  return gitVisiblePaths(rootDir, MUTATION_PATHSPECS).filter((relativePath) => {
    const extension = path.extname(relativePath).toLowerCase();
    const content = readFileSync(path.join(rootDir, relativePath), "utf8");
    if ([".md"].includes(extension)) return GUIDANCE_MUTATION.test(content);
    if (!relativePath.startsWith("src/") && !relativePath.startsWith("scripts/")) return false;
    return FILESYSTEM_MUTATION.test(content) && YAML_CONTEXT.test(content);
  });
}

function addDiagnostic(
  diagnostics: InventoryDiagnostic[],
  code: string,
  diagnosticPath: string,
  message: string,
): void {
  diagnostics.push({ code, path: diagnosticPath, message });
}

function validateEvidence(
  rootDir: string,
  ownerPath: string,
  value: unknown,
  diagnostics: InventoryDiagnostic[],
): void {
  const evidence = asStringArray(value);
  if (!evidence || evidence.length === 0) {
    addDiagnostic(diagnostics, "missing-evidence", ownerPath, "evidence must contain at least one repository path");
    return;
  }
  for (const evidencePath of evidence) {
    if (!existsSync(path.join(rootDir, evidencePath))) {
      addDiagnostic(diagnostics, "stale-evidence", `${ownerPath}.evidence`, `evidence path does not exist: ${evidencePath}`);
    }
  }
}

function patternsFromEntries(entries: StringMap): string[] {
  return Object.values(entries).flatMap((rawEntry) => {
    const entry = asMap(rawEntry);
    return asStringArray(entry?.path_patterns) ?? [];
  });
}

function matchingPatterns(patterns: string[], candidate: string): string[] {
  return patterns.filter((pattern) => inventoryPatternMatches(pattern, candidate));
}

export function validateYamlMutationInventory(options: InventoryValidationOptions): InventoryValidationResult {
  const rootDir = path.resolve(options.rootDir);
  const inventoryPath = normalizeRepoPath(options.inventoryPath ?? INVENTORY_PATH);
  const diagnostics: InventoryDiagnostic[] = [];
  let rawInventory = options.inventory;

  if (rawInventory === undefined) {
    const absoluteInventoryPath = path.join(rootDir, inventoryPath);
    if (!existsSync(absoluteInventoryPath)) {
      addDiagnostic(diagnostics, "missing-inventory", inventoryPath, "inventory file does not exist");
      return { valid: false, inventoryPath, yamlPathCount: 0, mutationPathCount: 0, familyCount: 0, surfaceCount: 0, diagnostics };
    }
    try {
      rawInventory = load(readFileSync(absoluteInventoryPath, "utf8"));
    } catch (error) {
      addDiagnostic(diagnostics, "invalid-yaml", inventoryPath, error instanceof Error ? error.message : String(error));
      return { valid: false, inventoryPath, yamlPathCount: 0, mutationPathCount: 0, familyCount: 0, surfaceCount: 0, diagnostics };
    }
  }

  const inventory = asMap(rawInventory);
  if (!inventory) {
    addDiagnostic(diagnostics, "invalid-inventory", inventoryPath, "inventory must be a YAML mapping");
    return { valid: false, inventoryPath, yamlPathCount: 0, mutationPathCount: 0, familyCount: 0, surfaceCount: 0, diagnostics };
  }

  if (inventory.schema !== "strict-spec-driven/yaml-mutation-inventory/v1") {
    addDiagnostic(diagnostics, "invalid-schema", "$.schema", "expected strict-spec-driven/yaml-mutation-inventory/v1");
  }
  if (inventory.schema_version !== 1) {
    addDiagnostic(diagnostics, "invalid-schema-version", "$.schema_version", "expected schema version 1");
  }
  if (inventory.artifact_type !== "yaml_mutation_inventory") {
    addDiagnostic(diagnostics, "invalid-artifact-type", "$.artifact_type", "expected yaml_mutation_inventory");
  }

  const metadata = asMap(inventory.inventory);
  const operationStates = new Set(asStringArray(metadata?.operation_states) ?? []);
  const ownershipClasses = new Set(asStringArray(metadata?.ownership_classes) ?? []);
  const families = asMap(inventory.artifact_families) ?? {};
  const exclusions = asMap(inventory.exclusions) ?? {};
  const surfaces = asMap(inventory.mutation_surfaces) ?? {};
  const declaredDirectWritePaths: Array<{ familyId: string; path: string }> = [];

  if (Object.keys(families).length === 0) addDiagnostic(diagnostics, "missing-families", "$.artifact_families", "at least one family is required");
  if (Object.keys(surfaces).length === 0) addDiagnostic(diagnostics, "missing-surfaces", "$.mutation_surfaces", "at least one surface is required");

  for (const [familyId, rawFamily] of Object.entries(families)) {
    const familyPath = `$.artifact_families.${familyId}`;
    if (!STABLE_ID.test(familyId)) addDiagnostic(diagnostics, "invalid-id", familyPath, "family id must be kebab-case");
    const family = asMap(rawFamily);
    if (!family) {
      addDiagnostic(diagnostics, "invalid-family", familyPath, "family must be a mapping");
      continue;
    }
    const patterns = asStringArray(family.path_patterns);
    if (!patterns || patterns.length === 0) addDiagnostic(diagnostics, "missing-pattern", `${familyPath}.path_patterns`, "at least one location pattern is required");
    if (!asStringArray(family.artifact_types)?.length) {
      addDiagnostic(diagnostics, "missing-artifact-types", `${familyPath}.artifact_types`, "at least one artifact type is required");
    }
    if (typeof family.validation_owner !== "string" || family.validation_owner.length === 0) {
      addDiagnostic(diagnostics, "missing-validation-owner", `${familyPath}.validation_owner`, "validation owner is required");
    }
    // The AI authoring protocol's final step runs this command, so a family whose mutations flow
    // through the CLI must name one. Requiring it only where an operation is cli-owned keeps
    // human-only and not-applicable families from having to invent a command nobody would run.
    const hasCliOwnedOperation = OPERATION_KEYS.some((operation) => asMap(family.operations)?.[operation] === "cli-owned");
    if (hasCliOwnedOperation && (typeof family.validation_command !== "string" || family.validation_command.length === 0)) {
      addDiagnostic(
        diagnostics,
        "missing-validation-command",
        `${familyPath}.validation_command`,
        `family '${familyId}' has a cli-owned operation but names no validation command for the authoring protocol to run`,
      );
    }
    if (typeof family.ownership !== "string" || !ownershipClasses.has(family.ownership)) {
      addDiagnostic(diagnostics, "invalid-ownership", `${familyPath}.ownership`, `unknown ownership class: ${String(family.ownership)}`);
    }
    const operations = asMap(family.operations);
    for (const operation of OPERATION_KEYS) {
      const state = operations?.[operation];
      if (typeof state !== "string" || !operationStates.has(state)) {
        addDiagnostic(diagnostics, "invalid-operation-state", `${familyPath}.operations.${operation}`, `unknown operation state: ${String(state)}`);
      }
    }
    if (!asStringArray(family.reference_side_effects)?.length) {
      addDiagnostic(diagnostics, "missing-reference-side-effects", `${familyPath}.reference_side_effects`, "reference side effects must be recorded explicitly");
    }
    const cliOwners = asStringArray(family.cli_owners);
    if (!cliOwners) {
      addDiagnostic(diagnostics, "invalid-cli-owners", `${familyPath}.cli_owners`, "CLI owners must be a string sequence, which may be empty");
    } else {
      // An operation the inventory advertises as CLI-owned is a claim that some command performs it.
      // Without a named owner the claim is unfalsifiable, so the family reads as covered while the
      // operation has no implementation anyone can point at.
      for (const operation of OPERATION_KEYS) {
        if (operations?.[operation] === "cli-owned" && cliOwners.length === 0) {
          addDiagnostic(
            diagnostics,
            "missing-cli-owner",
            `${familyPath}.operations.${operation}`,
            `family '${familyId}' declares ${operation} as cli-owned but names no CLI mutation owner`,
          );
        }
      }
      // A named owner is only evidence if the CLI actually registers it; a renamed or dropped
      // command would otherwise leave the inventory asserting coverage that cannot be invoked.
      for (const owner of cliOwners) {
        if (!REGISTERED_COMMANDS.has(owner)) {
          addDiagnostic(
            diagnostics,
            "unknown-cli-owner",
            `${familyPath}.cli_owners`,
            `family '${familyId}' names '${owner}', which the CLI does not register as a command`,
          );
        }
      }
    }
    const directWritePaths = asStringArray(family.direct_write_paths);
    if (!directWritePaths) {
      addDiagnostic(diagnostics, "invalid-direct-write-paths", `${familyPath}.direct_write_paths`, "direct write paths must be a string sequence, which may be empty");
    } else {
      for (const directWritePath of directWritePaths) {
        declaredDirectWritePaths.push({ familyId, path: directWritePath });
        if (!existsSync(path.join(rootDir, directWritePath))) {
          addDiagnostic(diagnostics, "stale-direct-write-path", `${familyPath}.direct_write_paths`, `direct write path does not exist: ${directWritePath}`);
        }
        // A direct writer alongside CLI owners is an accepted intermediate state; a direct writer
        // with no CLI owner at all means the family's only route to mutation is an unowned one.
        if (cliOwners?.length === 0) {
          addDiagnostic(
            diagnostics,
            "unowned-direct-write-path",
            `${familyPath}.direct_write_paths`,
            `family '${familyId}' declares direct write path '${directWritePath}' but names no CLI mutation owner`,
          );
        }
      }
    }
    validateEvidence(rootDir, familyPath, family.evidence, diagnostics);
  }

  for (const [exclusionId, rawExclusion] of Object.entries(exclusions)) {
    const exclusionPath = `$.exclusions.${exclusionId}`;
    if (!STABLE_ID.test(exclusionId)) addDiagnostic(diagnostics, "invalid-id", exclusionPath, "exclusion id must be kebab-case");
    const exclusion = asMap(rawExclusion);
    if (!exclusion) {
      addDiagnostic(diagnostics, "invalid-exclusion", exclusionPath, "exclusion must be a mapping");
      continue;
    }
    if (!asStringArray(exclusion.path_patterns)?.length) {
      addDiagnostic(diagnostics, "missing-pattern", `${exclusionPath}.path_patterns`, "at least one exclusion pattern is required");
    }
    if (typeof exclusion.ownership !== "string" || !ownershipClasses.has(exclusion.ownership)) {
      addDiagnostic(diagnostics, "invalid-ownership", `${exclusionPath}.ownership`, `unknown ownership class: ${String(exclusion.ownership)}`);
    }
    validateEvidence(rootDir, exclusionPath, exclusion.evidence, diagnostics);
  }

  for (const [surfaceId, rawSurface] of Object.entries(surfaces)) {
    const surfacePath = `$.mutation_surfaces.${surfaceId}`;
    if (!STABLE_ID.test(surfaceId)) addDiagnostic(diagnostics, "invalid-id", surfacePath, "surface id must be kebab-case");
    const surface = asMap(rawSurface);
    if (!surface) {
      addDiagnostic(diagnostics, "invalid-surface", surfacePath, "surface must be a mapping");
      continue;
    }
    if (!asStringArray(surface.path_patterns)?.length) {
      addDiagnostic(diagnostics, "missing-pattern", `${surfacePath}.path_patterns`, "at least one mutation path pattern is required");
    }
    if (typeof surface.mechanism !== "string" || !SURFACE_MECHANISMS.has(surface.mechanism)) {
      addDiagnostic(diagnostics, "invalid-surface-mechanism", `${surfacePath}.mechanism`, `unknown surface mechanism: ${String(surface.mechanism)}`);
    }
    if (typeof surface.classification !== "string" || !SURFACE_CLASSIFICATIONS.has(surface.classification)) {
      addDiagnostic(diagnostics, "invalid-surface-classification", `${surfacePath}.classification`, `unknown surface classification: ${String(surface.classification)}`);
    }
    const operations = asStringArray(surface.operations);
    if (!operations?.length) {
      addDiagnostic(diagnostics, "missing-surface-operations", `${surfacePath}.operations`, "at least one surface operation is required");
    } else {
      for (const operation of operations) {
        if (!SURFACE_OPERATIONS.has(operation)) {
          addDiagnostic(diagnostics, "invalid-surface-operation", `${surfacePath}.operations`, `unknown surface operation: ${operation}`);
        }
      }
    }
    for (const familyId of asStringArray(surface.families) ?? []) {
      if (!(familyId in families)) {
        addDiagnostic(diagnostics, "unknown-family-reference", `${surfacePath}.families`, `unknown family id: ${familyId}`);
      }
    }
    validateEvidence(rootDir, surfacePath, surface.evidence, diagnostics);
  }

  let yamlPaths: string[] = [];
  let mutationPaths: string[] = [];
  try {
    yamlPaths = (options.yamlPaths ?? gitVisiblePaths(rootDir, YAML_PATHSPECS)).map(normalizeRepoPath).sort();
    mutationPaths = (options.mutationPaths ?? discoverMutationPaths(rootDir)).map(normalizeRepoPath).sort();
  } catch (error) {
    addDiagnostic(diagnostics, "discovery-failed", "$.inventory.discovery", error instanceof Error ? error.message : String(error));
  }

  const familyPatterns = patternsFromEntries(families);
  const exclusionPatterns = patternsFromEntries(exclusions);
  for (const yamlPath of yamlPaths) {
    if (matchingPatterns(familyPatterns, yamlPath).length === 0 && matchingPatterns(exclusionPatterns, yamlPath).length === 0) {
      addDiagnostic(diagnostics, "uncovered-yaml-path", yamlPath, "no artifact family or explicit exclusion pattern covers this YAML path");
    }
  }

  const surfacePatterns = patternsFromEntries(surfaces);
  for (const directWritePath of declaredDirectWritePaths) {
    const familyFieldPath = `$.artifact_families.${directWritePath.familyId}.direct_write_paths`;
    if (matchingPatterns(surfacePatterns, directWritePath.path).length === 0) {
      addDiagnostic(
        diagnostics,
        "uncovered-direct-write-path",
        familyFieldPath,
        `no mutation surface pattern covers declared direct write path: ${directWritePath.path}`,
      );
      continue;
    }
    // The family says this path writes YAML; its surfaces say what kind of writer it is. When every
    // covering surface classifies it as something that does not write, the two halves of the
    // inventory disagree and neither can be trusted as coverage evidence.
    const coveringClassifications = Object.values(surfaces).filter((rawSurface) => {
      const patterns = asStringArray(asMap(rawSurface)?.path_patterns) ?? [];
      return matchingPatterns(patterns, directWritePath.path).length > 0;
    }).map((rawSurface) => asMap(rawSurface)?.classification);
    if (!coveringClassifications.some((classification) =>
      typeof classification === "string" && WRITING_SURFACE_CLASSIFICATIONS.has(classification))) {
      addDiagnostic(
        diagnostics,
        "non-writing-direct-write-surface",
        familyFieldPath,
        `direct write path '${directWritePath.path}' is covered only by surfaces that do not write it`,
      );
    }
  }
  for (const mutationPath of mutationPaths) {
    if (matchingPatterns(surfacePatterns, mutationPath).length === 0) {
      addDiagnostic(diagnostics, "uncovered-mutation-path", mutationPath, "no mutation surface pattern covers this repository path");
    }
  }

  let visiblePaths = new Set<string>();
  try {
    visiblePaths = new Set(gitVisiblePaths(rootDir, ["*"]));
  } catch (error) {
    addDiagnostic(diagnostics, "discovery-failed", "$.mutation_surfaces", error instanceof Error ? error.message : String(error));
  }
  for (const [surfaceId, rawSurface] of Object.entries(surfaces)) {
    const patterns = asStringArray(asMap(rawSurface)?.path_patterns) ?? [];
    for (const pattern of patterns) {
      if (![...visiblePaths].some((candidate) => inventoryPatternMatches(pattern, candidate))) {
        addDiagnostic(diagnostics, "stale-surface-pattern", `$.mutation_surfaces.${surfaceId}.path_patterns`, `pattern matches no repository path: ${pattern}`);
      }
    }
  }

  diagnostics.sort((left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path) || left.message.localeCompare(right.message));
  return {
    valid: diagnostics.length === 0,
    inventoryPath,
    yamlPathCount: yamlPaths.length,
    mutationPathCount: mutationPaths.length,
    familyCount: Object.keys(families).length,
    surfaceCount: Object.keys(surfaces).length,
    diagnostics,
  };
}

function runCli(): void {
  const args = process.argv.slice(2);
  // `--candidate` lets a pending inventory be checked before it is written, so inventory-edit can
  // gate a write on coverage without first installing the document it is validating.
  const candidateIndex = args.indexOf("--candidate");
  const candidatePath = candidateIndex === -1 ? undefined : args[candidateIndex + 1];
  const rootArgument = args.filter((_, index) => index !== candidateIndex && index !== candidateIndex + 1)[0];
  const rootDir = rootArgument ? path.resolve(rootArgument) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const candidate = candidatePath ? load(readFileSync(path.resolve(candidatePath), "utf8")) : undefined;
  const result = validateYamlMutationInventory({ rootDir, ...(candidate !== undefined ? { inventory: candidate } : {}) });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.valid) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) runCli();
