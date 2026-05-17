import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "fs";
import { spawn, spawnSync } from "child_process";
import path from "path";
import { normalizeRepoRelativePath } from "./cli/fs.js";
import { loadBundledSchemaByArtifactType, validateArtifact, type ValidationDiagnostic } from "./validation.js";
import { formatYamlParseSummary, getYamlDiagnosticDetails, parseYamlFile } from "./yaml.js";

export const DEV_SESSION_DECLARATION_PATH = ".strict-spec-driven/dev-session.yaml";
export const DEV_SESSION_RUNTIME_DIR = ".strict-spec-driven/.runtime/dev-session";
export const DEV_SESSION_RUNTIME_STATE_PATH = `${DEV_SESSION_RUNTIME_DIR}/state.json`;

const DEV_SESSION_LOGS_DIR = `${DEV_SESSION_RUNTIME_DIR}/logs`;
const SLEEP_SIGNAL = new Int32Array(new SharedArrayBuffer(4));

type DevSessionEnvironment = {
  required?: string[];
  optional?: string[];
};

type DevSessionReadiness = {
  type: "http" | "tcp" | "manual";
  url?: string;
  port?: number;
  timeout_seconds: number;
  interval_seconds: number;
  notes?: string[];
};

type DevSessionCleanup = {
  mode: "signal" | "command" | "none";
  signal?: string;
  command?: string;
  grace_period_seconds: number;
};

type DevSessionService = {
  description?: string;
  command: string;
  working_directory: string;
  environment: DevSessionEnvironment;
  urls: string[];
  ports: number[];
  readiness: DevSessionReadiness;
  browser_targets: string[];
  cleanup: DevSessionCleanup;
  unavailable_conditions: string[];
};

type DevSessionBrowserTarget = {
  url: string;
  smoke_paths: string[];
  evidence_labels: string[];
  local_only: boolean;
  service?: string;
  notes?: string[];
};

type DevSessionArtifact = {
  session: {
    id: string;
    description?: string;
    services: Record<string, DevSessionService>;
    browser_targets: Record<string, DevSessionBrowserTarget>;
  };
};

export type DerivedDevSessionPlan = {
  artifactPath: string;
  session: {
    id: string;
    description?: string;
    services: Array<{
      id: string;
      description?: string;
      command: string;
      workingDirectory: string;
      environment: {
        required: string[];
        optional: string[];
      };
      urls: string[];
      ports: number[];
      readiness: {
        type: "http" | "tcp" | "manual";
        url?: string;
        port?: number;
        timeoutSeconds: number;
        intervalSeconds: number;
        notes: string[];
      };
      browserTargets: string[];
      cleanup: {
        mode: "signal" | "command" | "none";
        signal?: string;
        command?: string;
        gracePeriodSeconds: number;
      };
      unavailableConditions: string[];
    }>;
    browserTargets: Array<{
      id: string;
      url: string;
      smokePaths: string[];
      evidenceLabels: string[];
      localOnly: boolean;
      service?: string;
      notes: string[];
    }>;
  };
};

export type DevSessionPlanDiagnostic = {
  source: string;
  artifactPath: string;
  fieldPath: string;
  message: string;
  expected?: string;
  actual?: string;
  errorType?: string;
  reason?: string;
  line?: number;
  column?: number;
  snippet?: string;
  offendingCharacter?: string;
};

export type DevSessionLifecycleDiagnostic = DevSessionPlanDiagnostic & {
  serviceId?: string;
  phase?: "declaration" | "environment" | "runtime_state" | "spawn" | "readiness" | "cleanup" | "logs";
};

export type DevSessionPlanResult =
  | (DerivedDevSessionPlan & { valid: true; diagnostics: [] })
  | { valid: false; artifactPath: string; diagnostics: DevSessionPlanDiagnostic[] };

type ManagedServiceStatus = "running" | "failed" | "stopped";
export type DevSessionServiceStatus = ManagedServiceStatus | "stale";

type DevSessionRuntimeServiceRecord = {
  serviceId: string;
  description?: string;
  command: string;
  workingDirectory: string;
  environment: {
    required: string[];
    optional: string[];
  };
  urls: string[];
  ports: number[];
  readiness: {
    type: "http" | "tcp" | "manual";
    url?: string;
    port?: number;
    timeoutSeconds: number;
    intervalSeconds: number;
    notes: string[];
  };
  browserTargets: string[];
  cleanup: {
    mode: "signal" | "command" | "none";
    signal?: string;
    command?: string;
    gracePeriodSeconds: number;
  };
  unavailableConditions: string[];
  pid: number | null;
  logPath: string;
  status: ManagedServiceStatus;
  startedAt: string;
  failureReason?: string;
};

type DevSessionRuntimeState = {
  version: 1;
  artifactPath: string;
  runtimeStatePath: string;
  sessionId: string;
  serviceOrder: string[];
  services: Record<string, DevSessionRuntimeServiceRecord>;
};

