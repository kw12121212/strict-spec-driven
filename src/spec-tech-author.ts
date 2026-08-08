import { existsSync, readdirSync } from "fs";
import path from "path";
import { loadBundledSchemaByArtifactType, validateArtifact } from "./validation.js";
import {
  commitYamlMutation,
  type YamlMutationRelationshipContext,
  type YamlMutationResult,
  type YamlMutationValidationIssue,
} from "./yaml-mutation.js";
import { parseYamlFile } from "./yaml.js";

const STRICT_WORKFLOW_DIR = ".strict-spec-driven";
const SPEC_ROOT = `${STRICT_WORKFLOW_DIR}/specs`;
const TECH_ROOT = `${STRICT_WORKFLOW_DIR}/tech`;
const SPEC_INDEX_PATH = `${SPEC_ROOT}/INDEX.yaml`;
const TECH_INDEX_PATH = `${TECH_ROOT}/INDEX.yaml`;
const MAIN_SPEC_SCHEMA_ID = "strict-spec-driven/main-spec/v1";
const SPEC_INDEX_SCHEMA_ID = "strict-spec-driven/spec-index/v1";
const MAIN_TECH_SCHEMA_ID = "strict-spec-driven/main-tech/v1";
const TECH_INDEX_SCHEMA_ID = "strict-spec-driven/tech-index/v1";
const ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const STRENGTHS = new Set(["MUST", "SHOULD", "MAY"]);
const TECH_CATEGORIES = new Set([
  "coding", "architecture", "security", "performance", "api", "testing", "tooling", "operations",
  "documentation", "ui",
]);
const ENFORCEMENT_METHODS = new Set(["lint", "ci", "test", "review", "manual"]);

type RawRecord = Record<string, unknown>;
export type ScenarioStep = { GIVEN?: string; WHEN?: string; THEN?: string; AND?: string };

export type MainSpecAuthorInput = {
  id: string;
  specPath?: string;
  title?: string;
  requirement?: {
    id: string;
    strength?: string;
    statement?: string;
    scenario?: { id: string; steps: ScenarioStep[] };
  };
  removeRequirements: string[];
  removeScenarios: string[];
  delete: boolean;
};

export type MainTechAuthorInput = {
  id: string;
  techPath?: string;
  title?: string;
  category?: string;
  rule?: {
    id: string;
    strength?: string;
    statement?: string;
    rationale?: string;
    method?: string;
    detail?: string;
    exampleGood: string[];
    exampleBad: string[];
    exceptions: string[];
    removeExampleGood: string[];
    removeExampleBad: string[];
    removeExceptions: string[];
  };
  removeRules: string[];
  delete: boolean;
};

export type MainArtifactAuthorResult = YamlMutationResult & {
  artifactPath: string;
  indexPath: string;
  operation: "create" | "update" | "delete";
};

type LoadedArtifact = {
  id: string;
  absolutePath: string;
  repoPath: string;
  artifact: RawRecord;
};

function asRecord(value: unknown): RawRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RawRecord : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function appendUnique(existing: string[], additions: string[]): string[] {
  return [...new Set([...existing, ...additions])];
}

function toRepoPath(rootDir: string, absolutePath: string): string {
  return path.relative(rootDir, absolutePath).split(path.sep).join("/");
}

function listYamlFiles(directoryPath: string): string[] {
  if (!existsSync(directoryPath)) return [];
  const files: string[] = [];
  const walk = (currentPath: string): void => {
    for (const entry of readdirSync(currentPath, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) walk(entryPath);
      else if (entry.isFile() && /\.ya?ml$/u.test(entry.name)) files.push(entryPath);
    }
  };
  walk(directoryPath);
  return files;
}

function assertId(id: string, label: string): void {
  if (!ID_PATTERN.test(id)) throw new Error(`${label} must be a lowercase kebab-case id`);
}

