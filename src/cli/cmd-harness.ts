import {
  archiveHarnessSession,
  createHarnessSession,
  doctorHarness,
  fixHarnessDiagnostics,
  generateHarnessScripts,
  getHarnessLogs,
  getHarnessPlanResult,
  getHarnessStatus,
  inferHarness,
  startHarness,
  stopHarness,
  validateHarnessSession,
  verifyHarnessScripts,
} from "../harness.js";
import {
  authorHarness,
  authorHarnessSession,
  type HarnessAuthorInput,
  type HarnessComponentAuthorInput,
  type HarnessSessionAuthorInput,
} from "../harness-author.js";
import { CHANGE_NAME_PATTERN, handleHelpRequest } from "./argv.js";
import { getCommandUsage } from "./command-metadata.js";
import { writeError, writeJson, writeOut, writeUsage } from "./output.js";

const HARNESS_PLAN_USAGE = getCommandUsage("harness-plan");
const HARNESS_EDIT_USAGE = getCommandUsage("harness-edit");
const HARNESS_INFER_USAGE = getCommandUsage("harness-infer");
const HARNESS_DOCTOR_USAGE = getCommandUsage("harness-doctor");
const HARNESS_START_USAGE = getCommandUsage("harness-start");
const HARNESS_STOP_USAGE = getCommandUsage("harness-stop");
const HARNESS_STATUS_USAGE = getCommandUsage("harness-status");
const HARNESS_LOGS_USAGE = getCommandUsage("harness-logs");
const HARNESS_SCRIPTS_USAGE = getCommandUsage("harness-scripts");
const HARNESS_SESSION_USAGE = getCommandUsage("harness-session");

type SelectionArgs = {
  environment?: string;
  components: string[];
  confirm: boolean;
};
type HarnessLogsArgs = {
  componentId?: string;
  tailLines?: number;
  all: boolean;
};

const HARNESS_EDIT_VALUE_FLAGS = new Set([
  "id", "description", "environment", "environment-kind", "environment-description",
  "component-environment", "component", "component-type", "component-description", "working-directory",
  "depends-on", "required-env", "optional-env", "url", "port", "readiness-type", "readiness-url",
  "readiness-port", "readiness-timeout", "readiness-interval", "readiness-note", "operation",
  "operation-mode", "operation-command", "operation-requires-confirmation", "operation-allow-stateful-lifecycle",
  "evidence-label", "unavailable-condition", "remove-environment", "remove-component", "remove-dependency",
  "remove-required-env", "remove-optional-env", "remove-url", "remove-port", "remove-readiness-note",
  "remove-evidence-label", "remove-unavailable-condition", "remove-operation",
]);

const HARNESS_SESSION_EDIT_VALUE_FLAGS = new Set([
  "status", "owner", "environment", "issue-summary", "observed-behavior", "expected-behavior",
  "expected-failure", "verification-status", "selected-component", "precondition", "replay-command",
  "verification-evidence", "step", "verification-step", "step-action", "step-expected", "step-target",
  "evidence", "evidence-kind", "evidence-path", "evidence-description", "hypothesis", "hypothesis-statement",
  "hypothesis-status", "hypothesis-evidence", "finding", "finding-summary", "finding-status", "finding-target",
  "finding-evidence", "checkpoint", "checkpoint-reason", "checkpoint-action", "checkpoint-sensitive",
  "checkpoint-status", "checkpoint-resume", "checkpoint-evidence-before", "checkpoint-evidence-after",
  "manual-action", "manual-actor", "manual-summary", "manual-status", "manual-evidence",
  "remove-selected-component", "remove-precondition", "remove-step", "remove-verification-step", "remove-evidence",
  "remove-hypothesis", "remove-finding", "remove-checkpoint", "remove-manual-action", "remove-replay-command",
  "remove-verification-evidence",
]);