export type DevSessionServiceSnapshot = {
  id: string;
  status: DevSessionServiceStatus;
  pid: number | null;
  logPath: string;
  urls: string[];
  ports: number[];
  message?: string;
};

export type DevSessionStartResult = {
  ok: boolean;
  artifactPath: string;
  runtimeStatePath: string;
  sessionId?: string;
  services: DevSessionServiceSnapshot[];
  diagnostics: DevSessionLifecycleDiagnostic[];
};

export type DevSessionStatusResult = {
  ok: boolean;
  artifactPath: string;
  runtimeStatePath: string;
  sessionId?: string;
  services: DevSessionServiceSnapshot[];
  diagnostics: DevSessionLifecycleDiagnostic[];
};

export type DevSessionStopResult = {
  ok: boolean;
  artifactPath: string;
  runtimeStatePath: string;
  sessionId?: string;
  services: DevSessionServiceSnapshot[];
  diagnostics: DevSessionLifecycleDiagnostic[];
};

export type DevSessionLogsResult = {
  ok: boolean;
  artifactPath: string;
  runtimeStatePath: string;
  serviceId?: string;
  logPath?: string;
  content?: string;
  diagnostics: DevSessionLifecycleDiagnostic[];
};

export type DevSessionTrialProvenance = "started_by_strict" | "already_available" | "unavailable";

export type DevSessionTrialBrowserTarget = {
  id: string;
  url: string;
  smokePaths: string[];
  evidenceLabels: string[];
  localOnly: boolean;
  service?: string;
  notes: string[];
  provenance: DevSessionTrialProvenance;
  trialReady: boolean;
  managedServiceStatus?: DevSessionServiceStatus;
};

export type DevSessionTrialResult = {
  ok: boolean;
  artifactPath: string;
  runtimeStatePath: string;
  sessionId?: string;
  browserTargets: DevSessionTrialBrowserTarget[];
  diagnostics: DevSessionLifecycleDiagnostic[];
};

type RuntimeStateLoadResult =
  | { ok: true; state: DevSessionRuntimeState | null }
  | { ok: false; diagnostic: DevSessionLifecycleDiagnostic };

type RuntimePaths = {
  absoluteRuntimeDir: string;
  absoluteLogsDir: string;
  absoluteStatePath: string;
  relativeStatePath: string;
};

type CleanupOutcome = {
  status: DevSessionServiceStatus;
  message?: string;
};

type DerivedDevSessionService = DerivedDevSessionPlan["session"]["services"][number];
type DerivedDevSessionBrowserTarget = DerivedDevSessionPlan["session"]["browserTargets"][number];

export class DevSessionDeclarationNotFoundError extends Error {
  readonly artifactPath: string;

  constructor(artifactPath: string) {
    super(`dev-session declaration not found at ${artifactPath}`);
    this.name = "DevSessionDeclarationNotFoundError";
    this.artifactPath = artifactPath;
  }
}

export class DevSessionDeclarationValidationError extends Error {
  readonly artifactPath: string;
  readonly diagnostics: ValidationDiagnostic[];

  constructor(artifactPath: string, diagnostics: ValidationDiagnostic[]) {
    super(`dev-session declaration is invalid at ${artifactPath}`);
    this.name = "DevSessionDeclarationValidationError";
    this.artifactPath = artifactPath;
    this.diagnostics = diagnostics;
  }
}

function sortEntries<T>(record: Record<string, T>): Array<[string, T]> {
  return Object.entries(record).sort(([left], [right]) => left.localeCompare(right));
}

function getRuntimePaths(rootDir: string): RuntimePaths {
  const absoluteRuntimeDir = path.join(rootDir, DEV_SESSION_RUNTIME_DIR);
  const absoluteLogsDir = path.join(rootDir, DEV_SESSION_LOGS_DIR);
  const absoluteStatePath = path.join(rootDir, DEV_SESSION_RUNTIME_STATE_PATH);
  return {
    absoluteRuntimeDir,
    absoluteLogsDir,
    absoluteStatePath,
    relativeStatePath: normalizeRepoRelativePath(rootDir, absoluteStatePath),
  };
}

function ensureRuntimeDirectories(rootDir: string): RuntimePaths {
  const runtimePaths = getRuntimePaths(rootDir);
  mkdirSync(runtimePaths.absoluteLogsDir, { recursive: true });
  return runtimePaths;
}

function sleepSync(milliseconds: number): void {
  if (milliseconds <= 0) {
    return;
  }
  Atomics.wait(SLEEP_SIGNAL, 0, 0, milliseconds);
}

function isProcessAlive(pid: number | null): boolean {
  if (pid === null) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ESRCH") {
      return false;
    }
    return true;
  }
}