function canonicalArtifactPath(
  familyRoot: string,
  id: string,
  suppliedPath: string | undefined,
  flagName: string,
): string {
  const candidate = suppliedPath ?? `${familyRoot}/${id}.yaml`;
  const normalized = path.posix.normalize(candidate.replaceAll("\\", "/"));
  if (
    path.isAbsolute(candidate)
    || normalized === familyRoot
    || !normalized.startsWith(`${familyRoot}/`)
    || !normalized.endsWith(".yaml")
    || path.posix.basename(normalized) === "INDEX.yaml"
  ) {
    throw new Error(`${flagName} must name a .yaml file below ${familyRoot}/ and cannot name INDEX.yaml`);
  }
  return normalized;
}

function loadArtifacts(rootDir: string, familyRoot: string, artifactType: string, headerField: string): LoadedArtifact[] {
  const absoluteRoot = path.join(rootDir, familyRoot);
  const loaded: LoadedArtifact[] = [];
  const byId = new Map<string, string>();
  for (const absolutePath of listYamlFiles(absoluteRoot)) {
    if (path.basename(absolutePath) === "INDEX.yaml") continue;
    const artifact = parseYamlFile<RawRecord>(absolutePath);
    if (artifact.artifact_type !== artifactType) continue;
    const id = asRecord(artifact[headerField]).id;
    if (typeof id !== "string" || id.length === 0) {
      throw new Error(`${toRepoPath(rootDir, absolutePath)} is missing ${headerField}.id`);
    }
    const priorPath = byId.get(id);
    if (priorPath !== undefined) {
      throw new Error(`duplicate ${headerField} id '${id}' in '${priorPath}' and '${toRepoPath(rootDir, absolutePath)}'`);
    }
    byId.set(id, toRepoPath(rootDir, absolutePath));
    loaded.push({ id, absolutePath, repoPath: toRepoPath(rootDir, absolutePath), artifact });
  }
  return loaded;
}

function readIndex(rootDir: string, repoPath: string, base: RawRecord): { artifact: RawRecord; exists: boolean } {
  const absolutePath = path.join(rootDir, repoPath);
  return existsSync(absolutePath)
    ? { artifact: parseYamlFile<RawRecord>(absolutePath), exists: true }
    : { artifact: base, exists: false };
}

function schemaIssues(artifactType: string, value: unknown, artifactPath: string): YamlMutationValidationIssue[] {
  return validateArtifact(loadBundledSchemaByArtifactType(artifactType), value, artifactPath).diagnostics.map((entry) => ({
    code: entry.source,
    fieldPath: entry.fieldPath,
    message: entry.message,
    expected: entry.expected,
    actual: entry.actual,
  }));
}

function splitScopedId(value: string, flagName: string): [string, string] {
  const delimiter = value.indexOf(":");
  if (delimiter <= 0 || delimiter === value.length - 1) {
    throw new Error(`${flagName} requires requirement-id:scenario-id`);
  }
  return [value.slice(0, delimiter), value.slice(delimiter + 1)];
}

function removeValues(existing: string[], removals: string[]): string[] {
  const removed = new Set(removals);
  return existing.filter((value) => !removed.has(value));
}

function hasSpecEditIntent(input: MainSpecAuthorInput): boolean {
  return input.title !== undefined
    || input.requirement !== undefined || input.removeRequirements.length > 0 || input.removeScenarios.length > 0;
}

function hasTechEditIntent(input: MainTechAuthorInput): boolean {
  return input.title !== undefined || input.category !== undefined
    || input.rule !== undefined || input.removeRules.length > 0;
}

function buildBaseSpec(input: MainSpecAuthorInput): RawRecord {
  if (input.title === undefined || input.requirement === undefined) {
    throw new Error("a new main spec requires --title and one complete --requirement");
  }
  return {
    schema: MAIN_SPEC_SCHEMA_ID,
    schema_version: 1,
    artifact_type: "main_spec",
    schema_file: "templates/strict-spec-driven/schemas/main-spec.yaml",
    spec: { id: input.id, title: input.title },
    requirements: {},
  };
}

