import { existsSync, readdirSync, rmdirSync, statSync } from "fs";
import path from "path";
import { loadBundledSchemaByArtifactType, validateArtifact } from "./validation.js";
import { commitYamlMutation, type YamlMutationResult } from "./yaml-mutation.js";
import { parseYamlFile } from "./yaml.js";

const HARNESS_SCHEMA_ID = "strict-spec-driven/harness/v1";
const HARNESS_FAMILY_ROOT = ".strict-spec-driven";
const HARNESS_DECLARATION_PATH = ".strict-spec-driven/harness.yaml";
const HARNESS_SESSIONS_DIR = ".strict-spec-driven/harness-sessions";
const HARNESS_SESSION_SCHEMA_ID = "strict-spec-driven/harness-session/v1";

type RawRecord = Record<string, unknown>;
type HarnessOperationName = "start" | "stop" | "status" | "logs";

export type HarnessComponentAuthorInput = {
  environmentId: string;
  componentId: string;
  type?: string;
  description?: string;
  workingDirectory?: string;
  readinessType?: "http" | "tcp" | "manual";
  readinessUrl?: string;
  readinessPort?: number;
  readinessTimeoutSeconds?: number;
  readinessIntervalSeconds?: number;
  dependsOn: string[];
  requiredEnvironment: string[];
  optionalEnvironment: string[];
  urls: string[];
  ports: number[];
  readinessNotes: string[];
  evidenceLabels: string[];
  unavailableConditions: string[];
  operation?: {
    name: HarnessOperationName;
    mode: "script" | "readonly" | "manual" | "disabled";
    command?: string;
    requiresConfirmation?: boolean;
    allowStatefulLifecycle?: boolean;
  };
};

export type HarnessAuthorInput = {
  id?: string;
  description?: string;
  environment?: { id: string; kind?: "development" | "production"; description?: string };
  component?: HarnessComponentAuthorInput;
  removeEnvironments: string[];
  removeComponents: string[];
  removeDependsOn: string[];
  removeRequiredEnvironment: string[];
  removeOptionalEnvironment: string[];
  removeUrls: string[];
  removePorts: string[];
  removeReadinessNotes: string[];
  removeEvidenceLabels: string[];
  removeUnavailableConditions: string[];
  removeOperations: string[];
  delete: boolean;
};

export type HarnessAuthorResult = YamlMutationResult & {
  artifactPath: string;
  operation: "create" | "update" | "delete";
};

export type HarnessSessionAuthorInput = {
  status?: string;
  owner?: string;
  environment?: string;
  issueSummary?: string;
  observedBehavior?: string;
  expectedBehavior?: string;
  expectedFailure?: string;
  verificationStatus?: string;
  selectedComponents: string[];
  preconditions: string[];
  replayCommands: string[];
  verificationEvidence: string[];
  step?: { id: string; action: string; expected?: string; target?: string; verification: boolean };
  evidence?: { id: string; kind: string; path: string; description: string };
  hypothesis?: { id: string; statement: string; status: string; evidence: string[] };
  finding?: { id: string; summary: string; status: string; target?: string; evidence: string[] };
  checkpoint?: {
    id: string;
    reason: string;
    requestedAction: string;
    sensitive: boolean;
    status: string;
    resumeCondition: string;
    evidenceBefore: string[];
    evidenceAfter: string[];
  };
  manualAction?: { id: string; actor: string; summary: string; status: string; evidence: string[] };
  removeSelectedComponents: string[];
  removePreconditions: string[];
  removeSteps: string[];
  removeVerificationSteps: string[];
  removeEvidence: string[];
  removeHypotheses: string[];
  removeFindings: string[];
  removeCheckpoints: string[];
  removeManualActions: string[];
  removeReplayCommands: string[];
  removeVerificationEvidence: string[];
  delete: boolean;
};

export type HarnessSessionAuthorResult = YamlMutationResult & {
  sessionId: string;
  sessionPath: string;
  evidenceDir: string;
  operation: "update" | "delete";
};