function createLifecycleDiagnostic(
  artifactPath: string,
  fieldPath: string,
  message: string,
  options?: {
    source?: string;
    phase?: DevSessionLifecycleDiagnostic["phase"];
    serviceId?: string;
    expected?: string;
    actual?: string;
  },
): DevSessionLifecycleDiagnostic {
  return {
    source: options?.source ?? "dev_session",
    artifactPath,
    fieldPath,
    message,
    expected: options?.expected,
    actual: options?.actual,
    serviceId: options?.serviceId,
    phase: options?.phase,
  };
}

function createRuntimeRecord(
  service: DerivedDevSessionPlan["session"]["services"][number],
  logPath: string,
  pid: number | null,
): DevSessionRuntimeServiceRecord {
  return {
    serviceId: service.id,
    description: service.description,
    command: service.command,
    workingDirectory: service.workingDirectory,
    environment: {
      required: [...service.environment.required],
      optional: [...service.environment.optional],
    },
    urls: [...service.urls],
    ports: [...service.ports],
    readiness: {
      type: service.readiness.type,
      url: service.readiness.url,
      port: service.readiness.port,
      timeoutSeconds: service.readiness.timeoutSeconds,
      intervalSeconds: service.readiness.intervalSeconds,
      notes: [...service.readiness.notes],
    },
    browserTargets: [...service.browserTargets],
    cleanup: {
      mode: service.cleanup.mode,
      signal: service.cleanup.signal,
      command: service.cleanup.command,
      gracePeriodSeconds: service.cleanup.gracePeriodSeconds,
    },
    unavailableConditions: [...service.unavailableConditions],
    pid,
    logPath,
    status: "running",
    startedAt: new Date().toISOString(),
  };
}

function getOrderedServiceIds(state: DevSessionRuntimeState): string[] {
  const seen = new Set(state.serviceOrder);
  const remaining = Object.keys(state.services).filter((serviceId) => !seen.has(serviceId)).sort((left, right) => left.localeCompare(right));
  return [...state.serviceOrder, ...remaining];
}

function deriveServiceSnapshot(record: DevSessionRuntimeServiceRecord): DevSessionServiceSnapshot {
  const alive = isProcessAlive(record.pid);
  if (record.status === "failed") {
    return {
      id: record.serviceId,
      status: "failed",
      pid: record.pid,
      logPath: record.logPath,
      urls: [...record.urls],
      ports: [...record.ports],
      message: record.failureReason,
    };
  }
  if (record.status === "stopped") {
    return {
      id: record.serviceId,
      status: alive ? "running" : "stopped",
      pid: record.pid,
      logPath: record.logPath,
      urls: [...record.urls],
      ports: [...record.ports],
      message: alive ? "managed process is still live despite a stopped record" : undefined,
    };
  }
  return {
    id: record.serviceId,
    status: alive ? "running" : "stale",
    pid: record.pid,
    logPath: record.logPath,
    urls: [...record.urls],
    ports: [...record.ports],
    message: alive ? undefined : "managed process record is stale",
  };
}

function summarizeRuntimeState(state: DevSessionRuntimeState): DevSessionServiceSnapshot[] {
  return getOrderedServiceIds(state)
    .map((serviceId) => state.services[serviceId])
    .filter((record): record is DevSessionRuntimeServiceRecord => record !== undefined)
    .map((record) => deriveServiceSnapshot(record));
}

function readRuntimeState(rootDir: string): RuntimeStateLoadResult {
  const runtimePaths = getRuntimePaths(rootDir);
  if (!existsSync(runtimePaths.absoluteStatePath)) {
    return { ok: true, state: null };
  }

  try {
    const raw = JSON.parse(readFileSync(runtimePaths.absoluteStatePath, "utf8")) as DevSessionRuntimeState;
    if (
      typeof raw !== "object"
      || raw === null
      || raw.version !== 1
      || typeof raw.artifactPath !== "string"
      || typeof raw.sessionId !== "string"
      || !Array.isArray(raw.serviceOrder)
      || typeof raw.services !== "object"
      || raw.services === null
    ) {
      return {
        ok: false,
        diagnostic: createLifecycleDiagnostic(
          DEV_SESSION_DECLARATION_PATH,
          "$",
          "dev-session runtime state is malformed",
          {
            source: "runtime_state",
            phase: "runtime_state",
            expected: "versioned runtime-state object",
            actual: "invalid-json-shape",
          },
        ),
      };
    }
    return { ok: true, state: raw };
  } catch (error) {
    return {
      ok: false,
      diagnostic: createLifecycleDiagnostic(
        DEV_SESSION_DECLARATION_PATH,
        "$",
        "dev-session runtime state is not valid JSON",
        {
          source: "runtime_state",
          phase: "runtime_state",
          actual: error instanceof Error ? error.message : String(error),
        },
      ),
    };
  }
}