function parseNamedFlags(argv: string[], valueFlags: Set<string>, booleanFlags: Set<string>): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--") || token === "--") throw new Error(`unexpected argument '${token}'`);
    const equals = token.indexOf("=");
    const name = token.slice(2, equals === -1 ? undefined : equals);
    if (booleanFlags.has(name)) {
      if (equals !== -1) throw new Error(`--${name} does not accept a value`);
      result[name] ??= [];
      result[name].push("true");
      continue;
    }
    if (!valueFlags.has(name)) throw new Error(`unsupported argument --${name}`);
    const value = equals === -1 ? argv[index + 1] : token.slice(equals + 1);
    if (value === undefined || (equals === -1 && value.startsWith("--")) || value.length === 0) {
      throw new Error(`missing value for --${name}`);
    }
    result[name] ??= [];
    result[name].push(value);
    if (equals === -1) index += 1;
  }
  return result;
}

function one(flags: Record<string, string[]>, name: string): string | undefined {
  const values = flags[name] ?? [];
  if (values.length > 1) throw new Error(`--${name} may be supplied at most once`);
  return values[0];
}

function positiveInteger(value: string | undefined, name: string, maximum?: number): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || (maximum !== undefined && parsed > maximum)) {
    throw new Error(`--${name} must be a positive integer${maximum === undefined ? "" : ` no greater than ${maximum}`}`);
  }
  return parsed;
}

function booleanValue(value: string | undefined, name: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (value !== "true" && value !== "false") throw new Error(`--${name} must be true or false`);
  return value === "true";
}