export function commitHarnessCandidate(
  rootDir: string,
  candidate: RawRecord,
  operation: "create" | "update",
): YamlMutationResult {
  const absolutePath = path.join(rootDir, HARNESS_DECLARATION_PATH);
  return commitYamlMutation({
    rootDir,
    mutations: [{
      artifactFamily: "harness-state",
      artifactId: "harness",
      schemaId: HARNESS_SCHEMA_ID,
      familyRoot: path.join(rootDir, HARNESS_FAMILY_ROOT),
      absolutePath,
      operation,
      candidate,
      validateCandidate: (value: unknown, context: { artifactPath: string }) => {
        const schemaResult = validateArtifact(loadBundledSchemaByArtifactType("harness"), value, context.artifactPath);
        return [
          ...schemaResult.diagnostics.map((entry) => ({
            code: entry.source,
            fieldPath: entry.fieldPath,
            message: entry.message,
            expected: entry.expected,
            actual: entry.actual,
          })),
          ...validateRelationships(asRecord(value)),
        ];
      },
    }],
  });
}

function asRecord(value: unknown): RawRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RawRecord : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function asNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === "number") : [];
}

function appendUnique<T>(existing: T[], additions: T[]): T[] {
  return [...new Set([...existing, ...additions])];
}

function removeExact<T>(existing: T[], value: T): T[] {
  return existing.filter((entry) => entry !== value);
}

function upsertById(existing: unknown, addition: RawRecord): RawRecord[] {
  const entries = Array.isArray(existing) ? existing.filter((entry): entry is RawRecord => Object.keys(asRecord(entry)).length > 0) : [];
  const index = entries.findIndex((entry) => entry.id === addition.id);
  if (index === -1) return [...entries, addition];
  const result = [...entries];
  result[index] = { ...result[index], ...addition };
  return result;
}

function removeById(existing: unknown, ids: string[]): RawRecord[] {
  const removed = new Set(ids);
  return (Array.isArray(existing) ? existing : [])
    .filter((entry): entry is RawRecord => Object.keys(asRecord(entry)).length > 0)
    .filter((entry) => !removed.has(String(entry.id)));
}

function parseScopedValue(value: string, segments: number): string[] | null {
  const result: string[] = [];
  let remainder = value;
  for (let index = 1; index < segments; index += 1) {
    const delimiter = remainder.indexOf(":");
    if (delimiter <= 0) return null;
    result.push(remainder.slice(0, delimiter));
    remainder = remainder.slice(delimiter + 1);
  }
  if (remainder.length === 0) return null;
  result.push(remainder);
  return result;
}

function baseArtifact(id: string): RawRecord {
  return {
    schema: HARNESS_SCHEMA_ID,
    schema_version: 1,
    artifact_type: "harness",
    schema_file: "templates/strict-spec-driven/schemas/harness.yaml",
    harness: { id, environments: {} },
  };
}

function baseComponent(type: string): RawRecord {
  return {
    type,
    working_directory: ".",
    depends_on: [],
    environment: { required: [], optional: [] },
    urls: [],
    ports: [],
    readiness: { type: "manual", timeout_seconds: 60, interval_seconds: 5, notes: [] },
    operations: { start: { mode: "manual" }, stop: { mode: "manual" } },
    evidence_labels: [],
    unavailable_conditions: [],
  };
}

function activeSessionPaths(rootDir: string): string[] {
  const sessionsDir = path.join(rootDir, HARNESS_SESSIONS_DIR);
  if (!existsSync(sessionsDir) || !statSync(sessionsDir).isDirectory()) return [];
  return readdirSync(sessionsDir)
    .filter((entry) => entry !== "archive")
    .map((entry) => path.join(sessionsDir, entry, "session.yaml"))
    .filter((entry) => existsSync(entry));
}