function writeRuntimeState(rootDir: string, state: DevSessionRuntimeState): void {
  const runtimePaths = ensureRuntimeDirectories(rootDir);
  writeFileSync(runtimePaths.absoluteStatePath, JSON.stringify(state, null, 2) + "\n", "utf8");
}

function clearRuntimeState(rootDir: string): void {
  rmSync(getRuntimePaths(rootDir).absoluteRuntimeDir, { recursive: true, force: true });
}

function getMissingRequiredEnvironment(service: DerivedDevSessionPlan["session"]["services"][number]): string[] {
  return service.environment.required.filter((name) => !(name in process.env));
}

function runHttpReadinessCheck(url: string): boolean {
  const script = [
    "const http = require('http');",
    "const https = require('https');",
    "const target = new URL(process.argv[1]);",
    "const client = target.protocol === 'https:' ? https : http;",
    "const req = client.request(target, { method: 'GET' }, (res) => {",
    "  const status = typeof res.statusCode === 'number' ? res.statusCode : 0;",
    "  process.exit(status >= 200 && status < 400 ? 0 : 1);",
    "});",
    "req.on('error', () => process.exit(1));",
    "req.end();",
  ].join("");
  const result = spawnSync(process.execPath, ["-e", script, url], { stdio: "ignore" });
  return result.status === 0;
}

function runTcpReadinessCheck(port: number): boolean {
  const script = [
    "const net = require('net');",
    "const socket = net.createConnection({ host: '127.0.0.1', port: Number(process.argv[1]) }, () => {",
    "  socket.end();",
    "  process.exit(0);",
    "});",
    "socket.on('error', () => process.exit(1));",
  ].join("");
  const result = spawnSync(process.execPath, ["-e", script, String(port)], { stdio: "ignore" });
  return result.status === 0;
}

function canProbeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isBrowserTrialTargetAvailable(
  service: DerivedDevSessionService | undefined,
  target: DerivedDevSessionBrowserTarget,
): boolean {
  if (service?.readiness.type === "http") {
    return service.readiness.url !== undefined && runHttpReadinessCheck(service.readiness.url);
  }
  if (service?.readiness.type === "tcp") {
    return service.readiness.port !== undefined && runTcpReadinessCheck(service.readiness.port);
  }
  return canProbeHttpUrl(target.url) && runHttpReadinessCheck(target.url);
}

function deriveBrowserTrialTarget(
  plan: DerivedDevSessionPlan,
  target: DerivedDevSessionBrowserTarget,
  runtimeState: DevSessionRuntimeState | null,
): DevSessionTrialBrowserTarget {
  const service = target.service === undefined
    ? undefined
    : plan.session.services.find((candidate) => candidate.id === target.service);
  const managedRecord = service !== undefined && runtimeState !== null
    ? runtimeState.services[service.id]
    : undefined;
  const managedSnapshot = managedRecord === undefined ? undefined : deriveServiceSnapshot(managedRecord);
  const provenance = managedSnapshot !== undefined
    ? "started_by_strict"
    : isBrowserTrialTargetAvailable(service, target)
      ? "already_available"
      : "unavailable";

  return {
    id: target.id,
    url: target.url,
    smokePaths: [...target.smokePaths],
    evidenceLabels: [...target.evidenceLabels],
    localOnly: target.localOnly,
    service: target.service,
    notes: [...target.notes],
    provenance,
    trialReady: provenance === "started_by_strict"
      ? managedSnapshot?.status === "running"
      : provenance === "already_available",
    managedServiceStatus: managedSnapshot?.status,
  };
}

