import { existsSync } from "node:fs";
import path from "node:path";
import { loadBundledSchemaByArtifactType, validateArtifact } from "./validation.js";
import { commitYamlMutation, type YamlMutationResult } from "./yaml-mutation.js";
import { parseYamlFile } from "./yaml.js";

const CONFIG_SCHEMA_ID = "strict-spec-driven/config/v1";
const CONFIG_ARTIFACT_PATH = ".strict-spec-driven/config.yaml";

type RawRecord = Record<string, unknown>;

export type WorkflowConfigAuthorInput = {
  preferredHumanLanguage?: string;
  context?: string;
  regressionMethod?: string;
  regressionCommand?: string;
  regressionMeaning?: string;
  regressionUnavailableBehavior?: string;
  coverageThreshold?: number;
  rules: string[];
  coverageIncludes: string[];
  coverageExcludes: string[];
  maintenanceChecks: string[];
  removeRules: string[];
  removeCoverageIncludes: string[];
  removeCoverageExcludes: string[];
  removeMaintenanceChecks: string[];
  removePreferredHumanLanguage: boolean;
  removeContext: boolean;
  removeRegressionMethod: boolean;
  removeRegressionCommand: boolean;
  removeRegressionMeaning: boolean;
  removeRegressionUnavailableBehavior: boolean;
  removeCoverage: boolean;
};