function validateRelationships(candidate: RawRecord): Array<{ code: string; fieldPath: string; message: string; expected?: string; actual?: string }> {
  const issues: Array<{ code: string; fieldPath: string; message: string; expected?: string; actual?: string }> = [];
  const environments = asRecord(asRecord(candidate.harness).environments);
  for (const [environmentId, rawEnvironment] of Object.entries(environments)) {
    const components = asRecord(asRecord(rawEnvironment).components);
    for (const [componentId, rawComponent] of Object.entries(components)) {
      const dependencies = asStringArray(asRecord(rawComponent).depends_on);
      for (const dependency of dependencies) {
        if (dependency === componentId || !(dependency in components)) {
          issues.push({
            code: "reference",
            fieldPath: `$.harness.environments.${environmentId}.components.${componentId}.depends_on`,
            message: "component dependencies must name another component in the same environment",
            expected: Object.keys(components).filter((id) => id !== componentId).join(", "),
            actual: dependency,
          });
        }
      }
    }
  }
  return issues;
}

function applyComponent(candidate: RawRecord, input: HarnessComponentAuthorInput): void {
  const harness = asRecord(candidate.harness);
  const environments = asRecord(harness.environments);
  const environment = asRecord(environments[input.environmentId]);
  if (Object.keys(environment).length === 0) {
    throw new Error(`component environment '${input.environmentId}' does not exist; add it with --environment and --environment-kind`);
  }
  const components = asRecord(environment.components);
  const current = asRecord(components[input.componentId]);
  if (Object.keys(current).length === 0 && input.type === undefined) {
    throw new Error("a new component requires --component-type");
  }
  const component = Object.keys(current).length === 0 ? baseComponent(input.type!) : { ...current };
  if (input.type !== undefined) component.type = input.type;
  if (input.description !== undefined) component.description = input.description;
  if (input.workingDirectory !== undefined) component.working_directory = input.workingDirectory;
  component.depends_on = appendUnique(asStringArray(component.depends_on), input.dependsOn);
  component.urls = appendUnique(asStringArray(component.urls), input.urls);
  component.ports = appendUnique(asNumberArray(component.ports), input.ports);
  component.evidence_labels = appendUnique(asStringArray(component.evidence_labels), input.evidenceLabels);
  component.unavailable_conditions = appendUnique(asStringArray(component.unavailable_conditions), input.unavailableConditions);

  const environmentNames = asRecord(component.environment);
  environmentNames.required = appendUnique(asStringArray(environmentNames.required), input.requiredEnvironment);
  environmentNames.optional = appendUnique(asStringArray(environmentNames.optional), input.optionalEnvironment);
  component.environment = environmentNames;

  const readiness = asRecord(component.readiness);
  if (input.readinessType !== undefined) readiness.type = input.readinessType;
  if (input.readinessUrl !== undefined) readiness.url = input.readinessUrl;
  if (input.readinessPort !== undefined) readiness.port = input.readinessPort;
  if (input.readinessTimeoutSeconds !== undefined) readiness.timeout_seconds = input.readinessTimeoutSeconds;
  if (input.readinessIntervalSeconds !== undefined) readiness.interval_seconds = input.readinessIntervalSeconds;
  readiness.notes = appendUnique(asStringArray(readiness.notes), input.readinessNotes);
  if (readiness.type !== "http") delete readiness.url;
  if (readiness.type !== "tcp") delete readiness.port;
  component.readiness = readiness;

  if (input.operation !== undefined) {
    const operations = asRecord(component.operations);
    const nextOperation: RawRecord = { mode: input.operation.mode };
    if (input.operation.command !== undefined) nextOperation.command = input.operation.command;
    if (input.operation.requiresConfirmation !== undefined) nextOperation.requires_confirmation = input.operation.requiresConfirmation;
    if (input.operation.allowStatefulLifecycle !== undefined) nextOperation.allow_stateful_lifecycle = input.operation.allowStatefulLifecycle;
    operations[input.operation.name] = nextOperation;
    component.operations = operations;
  }

  components[input.componentId] = component;
  environment.components = components;
  environments[input.environmentId] = environment;
  harness.environments = environments;
  candidate.harness = harness;
}