function parseHarnessEditArgs(argv: string[]): HarnessAuthorInput {
  const flags = parseNamedFlags(argv, HARNESS_EDIT_VALUE_FLAGS, new Set(["delete"]));
  const environmentId = one(flags, "environment");
  const environmentKind = one(flags, "environment-kind");
  const environmentDescription = one(flags, "environment-description");
  if ((environmentKind !== undefined || environmentDescription !== undefined) && environmentId === undefined) {
    throw new Error("--environment-kind and --environment-description require --environment");
  }
  if (environmentKind !== undefined && environmentKind !== "development" && environmentKind !== "production") {
    throw new Error("--environment-kind must be development or production");
  }

  const componentEnvironment = one(flags, "component-environment");
  const componentId = one(flags, "component");
  const componentFields = [
    "component-type", "component-description", "working-directory", "depends-on", "required-env", "optional-env",
    "url", "port", "readiness-type", "readiness-url", "readiness-port", "readiness-timeout", "readiness-interval",
    "readiness-note", "operation", "operation-mode", "operation-command", "operation-requires-confirmation",
    "operation-allow-stateful-lifecycle", "evidence-label", "unavailable-condition",
  ];
  const hasComponentFields = componentFields.some((name) => (flags[name]?.length ?? 0) > 0);
  if ((componentEnvironment !== undefined || componentId !== undefined || hasComponentFields)
    && (componentEnvironment === undefined || componentId === undefined)) {
    throw new Error("component authoring requires --component-environment and --component");
  }
  const readinessType = one(flags, "readiness-type");
  if (readinessType !== undefined && !["http", "tcp", "manual"].includes(readinessType)) {
    throw new Error("--readiness-type must be http, tcp, or manual");
  }
  const operationName = one(flags, "operation");
  const operationMode = one(flags, "operation-mode");
  if ((operationName === undefined) !== (operationMode === undefined)) {
    throw new Error("--operation and --operation-mode must be supplied together");
  }
  if (operationName !== undefined && !["start", "stop", "status", "logs"].includes(operationName)) {
    throw new Error("--operation must be start, stop, status, or logs");
  }
  if (operationMode !== undefined && !["script", "readonly", "manual", "disabled"].includes(operationMode)) {
    throw new Error("--operation-mode must be script, readonly, manual, or disabled");
  }

  let component: HarnessComponentAuthorInput | undefined;
  if (componentEnvironment !== undefined && componentId !== undefined) {
    component = {
      environmentId: componentEnvironment,
      componentId,
      type: one(flags, "component-type"),
      description: one(flags, "component-description"),
      workingDirectory: one(flags, "working-directory"),
      readinessType: readinessType as HarnessComponentAuthorInput["readinessType"],
      readinessUrl: one(flags, "readiness-url"),
      readinessPort: positiveInteger(one(flags, "readiness-port"), "readiness-port", 65535),
      readinessTimeoutSeconds: positiveInteger(one(flags, "readiness-timeout"), "readiness-timeout"),
      readinessIntervalSeconds: positiveInteger(one(flags, "readiness-interval"), "readiness-interval"),
      dependsOn: flags["depends-on"] ?? [],
      requiredEnvironment: flags["required-env"] ?? [],
      optionalEnvironment: flags["optional-env"] ?? [],
      urls: flags.url ?? [],
      ports: (flags.port ?? []).map((value) => positiveInteger(value, "port", 65535)!),
      readinessNotes: flags["readiness-note"] ?? [],
      evidenceLabels: flags["evidence-label"] ?? [],
      unavailableConditions: flags["unavailable-condition"] ?? [],
      ...(operationName === undefined || operationMode === undefined ? {} : {
        operation: {
          name: operationName as "start" | "stop" | "status" | "logs",
          mode: operationMode as "script" | "readonly" | "manual" | "disabled",
          command: one(flags, "operation-command"),
          requiresConfirmation: booleanValue(one(flags, "operation-requires-confirmation"), "operation-requires-confirmation"),
          allowStatefulLifecycle: booleanValue(one(flags, "operation-allow-stateful-lifecycle"), "operation-allow-stateful-lifecycle"),
        },
      }),
    };
  }

  return {
    id: one(flags, "id"),
    description: one(flags, "description"),
    ...(environmentId === undefined ? {} : {
      environment: {
        id: environmentId,
        kind: environmentKind as "development" | "production" | undefined,
        description: environmentDescription,
      },
    }),
    component,
    removeEnvironments: flags["remove-environment"] ?? [],
    removeComponents: flags["remove-component"] ?? [],
    removeDependsOn: flags["remove-dependency"] ?? [],
    removeRequiredEnvironment: flags["remove-required-env"] ?? [],
    removeOptionalEnvironment: flags["remove-optional-env"] ?? [],
    removeUrls: flags["remove-url"] ?? [],
    removePorts: flags["remove-port"] ?? [],
    removeReadinessNotes: flags["remove-readiness-note"] ?? [],
    removeEvidenceLabels: flags["remove-evidence-label"] ?? [],
    removeUnavailableConditions: flags["remove-unavailable-condition"] ?? [],
    removeOperations: flags["remove-operation"] ?? [],
    delete: flags.delete !== undefined,
  };
}

function requiredGroup(flags: Record<string, string[]>, names: string[], trigger: string): string[] | undefined {
  const active = names.some((name) => (flags[name]?.length ?? 0) > 0);
  if (!active) return undefined;
  const values = names.map((name) => one(flags, name));
  const missing = names.filter((_name, index) => values[index] === undefined);
  if (missing.length > 0) throw new Error(`--${trigger} group also requires ${missing.map((name) => `--${name}`).join(", ")}`);
  return values as string[];
}