function applySpecInput(candidate: RawRecord, input: MainSpecAuthorInput, creating: boolean): void {
  const header = asRecord(candidate.spec);
  if (header.id !== input.id) {
    throw new Error(`resolved main spec identity '${String(header.id)}' does not match requested id '${input.id}'`);
  }
  if (input.title !== undefined) header.title = input.title;
  candidate.spec = header;

  // File mappings were removed from the strict YAML artifact model, so any write strips a
  // residual mapping field left by an artifact authored before the removal.
  delete candidate.mapping;

  const requirements = asRecord(candidate.requirements);
  if (input.requirement !== undefined) {
    assertId(input.requirement.id, "requirement id");
    const current = asRecord(requirements[input.requirement.id]);
    const isNew = Object.keys(current).length === 0;
    const requirement = { ...current };
    if (input.requirement.strength !== undefined) {
      if (!STRENGTHS.has(input.requirement.strength)) throw new Error("--strength must be MUST, SHOULD, or MAY");
      requirement.strength = input.requirement.strength;
    }
    if (input.requirement.statement !== undefined) requirement.statement = input.requirement.statement;
    const scenarios = asRecord(requirement.scenarios);
    if (input.requirement.scenario !== undefined) {
      assertId(input.requirement.scenario.id, "scenario id");
      if (input.requirement.scenario.steps.length === 0) throw new Error("a scenario requires at least one step");
      scenarios[input.requirement.scenario.id] = input.requirement.scenario.steps;
    }
    requirement.scenarios = scenarios;
    if (isNew && (
      typeof requirement.strength !== "string"
      || typeof requirement.statement !== "string"
      || Object.keys(scenarios).length === 0
    )) {
      throw new Error("a new requirement requires --strength, --statement, and one --scenario with steps");
    }
    requirements[input.requirement.id] = requirement;
  }
  for (const encoded of input.removeScenarios) {
    const [requirementId, scenarioId] = splitScopedId(encoded, "--remove-scenario");
    const requirement = asRecord(requirements[requirementId]);
    const scenarios = asRecord(requirement.scenarios);
    delete scenarios[scenarioId];
    requirement.scenarios = scenarios;
    if (Object.keys(requirement).length > 0) requirements[requirementId] = requirement;
  }
  for (const requirementId of input.removeRequirements) delete requirements[requirementId];
  candidate.requirements = requirements;
  if (creating && Object.keys(requirements).length === 0) {
    throw new Error("a new main spec must contain at least one complete requirement");
  }
}

function buildSpecIndex(
  rootDir: string,
  loaded: LoadedArtifact[],
  targetPath: string,
  candidate: RawRecord | undefined,
): RawRecord {
  const index = readIndex(rootDir, SPEC_INDEX_PATH, {
    schema: SPEC_INDEX_SCHEMA_ID,
    schema_version: 1,
    artifact_type: "spec_index",
    schema_file: "templates/strict-spec-driven/schemas/spec-index.yaml",
    specs: [],
  }).artifact;
  const entries = loaded
    .filter((entry) => entry.repoPath !== targetPath)
    .map((entry) => ({
      id: entry.id,
      title: asRecord(entry.artifact.spec).title,
      path: entry.repoPath,
    }));
  if (candidate !== undefined) {
    entries.push({
      id: asRecord(candidate.spec).id as string,
      title: asRecord(candidate.spec).title,
      path: targetPath,
    });
  }
  entries.sort((left, right) => left.path.localeCompare(right.path) || left.id.localeCompare(right.id));
  index.specs = entries;
  return index;
}

function buildBaseTech(input: MainTechAuthorInput): RawRecord {
  if (input.title === undefined || input.category === undefined || input.rule === undefined) {
    throw new Error("a new technical standard requires --title, --category, and one complete --rule");
  }
  return {
    schema: MAIN_TECH_SCHEMA_ID,
    schema_version: 1,
    artifact_type: "main_tech",
    schema_file: "templates/strict-spec-driven/schemas/main-tech.yaml",
    standard: { id: input.id, title: input.title, category: input.category },
    rules: {},
  };
}