function applyRemovals(candidate: RawRecord, input: HarnessAuthorInput): void {
  const harness = asRecord(candidate.harness);
  const environments = asRecord(harness.environments);
  for (const environmentId of input.removeEnvironments) delete environments[environmentId];

  const removeComponent = (encoded: string): void => {
    const parts = parseScopedValue(encoded, 2);
    if (!parts) throw new Error(`expected environment:component, received '${encoded}'`);
    const environment = asRecord(environments[parts[0]]);
    const components = asRecord(environment.components);
    delete components[parts[1]];
    environment.components = components;
    environments[parts[0]] = environment;
  };
  input.removeComponents.forEach(removeComponent);

  const removeListValue = (encoded: string, field: string, numeric = false): void => {
    const parts = parseScopedValue(encoded, 3);
    if (!parts) throw new Error(`expected environment:component:value, received '${encoded}'`);
    const environment = asRecord(environments[parts[0]]);
    const components = asRecord(environment.components);
    const component = asRecord(components[parts[1]]);
    const rawValue = numeric ? Number(parts[2]) : parts[2];
    component[field] = removeExact(Array.isArray(component[field]) ? component[field] : [], rawValue);
    components[parts[1]] = component;
    environment.components = components;
    environments[parts[0]] = environment;
  };
  input.removeDependsOn.forEach((value) => removeListValue(value, "depends_on"));
  input.removeUrls.forEach((value) => removeListValue(value, "urls"));
  input.removePorts.forEach((value) => removeListValue(value, "ports", true));
  input.removeReadinessNotes.forEach((encoded) => {
    const parts = parseScopedValue(encoded, 3);
    if (!parts) throw new Error(`expected environment:component:value, received '${encoded}'`);
    const environment = asRecord(environments[parts[0]]);
    const components = asRecord(environment.components);
    const component = asRecord(components[parts[1]]);
    const readiness = asRecord(component.readiness);
    readiness.notes = removeExact(asStringArray(readiness.notes), parts[2]);
    component.readiness = readiness;
    components[parts[1]] = component;
    environment.components = components;
    environments[parts[0]] = environment;
  });
  input.removeEvidenceLabels.forEach((value) => removeListValue(value, "evidence_labels"));
  input.removeUnavailableConditions.forEach((value) => removeListValue(value, "unavailable_conditions"));

  const removeEnvironmentName = (encoded: string, field: "required" | "optional"): void => {
    const parts = parseScopedValue(encoded, 3);
    if (!parts) throw new Error(`expected environment:component:value, received '${encoded}'`);
    const environment = asRecord(environments[parts[0]]);
    const components = asRecord(environment.components);
    const component = asRecord(components[parts[1]]);
    const environmentNames = asRecord(component.environment);
    environmentNames[field] = removeExact(asStringArray(environmentNames[field]), parts[2]);
    component.environment = environmentNames;
    components[parts[1]] = component;
    environment.components = components;
    environments[parts[0]] = environment;
  };
  input.removeRequiredEnvironment.forEach((value) => removeEnvironmentName(value, "required"));
  input.removeOptionalEnvironment.forEach((value) => removeEnvironmentName(value, "optional"));
  input.removeOperations.forEach((encoded) => {
    const parts = parseScopedValue(encoded, 3);
    if (!parts) throw new Error(`expected environment:component:operation, received '${encoded}'`);
    const environment = asRecord(environments[parts[0]]);
    const components = asRecord(environment.components);
    const component = asRecord(components[parts[1]]);
    const operations = asRecord(component.operations);
    delete operations[parts[2]];
    component.operations = operations;
    components[parts[1]] = component;
    environment.components = components;
    environments[parts[0]] = environment;
  });
  harness.environments = environments;
  candidate.harness = harness;
}