function parseHarnessSessionEditArgs(argv: string[], deleteIntent = false): HarnessSessionAuthorInput {
  const flags = parseNamedFlags(argv, HARNESS_SESSION_EDIT_VALUE_FLAGS, new Set());
  const stepId = one(flags, "step");
  const verificationStepId = one(flags, "verification-step");
  if (stepId !== undefined && verificationStepId !== undefined) {
    throw new Error("supply either --step or --verification-step, not both");
  }
  const stepAction = one(flags, "step-action");
  if ((stepId !== undefined || verificationStepId !== undefined) !== (stepAction !== undefined)) {
    throw new Error("--step or --verification-step and --step-action must be supplied together");
  }
  const evidence = requiredGroup(flags, ["evidence", "evidence-kind", "evidence-path", "evidence-description"], "evidence");
  const hypothesis = requiredGroup(flags, ["hypothesis", "hypothesis-statement", "hypothesis-status"], "hypothesis");
  const finding = requiredGroup(flags, ["finding", "finding-summary", "finding-status"], "finding");
  const checkpoint = requiredGroup(
    flags,
    ["checkpoint", "checkpoint-reason", "checkpoint-action", "checkpoint-sensitive", "checkpoint-status", "checkpoint-resume"],
    "checkpoint",
  );
  const manualAction = requiredGroup(flags, ["manual-action", "manual-actor", "manual-summary", "manual-status"], "manual-action");
  return {
    status: one(flags, "status"),
    owner: one(flags, "owner"),
    environment: one(flags, "environment"),
    issueSummary: one(flags, "issue-summary"),
    observedBehavior: one(flags, "observed-behavior"),
    expectedBehavior: one(flags, "expected-behavior"),
    expectedFailure: one(flags, "expected-failure"),
    verificationStatus: one(flags, "verification-status"),
    selectedComponents: flags["selected-component"] ?? [],
    preconditions: flags.precondition ?? [],
    replayCommands: flags["replay-command"] ?? [],
    verificationEvidence: flags["verification-evidence"] ?? [],
    ...(stepId === undefined && verificationStepId === undefined ? {} : {
      step: {
        id: (stepId ?? verificationStepId)!,
        action: stepAction!,
        expected: one(flags, "step-expected"),
        target: one(flags, "step-target"),
        verification: verificationStepId !== undefined,
      },
    }),
    ...(evidence === undefined ? {} : { evidence: { id: evidence[0], kind: evidence[1], path: evidence[2], description: evidence[3] } }),
    ...(hypothesis === undefined ? {} : {
      hypothesis: { id: hypothesis[0], statement: hypothesis[1], status: hypothesis[2], evidence: flags["hypothesis-evidence"] ?? [] },
    }),
    ...(finding === undefined ? {} : {
      finding: {
        id: finding[0],
        summary: finding[1],
        status: finding[2],
        target: one(flags, "finding-target"),
        evidence: flags["finding-evidence"] ?? [],
      },
    }),
    ...(checkpoint === undefined ? {} : {
      checkpoint: {
        id: checkpoint[0],
        reason: checkpoint[1],
        requestedAction: checkpoint[2],
        sensitive: booleanValue(checkpoint[3], "checkpoint-sensitive")!,
        status: checkpoint[4],
        resumeCondition: checkpoint[5],
        evidenceBefore: flags["checkpoint-evidence-before"] ?? [],
        evidenceAfter: flags["checkpoint-evidence-after"] ?? [],
      },
    }),
    ...(manualAction === undefined ? {} : {
      manualAction: {
        id: manualAction[0],
        actor: manualAction[1],
        summary: manualAction[2],
        status: manualAction[3],
        evidence: flags["manual-evidence"] ?? [],
      },
    }),
    removeSelectedComponents: flags["remove-selected-component"] ?? [],
    removePreconditions: flags["remove-precondition"] ?? [],
    removeSteps: flags["remove-step"] ?? [],
    removeVerificationSteps: flags["remove-verification-step"] ?? [],
    removeEvidence: flags["remove-evidence"] ?? [],
    removeHypotheses: flags["remove-hypothesis"] ?? [],
    removeFindings: flags["remove-finding"] ?? [],
    removeCheckpoints: flags["remove-checkpoint"] ?? [],
    removeManualActions: flags["remove-manual-action"] ?? [],
    removeReplayCommands: flags["remove-replay-command"] ?? [],
    removeVerificationEvidence: flags["remove-verification-evidence"] ?? [],
    delete: deleteIntent,
  };
}