function waitForReadiness(record: DevSessionRuntimeServiceRecord): { ok: true } | { ok: false; message: string } {
  if (record.readiness.type === "manual") {
    return { ok: true };
  }

  const deadline = Date.now() + (record.readiness.timeoutSeconds * 1000);
  const intervalMs = Math.max(1, record.readiness.intervalSeconds) * 1000;
  while (Date.now() <= deadline) {
    if (!isProcessAlive(record.pid)) {
      return { ok: false, message: "service exited before readiness checks succeeded" };
    }

    const ready = record.readiness.type === "http"
      ? record.readiness.url !== undefined && runHttpReadinessCheck(record.readiness.url)
      : record.readiness.port !== undefined && runTcpReadinessCheck(record.readiness.port);
    if (ready) {
      return { ok: true };
    }

    sleepSync(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
  }

  return {
    ok: false,
    message: `service did not satisfy ${record.readiness.type} readiness within ${record.readiness.timeoutSeconds} seconds`,
  };
}

function stopServiceProcess(rootDir: string, record: DevSessionRuntimeServiceRecord): CleanupOutcome {
  const live = isProcessAlive(record.pid);
  if (!live) {
    return record.status === "stopped"
      ? { status: "stopped" }
      : record.status === "failed"
        ? { status: "failed", message: record.failureReason }
        : { status: "stale", message: "managed process record is stale" };
  }

  if (record.cleanup.mode === "none") {
    return {
      status: "failed",
      message: "cleanup mode 'none' does not define how to stop a running managed process",
    };
  }

  if (record.cleanup.mode === "command") {
    const workingDirectory = path.join(rootDir, record.workingDirectory);
    const result = spawnSync(record.cleanup.command ?? "", [], {
      cwd: workingDirectory,
      env: process.env,
      shell: true,
      encoding: "utf8",
    });
    if (result.status !== 0) {
      const details = result.stderr.trim() || result.stdout.trim();
      return {
        status: "failed",
        message: details.length > 0
          ? `cleanup command failed: ${details}`
          : "cleanup command failed",
      };
    }
  } else {
    try {
      process.kill(record.pid ?? 0, (record.cleanup.signal ?? "SIGTERM") as NodeJS.Signals);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ESRCH") {
        return { status: "stale", message: "managed process record is stale" };
      }
      return {
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const deadline = Date.now() + (record.cleanup.gracePeriodSeconds * 1000);
  while (Date.now() <= deadline) {
    if (!isProcessAlive(record.pid)) {
      return { status: "stopped" };
    }
    sleepSync(Math.min(250, Math.max(0, deadline - Date.now())));
  }

  return {
    status: "failed",
    message: "managed process did not stop within the configured grace period",
  };
}

function stopStartedServices(
  rootDir: string,
  state: DevSessionRuntimeState,
  serviceIds: string[],
  failedServiceId?: string,
  failureReason?: string,
): void {
  for (const serviceId of [...serviceIds].reverse()) {
    const record = state.services[serviceId];
    if (record === undefined) {
      continue;
    }
    const outcome = stopServiceProcess(rootDir, record);
    if (serviceId === failedServiceId) {
      record.status = "failed";
      record.failureReason = failureReason ?? outcome.message ?? record.failureReason;
      continue;
    }
    if (outcome.status === "stopped") {
      record.status = "stopped";
      delete record.failureReason;
      continue;
    }
    if (outcome.status === "failed") {
      record.status = "failed";
      record.failureReason = outcome.message;
      continue;
    }
  }
}

function createPlanFailureResult(rootDir: string, planResult: DevSessionPlanResult): DevSessionStartResult {
  return {
    ok: false,
    artifactPath: planResult.artifactPath,
    runtimeStatePath: getRuntimePaths(rootDir).relativeStatePath,
    services: [],
    diagnostics: planResult.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      phase: "declaration",
    })),
  };
}

function createRuntimeStateConflictDiagnostics(
  artifactPath: string,
  state: DevSessionRuntimeState,
): DevSessionLifecycleDiagnostic[] {
  return summarizeRuntimeState(state)
    .filter((service) => service.status === "running")
    .map((service) => createLifecycleDiagnostic(
      artifactPath,
      "$",
      "dev-session-start found existing managed runtime state for a still-running service",
      {
        source: "runtime_state",
        phase: "runtime_state",
        serviceId: service.id,
        actual: service.id,
      },
    ));
}

export function deriveDevSessionPlan(rootDir: string): DerivedDevSessionPlan {
  const absolutePath = path.join(rootDir, DEV_SESSION_DECLARATION_PATH);
  const artifactPath = normalizeRepoRelativePath(rootDir, absolutePath);
  if (!existsSync(absolutePath)) {
    throw new DevSessionDeclarationNotFoundError(artifactPath);
  }

  const artifact = parseYamlFile<DevSessionArtifact>(absolutePath);
  const schema = loadBundledSchemaByArtifactType("dev_session");
  const validation = validateArtifact(schema, artifact, artifactPath);
  if (!validation.valid) {
    throw new DevSessionDeclarationValidationError(artifactPath, validation.diagnostics);
  }

  return {
    artifactPath,
    session: {
      id: artifact.session.id,
      description: artifact.session.description,
      services: sortEntries(artifact.session.services).map(([id, service]) => ({
        id,
        description: service.description,
        command: service.command,
        workingDirectory: service.working_directory,
        environment: {
          required: [...(service.environment.required ?? [])],
          optional: [...(service.environment.optional ?? [])],
        },
        urls: [...service.urls],
        ports: [...service.ports],
        readiness: {
          type: service.readiness.type,
          url: service.readiness.url,
          port: service.readiness.port,
          timeoutSeconds: service.readiness.timeout_seconds,
          intervalSeconds: service.readiness.interval_seconds,
          notes: [...(service.readiness.notes ?? [])],
        },
        browserTargets: [...service.browser_targets],
        cleanup: {
          mode: service.cleanup.mode,
          signal: service.cleanup.signal,
          command: service.cleanup.command,
          gracePeriodSeconds: service.cleanup.grace_period_seconds,
        },
        unavailableConditions: [...service.unavailable_conditions],
      })),
      browserTargets: sortEntries(artifact.session.browser_targets).map(([id, target]) => ({
        id,
        url: target.url,
        smokePaths: [...target.smoke_paths],
        evidenceLabels: [...target.evidence_labels],
        localOnly: target.local_only,
        service: target.service,
        notes: [...(target.notes ?? [])],
      })),
    },
  };
}