function hasEditIntent(input: HarnessAuthorInput): boolean {
  return input.id !== undefined
    || input.description !== undefined
    || input.environment !== undefined
    || input.component !== undefined
    || input.removeEnvironments.length > 0
    || input.removeComponents.length > 0
    || input.removeDependsOn.length > 0
    || input.removeRequiredEnvironment.length > 0
    || input.removeOptionalEnvironment.length > 0
    || input.removeUrls.length > 0
    || input.removePorts.length > 0
    || input.removeReadinessNotes.length > 0
    || input.removeEvidenceLabels.length > 0
    || input.removeUnavailableConditions.length > 0
    || input.removeOperations.length > 0;
}

export function authorHarness(rootDir: string, input: HarnessAuthorInput): HarnessAuthorResult {
  const absolutePath = path.join(rootDir, HARNESS_DECLARATION_PATH);
  const exists = existsSync(absolutePath);
  const operation = input.delete ? "delete" : exists ? "update" : "create";
  if (input.delete && hasEditIntent(input)) {
    throw new Error("--delete cannot be combined with harness editing flags");
  }
  if (input.delete && activeSessionPaths(rootDir).length > 0) {
    throw new Error("harness deletion is blocked while active harness sessions exist; archive or delete those sessions first");
  }
  if (!input.delete && !hasEditIntent(input)) {
    throw new Error("harness-edit requires at least one semantic editing flag or --delete");
  }
  if (!exists && !input.delete && input.id === undefined) {
    throw new Error("new harness declarations require --id");
  }

  let candidate: RawRecord | undefined;
  if (!input.delete) {
    candidate = exists ? parseYamlFile<RawRecord>(absolutePath) : baseArtifact(input.id!);
    const harness = asRecord(candidate.harness);
    if (input.id !== undefined) harness.id = input.id;
    if (input.description !== undefined) harness.description = input.description;
    const environments = asRecord(harness.environments);
    if (input.environment !== undefined) {
      const current = asRecord(environments[input.environment.id]);
      if (Object.keys(current).length === 0 && input.environment.kind === undefined) {
        throw new Error("a new environment requires --environment-kind");
      }
      const environment = Object.keys(current).length === 0
        ? { kind: input.environment.kind, components: {} } as RawRecord
        : { ...current };
      if (input.environment.kind !== undefined) environment.kind = input.environment.kind;
      if (input.environment.description !== undefined) environment.description = input.environment.description;
      environments[input.environment.id] = environment;
    }
    harness.environments = environments;
    candidate.harness = harness;
    if (input.component !== undefined) applyComponent(candidate, input.component);
    applyRemovals(candidate, input);
  }

  const mutation = candidate === undefined
    ? commitYamlMutation({
      rootDir,
      mutations: [{
        artifactFamily: "harness-state",
        artifactId: "harness",
        schemaId: HARNESS_SCHEMA_ID,
        familyRoot: path.join(rootDir, HARNESS_FAMILY_ROOT),
        absolutePath,
        operation,
      }],
    })
    : commitHarnessCandidate(rootDir, candidate, operation as "create" | "update");
  return { ...mutation, artifactPath: HARNESS_DECLARATION_PATH, operation };
}

export function commitHarnessSessionCandidate(
  rootDir: string,
  sessionId: string,
  candidate: RawRecord,
  operation: "create" | "update",
): YamlMutationResult {
  const absolutePath = path.join(rootDir, HARNESS_SESSIONS_DIR, sessionId, "session.yaml");
  return commitYamlMutation({
    rootDir,
    mutations: [{
      artifactFamily: "harness-state",
      artifactId: sessionId,
      schemaId: HARNESS_SESSION_SCHEMA_ID,
      familyRoot: path.join(rootDir, HARNESS_SESSIONS_DIR),
      absolutePath,
      operation,
      candidate,
      validateCandidate: (value: unknown, context: { artifactPath: string }) => {
        const validation = validateArtifact(loadBundledSchemaByArtifactType("harness_session"), value, context.artifactPath);
        const artifactId = asRecord(asRecord(value).harness_session).id;
        return [
          ...validation.diagnostics.map((entry) => ({
            code: entry.source,
            fieldPath: entry.fieldPath,
            message: entry.message,
            expected: entry.expected,
            actual: entry.actual,
          })),
          ...(artifactId === sessionId ? [] : [{
            code: "reference",
            fieldPath: "$.harness_session.id",
            message: "harness-session id must match its active directory name",
            expected: sessionId,
            actual: String(artifactId),
          }]),
        ];
      },
    }],
  });
}