function parseSelectionArgs(argv: string[], usage: string, allowConfirm: boolean): SelectionArgs | null {
  const parsed: SelectionArgs = { components: [], confirm: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--environment") {
      const value = argv[index + 1];
      if (!value) {
        writeUsage(usage);
        return null;
      }
      parsed.environment = value;
      index += 1;
      continue;
    }
    if (arg === "--component") {
      const value = argv[index + 1];
      if (!value) {
        writeUsage(usage);
        return null;
      }
      parsed.components.push(value);
      index += 1;
      continue;
    }
    if (arg === "--confirm" && allowConfirm) {
      parsed.confirm = true;
      continue;
    }
    writeUsage(usage);
    return null;
  }
  return parsed;
}

function parseHarnessLogsArgs(argv: string[]): HarnessLogsArgs | null {
  const parsed: HarnessLogsArgs = { all: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--tail") {
      const value = argv[index + 1];
      const tailLines = Number(value);
      if (!value || !Number.isInteger(tailLines) || tailLines <= 0 || parsed.tailLines !== undefined || parsed.all) {
        writeUsage(HARNESS_LOGS_USAGE);
        return null;
      }
      parsed.tailLines = tailLines;
      index += 1;
      continue;
    }
    if (arg === "--all") {
      if (parsed.tailLines !== undefined || parsed.all) {
        writeUsage(HARNESS_LOGS_USAGE);
        return null;
      }
      parsed.all = true;
      continue;
    }
    if (arg.startsWith("--") || parsed.componentId !== undefined) {
      writeUsage(HARNESS_LOGS_USAGE);
      return null;
    }
    parsed.componentId = arg;
  }
  return parsed;
}

export function runHarnessPlan(argv: string[]): number {
  if (handleHelpRequest("harness-plan", argv)) {
    return 0;
  }
  const selection = parseSelectionArgs(argv, HARNESS_PLAN_USAGE, false);
  if (selection === null) return 1;
  const result = getHarnessPlanResult(process.cwd(), selection.environment, selection.components);
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runHarnessEdit(argv: string[]): number {
  if (handleHelpRequest("harness-edit", argv)) return 0;
  try {
    const result = authorHarness(process.cwd(), parseHarnessEditArgs(argv));
    writeJson(result);
    return result.valid ? 0 : 1;
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error));
    writeUsage(HARNESS_EDIT_USAGE);
    return 1;
  }
}

export function runHarnessInfer(argv: string[]): number {
  if (handleHelpRequest("harness-infer", argv)) {
    return 0;
  }
  let write = false;
  let force = false;
  for (const arg of argv) {
    if (arg === "--write") {
      write = true;
      continue;
    }
    if (arg === "--force") {
      force = true;
      continue;
    }
    writeUsage(HARNESS_INFER_USAGE);
    return 1;
  }
  if (force && !write) {
    writeUsage(HARNESS_INFER_USAGE);
    return 1;
  }
  const result = inferHarness(process.cwd(), { write, force });
  writeJson(result);
  return result.ok ? 0 : 1;
}

export function runHarnessDoctor(argv: string[]): number {
  if (handleHelpRequest("harness-doctor", argv)) {
    return 0;
  }
  let fix = false;
  for (const arg of argv) {
    if (arg === "--fix") {
      fix = true;
    } else {
      writeUsage(HARNESS_DOCTOR_USAGE);
      return 1;
    }
  }
  let result = doctorHarness(process.cwd());
  if (fix && !result.ok) {
    try {
      const maxPasses = 5;
      for (let pass = 0; pass < maxPasses && !result.ok; pass++) {
        const fixed = fixHarnessDiagnostics(process.cwd(), result.diagnostics);
        if (!fixed) break;
        result = doctorHarness(process.cwd());
      }
    } catch (error) {
      writeError((error as Error).message);
      return 1;
    }
  }
  writeJson(result);
  return result.ok ? 0 : 1;
}