export function getDevSessionPlanResult(rootDir: string): DevSessionPlanResult {
  const absolutePath = path.join(rootDir, DEV_SESSION_DECLARATION_PATH);
  const artifactPath = normalizeRepoRelativePath(rootDir, absolutePath);

  try {
    const plan = deriveDevSessionPlan(rootDir);
    return {
      valid: true,
      artifactPath: plan.artifactPath,
      diagnostics: [],
      session: plan.session,
    };
  } catch (error) {
    if (error instanceof DevSessionDeclarationNotFoundError) {
      return {
        valid: false,
        artifactPath,
        diagnostics: [{
          source: "filesystem",
          artifactPath,
          fieldPath: "$",
          message: "dev-session declaration file is missing",
          expected: DEV_SESSION_DECLARATION_PATH,
          actual: "missing",
        }],
      };
    }
    if (error instanceof DevSessionDeclarationValidationError) {
      return {
        valid: false,
        artifactPath,
        diagnostics: error.diagnostics,
      };
    }

    return {
      valid: false,
      artifactPath,
      diagnostics: [{
        source: "yaml_parse",
        artifactPath,
        fieldPath: "$",
        message: "dev-session declaration is not parseable YAML",
        expected: "parseable YAML mapping",
        actual: formatYamlParseSummary(error),
        ...(getYamlDiagnosticDetails(error) ?? {}),
      }],
    };
  }
}

export function startDevSession(rootDir: string): DevSessionStartResult {
  const runtimePaths = getRuntimePaths(rootDir);
  const planResult = getDevSessionPlanResult(rootDir);
  if (!planResult.valid) {
    return createPlanFailureResult(rootDir, planResult);
  }

  const runtimeState = readRuntimeState(rootDir);
  if (!runtimeState.ok) {
    return {
      ok: false,
      artifactPath: planResult.artifactPath,
      runtimeStatePath: runtimePaths.relativeStatePath,
      sessionId: planResult.session.id,
      services: [],
      diagnostics: [runtimeState.diagnostic],
    };
  }
  if (runtimeState.state !== null) {
    const conflicts = createRuntimeStateConflictDiagnostics(planResult.artifactPath, runtimeState.state);
    if (conflicts.length > 0) {
      return {
        ok: false,
        artifactPath: planResult.artifactPath,
        runtimeStatePath: runtimePaths.relativeStatePath,
        sessionId: planResult.session.id,
        services: summarizeRuntimeState(runtimeState.state),
        diagnostics: conflicts,
      };
    }
  }

  clearRuntimeState(rootDir);
  const writableRuntimePaths = ensureRuntimeDirectories(rootDir);
  const state: DevSessionRuntimeState = {
    version: 1,
    artifactPath: planResult.artifactPath,
    runtimeStatePath: writableRuntimePaths.relativeStatePath,
    sessionId: planResult.session.id,
    serviceOrder: planResult.session.services.map((service) => service.id),
    services: {},
  };
  const startedServiceIds: string[] = [];

  for (const service of planResult.session.services) {
    const logAbsolutePath = path.join(writableRuntimePaths.absoluteLogsDir, `${service.id}.log`);
    const logPath = normalizeRepoRelativePath(rootDir, logAbsolutePath);
    const missingEnvironment = getMissingRequiredEnvironment(service);
    if (missingEnvironment.length > 0) {
      const record = createRuntimeRecord(service, logPath, null);
      record.status = "failed";
      record.failureReason = `missing required environment variables: ${missingEnvironment.join(", ")}`;
      state.services[service.id] = record;
      writeRuntimeState(rootDir, state);
      return {
        ok: false,
        artifactPath: planResult.artifactPath,
        runtimeStatePath: writableRuntimePaths.relativeStatePath,
        sessionId: planResult.session.id,
        services: summarizeRuntimeState(state),
        diagnostics: [
          createLifecycleDiagnostic(
            planResult.artifactPath,
            `$.session.services.${service.id}.environment.required`,
            "required environment variables are missing for dev-session-start",
            {
              source: "environment",
              phase: "environment",
              serviceId: service.id,
              expected: service.environment.required.join(", "),
              actual: missingEnvironment.join(", "),
            },
          ),
        ],
      };
    }

    writeFileSync(logAbsolutePath, "", "utf8");
    const logDescriptor = openSync(logAbsolutePath, "a");
    const child = spawn(service.command, [], {
      cwd: path.join(rootDir, service.workingDirectory),
      env: process.env,
      shell: true,
      detached: true,
      stdio: ["ignore", logDescriptor, logDescriptor],
    });
    closeSync(logDescriptor);
    child.unref();

    const record = createRuntimeRecord(service, logPath, typeof child.pid === "number" ? child.pid : null);
    state.services[service.id] = record;
    writeRuntimeState(rootDir, state);

    if (typeof child.pid !== "number") {
      record.status = "failed";
      record.failureReason = "service process did not provide a pid";
      writeRuntimeState(rootDir, state);
      return {
        ok: false,
        artifactPath: planResult.artifactPath,
        runtimeStatePath: writableRuntimePaths.relativeStatePath,
        sessionId: planResult.session.id,
        services: summarizeRuntimeState(state),
        diagnostics: [
          createLifecycleDiagnostic(
            planResult.artifactPath,
            `$.session.services.${service.id}.command`,
            "dev-session-start could not determine the managed process identifier",
            {
              source: "spawn",
              phase: "spawn",
              serviceId: service.id,
            },
          ),
        ],
      };
    }

    const readiness = waitForReadiness(record);
    if (!readiness.ok) {
      record.status = "failed";
      record.failureReason = readiness.message;
      stopStartedServices(rootDir, state, [...startedServiceIds, service.id], service.id, readiness.message);
      writeRuntimeState(rootDir, state);
      return {
        ok: false,
        artifactPath: planResult.artifactPath,
        runtimeStatePath: writableRuntimePaths.relativeStatePath,
        sessionId: planResult.session.id,
        services: summarizeRuntimeState(state),
        diagnostics: [
          createLifecycleDiagnostic(
            planResult.artifactPath,
            `$.session.services.${service.id}.readiness`,
            readiness.message,
            {
              source: "readiness",
              phase: "readiness",
              serviceId: service.id,
            },
          ),
        ],
      };
    }

    startedServiceIds.push(service.id);
    writeRuntimeState(rootDir, state);
  }

  return {
    ok: true,
    artifactPath: planResult.artifactPath,
    runtimeStatePath: writableRuntimePaths.relativeStatePath,
    sessionId: planResult.session.id,
    services: summarizeRuntimeState(state),
    diagnostics: [],
  };
}