function hasSessionEditIntent(input: HarnessSessionAuthorInput): boolean {
  return input.status !== undefined
    || input.owner !== undefined
    || input.environment !== undefined
    || input.issueSummary !== undefined
    || input.observedBehavior !== undefined
    || input.expectedBehavior !== undefined
    || input.expectedFailure !== undefined
    || input.verificationStatus !== undefined
    || input.selectedComponents.length > 0
    || input.preconditions.length > 0
    || input.replayCommands.length > 0
    || input.verificationEvidence.length > 0
    || input.step !== undefined
    || input.evidence !== undefined
    || input.hypothesis !== undefined
    || input.finding !== undefined
    || input.checkpoint !== undefined
    || input.manualAction !== undefined
    || input.removeSelectedComponents.length > 0
    || input.removePreconditions.length > 0
    || input.removeSteps.length > 0
    || input.removeVerificationSteps.length > 0
    || input.removeEvidence.length > 0
    || input.removeHypotheses.length > 0
    || input.removeFindings.length > 0
    || input.removeCheckpoints.length > 0
    || input.removeManualActions.length > 0
    || input.removeReplayCommands.length > 0
    || input.removeVerificationEvidence.length > 0;
}

export function authorHarnessSession(
  rootDir: string,
  sessionId: string,
  input: HarnessSessionAuthorInput,
): HarnessSessionAuthorResult {
  const sessionDir = path.join(rootDir, HARNESS_SESSIONS_DIR, sessionId);
  const absolutePath = path.join(sessionDir, "session.yaml");
  const evidenceDir = path.join(sessionDir, "evidence");
  const sessionPath = path.relative(rootDir, absolutePath).split(path.sep).join("/");
  const relativeEvidenceDir = `${path.relative(rootDir, evidenceDir).split(path.sep).join("/")}/`;
  if (!existsSync(absolutePath)) throw new Error(`harness-session artifact not found: ${sessionPath}`);
  if (input.delete && hasSessionEditIntent(input)) throw new Error("session delete cannot be combined with editing flags");
  if (!input.delete && !hasSessionEditIntent(input)) throw new Error("harness-session edit requires semantic fields or named removals");
  if (input.delete && existsSync(evidenceDir) && readdirSync(evidenceDir).length > 0) {
    throw new Error("harness-session delete is blocked while its evidence directory is non-empty; archive the session to preserve evidence");
  }

  if (input.delete) {
    const mutation = commitYamlMutation({
      rootDir,
      mutations: [{
        artifactFamily: "harness-state",
        artifactId: sessionId,
        schemaId: HARNESS_SESSION_SCHEMA_ID,
        familyRoot: path.join(rootDir, HARNESS_SESSIONS_DIR),
        absolutePath,
        operation: "delete",
      }],
    });
    if (mutation.valid) {
      if (existsSync(evidenceDir)) rmdirSync(evidenceDir);
      if (existsSync(sessionDir)) rmdirSync(sessionDir);
    }
    return { ...mutation, sessionId, sessionPath, evidenceDir: relativeEvidenceDir, operation: "delete" };
  }

  const candidate = parseYamlFile<RawRecord>(absolutePath);
  const session = asRecord(candidate.harness_session);
  if (input.status !== undefined) session.status = input.status;
  if (input.owner !== undefined) session.owner = input.owner;
  candidate.harness_session = session;
  const harness = asRecord(candidate.harness);
  if (input.environment !== undefined) harness.environment = input.environment;
  candidate.harness = harness;
  const issue = asRecord(candidate.issue);
  if (input.issueSummary !== undefined) issue.summary = input.issueSummary;
  if (input.observedBehavior !== undefined) issue.observed_behavior = input.observedBehavior;
  if (input.expectedBehavior !== undefined) issue.expected_behavior = input.expectedBehavior;
  candidate.issue = issue;
  candidate.selected_components = input.removeSelectedComponents.reduce(
    (values, value) => removeExact(values, value),
    appendUnique(asStringArray(candidate.selected_components), input.selectedComponents),
  );
  const reproduction = asRecord(candidate.reproduction);
  reproduction.preconditions = input.removePreconditions.reduce(
    (values, value) => removeExact(values, value),
    appendUnique(asStringArray(reproduction.preconditions), input.preconditions),
  );
  if (input.expectedFailure !== undefined) reproduction.expected_failure = input.expectedFailure;
  if (input.step !== undefined && !input.step.verification) {
    reproduction.steps = upsertById(reproduction.steps, {
      id: input.step.id,
      action: input.step.action,
      ...(input.step.expected === undefined ? {} : { expected: input.step.expected }),
      ...(input.step.target === undefined ? {} : { target: input.step.target }),
    });
  }
  reproduction.steps = removeById(reproduction.steps, input.removeSteps);
  candidate.reproduction = reproduction;

  const evidence = asRecord(candidate.evidence);
  if (input.evidence !== undefined) {
    evidence.entries = upsertById(evidence.entries, { ...input.evidence, contains_secrets: false });
  }
  evidence.entries = removeById(evidence.entries, input.removeEvidence);
  candidate.evidence = evidence;
  if (input.hypothesis !== undefined) candidate.hypotheses = upsertById(candidate.hypotheses, input.hypothesis);
  candidate.hypotheses = removeById(candidate.hypotheses, input.removeHypotheses);
  if (input.finding !== undefined) candidate.findings = upsertById(candidate.findings, input.finding);
  candidate.findings = removeById(candidate.findings, input.removeFindings);
  if (input.checkpoint !== undefined) {
    candidate.human_checkpoints = upsertById(candidate.human_checkpoints, {
      id: input.checkpoint.id,
      reason: input.checkpoint.reason,
      requested_action: input.checkpoint.requestedAction,
      sensitive: input.checkpoint.sensitive,
      status: input.checkpoint.status,
      resume_condition: input.checkpoint.resumeCondition,
      evidence_before: input.checkpoint.evidenceBefore,
      evidence_after: input.checkpoint.evidenceAfter,
    });
  }
  candidate.human_checkpoints = removeById(candidate.human_checkpoints, input.removeCheckpoints);
  if (input.manualAction !== undefined) {
    candidate.manual_actions = upsertById(candidate.manual_actions, {
      id: input.manualAction.id,
      actor: input.manualAction.actor,
      summary: input.manualAction.summary,
      secrets_recorded: false,
      status: input.manualAction.status,
      evidence: input.manualAction.evidence,
    });
  }
  candidate.manual_actions = removeById(candidate.manual_actions, input.removeManualActions);
  const replay = asRecord(candidate.replay);
  replay.commands = input.removeReplayCommands.reduce(
    (values, value) => removeExact(values, value),
    appendUnique(asStringArray(replay.commands), input.replayCommands),
  );
  candidate.replay = replay;
  const verification = asRecord(candidate.verification);
  if (input.verificationStatus !== undefined) verification.status = input.verificationStatus;
  if (input.step !== undefined && input.step.verification) {
    verification.steps = upsertById(verification.steps, {
      id: input.step.id,
      action: input.step.action,
      ...(input.step.expected === undefined ? {} : { expected: input.step.expected }),
      ...(input.step.target === undefined ? {} : { target: input.step.target }),
    });
  }
  verification.steps = removeById(verification.steps, input.removeVerificationSteps);
  verification.evidence = input.removeVerificationEvidence.reduce(
    (values, value) => removeExact(values, value),
    appendUnique(asStringArray(verification.evidence), input.verificationEvidence),
  );
  candidate.verification = verification;

  const mutation = commitHarnessSessionCandidate(rootDir, sessionId, candidate, "update");
  return { ...mutation, sessionId, sessionPath, evidenceDir: relativeEvidenceDir, operation: "update" };
}