function applyTechInput(candidate: RawRecord, input: MainTechAuthorInput, creating: boolean): void {
  const header = asRecord(candidate.standard);
  if (header.id !== input.id) {
    throw new Error(`resolved technical-standard identity '${String(header.id)}' does not match requested id '${input.id}'`);
  }
  if (input.title !== undefined) header.title = input.title;
  if (input.category !== undefined) {
    if (!TECH_CATEGORIES.has(input.category)) throw new Error(`unsupported technical-standard category '${input.category}'`);
    header.category = input.category;
  }
  candidate.standard = header;

  // See applySpecInput: any write strips a residual mapping field.
  delete candidate.mapping;

  const rules = asRecord(candidate.rules);
  if (input.rule !== undefined) {
    assertId(input.rule.id, "rule id");
    const current = asRecord(rules[input.rule.id]);
    const isNew = Object.keys(current).length === 0;
    const rule = { ...current };
    if (input.rule.strength !== undefined) {
      if (!STRENGTHS.has(input.rule.strength)) throw new Error("--strength must be MUST, SHOULD, or MAY");
      rule.strength = input.rule.strength;
    }
    if (input.rule.statement !== undefined) rule.statement = input.rule.statement;
    if (input.rule.rationale !== undefined) rule.rationale = input.rule.rationale;
    const enforcement = asRecord(rule.enforcement);
    if (input.rule.method !== undefined) {
      if (!ENFORCEMENT_METHODS.has(input.rule.method)) throw new Error(`unsupported enforcement method '${input.rule.method}'`);
      enforcement.method = input.rule.method;
    }
    if (input.rule.detail !== undefined) enforcement.detail = input.rule.detail;
    rule.enforcement = enforcement;
    const examples = asRecord(rule.examples);
    examples.good = removeValues(appendUnique(strings(examples.good), input.rule.exampleGood), input.rule.removeExampleGood);
    examples.bad = removeValues(appendUnique(strings(examples.bad), input.rule.exampleBad), input.rule.removeExampleBad);
    if (strings(examples.good).length > 0 || strings(examples.bad).length > 0) rule.examples = examples;
    else delete rule.examples;
    const exceptions = removeValues(appendUnique(strings(rule.exceptions), input.rule.exceptions), input.rule.removeExceptions);
    if (exceptions.length > 0) rule.exceptions = exceptions;
    else delete rule.exceptions;
    if (isNew && (
      typeof rule.strength !== "string"
      || typeof rule.statement !== "string"
      || typeof rule.rationale !== "string"
      || typeof asRecord(rule.enforcement).method !== "string"
    )) {
      throw new Error("a new rule requires --strength, --statement, --rationale, and --method");
    }
    rules[input.rule.id] = rule;
  }
  for (const ruleId of input.removeRules) delete rules[ruleId];
  candidate.rules = rules;
  if (creating && Object.keys(rules).length === 0) {
    throw new Error("a new technical standard must contain at least one complete rule");
  }
}

function buildTechIndex(
  rootDir: string,
  loaded: LoadedArtifact[],
  targetPath: string,
  candidate: RawRecord | undefined,
): RawRecord {
  const index = readIndex(rootDir, TECH_INDEX_PATH, {
    schema: TECH_INDEX_SCHEMA_ID,
    schema_version: 1,
    artifact_type: "tech_index",
    schema_file: "templates/strict-spec-driven/schemas/tech-index.yaml",
    standards: [],
  }).artifact;
  const entries = loaded
    .filter((entry) => entry.repoPath !== targetPath)
    .map((entry) => {
      const standard = asRecord(entry.artifact.standard);
      return { id: entry.id, title: standard.title, category: standard.category, path: entry.repoPath };
    });
  if (candidate !== undefined) {
    const standard = asRecord(candidate.standard);
    entries.push({
      id: standard.id as string,
      title: standard.title,
      category: standard.category,
      path: targetPath,
    });
  }
  entries.sort((left, right) => left.path.localeCompare(right.path) || left.id.localeCompare(right.id));
  index.standards = entries;
  return index;
}

function activeDeltaPaths(rootDir: string, relativeDirectory: "specs" | "tech", targetField: string, id: string): string[] {
  const changesRoot = path.join(rootDir, STRICT_WORKFLOW_DIR, "changes");
  if (!existsSync(changesRoot)) return [];
  const references: string[] = [];
  for (const entry of readdirSync(changesRoot, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory() || entry.name === "archive") continue;
    const deltaRoot = path.join(changesRoot, entry.name, relativeDirectory);
    for (const deltaPath of listYamlFiles(deltaRoot)) {
      const artifact = parseYamlFile<RawRecord>(deltaPath);
      if (artifact[targetField] === id) references.push(toRepoPath(rootDir, deltaPath));
    }
  }
  return references;
}