export function getDevSessionStatus(rootDir: string): DevSessionStatusResult {
  const runtimePaths = getRuntimePaths(rootDir);
  const runtimeState = readRuntimeState(rootDir);
  if (!runtimeState.ok) {
    return {
      ok: false,
      artifactPath: DEV_SESSION_DECLARATION_PATH,
      runtimeStatePath: runtimePaths.relativeStatePath,
      services: [],
      diagnostics: [runtimeState.diagnostic],
    };
  }
  if (runtimeState.state === null) {
    return {
      ok: true,
      artifactPath: DEV_SESSION_DECLARATION_PATH,
      runtimeStatePath: runtimePaths.relativeStatePath,
      services: [],
      diagnostics: [],
    };
  }
  return {
    ok: true,
    artifactPath: runtimeState.state.artifactPath,
    runtimeStatePath: runtimeState.state.runtimeStatePath,
    sessionId: runtimeState.state.sessionId,
    services: summarizeRuntimeState(runtimeState.state),
    diagnostics: [],
  };
}

export function getDevSessionLogs(rootDir: string, requestedServiceId?: string): DevSessionLogsResult {
  const runtimePaths = getRuntimePaths(rootDir);
  const runtimeState = readRuntimeState(rootDir);
  if (!runtimeState.ok) {
    return {
      ok: false,
      artifactPath: DEV_SESSION_DECLARATION_PATH,
      runtimeStatePath: runtimePaths.relativeStatePath,
      diagnostics: [runtimeState.diagnostic],
    };
  }
  if (runtimeState.state === null) {
    return {
      ok: false,
      artifactPath: DEV_SESSION_DECLARATION_PATH,
      runtimeStatePath: runtimePaths.relativeStatePath,
      diagnostics: [
        createLifecycleDiagnostic(
          DEV_SESSION_DECLARATION_PATH,
          "$",
          "dev-session-logs requires runtime state created by dev-session-start",
          {
            source: "runtime_state",
            phase: "logs",
          },
        ),
      ],
    };
  }

  const serviceIds = getOrderedServiceIds(runtimeState.state);
  const serviceId = requestedServiceId ?? (serviceIds.length === 1 ? serviceIds[0] : undefined);
  if (serviceId === undefined) {
    return {
      ok: false,
      artifactPath: runtimeState.state.artifactPath,
      runtimeStatePath: runtimeState.state.runtimeStatePath,
      diagnostics: [
        createLifecycleDiagnostic(
          runtimeState.state.artifactPath,
          "$",
          "dev-session-logs requires a declared service id when multiple managed services exist",
          {
            source: "logs",
            phase: "logs",
            expected: serviceIds.join(", "),
          },
        ),
      ],
    };
  }

  const record = runtimeState.state.services[serviceId];
  if (record === undefined) {
    return {
      ok: false,
      artifactPath: runtimeState.state.artifactPath,
      runtimeStatePath: runtimeState.state.runtimeStatePath,
      diagnostics: [
        createLifecycleDiagnostic(
          runtimeState.state.artifactPath,
          "$",
          "dev-session-logs received an unknown declared service id",
          {
            source: "logs",
            phase: "logs",
            serviceId,
            expected: serviceIds.join(", "),
            actual: serviceId,
          },
        ),
      ],
    };
  }

  const logAbsolutePath = path.join(rootDir, record.logPath);
  if (!existsSync(logAbsolutePath)) {
    return {
      ok: false,
      artifactPath: runtimeState.state.artifactPath,
      runtimeStatePath: runtimeState.state.runtimeStatePath,
      serviceId,
      logPath: record.logPath,
      diagnostics: [
        createLifecycleDiagnostic(
          runtimeState.state.artifactPath,
          "$",
          "dev-session-logs could not find the managed service log file",
          {
            source: "logs",
            phase: "logs",
            serviceId,
            expected: record.logPath,
            actual: "missing",
          },
        ),
      ],
    };
  }

  return {
    ok: true,
    artifactPath: runtimeState.state.artifactPath,
    runtimeStatePath: runtimeState.state.runtimeStatePath,
    serviceId,
    logPath: record.logPath,
    content: readFileSync(logAbsolutePath, "utf8"),
    diagnostics: [],
  };
}