export function runHarnessStart(argv: string[]): number {
  if (handleHelpRequest("harness-start", argv)) {
    return 0;
  }
  const selection = parseSelectionArgs(argv, HARNESS_START_USAGE, true);
  if (selection === null) return 1;
  const result = startHarness(process.cwd(), {
    environment: selection.environment,
    components: selection.components,
    confirm: selection.confirm,
  });
  writeJson(result);
  return result.ok ? 0 : 1;
}

export function runHarnessStop(argv: string[]): number {
  if (handleHelpRequest("harness-stop", argv)) {
    return 0;
  }
  const selection = parseSelectionArgs(argv, HARNESS_STOP_USAGE, true);
  if (selection === null || selection.environment !== undefined || selection.components.length > 0) return 1;
  const result = stopHarness(process.cwd(), { confirm: selection.confirm });
  writeJson(result);
  return result.ok ? 0 : 1;
}

export function runHarnessStatus(argv: string[]): number {
  if (handleHelpRequest("harness-status", argv)) {
    return 0;
  }
  if (argv.length > 0) {
    writeUsage(HARNESS_STATUS_USAGE);
    return 1;
  }
  const result = getHarnessStatus(process.cwd());
  writeJson(result);
  return result.ok ? 0 : 1;
}

export function runHarnessLogs(argv: string[]): number {
  if (handleHelpRequest("harness-logs", argv)) {
    return 0;
  }
  const parsed = parseHarnessLogsArgs(argv);
  if (parsed === null) return 1;
  const result = getHarnessLogs(process.cwd(), parsed);
  if (!result.ok) {
    writeJson(result);
    return 1;
  }
  writeOut(result.content ?? "");
  return 0;
}

export function runHarnessScripts(argv: string[]): number {
  const [action, ...extraArgs] = argv;
  if (handleHelpRequest("harness-scripts", argv)) {
    return 0;
  }
  if (!action || extraArgs.length > 0 || (action !== "generate" && action !== "verify")) {
    writeUsage(HARNESS_SCRIPTS_USAGE);
    return 1;
  }
  const result = action === "generate" ? generateHarnessScripts(process.cwd()) : verifyHarnessScripts(process.cwd());
  writeJson(result);
  return result.ok ? 0 : 1;
}

export function runHarnessSession(argv: string[]): number {
  const [action, target, ...extraArgs] = argv;
  if (handleHelpRequest("harness-session", argv)) {
    return 0;
  }
  if (!action || !target || !["create", "edit", "delete", "validate", "archive"].includes(action)) {
    writeUsage(HARNESS_SESSION_USAGE);
    return 1;
  }
  if (action === "create") {
    if (extraArgs.length > 0) {
      writeUsage(HARNESS_SESSION_USAGE);
      return 1;
    }
    if (!CHANGE_NAME_PATTERN.test(target)) {
      writeError("harness-session id must be kebab-case (lowercase letters, numbers, and hyphens)");
      return 1;
    }
    const result = createHarnessSession(process.cwd(), target);
    writeJson(result);
    return result.ok ? 0 : 1;
  }
  if (action === "edit" || action === "delete") {
    if (!CHANGE_NAME_PATTERN.test(target) || (action === "delete" && extraArgs.length > 0)) {
      writeUsage(HARNESS_SESSION_USAGE);
      return 1;
    }
    try {
      const result = authorHarnessSession(
        process.cwd(),
        target,
        parseHarnessSessionEditArgs(extraArgs, action === "delete"),
      );
      writeJson(result);
      return result.valid ? 0 : 1;
    } catch (error) {
      writeError(error instanceof Error ? error.message : String(error));
      return 1;
    }
  }
  if (extraArgs.length > 0) {
    writeUsage(HARNESS_SESSION_USAGE);
    return 1;
  }
  if (action === "validate") {
    const result = validateHarnessSession(process.cwd(), target);
    writeJson(result);
    return result.valid ? 0 : 1;
  }
  const result = archiveHarnessSession(process.cwd(), target);
  writeJson(result);
  return result.ok ? 0 : 1;
}