function indexRelationshipIssues(
  context: YamlMutationRelationshipContext,
  family: "spec-state" | "tech-state",
  id: string,
  indexId: string,
  collectionName: "specs" | "standards",
  targetPath: string,
  deleting: boolean,
  activeReferences: string[],
  requestedPathMismatch: string | undefined,
): YamlMutationValidationIssue[] {
  const issues: YamlMutationValidationIssue[] = [];
  const index = asRecord(context.getCandidate(family, indexId));
  const entries = Array.isArray(index[collectionName]) ? index[collectionName] as unknown[] : [];
  const matching = entries.filter((entry) => asRecord(entry).id === id);
  if ((deleting && matching.length !== 0) || (!deleting && (matching.length !== 1 || asRecord(matching[0]).path !== targetPath))) {
    issues.push({
      code: "index-reconciliation",
      artifactPath: targetPath,
      fieldPath: `$.${collectionName}`,
      message: "the reconciled index must contain exactly the live artifact identity and canonical path",
      expected: deleting ? "no matching index entry" : targetPath,
      actual: matching.map((entry) => String(asRecord(entry).path)).join(", ") || "missing",
    });
  }
  if (requestedPathMismatch !== undefined) {
    issues.push({
      code: "canonical-path-mismatch",
      artifactPath: targetPath,
      fieldPath: "$.path",
      message: "the supplied artifact path does not match the path resolved from the stable artifact id",
      expected: targetPath,
      actual: requestedPathMismatch,
    });
  }
  if (deleting && activeReferences.length > 0) {
    issues.push({
      code: "active-delta-reference",
      artifactPath: targetPath,
      fieldPath: "$.delete",
      message: "whole-artifact deletion is blocked while active strict changes target this artifact",
      expected: "no active delta references",
      actual: activeReferences.join(", "),
    });
  }
  return issues;
}

export function authorMainSpec(rootDir: string, input: MainSpecAuthorInput): MainArtifactAuthorResult {
  assertId(input.id, "spec id");
  if (!input.delete && !hasSpecEditIntent(input)) throw new Error("spec-edit requires semantic fields, named removals, or --delete");
  const loaded = loadArtifacts(rootDir, SPEC_ROOT, "main_spec", "spec");
  const existing = loaded.find((entry) => entry.id === input.id);
  const suppliedPath = input.specPath === undefined ? undefined : canonicalArtifactPath(SPEC_ROOT, input.id, input.specPath, "--spec-path");
  const targetPath = existing?.repoPath ?? canonicalArtifactPath(SPEC_ROOT, input.id, suppliedPath, "--spec-path");
  const absolutePath = path.join(rootDir, targetPath);
  const operation = input.delete ? "delete" : existing === undefined ? "create" : "update";
  if (input.delete && existing === undefined) throw new Error(`main spec '${input.id}' does not exist`);

  let candidate: RawRecord | undefined;
  if (!input.delete) {
    candidate = existing === undefined ? buildBaseSpec(input) : parseYamlFile<RawRecord>(existing.absolutePath);
    applySpecInput(candidate, input, existing === undefined);
  }
  const index = readIndex(rootDir, SPEC_INDEX_PATH, {}).exists;
  const indexCandidate = buildSpecIndex(rootDir, loaded, targetPath, candidate);
  const editDuringDelete = input.delete && hasSpecEditIntent(input);
  const activeReferences = input.delete ? activeDeltaPaths(rootDir, "specs", "target_spec", input.id) : [];
  const requestedPathMismatch = suppliedPath !== undefined && existing !== undefined && suppliedPath !== existing.repoPath
    ? suppliedPath
    : undefined;

  const mutation = commitYamlMutation({
    rootDir,
    mutations: [
      {
        artifactFamily: "spec-state",
        artifactId: input.id,
        schemaId: MAIN_SPEC_SCHEMA_ID,
        familyRoot: path.join(rootDir, SPEC_ROOT),
        absolutePath,
        operation,
        ...(candidate === undefined
          ? (editDuringDelete ? { candidate: {} } : {})
          : { candidate, validateCandidate: (value, context) => schemaIssues("main_spec", value, context.artifactPath) }),
      },
      {
        artifactFamily: "spec-state",
        artifactId: "spec-index",
        schemaId: SPEC_INDEX_SCHEMA_ID,
        familyRoot: path.join(rootDir, SPEC_ROOT),
        absolutePath: path.join(rootDir, SPEC_INDEX_PATH),
        operation: index ? "update" : "create",
        role: "reference",
        candidate: indexCandidate,
        validateCandidate: (value, context) => schemaIssues("spec_index", value, context.artifactPath),
      },
    ],
    validateRelationships: (context) => indexRelationshipIssues(
      context,
      "spec-state",
      input.id,
      "spec-index",
      "specs",
      targetPath,
      input.delete,
      activeReferences,
      requestedPathMismatch,
    ),
  });
  return { ...mutation, artifactPath: targetPath, indexPath: SPEC_INDEX_PATH, operation };
}