export function getDevSessionTrialResult(rootDir: string): DevSessionTrialResult {
  const runtimePaths = getRuntimePaths(rootDir);
  const planResult = getDevSessionPlanResult(rootDir);
  if (!planResult.valid) {
    return {
      ok: false,
      artifactPath: planResult.artifactPath,
      runtimeStatePath: runtimePaths.relativeStatePath,
      browserTargets: [],
      diagnostics: planResult.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        phase: "declaration",
      })),
    };
  }

  const runtimeState = readRuntimeState(rootDir);
  if (!runtimeState.ok) {
    return {
      ok: false,
      artifactPath: planResult.artifactPath,
      runtimeStatePath: runtimePaths.relativeStatePath,
      sessionId: planResult.session.id,
      browserTargets: [],
      diagnostics: [runtimeState.diagnostic],
    };
  }

  return {
    ok: true,
    artifactPath: planResult.artifactPath,
    runtimeStatePath: runtimeState.state?.runtimeStatePath ?? runtimePaths.relativeStatePath,
    sessionId: planResult.session.id,
    browserTargets: planResult.session.browserTargets.map((target) =>
      deriveBrowserTrialTarget(planResult, target, runtimeState.state)
    ),
    diagnostics: [],
  };
}

export function stopDevSession(rootDir: string): DevSessionStopResult {
  const runtimePaths = getRuntimePaths(rootDir);
  const runtimeState = readRuntimeState(rootDir);
  if (!runtimeState.ok) {
    return {
      ok: false,
      artifactPath: DEV_SESSION_DECLARATION_PATH,
      runtimeStatePath: runtimePaths.relativeStatePath,
      services: [],
      diagnostics: [runtimeState.diagnostic],
    };
  }
  if (runtimeState.state === null) {
    return {
      ok: true,
      artifactPath: DEV_SESSION_DECLARATION_PATH,
      runtimeStatePath: runtimePaths.relativeStatePath,
      services: [],
      diagnostics: [],
    };
  }

  const diagnostics: DevSessionLifecycleDiagnostic[] = [];
  for (const serviceId of [...getOrderedServiceIds(runtimeState.state)].reverse()) {
    const record = runtimeState.state.services[serviceId];
    if (record === undefined) {
      continue;
    }
    const wasAlreadyFailed = record.status === "failed" && !isProcessAlive(record.pid);
    const outcome = stopServiceProcess(rootDir, record);
    if (outcome.status === "stopped") {
      record.status = "stopped";
      delete record.failureReason;
      continue;
    }
    if (outcome.status === "failed") {
      record.status = "failed";
      record.failureReason = outcome.message;
      if (!wasAlreadyFailed) {
        diagnostics.push(createLifecycleDiagnostic(
          runtimeState.state.artifactPath,
          `$.session.services.${serviceId}.cleanup`,
          outcome.message ?? "managed service cleanup failed",
          {
            source: "cleanup",
            phase: "cleanup",
            serviceId,
          },
        ));
      }
    }
  }
  writeRuntimeState(rootDir, runtimeState.state);

  return {
    ok: diagnostics.length === 0,
    artifactPath: runtimeState.state.artifactPath,
    runtimeStatePath: runtimeState.state.runtimeStatePath,
    sessionId: runtimeState.state.sessionId,
    services: summarizeRuntimeState(runtimeState.state),
    diagnostics,
  };
}