export type WorkflowConfigAuthorResult = YamlMutationResult & {
  artifactPath: string;
  operation: "update";
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

function splitScoped(value: string, flagName: string): [string, string] {
  const delimiter = value.indexOf(":");
  if (delimiter <= 0 || delimiter === value.length - 1) {
    throw new Error(`--${flagName} expects <category>:<text>, received '${value}'`);
  }
  return [value.slice(0, delimiter), value.slice(delimiter + 1)];
}

function hasIntent(input: WorkflowConfigAuthorInput): boolean {
  return input.preferredHumanLanguage !== undefined
    || input.context !== undefined
    || input.regressionMethod !== undefined
    || input.regressionCommand !== undefined
    || input.regressionMeaning !== undefined
    || input.regressionUnavailableBehavior !== undefined
    || input.coverageThreshold !== undefined
    || input.rules.length > 0
    || input.coverageIncludes.length > 0
    || input.coverageExcludes.length > 0
    || input.maintenanceChecks.length > 0
    || input.removeRules.length > 0
    || input.removeCoverageIncludes.length > 0
    || input.removeCoverageExcludes.length > 0
    || input.removeMaintenanceChecks.length > 0
    || input.removePreferredHumanLanguage
    || input.removeContext
    || input.removeRegressionMethod
    || input.removeRegressionCommand
    || input.removeRegressionMeaning
    || input.removeRegressionUnavailableBehavior
    || input.removeCoverage;
}

function mutateRules(candidate: RawRecord, input: WorkflowConfigAuthorInput): void {
  const rules = asRecord(candidate.rules);
  for (const encoded of input.rules) {
    const [category, statement] = splitScoped(encoded, "rule");
    rules[category] = appendUnique(strings(rules[category]), [statement]);
  }
  for (const encoded of input.removeRules) {
    const [category, statement] = splitScoped(encoded, "remove-rule");
    const remaining = strings(rules[category]).filter((entry) => entry !== statement);
    if (remaining.length === 0) delete rules[category];
    else rules[category] = remaining;
  }
  if (Object.keys(rules).length === 0) delete candidate.rules;
  else candidate.rules = rules;
}

function mutateReviewEvidence(candidate: RawRecord, input: WorkflowConfigAuthorInput): void {
  const reviewEvidence = asRecord(candidate.review_evidence);
  const regression = asRecord(reviewEvidence.project_regression);
  if (input.regressionMethod !== undefined) regression.method = input.regressionMethod;
  if (input.regressionCommand !== undefined) regression.command = input.regressionCommand;
  if (input.regressionMeaning !== undefined) regression.meaning = input.regressionMeaning;
  if (input.regressionUnavailableBehavior !== undefined) {
    regression.unavailable_behavior = input.regressionUnavailableBehavior;
  }
  if (input.removeRegressionMethod) delete regression.method;
  if (input.removeRegressionCommand) delete regression.command;
  if (input.removeRegressionMeaning) delete regression.meaning;
  if (input.removeRegressionUnavailableBehavior) delete regression.unavailable_behavior;

  if (input.removeCoverage) {
    delete regression.coverage;
  } else {
    const coverage = asRecord(regression.coverage);
    const hasCoverageWrite = input.coverageThreshold !== undefined
      || input.coverageIncludes.length > 0
      || input.coverageExcludes.length > 0;
    if (hasCoverageWrite && coverage.metric === undefined) coverage.metric = "line";
    if (input.coverageThreshold !== undefined) coverage.threshold = input.coverageThreshold;
    if (input.coverageIncludes.length > 0) {
      const scope = asRecord(coverage.scope);
      scope.include = appendUnique(strings(scope.include), input.coverageIncludes);
      coverage.scope = scope;
    }
    if (input.coverageExcludes.length > 0) {
      const scope = asRecord(coverage.scope);
      scope.exclude = appendUnique(strings(scope.exclude), input.coverageExcludes);
      coverage.scope = scope;
    }
    if (input.removeCoverageIncludes.length > 0 || input.removeCoverageExcludes.length > 0) {
      const scope = asRecord(coverage.scope);
      if (input.removeCoverageIncludes.length > 0) {
        scope.include = strings(scope.include).filter((entry) => !input.removeCoverageIncludes.includes(entry));
      }
      if (input.removeCoverageExcludes.length > 0) {
        const remaining = strings(scope.exclude).filter((entry) => !input.removeCoverageExcludes.includes(entry));
        if (remaining.length === 0) delete scope.exclude;
        else scope.exclude = remaining;
      }
      coverage.scope = scope;
    }
    if (Object.keys(coverage).length > 0) regression.coverage = coverage;
  }

  if (Object.keys(regression).length === 0) delete reviewEvidence.project_regression;
  else reviewEvidence.project_regression = regression;
  if (Object.keys(reviewEvidence).length === 0) delete candidate.review_evidence;
  else candidate.review_evidence = reviewEvidence;
}

function mutateMaintenance(candidate: RawRecord, input: WorkflowConfigAuthorInput): void {
  if (input.maintenanceChecks.length === 0 && input.removeMaintenanceChecks.length === 0) return;
  const maintenance = asRecord(candidate.maintenance);
  const checks = Array.isArray(maintenance.checks)
    ? maintenance.checks.filter((entry): entry is RawRecord => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    : [];
  const byType = new Map<string, RawRecord>();
  for (const check of checks) {
    if (typeof check.type === "string") byType.set(check.type, check);
  }
  for (const type of input.maintenanceChecks) byType.set(type, { ...(byType.get(type) ?? {}), type });
  for (const type of input.removeMaintenanceChecks) byType.delete(type);
  if (byType.size === 0) delete candidate.maintenance;
  else {
    maintenance.checks = [...byType.values()];
    candidate.maintenance = maintenance;
  }
}

export function authorWorkflowConfig(rootDir: string, input: WorkflowConfigAuthorInput): WorkflowConfigAuthorResult {
  if (!hasIntent(input)) throw new Error("config-edit requires named semantic fields or removals");
  const absolutePath = path.join(rootDir, CONFIG_ARTIFACT_PATH);
  if (!existsSync(absolutePath)) {
    throw new Error(`workflow config is missing: ${CONFIG_ARTIFACT_PATH}; run strict-spec-cli init first`);
  }
  const candidate = parseYamlFile<RawRecord>(absolutePath);

  if (input.preferredHumanLanguage !== undefined) candidate.preferred_human_language = input.preferredHumanLanguage;
  if (input.context !== undefined) candidate.context = input.context;
  if (input.removePreferredHumanLanguage) delete candidate.preferred_human_language;
  if (input.removeContext) delete candidate.context;
  mutateRules(candidate, input);
  mutateReviewEvidence(candidate, input);
  mutateMaintenance(candidate, input);

  const mutation = commitYamlMutation({
    rootDir,
    mutations: [{
      artifactFamily: "workflow-config",
      artifactId: "config",
      schemaId: CONFIG_SCHEMA_ID,
      familyRoot: path.join(rootDir, ".strict-spec-driven"),
      absolutePath,
      operation: "update",
      candidate,
      validateCandidate: (value, context) => {
        const validation = validateArtifact(loadBundledSchemaByArtifactType("workflow_config"), value, context.artifactPath);
        return validation.diagnostics.map((entry) => ({
          code: entry.source,
          fieldPath: entry.fieldPath,
          message: entry.message,
          expected: entry.expected,
          actual: entry.actual,
        }));
      },
    }],
  });

  return { ...mutation, artifactPath: CONFIG_ARTIFACT_PATH, operation: "update" };
}