export function authorMainTech(rootDir: string, input: MainTechAuthorInput): MainArtifactAuthorResult {
  assertId(input.id, "standard id");
  if (!input.delete && !hasTechEditIntent(input)) throw new Error("tech-edit requires semantic fields, named removals, or --delete");
  const loaded = loadArtifacts(rootDir, TECH_ROOT, "main_tech", "standard");
  const existing = loaded.find((entry) => entry.id === input.id);
  const suppliedPath = input.techPath === undefined ? undefined : canonicalArtifactPath(TECH_ROOT, input.id, input.techPath, "--tech-path");
  const targetPath = existing?.repoPath ?? canonicalArtifactPath(TECH_ROOT, input.id, suppliedPath, "--tech-path");
  const absolutePath = path.join(rootDir, targetPath);
  const operation = input.delete ? "delete" : existing === undefined ? "create" : "update";
  if (input.delete && existing === undefined) throw new Error(`technical standard '${input.id}' does not exist`);

  let candidate: RawRecord | undefined;
  if (!input.delete) {
    candidate = existing === undefined ? buildBaseTech(input) : parseYamlFile<RawRecord>(existing.absolutePath);
    applyTechInput(candidate, input, existing === undefined);
  }
  const index = readIndex(rootDir, TECH_INDEX_PATH, {}).exists;
  const indexCandidate = buildTechIndex(rootDir, loaded, targetPath, candidate);
  const editDuringDelete = input.delete && hasTechEditIntent(input);
  const activeReferences = input.delete ? activeDeltaPaths(rootDir, "tech", "target_standard", input.id) : [];
  const requestedPathMismatch = suppliedPath !== undefined && existing !== undefined && suppliedPath !== existing.repoPath
    ? suppliedPath
    : undefined;

  const mutation = commitYamlMutation({
    rootDir,
    mutations: [
      {
        artifactFamily: "tech-state",
        artifactId: input.id,
        schemaId: MAIN_TECH_SCHEMA_ID,
        familyRoot: path.join(rootDir, TECH_ROOT),
        absolutePath,
        operation,
        ...(candidate === undefined
          ? (editDuringDelete ? { candidate: {} } : {})
          : { candidate, validateCandidate: (value, context) => schemaIssues("main_tech", value, context.artifactPath) }),
      },
      {
        artifactFamily: "tech-state",
        artifactId: "tech-index",
        schemaId: TECH_INDEX_SCHEMA_ID,
        familyRoot: path.join(rootDir, TECH_ROOT),
        absolutePath: path.join(rootDir, TECH_INDEX_PATH),
        operation: index ? "update" : "create",
        role: "reference",
        candidate: indexCandidate,
        validateCandidate: (value, context) => schemaIssues("tech_index", value, context.artifactPath),
      },
    ],
    validateRelationships: (context) => indexRelationshipIssues(
      context,
      "tech-state",
      input.id,
      "tech-index",
      "standards",
      targetPath,
      input.delete,
      activeReferences,
      requestedPathMismatch,
    ),
  });
  return { ...mutation, artifactPath: targetPath, indexPath: TECH_INDEX_PATH, operation };
}
