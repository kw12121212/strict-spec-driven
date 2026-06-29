import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, appendFileSync } from "fs";
import { spawn, spawnSync } from "child_process";
import path from "path";
import { normalizeRepoRelativePath } from "./cli/fs.js";
import { readBundledScaffoldTemplate } from "./scaffold.js";
import { loadBundledSchemaByArtifactType, validateArtifact, type ValidationDiagnostic } from "./validation.js";
import { formatYamlParseSummary, getYamlDiagnosticDetails, parseYamlDocument, parseYamlFile, stringifyYamlDocument } from "./yaml.js";

export const HARNESS_DECLARATION_PATH = ".strict-spec-driven/harness.yaml";
export const HARNESS_RUNTIME_DIR = ".strict-spec-driven/.runtime/harness";
export const HARNESS_RUNTIME_STATE_PATH = `${HARNESS_RUNTIME_DIR}/state.json`;
export const HARNESS_SESSIONS_DIR = ".strict-spec-driven/harness-sessions";
export const HARNESS_SESSION_ARCHIVE_DIR = `${HARNESS_SESSIONS_DIR}/archive`;
export const HARNESS_SESSION_FILE_NAME = "session.yaml";
export const HARNESS_SESSION_TEMPLATE_PATH = "harness-sessions/session.yaml";

const HARNESS_LOGS_DIR = `${HARNESS_RUNTIME_DIR}/logs`;
const SESSION_ID_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
const TEMPLATE_SESSION_ID_PLACEHOLDER = "{{session_id}}";
const SLEEP_SIGNAL = new Int32Array(new SharedArrayBuffer(4));
const SCRIPT_NAMES = ["harness-infer", "harness-doctor", "harness-plan", "harness-start", "harness-stop", "harness-status", "harness-logs", "harness-session"] as const;
const STATEFUL_TYPES = new Set(["database", "cache", "queue", "object_storage", "external_resource"]);
const MUTATING_OPERATIONS = new Set(["start", "stop", "cleanup"]);
const ENV_SAMPLE_FILES = [".env.example", ".env.sample", ".env.local.example", "example.env"];
const PACKAGE_SCRIPT_NAMES = ["dev", "start", "serve"] as const;
const COMPOSE_FILES = ["docker-compose.yml", "compose.yaml"] as const;
const PROCFILE_EXCLUDED_PROCESS_NAMES = new Set(["release", "console", "test"]);
const MAKEFILE_TARGET_NAMES = new Set(["run", "start", "dev"]);
const DEFAULT_HARNESS_LOG_TAIL_LINES = 200;

type HarnessEnvironmentKind = "development" | "production";
type HarnessOperationMode = "script" | "readonly" | "manual" | "disabled";
type HarnessReadiness = {
  type: "http" | "tcp" | "manual";
  url?: string;
  port?: number;
  timeout_seconds: number;
  interval_seconds: number;
  notes?: string[];
};
type HarnessOperation = {
  mode: HarnessOperationMode;
  command?: string;
  requires_confirmation?: boolean;
  allow_stateful_lifecycle?: boolean;
};
type DerivedHarnessOperation = {
  mode: HarnessOperationMode;
  command?: string;
  requiresConfirmation: boolean;
  allowStatefulLifecycle: boolean;
};
type HarnessComponent = {
  type: string;
  description?: string;
  working_directory: string;
  depends_on: string[];
  environment: {
    required: string[];
    optional: string[];
  };
  urls: string[];
  ports: number[];
  readiness: HarnessReadiness;
  operations: {
    start: HarnessOperation;
    stop: HarnessOperation;
    status?: HarnessOperation;
    logs?: HarnessOperation;
  };
  evidence_labels: string[];
  unavailable_conditions: string[];
};
type HarnessEnvironment = {
  kind: HarnessEnvironmentKind;
  description?: string;
  components: Record<string, HarnessComponent>;
};
type HarnessArtifact = {
  harness: {
    id: string;
    description?: string;
    environments: Record<string, HarnessEnvironment>;
  };
};
type HarnessInferenceSignal = {
  kind: "package-script" | "compose-service" | "procfile-process" | "makefile-target";
  command: string;
  description: string;
  evidence: string[];
  analysisCommand?: string;
  port: number | null;
};
type HarnessInferenceProbe = {
  candidate: HarnessInferenceSignal | null;
  evidence: string[];
};

export type HarnessRecoveryAction =
  | {
      action: "write_file";
      path: string;
      content: string;
      mode?: "overwrite" | "append";
    }
  | {
      action: "run_cli";
      args: string[];
    };

export type HarnessRecovery = {
  type: string;
  description: string;
  steps: HarnessRecoveryAction[];
};

export type HarnessDiagnostic = Omit<ValidationDiagnostic, "source"> & {
  source: ValidationDiagnostic["source"] | "filesystem" | "yaml" | "reference" | "safety" | "runtime_state" | "environment" | "spawn" | "readiness" | "logs" | "scripts";
  componentId?: string;
  phase?: "declaration" | "scripts" | "environment" | "runtime_state" | "spawn" | "readiness" | "cleanup" | "logs" | "session";
  errorType?: string;
  reason?: string;
  line?: number;
  column?: number;
  snippet?: string;
  offendingCharacter?: string;
  recovery?: HarnessRecovery;
};

export type DerivedHarnessComponent = {
  id: string;
  type: string;
  description?: string;
  workingDirectory: string;
  dependsOn: string[];
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
  operations: {
    start: DerivedHarnessOperation;
    stop: DerivedHarnessOperation;
    status?: DerivedHarnessOperation;
    logs?: DerivedHarnessOperation;
  };
  evidenceLabels: string[];
  unavailableConditions: string[];
};

export type DerivedHarnessPlan = {
  artifactPath: string;
  harness: {
    id: string;
    description?: string;
  };
  environment: {
    id: string;
    kind: HarnessEnvironmentKind;
    description?: string;
  };
  components: DerivedHarnessComponent[];
};

export type HarnessPlanResult =
  | (DerivedHarnessPlan & { valid: true; diagnostics: [] })
  | { valid: false; artifactPath: string; diagnostics: HarnessDiagnostic[] };

type ManagedStatus = "running" | "failed" | "stopped";
type RuntimeComponentRecord = {
  componentId: string;
  type: string;
  command: string;
  stopCommand?: string;
  workingDirectory: string;
  environment: {
    required: string[];
    optional: string[];
  };
  urls: string[];
  ports: number[];
  readiness: DerivedHarnessComponent["readiness"];
  pid: number | null;
  logPath: string;
  status: ManagedStatus;
  startedAt: string;
  failureReason?: string;
};
type RuntimeState = {
  version: 1;
  artifactPath: string;
  runtimeStatePath: string;
  harnessId: string;
  environmentId: string;
  componentOrder: string[];
  components: Record<string, RuntimeComponentRecord>;
};
type RuntimeStateLoadResult =
  | { ok: true; state: RuntimeState | null }
  | { ok: false; diagnostic: HarnessDiagnostic };
type RuntimePaths = {
  absoluteRuntimeDir: string;
  absoluteLogsDir: string;
  absoluteStatePath: string;
  relativeStatePath: string;
};

export type HarnessComponentSnapshot = {
  id: string;
  type: string;
  status: ManagedStatus | "stale";
  pid: number | null;
  logPath: string;
  urls: string[];
  ports: number[];
  message?: string;
};
export type HarnessLifecycleResult = {
  ok: boolean;
  artifactPath: string;
  runtimeStatePath: string;
  harnessId?: string;
  environmentId?: string;
  components: HarnessComponentSnapshot[];
  diagnostics: HarnessDiagnostic[];
};
export type HarnessLogsResult = {
  ok: boolean;
  artifactPath: string;
  runtimeStatePath: string;
  componentId?: string;
  logPath?: string;
  content?: string;
  diagnostics: HarnessDiagnostic[];
};
export type HarnessLogsOptions = {
  componentId?: string;
  tailLines?: number;
  all?: boolean;
};
export type HarnessScriptsResult = {
  ok: boolean;
  scripts: string[];
  created: string[];
  verified: string[];
  diagnostics: HarnessDiagnostic[];
};
export type HarnessInferenceResult = {
  ok: boolean;
  artifactPath: string;
  created: boolean;
  draft: string;
  evidence: string[];
  diagnostics: HarnessDiagnostic[];
};
export type HarnessDoctorResult = {
  ok: boolean;
  artifactPath: string;
  diagnostics: HarnessDiagnostic[];
};
export type HarnessSessionCreateResult = {
  ok: boolean;
  sessionId: string;
  sessionDir: string;
  sessionPath: string;
  evidenceDir: string;
  created: string[];
  diagnostics: HarnessDiagnostic[];
};
export type HarnessSessionValidateResult = {
  valid: boolean;
  artifactPath: string;
  diagnostics: HarnessDiagnostic[];
};
export type HarnessSessionArchiveResult = {
  ok: boolean;
  sessionId: string | null;
  sourceDir: string;
  sourcePath: string;
  archiveDir: string | null;
  archivePath: string | null;
  diagnostics: HarnessDiagnostic[];
};

function sortEntries<T>(record: Record<string, T>): Array<[string, T]> {
  return Object.entries(record).sort(([left], [right]) => left.localeCompare(right));
}

function createDiagnostic(
  artifactPath: string,
  fieldPath: string,
  message: string,
  options?: {
    source?: HarnessDiagnostic["source"];
    expected?: string;
    actual?: string;
    componentId?: string;
    phase?: HarnessDiagnostic["phase"];
    recovery?: HarnessRecovery;
  },
): HarnessDiagnostic {
  return {
    source: options?.source ?? "filesystem",
    artifactPath,
    fieldPath,
    message,
    expected: options?.expected,
    actual: options?.actual,
    componentId: options?.componentId,
    phase: options?.phase,
    recovery: options?.recovery,
  };
}

function yamlDiagnosticFromError(artifactPath: string, error: unknown): HarnessDiagnostic {
  const details = getYamlDiagnosticDetails(error);
  return {
    source: "yaml",
    artifactPath,
    fieldPath: "$",
    message: formatYamlParseSummary(error),
    actual: "invalid-yaml",
    errorType: details?.errorType,
    reason: details?.reason,
    line: details?.line,
    column: details?.column,
    snippet: details?.snippet,
    offendingCharacter: details?.offendingCharacter,
  };
}

function getRuntimePaths(rootDir: string): RuntimePaths {
  const absoluteRuntimeDir = path.join(rootDir, HARNESS_RUNTIME_DIR);
  const absoluteLogsDir = path.join(rootDir, HARNESS_LOGS_DIR);
  const absoluteStatePath = path.join(rootDir, HARNESS_RUNTIME_STATE_PATH);
  return {
    absoluteRuntimeDir,
    absoluteLogsDir,
    absoluteStatePath,
    relativeStatePath: normalizeRepoRelativePath(rootDir, absoluteStatePath),
  };
}

function ensureRuntimeDirectories(rootDir: string): RuntimePaths {
  const paths = getRuntimePaths(rootDir);
  mkdirSync(paths.absoluteLogsDir, { recursive: true });
  return paths;
}

function sleepSync(milliseconds: number): void {
  if (milliseconds > 0) {
    Atomics.wait(SLEEP_SIGNAL, 0, 0, milliseconds);
  }
}

function isProcessAlive(pid: number | null): boolean {
  if (pid === null) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ESRCH") return false;
    return true;
  }
}

function readRuntimeState(rootDir: string): RuntimeStateLoadResult {
  const paths = getRuntimePaths(rootDir);
  if (!existsSync(paths.absoluteStatePath)) return { ok: true, state: null };
  try {
    const state = JSON.parse(readFileSync(paths.absoluteStatePath, "utf8")) as RuntimeState;
    if (
      typeof state !== "object"
      || state === null
      || state.version !== 1
      || typeof state.artifactPath !== "string"
      || typeof state.harnessId !== "string"
      || typeof state.environmentId !== "string"
      || !Array.isArray(state.componentOrder)
      || typeof state.components !== "object"
      || state.components === null
    ) {
      return {
        ok: false,
        diagnostic: createDiagnostic(HARNESS_DECLARATION_PATH, "$", "harness runtime state is malformed", {
          source: "runtime_state",
          phase: "runtime_state",
          expected: "versioned runtime-state object",
          actual: "invalid-json-shape",
        }),
      };
    }
    return { ok: true, state };
  } catch (error) {
    return {
      ok: false,
      diagnostic: createDiagnostic(HARNESS_DECLARATION_PATH, "$", "harness runtime state is not valid JSON", {
        source: "runtime_state",
        phase: "runtime_state",
        actual: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}

function writeRuntimeState(rootDir: string, state: RuntimeState): void {
  const paths = ensureRuntimeDirectories(rootDir);
  writeFileSync(paths.absoluteStatePath, JSON.stringify(state, null, 2) + "\n", "utf8");
}

function clearRuntimeState(rootDir: string): void {
  rmSync(getRuntimePaths(rootDir).absoluteRuntimeDir, { recursive: true, force: true });
}

function snapshot(record: RuntimeComponentRecord): HarnessComponentSnapshot {
  const alive = isProcessAlive(record.pid);
  if (record.status === "failed") {
    return {
      id: record.componentId,
      type: record.type,
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
      id: record.componentId,
      type: record.type,
      status: alive ? "running" : "stopped",
      pid: record.pid,
      logPath: record.logPath,
      urls: [...record.urls],
      ports: [...record.ports],
      message: alive ? "managed process is still live despite a stopped record" : undefined,
    };
  }
  return {
    id: record.componentId,
    type: record.type,
    status: alive ? "running" : "stale",
    pid: record.pid,
    logPath: record.logPath,
    urls: [...record.urls],
    ports: [...record.ports],
    message: alive ? undefined : "managed process record is stale",
  };
}

function summarizeRuntimeState(state: RuntimeState): HarnessComponentSnapshot[] {
  const seen = new Set(state.componentOrder);
  const ordered = [
    ...state.componentOrder,
    ...Object.keys(state.components).filter((id) => !seen.has(id)).sort((left, right) => left.localeCompare(right)),
  ];
  return ordered
    .map((id) => state.components[id])
    .filter((record): record is RuntimeComponentRecord => record !== undefined)
    .map(snapshot);
}

function createPartialStartRecoveryDiagnostic(artifactPath: string, state: RuntimeState): HarnessDiagnostic | null {
  const runningComponentIds = summarizeRuntimeState(state)
    .filter((component) => component.status === "running")
    .map((component) => component.id);
  if (runningComponentIds.length === 0) return null;
  const componentLabel = runningComponentIds.length === 1 ? "component remains" : "components remain";
  const runningSummary = runningComponentIds.join(", ");
  return createDiagnostic(
    artifactPath,
    "$",
    `harness-start left already-started managed ${componentLabel} running after a later startup failure: ${runningSummary}; run strict-spec-cli harness-stop to clean them up`,
    {
      source: "runtime_state",
      phase: "cleanup",
      expected: "strict-spec-cli harness-stop",
      actual: runningSummary,
    },
  );
}

function takeTailLines(content: string, tailLines: number): string {
  if (content.length === 0) return content;
  let cursor = content.endsWith("\n") ? content.length - 1 : content.length;
  let remaining = tailLines;
  while (remaining > 0) {
    const newlineIndex = content.lastIndexOf("\n", cursor - 1);
    if (newlineIndex === -1) return content;
    cursor = newlineIndex;
    remaining -= 1;
  }
  return content.slice(cursor + 1);
}

function topologicalOrder(components: Record<string, HarnessComponent>, artifactPath: string): { ids: string[]; diagnostics: HarnessDiagnostic[] } {
  const diagnostics: HarnessDiagnostic[] = [];
  const ids = Object.keys(components).sort((left, right) => left.localeCompare(right));
  const idSet = new Set(ids);
  for (const id of ids) {
    for (const dependency of components[id]?.depends_on ?? []) {
      if (!idSet.has(dependency)) {
        diagnostics.push(createDiagnostic(artifactPath, `$.harness.environments.*.components.${id}.depends_on`, "component dependency reference is missing", {
          source: "reference",
          expected: ids.join(", "),
          actual: dependency,
          componentId: id,
        }));
      }
    }
  }
  if (diagnostics.length > 0) return { ids: [], diagnostics };

  const temporary = new Set<string>();
  const permanent = new Set<string>();
  const ordered: string[] = [];
  function visit(id: string): void {
    if (permanent.has(id)) return;
    if (temporary.has(id)) {
      diagnostics.push(createDiagnostic(artifactPath, `$.harness.environments.*.components.${id}.depends_on`, "component dependency cycle detected", {
        source: "reference",
        actual: id,
        componentId: id,
      }));
      return;
    }
    temporary.add(id);
    for (const dependency of [...(components[id]?.depends_on ?? [])].sort((left, right) => left.localeCompare(right))) {
      visit(dependency);
    }
    temporary.delete(id);
    permanent.add(id);
    ordered.push(id);
  }
  for (const id of ids) visit(id);
  return { ids: diagnostics.length > 0 ? [] : ordered, diagnostics };
}

function assertOperationAllowed(
  artifactPath: string,
  environment: { id: string; kind: HarnessEnvironmentKind },
  component: DerivedHarnessComponent,
  operationName: "start" | "stop",
  confirmed: boolean,
): HarnessDiagnostic | null {
  const operation = component.operations[operationName];
  if (operation.mode !== "script") {
    return createDiagnostic(artifactPath, `$.harness.environments.${environment.id}.components.${component.id}.operations.${operationName}.mode`, "harness operation is not executable by script", {
      source: "safety",
      phase: "environment",
      componentId: component.id,
      expected: "script",
      actual: operation.mode,
    });
  }
  if (!operation.command) {
    return createDiagnostic(artifactPath, `$.harness.environments.${environment.id}.components.${component.id}.operations.${operationName}.command`, "script operation requires a command", {
      source: "safety",
      phase: "environment",
      componentId: component.id,
      expected: "non-empty command",
      actual: "missing",
    });
  }
  if (environment.kind === "production" && MUTATING_OPERATIONS.has(operationName) && (!operation.requiresConfirmation || !confirmed)) {
    return createDiagnostic(artifactPath, `$.harness.environments.${environment.id}.components.${component.id}.operations.${operationName}.requires_confirmation`, "production mutating operations require explicit confirmation for each invocation", {
      source: "safety",
      phase: "environment",
      componentId: component.id,
      expected: "--confirm",
      actual: confirmed ? "missing declaration" : "not confirmed",
    });
  }
  if (STATEFUL_TYPES.has(component.type) && MUTATING_OPERATIONS.has(operationName) && !operation.allowStatefulLifecycle) {
    return createDiagnostic(artifactPath, `$.harness.environments.${environment.id}.components.${component.id}.operations.${operationName}.allow_stateful_lifecycle`, "stateful component lifecycle operations require explicit permission", {
      source: "safety",
      phase: "environment",
      componentId: component.id,
      expected: "true",
      actual: "false",
    });
  }
  return null;
}

function selectComponents(plan: DerivedHarnessPlan, componentIds: string[]): DerivedHarnessComponent[] {
  if (componentIds.length === 0) return plan.components;
  const selected = new Set(componentIds);
  return plan.components.filter((component) => selected.has(component.id));
}

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function detectPackageRunner(rootDir: string): string {
  if (existsSync(path.join(rootDir, "bun.lock")) || existsSync(path.join(rootDir, "bun.lockb"))) return "bun run";
  if (existsSync(path.join(rootDir, "pnpm-lock.yaml"))) return "pnpm run";
  if (existsSync(path.join(rootDir, "yarn.lock"))) return "yarn";
  return "npm run";
}

function inferComponentType(packageJson: Record<string, unknown> | null, scriptCommand: string | undefined): HarnessComponent["type"] {
  const dependencies = {
    ...(typeof packageJson?.dependencies === "object" && packageJson.dependencies !== null ? packageJson.dependencies : {}),
    ...(typeof packageJson?.devDependencies === "object" && packageJson.devDependencies !== null ? packageJson.devDependencies : {}),
  } as Record<string, unknown>;
  const dependencyNames = Object.keys(dependencies);
  const command = scriptCommand ?? "";
  if (dependencyNames.some((name) => ["next", "vite", "react", "vue", "svelte", "@angular/core"].includes(name)) || /\b(next|vite|webpack-dev-server)\b/.test(command)) {
    return "frontend";
  }
  if (dependencyNames.some((name) => ["express", "fastify", "@nestjs/core", "koa", "hono"].includes(name))) {
    return "backend";
  }
  return "backend";
}

function inferPort(scriptCommand: string | undefined, packageJson: Record<string, unknown> | null): number | null {
  if (scriptCommand) {
    const explicit = scriptCommand.match(/(?:PORT=|--port\s+|localhost:|127\.0\.0\.1:)(\d{2,5})/);
    if (explicit) {
      const port = Number(explicit[1]);
      if (port >= 1 && port <= 65535) return port;
    }
    if (/\bvite\b/.test(scriptCommand)) return 5173;
    if (/\bnext\b/.test(scriptCommand)) return 3000;
  }
  const dependencies = {
    ...(typeof packageJson?.dependencies === "object" && packageJson.dependencies !== null ? packageJson.dependencies : {}),
    ...(typeof packageJson?.devDependencies === "object" && packageJson.devDependencies !== null ? packageJson.devDependencies : {}),
  } as Record<string, unknown>;
  if ("vite" in dependencies) return 5173;
  if ("next" in dependencies) return 3000;
  return null;
}

function readEnvSampleNames(rootDir: string): { names: string[]; evidence: string[] } {
  const names = new Set<string>();
  const evidence: string[] = [];
  for (const relativePath of ENV_SAMPLE_FILES) {
    const absolutePath = path.join(rootDir, relativePath);
    if (!existsSync(absolutePath)) continue;
    evidence.push(relativePath);
    for (const line of readFileSync(absolutePath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/);
      if (match) names.add(match[1] as string);
    }
  }
  return { names: [...names].sort((left, right) => left.localeCompare(right)), evidence };
}

function getPackageScripts(packageJson: Record<string, unknown> | null): Record<string, string> {
  if (!packageJson || typeof packageJson.scripts !== "object" || packageJson.scripts === null) return {};
  return Object.fromEntries(
    Object.entries(packageJson.scripts as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringOrStringArray(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    const joined = value.map((item) => item.trim()).filter((item) => item.length > 0).join(" ");
    return joined.length > 0 ? joined : undefined;
  }
  return undefined;
}

function inferComposePort(service: Record<string, unknown>): number | null {
  if (!Array.isArray(service.ports)) return null;
  for (const entry of service.ports) {
    if (typeof entry === "number" && Number.isInteger(entry) && entry >= 1 && entry <= 65535) {
      return entry;
    }
    if (typeof entry === "string") {
      const segments = entry.split("/", 1)[0].split(":").map((part) => part.trim()).filter((part) => part.length > 0);
      const candidate = segments.length === 1 ? Number(segments[0]) : Number(segments[segments.length - 2]);
      if (Number.isInteger(candidate) && candidate >= 1 && candidate <= 65535) {
        return candidate;
      }
    }
    if (isRecord(entry)) {
      const published = typeof entry.published === "number"
        ? entry.published
        : typeof entry.published === "string"
          ? Number(entry.published)
          : typeof entry.target === "number"
            ? entry.target
            : typeof entry.target === "string"
              ? Number(entry.target)
              : null;
      if (published !== null && Number.isInteger(published) && published >= 1 && published <= 65535) {
        return published;
      }
    }
  }
  return null;
}

function detectPackageScriptSignal(rootDir: string, packageJson: Record<string, unknown> | null, scripts: Record<string, string>): HarnessInferenceProbe {
  if (!existsSync(path.join(rootDir, "package.json"))) {
    return { candidate: null, evidence: [] };
  }
  const preferredScript = PACKAGE_SCRIPT_NAMES.find((name) => scripts[name] !== undefined);
  if (!preferredScript) {
    return {
      candidate: null,
      evidence: ["No package.json dev/start/serve script was found."],
    };
  }
  const scriptCommand = scripts[preferredScript];
  return {
    candidate: {
      kind: "package-script",
      command: `${detectPackageRunner(rootDir)} ${preferredScript}`,
      description: `Inferred from package script '${preferredScript}'.`,
      evidence: ["package.json", `Selected package script '${preferredScript}'.`],
      analysisCommand: scriptCommand,
      port: inferPort(scriptCommand, packageJson),
    },
    evidence: ["package.json", `Selected package script '${preferredScript}'.`],
  };
}

function detectComposeServiceSignal(rootDir: string): HarnessInferenceProbe {
  const evidence: string[] = [];
  for (const relativePath of COMPOSE_FILES) {
    const absolutePath = path.join(rootDir, relativePath);
    if (!existsSync(absolutePath)) continue;
    try {
      const compose = parseYamlDocument<unknown>(readFileSync(absolutePath, "utf8"), { source: relativePath });
      const services = isRecord(compose) && isRecord(compose.services)
        ? Object.entries(compose.services).filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
        : [];
      const eligible = services.filter(([, service]) => "build" in service || readStringOrStringArray(service.command) !== undefined);
      if (eligible.length === 0) {
        evidence.push(`${relativePath} exists but no app-like runnable service was found.`);
        continue;
      }
      const [serviceName, service] = eligible[0];
      return {
        candidate: {
          kind: "compose-service",
          command: `docker compose up ${serviceName}`,
          description: `Inferred from compose service '${serviceName}' in ${relativePath}.`,
          evidence: [relativePath, `Selected compose service '${serviceName}'.`],
          analysisCommand: readStringOrStringArray(service.command),
          port: inferComposePort(service),
        },
        evidence: [...evidence, relativePath, `Selected compose service '${serviceName}'.`],
      };
    } catch (error) {
      evidence.push(`${relativePath} could not be parsed: ${formatYamlParseSummary(error)}.`);
    }
  }
  return { candidate: null, evidence };
}

function detectProcfileSignal(rootDir: string, packageJson: Record<string, unknown> | null): HarnessInferenceProbe {
  const procfilePath = path.join(rootDir, "Procfile");
  if (!existsSync(procfilePath)) {
    return { candidate: null, evidence: [] };
  }
  const entries = readFileSync(procfilePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => line.match(/^([A-Za-z0-9_-]+):\s*(.+)$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => ({ name: match[1], command: match[2].trim() }))
    .filter((entry) => entry.command.length > 0);
  const eligible = entries.filter((entry) => !PROCFILE_EXCLUDED_PROCESS_NAMES.has(entry.name.toLowerCase()));
  if (eligible.length === 0) {
    return {
      candidate: null,
      evidence: ["Procfile exists but no app-like runnable process was found."],
    };
  }
  const selected = eligible[0];
  return {
    candidate: {
      kind: "procfile-process",
      command: selected.command,
      description: `Inferred from Procfile process '${selected.name}'.`,
      evidence: ["Procfile", `Selected Procfile process '${selected.name}'.`],
      analysisCommand: selected.command,
      port: inferPort(selected.command, packageJson),
    },
    evidence: ["Procfile", `Selected Procfile process '${selected.name}'.`],
  };
}

function detectMakefileSignal(rootDir: string): HarnessInferenceProbe {
  const makefilePath = path.join(rootDir, "Makefile");
  if (!existsSync(makefilePath)) {
    return { candidate: null, evidence: [] };
  }
  const target = readFileSync(makefilePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Za-z0-9_.-]+)\s*:(?![=])/))
    .find((match) => match !== null && !match[1].startsWith(".") && MAKEFILE_TARGET_NAMES.has(match[1]));
  if (!target) {
    return {
      candidate: null,
      evidence: ["Makefile exists but no run/start/dev target was found."],
    };
  }
  return {
    candidate: {
      kind: "makefile-target",
      command: `make ${target[1]}`,
      description: `Inferred from Makefile target '${target[1]}'.`,
      evidence: ["Makefile", `Selected Makefile target '${target[1]}'.`],
      port: null,
    },
    evidence: ["Makefile", `Selected Makefile target '${target[1]}'.`],
  };
}

function detectHarnessInferenceSignal(rootDir: string, packageJson: Record<string, unknown> | null, scripts: Record<string, string>): { signal: HarnessInferenceSignal | null; evidence: string[] } {
  const probes = [
    detectPackageScriptSignal(rootDir, packageJson, scripts),
    detectComposeServiceSignal(rootDir),
    detectProcfileSignal(rootDir, packageJson),
    detectMakefileSignal(rootDir),
  ];
  const evidence: string[] = [];
  for (const probe of probes) {
    evidence.push(...probe.evidence);
    if (probe.candidate) {
      return { signal: probe.candidate, evidence };
    }
  }
  evidence.push("No supported lifecycle command was inferred from package.json, docker-compose.yml/compose.yaml, Procfile, or Makefile.");
  return { signal: null, evidence };
}

function buildInferredHarness(rootDir: string): { artifact: HarnessArtifact & { schema: string; schema_version: number; artifact_type: string; schema_file: string }; evidence: string[] } {
  const packageJson = readJsonFile<Record<string, unknown>>(path.join(rootDir, "package.json"));
  const scripts = getPackageScripts(packageJson);
  const envSamples = readEnvSampleNames(rootDir);
  const inference = detectHarnessInferenceSignal(rootDir, packageJson, scripts);
  const command = inference.signal?.command;
  const analysisCommand = inference.signal?.analysisCommand;
  const port = inference.signal?.port ?? null;
  const urls = port === null ? [] : [`http://127.0.0.1:${port}`];
  const ports = port === null ? [] : [port];
  const description = inference.signal?.description ?? "No lifecycle command could be inferred; replace manual operations before use.";
  const unavailableConditions = command === undefined
    ? ["No lifecycle command could be inferred from package.json, docker-compose.yml/compose.yaml, Procfile, or Makefile."]
    : [];
  const evidence = [...inference.evidence, ...envSamples.evidence];
  const inferredComponentType = inferComponentType(packageJson, analysisCommand);

  return {
    evidence,
    artifact: {
      schema: "strict-spec-driven/harness/v1",
      schema_version: 1,
      artifact_type: "harness",
      schema_file: "templates/strict-spec-driven/schemas/harness.yaml",
      harness: {
        id: path.basename(rootDir).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "default",
        description: "AI-assisted draft inferred from repository metadata. Review commands and safety policy before enabling lifecycle scripts.",
        environments: {
          development: {
            kind: "development",
            description: "Local development environment inferred from repository metadata.",
            components: {
              app: {
                type: inferredComponentType,
                description,
                working_directory: ".",
                depends_on: [],
                environment: {
                  required: envSamples.names,
                  optional: [],
                },
                urls,
                ports,
                readiness: port === null
                  ? {
                    type: "manual",
                    timeout_seconds: 60,
                    interval_seconds: 5,
                    notes: ["No port was inferred; replace manual readiness with HTTP or TCP readiness when known."],
                  }
                  : {
                    type: "tcp",
                    port,
                    timeout_seconds: 60,
                    interval_seconds: 5,
                    notes: ["TCP readiness was inferred from repository metadata; confirm the port before enabling lifecycle scripts."],
                  },
                operations: {
                  start: command === undefined ? { mode: "manual" } : { mode: "manual", command },
                  stop: { mode: "manual" },
                  status: { mode: "readonly" },
                  logs: { mode: "readonly" },
                },
                evidence_labels: [],
                unavailable_conditions: unavailableConditions,
              },
            },
          },
          production: {
            kind: "production",
            description: "Production operations are intentionally disabled in inferred drafts.",
            components: {
              app: {
                type: inferredComponentType,
                description: "Production lifecycle is disabled until a human explicitly declares safe operations.",
                working_directory: ".",
                depends_on: [],
                environment: {
                  required: envSamples.names,
                  optional: [],
                },
                urls: [],
                ports: [],
                readiness: {
                  type: "manual",
                  timeout_seconds: 60,
                  interval_seconds: 5,
                  notes: ["Production readiness must be declared explicitly by a human operator."],
                },
                operations: {
                  start: { mode: "disabled" },
                  stop: { mode: "disabled" },
                  status: { mode: "readonly" },
                  logs: { mode: "readonly" },
                },
                evidence_labels: [],
                unavailable_conditions: ["Production lifecycle is disabled in inferred harness drafts."],
              },
            },
          },
        },
      },
    },
  };
}

export function inferHarness(rootDir: string, options: { write?: boolean; force?: boolean } = {}): HarnessInferenceResult {
  const absolutePath = path.join(rootDir, HARNESS_DECLARATION_PATH);
  const artifactPath = normalizeRepoRelativePath(rootDir, absolutePath);
  const inferred = buildInferredHarness(rootDir);
  const draft = stringifyYamlDocument(inferred.artifact);
  const validation = validateArtifact(loadBundledSchemaByArtifactType("harness"), inferred.artifact, artifactPath);
  const diagnostics = validation.valid ? [] : validation.diagnostics as HarnessDiagnostic[];
  if (!validation.valid) {
    return { ok: false, artifactPath, created: false, draft, evidence: inferred.evidence, diagnostics };
  }
  if (options.write) {
    if (existsSync(absolutePath) && !options.force) {
      return {
        ok: false,
        artifactPath,
        created: false,
        draft,
        evidence: inferred.evidence,
        diagnostics: [createDiagnostic(artifactPath, "$", "harness declaration already exists; use --force to replace it", {
          expected: "missing harness declaration or --force",
          actual: "exists",
        })],
      };
    }
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, draft, "utf8");
  }
  return { ok: true, artifactPath, created: options.write ?? false, draft, evidence: inferred.evidence, diagnostics: [] };
}

export function deriveHarnessPlan(rootDir: string, environmentId?: string, componentIds: string[] = []): DerivedHarnessPlan {
  const absolutePath = path.join(rootDir, HARNESS_DECLARATION_PATH);
  const artifactPath = normalizeRepoRelativePath(rootDir, absolutePath);
  if (!existsSync(absolutePath)) {
    throw new Error("missing-harness");
  }
  const artifact = parseYamlFile<HarnessArtifact>(absolutePath);
  const schema = loadBundledSchemaByArtifactType("harness");
  const validation = validateArtifact(schema, artifact, artifactPath);
  if (!validation.valid) {
    const error = new Error("invalid-harness") as Error & { diagnostics: ValidationDiagnostic[] };
    error.diagnostics = validation.diagnostics;
    throw error;
  }

  const environmentEntries = sortEntries(artifact.harness.environments);
  const selectedEnvironmentEntry = environmentId === undefined
    ? environmentEntries[0]
    : environmentEntries.find(([id]) => id === environmentId);
  if (selectedEnvironmentEntry === undefined) {
    const error = new Error("unknown-environment") as Error & { diagnostics: HarnessDiagnostic[] };
    error.diagnostics = [
      createDiagnostic(artifactPath, "$.harness.environments", "requested harness environment is not declared", {
        source: "reference",
        expected: environmentEntries.map(([id]) => id).join(", "),
        actual: environmentId ?? "missing",
      }),
    ];
    throw error;
  }

  const [selectedEnvironmentId, selectedEnvironment] = selectedEnvironmentEntry;
  const ordering = topologicalOrder(selectedEnvironment.components, artifactPath);
  if (ordering.diagnostics.length > 0) {
    const error = new Error("invalid-references") as Error & { diagnostics: HarnessDiagnostic[] };
    error.diagnostics = ordering.diagnostics;
    throw error;
  }
  const requested = new Set(componentIds);
  const unknownComponents = [...requested].filter((id) => selectedEnvironment.components[id] === undefined).sort();
  if (unknownComponents.length > 0) {
    const error = new Error("unknown-component") as Error & { diagnostics: HarnessDiagnostic[] };
    error.diagnostics = [
      createDiagnostic(artifactPath, `$.harness.environments.${selectedEnvironmentId}.components`, "requested harness component is not declared", {
        source: "reference",
        expected: Object.keys(selectedEnvironment.components).sort().join(", "),
        actual: unknownComponents.join(", "),
      }),
    ];
    throw error;
  }

  const components = ordering.ids
    .filter((id) => requested.size === 0 || requested.has(id))
    .map((id) => {
      const component = selectedEnvironment.components[id] as HarnessComponent;
      return {
        id,
        type: component.type,
        description: component.description,
        workingDirectory: component.working_directory,
        dependsOn: [...component.depends_on],
        environment: {
          required: [...component.environment.required],
          optional: [...component.environment.optional],
        },
        urls: [...component.urls],
        ports: [...component.ports],
        readiness: {
          type: component.readiness.type,
          url: component.readiness.url,
          port: component.readiness.port,
          timeoutSeconds: component.readiness.timeout_seconds,
          intervalSeconds: component.readiness.interval_seconds,
          notes: [...(component.readiness.notes ?? [])],
        },
        operations: {
          start: normalizeOperation(component.operations.start),
          stop: normalizeOperation(component.operations.stop),
          status: component.operations.status ? normalizeOperation(component.operations.status) : undefined,
          logs: component.operations.logs ? normalizeOperation(component.operations.logs) : undefined,
        },
        evidenceLabels: [...component.evidence_labels],
        unavailableConditions: [...component.unavailable_conditions],
      };
    });

  return {
    artifactPath,
    harness: {
      id: artifact.harness.id,
      description: artifact.harness.description,
    },
    environment: {
      id: selectedEnvironmentId,
      kind: selectedEnvironment.kind,
      description: selectedEnvironment.description,
    },
    components,
  };
}

function normalizeOperation(operation: HarnessOperation): DerivedHarnessOperation {
  return {
    mode: operation.mode,
    command: operation.command,
    requiresConfirmation: operation.requires_confirmation ?? false,
    allowStatefulLifecycle: operation.allow_stateful_lifecycle ?? false,
  };
}

export function getHarnessPlanResult(rootDir: string, environmentId?: string, componentIds: string[] = []): HarnessPlanResult {
  const artifactPath = normalizeRepoRelativePath(rootDir, path.join(rootDir, HARNESS_DECLARATION_PATH));
  try {
    return {
      valid: true,
      diagnostics: [],
      ...deriveHarnessPlan(rootDir, environmentId, componentIds),
    };
  } catch (error) {
    if (error instanceof Error && error.message === "missing-harness") {
      return {
        valid: false,
        artifactPath,
        diagnostics: [createDiagnostic(artifactPath, "$", "harness declaration file is missing", {
          expected: HARNESS_DECLARATION_PATH,
          actual: "missing",
        })],
      };
    }
    if (error instanceof Error && "diagnostics" in error && Array.isArray(error.diagnostics)) {
      return { valid: false, artifactPath, diagnostics: error.diagnostics as HarnessDiagnostic[] };
    }
    return {
      valid: false,
      artifactPath,
      diagnostics: [{
        source: "yaml",
        artifactPath,
        fieldPath: "$",
        message: "harness declaration is not parseable YAML",
        expected: "parseable YAML mapping",
        actual: formatYamlParseSummary(error),
        ...(getYamlDiagnosticDetails(error) ?? {}),
      }],
    };
  }
}

function getMissingRequiredEnvironment(component: DerivedHarnessComponent): string[] {
  return component.environment.required.filter((name) => !(name in process.env));
}

function formatMissingRequiredEnvironmentFailure(missingEnvironment: string[]): string {
  return `missing required environment variables in the current process environment: ${missingEnvironment.join(", ")}. harness-doctor only checks that required names are documented in env sample files, and harness-start does not load .env files. Export or source the missing values before retrying.`;
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
  return spawnSync(process.execPath, ["-e", script, url], { stdio: "ignore" }).status === 0;
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
  return spawnSync(process.execPath, ["-e", script, String(port)], { stdio: "ignore" }).status === 0;
}

function findPortConflict(
  ports: number[],
  ignoredPorts: Set<number>,
): number | null {
  for (const port of ports) {
    if (ignoredPorts.has(port)) continue;
    if (runTcpReadinessCheck(port)) return port;
  }
  return null;
}

function waitForReadiness(record: RuntimeComponentRecord): { ok: true } | { ok: false; message: string } {
  if (record.readiness.type === "manual") return { ok: true };
  const deadline = Date.now() + record.readiness.timeoutSeconds * 1000;
  const intervalMs = Math.max(1, record.readiness.intervalSeconds) * 1000;
  while (Date.now() <= deadline) {
    if (!isProcessAlive(record.pid)) return { ok: false, message: "component exited before readiness checks succeeded" };
    const ready = record.readiness.type === "http"
      ? record.readiness.url !== undefined && runHttpReadinessCheck(record.readiness.url)
      : record.readiness.port !== undefined && runTcpReadinessCheck(record.readiness.port);
    if (ready) return { ok: true };
    sleepSync(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
  }
  return { ok: false, message: `component did not satisfy ${record.readiness.type} readiness within ${record.readiness.timeoutSeconds} seconds` };
}

function createRuntimeRecord(component: DerivedHarnessComponent, command: string, logPath: string, pid: number | null): RuntimeComponentRecord {
  return {
    componentId: component.id,
    type: component.type,
    command,
    stopCommand: component.operations.stop.command,
    workingDirectory: component.workingDirectory,
    environment: {
      required: [...component.environment.required],
      optional: [...component.environment.optional],
    },
    urls: [...component.urls],
    ports: [...component.ports],
    readiness: { ...component.readiness, notes: [...component.readiness.notes] },
    pid,
    logPath,
    status: "running",
    startedAt: new Date().toISOString(),
  };
}

export function startHarness(rootDir: string, options: { environment?: string; components?: string[]; confirm?: boolean } = {}): HarnessLifecycleResult {
  const runtimePaths = getRuntimePaths(rootDir);
  const planResult = getHarnessPlanResult(rootDir, options.environment, options.components ?? []);
  if (!planResult.valid) {
    return { ok: false, artifactPath: planResult.artifactPath, runtimeStatePath: runtimePaths.relativeStatePath, components: [], diagnostics: planResult.diagnostics };
  }
  const existing = readRuntimeState(rootDir);
  if (!existing.ok) {
    return { ok: false, artifactPath: planResult.artifactPath, runtimeStatePath: runtimePaths.relativeStatePath, harnessId: planResult.harness.id, environmentId: planResult.environment.id, components: [], diagnostics: [existing.diagnostic] };
  }
  if (existing.state !== null) {
    const running = summarizeRuntimeState(existing.state).filter((component) => component.status === "running");
    if (running.length > 0) {
      return {
        ok: false,
        artifactPath: planResult.artifactPath,
        runtimeStatePath: runtimePaths.relativeStatePath,
        harnessId: planResult.harness.id,
        environmentId: planResult.environment.id,
        components: summarizeRuntimeState(existing.state),
        diagnostics: running.map((component) => createDiagnostic(planResult.artifactPath, "$", "harness-start found existing managed runtime state for a still-running component", {
          source: "runtime_state",
          phase: "runtime_state",
          componentId: component.id,
          actual: component.id,
        })),
      };
    }
  }

  const occupiedPorts = new Set<number>(
    Object.values(existing.state?.components ?? {})
      .filter((record) => record.status === "running")
      .flatMap((record) => record.ports),
  );
  clearRuntimeState(rootDir);
  const writablePaths = ensureRuntimeDirectories(rootDir);
  const state: RuntimeState = {
    version: 1,
    artifactPath: planResult.artifactPath,
    runtimeStatePath: writablePaths.relativeStatePath,
    harnessId: planResult.harness.id,
    environmentId: planResult.environment.id,
    componentOrder: planResult.components.map((component) => component.id),
    components: {},
  };

  for (const component of planResult.components) {
    const safety = assertOperationAllowed(planResult.artifactPath, planResult.environment, component, "start", options.confirm ?? false);
    if (safety !== null) {
      const diagnostics = [safety];
      const recovery = createPartialStartRecoveryDiagnostic(planResult.artifactPath, state);
      if (recovery !== null) diagnostics.push(recovery);
      return { ok: false, artifactPath: planResult.artifactPath, runtimeStatePath: writablePaths.relativeStatePath, harnessId: planResult.harness.id, environmentId: planResult.environment.id, components: summarizeRuntimeState(state), diagnostics };
    }
    const missingEnvironment = getMissingRequiredEnvironment(component);
    const logAbsolutePath = path.join(writablePaths.absoluteLogsDir, `${component.id}.log`);
    const logPath = normalizeRepoRelativePath(rootDir, logAbsolutePath);
    if (missingEnvironment.length > 0) {
      const failureReason = formatMissingRequiredEnvironmentFailure(missingEnvironment);
      const record = createRuntimeRecord(component, component.operations.start.command ?? "", logPath, null);
      record.status = "failed";
      record.failureReason = failureReason;
      state.components[component.id] = record;
      writeRuntimeState(rootDir, state);
      const diagnostics = [createDiagnostic(planResult.artifactPath, `$.harness.environments.${planResult.environment.id}.components.${component.id}.environment.required`, "required environment variables are missing from the current process environment for harness-start", {
        source: "environment",
        phase: "environment",
        componentId: component.id,
        expected: "required values exported or sourced into the current process environment before harness-start; env sample files only document required names and the harness does not load .env files",
        actual: missingEnvironment.join(", "),
      })];
      const recovery = createPartialStartRecoveryDiagnostic(planResult.artifactPath, state);
      if (recovery !== null) diagnostics.push(recovery);
      return {
        ok: false,
        artifactPath: planResult.artifactPath,
        runtimeStatePath: writablePaths.relativeStatePath,
        harnessId: planResult.harness.id,
        environmentId: planResult.environment.id,
        components: summarizeRuntimeState(state),
        diagnostics,
      };
    }

    const inUsePort = findPortConflict(component.ports, occupiedPorts);
    if (inUsePort !== null) {
      const failureReason = `declared port ${inUsePort} is already in use by a process outside the managed harness runtime`;
      const record = createRuntimeRecord(component, component.operations.start.command ?? "", logPath, null);
      record.status = "failed";
      record.failureReason = failureReason;
      state.components[component.id] = record;
      writeRuntimeState(rootDir, state);
      const diagnostics = [createDiagnostic(planResult.artifactPath, `$.harness.environments.${planResult.environment.id}.components.${component.id}.ports`, "declared component port is already in use", {
        source: "spawn",
        phase: "spawn",
        componentId: component.id,
        expected: `declared port ${inUsePort} must be free for this harness start`,
        actual: `in-use`,
      })];
      const recovery = createPartialStartRecoveryDiagnostic(planResult.artifactPath, state);
      if (recovery !== null) diagnostics.push(recovery);
      return {
        ok: false,
        artifactPath: planResult.artifactPath,
        runtimeStatePath: writablePaths.relativeStatePath,
        harnessId: planResult.harness.id,
        environmentId: planResult.environment.id,
        components: summarizeRuntimeState(state),
        diagnostics,
      };
    }

    writeFileSync(logAbsolutePath, "", "utf8");
    const logDescriptor = openSync(logAbsolutePath, "a");
    const child = spawn(component.operations.start.command ?? "", [], {
      cwd: path.join(rootDir, component.workingDirectory),
      env: process.env,
      shell: true,
      detached: true,
      stdio: ["ignore", logDescriptor, logDescriptor],
    });
    closeSync(logDescriptor);
    child.unref();

    const record = createRuntimeRecord(component, component.operations.start.command ?? "", logPath, typeof child.pid === "number" ? child.pid : null);
    state.components[component.id] = record;
    component.ports.forEach((port) => occupiedPorts.add(port));
    writeRuntimeState(rootDir, state);
    const readiness = waitForReadiness(record);
    if (!readiness.ok) {
      record.status = "failed";
      record.failureReason = readiness.message;
      writeRuntimeState(rootDir, state);
      const diagnostics = [createDiagnostic(planResult.artifactPath, `$.harness.environments.${planResult.environment.id}.components.${component.id}.readiness`, readiness.message, {
        source: "readiness",
        phase: "readiness",
        componentId: component.id,
      })];
      const recovery = createPartialStartRecoveryDiagnostic(planResult.artifactPath, state);
      if (recovery !== null) diagnostics.push(recovery);
      return {
        ok: false,
        artifactPath: planResult.artifactPath,
        runtimeStatePath: writablePaths.relativeStatePath,
        harnessId: planResult.harness.id,
        environmentId: planResult.environment.id,
        components: summarizeRuntimeState(state),
        diagnostics,
      };
    }
  }

  return { ok: true, artifactPath: planResult.artifactPath, runtimeStatePath: writablePaths.relativeStatePath, harnessId: planResult.harness.id, environmentId: planResult.environment.id, components: summarizeRuntimeState(state), diagnostics: [] };
}

export function getHarnessStatus(rootDir: string): HarnessLifecycleResult {
  const paths = getRuntimePaths(rootDir);
  const runtime = readRuntimeState(rootDir);
  if (!runtime.ok) return { ok: false, artifactPath: HARNESS_DECLARATION_PATH, runtimeStatePath: paths.relativeStatePath, components: [], diagnostics: [runtime.diagnostic] };
  if (runtime.state === null) return { ok: true, artifactPath: HARNESS_DECLARATION_PATH, runtimeStatePath: paths.relativeStatePath, components: [], diagnostics: [] };
  return { ok: true, artifactPath: runtime.state.artifactPath, runtimeStatePath: runtime.state.runtimeStatePath, harnessId: runtime.state.harnessId, environmentId: runtime.state.environmentId, components: summarizeRuntimeState(runtime.state), diagnostics: [] };
}

export function getHarnessLogs(rootDir: string, options: HarnessLogsOptions = {}): HarnessLogsResult {
  const paths = getRuntimePaths(rootDir);
  const runtime = readRuntimeState(rootDir);
  if (!runtime.ok) return { ok: false, artifactPath: HARNESS_DECLARATION_PATH, runtimeStatePath: paths.relativeStatePath, diagnostics: [runtime.diagnostic] };
  if (runtime.state === null) {
    return { ok: false, artifactPath: HARNESS_DECLARATION_PATH, runtimeStatePath: paths.relativeStatePath, diagnostics: [createDiagnostic(HARNESS_DECLARATION_PATH, "$", "harness-logs requires runtime state created by harness-start", { source: "runtime_state", phase: "logs" })] };
  }
  const ids = runtime.state.componentOrder;
  const componentId = options.componentId ?? (ids.length === 1 ? ids[0] : undefined);
  if (componentId === undefined) {
    return { ok: false, artifactPath: runtime.state.artifactPath, runtimeStatePath: runtime.state.runtimeStatePath, diagnostics: [createDiagnostic(runtime.state.artifactPath, "$", "harness-logs requires a declared component id when multiple managed components exist", { source: "logs", phase: "logs", expected: ids.join(", ") })] };
  }
  const record = runtime.state.components[componentId];
  if (record === undefined) {
    return { ok: false, artifactPath: runtime.state.artifactPath, runtimeStatePath: runtime.state.runtimeStatePath, diagnostics: [createDiagnostic(runtime.state.artifactPath, "$", "harness-logs received an unknown declared component id", { source: "logs", phase: "logs", componentId, expected: ids.join(", "), actual: componentId })] };
  }
  const content = readFileSync(path.join(rootDir, record.logPath), "utf8");
  const boundedContent = options.all ? content : takeTailLines(content, options.tailLines ?? DEFAULT_HARNESS_LOG_TAIL_LINES);
  return { ok: true, artifactPath: runtime.state.artifactPath, runtimeStatePath: runtime.state.runtimeStatePath, componentId, logPath: record.logPath, content: boundedContent, diagnostics: [] };
}

export function stopHarness(rootDir: string, options: { confirm?: boolean } = {}): HarnessLifecycleResult {
  const paths = getRuntimePaths(rootDir);
  const runtime = readRuntimeState(rootDir);
  if (!runtime.ok) return { ok: false, artifactPath: HARNESS_DECLARATION_PATH, runtimeStatePath: paths.relativeStatePath, components: [], diagnostics: [runtime.diagnostic] };
  if (runtime.state === null) return { ok: true, artifactPath: HARNESS_DECLARATION_PATH, runtimeStatePath: paths.relativeStatePath, components: [], diagnostics: [] };
  const plan = getHarnessPlanResult(rootDir, runtime.state.environmentId, runtime.state.componentOrder);
  if (!plan.valid) return { ok: false, artifactPath: runtime.state.artifactPath, runtimeStatePath: runtime.state.runtimeStatePath, components: summarizeRuntimeState(runtime.state), diagnostics: plan.diagnostics };
  const planById = new Map(plan.components.map((component) => [component.id, component]));
  const diagnostics: HarnessDiagnostic[] = [];

  for (const componentId of [...runtime.state.componentOrder].reverse()) {
    const record = runtime.state.components[componentId];
    const component = planById.get(componentId);
    if (record === undefined || component === undefined) continue;
    const safety = assertOperationAllowed(plan.artifactPath, plan.environment, component, "stop", options.confirm ?? false);
    if (safety !== null) {
      record.status = "failed";
      record.failureReason = safety.message;
      diagnostics.push(safety);
      continue;
    }
    if (!isProcessAlive(record.pid)) {
      record.status = record.status === "failed" ? "failed" : "stopped";
      continue;
    }
    if (record.stopCommand) {
      const result = spawnSync(record.stopCommand, [], { cwd: path.join(rootDir, record.workingDirectory), env: process.env, shell: true, encoding: "utf8" });
      if (result.status !== 0) {
        record.status = "failed";
        record.failureReason = result.stderr.trim() || result.stdout.trim() || "stop command failed";
        diagnostics.push(createDiagnostic(plan.artifactPath, `$.harness.environments.${plan.environment.id}.components.${component.id}.operations.stop.command`, "harness stop command failed", { source: "runtime_state", phase: "cleanup", componentId: component.id, actual: record.failureReason }));
        continue;
      }
    } else {
      process.kill(record.pid ?? 0, "SIGTERM");
    }
    const deadline = Date.now() + 2000;
    while (Date.now() <= deadline && isProcessAlive(record.pid)) sleepSync(100);
    record.status = isProcessAlive(record.pid) ? "failed" : "stopped";
    if (record.status === "failed") record.failureReason = "managed process did not stop within the configured grace period";
  }
  writeRuntimeState(rootDir, runtime.state);
  return { ok: diagnostics.length === 0, artifactPath: runtime.state.artifactPath, runtimeStatePath: runtime.state.runtimeStatePath, harnessId: runtime.state.harnessId, environmentId: runtime.state.environmentId, components: summarizeRuntimeState(runtime.state), diagnostics };
}

function extractPackageScriptName(command: string): string | null {
  const trimmed = command.trim();
  const match = trimmed.match(/^(?:bun|npm|pnpm)\s+run\s+([A-Za-z0-9:_-]+)$/) ?? trimmed.match(/^yarn(?:\s+run)?\s+([A-Za-z0-9:_-]+)$/);
  return match?.[1] ?? null;
}

function addDoctorDiagnostic(
  diagnostics: HarnessDiagnostic[],
  artifactPath: string,
  fieldPath: string,
  message: string,
  options?: Parameters<typeof createDiagnostic>[3],
): void {
  diagnostics.push(createDiagnostic(artifactPath, fieldPath, message, options));
}

export function doctorHarness(rootDir: string): HarnessDoctorResult {
  const artifactPath = normalizeRepoRelativePath(rootDir, path.join(rootDir, HARNESS_DECLARATION_PATH));
  const planResult = getHarnessPlanResult(rootDir);
  const diagnostics: HarnessDiagnostic[] = [];
  if (!planResult.valid) {
    return { ok: false, artifactPath: planResult.artifactPath, diagnostics: planResult.diagnostics };
  }

  const absolutePath = path.join(rootDir, HARNESS_DECLARATION_PATH);
  const artifact = parseYamlFile<HarnessArtifact>(absolutePath);
  const rootEnvSamples = readEnvSampleNames(rootDir);
  const wrapperCheck = verifyHarnessScripts(rootDir);
  diagnostics.push(...wrapperCheck.diagnostics);

  const crossEnvironmentPorts = new Map<number, Array<{ environmentId: string; componentId: string }>>();

  for (const [environmentId] of sortEntries(artifact.harness.environments)) {
    const environmentPlan = getHarnessPlanResult(rootDir, environmentId);
    if (!environmentPlan.valid) {
      diagnostics.push(...environmentPlan.diagnostics);
      continue;
    }
    const seenPorts = new Map<number, string>();
    for (const component of environmentPlan.components) {
      const workingDirectory = path.join(rootDir, component.workingDirectory);
      if (!existsSync(workingDirectory) || !statSync(workingDirectory).isDirectory()) {
        addDoctorDiagnostic(diagnostics, environmentPlan.artifactPath, `$.harness.environments.${environmentId}.components.${component.id}.working_directory`, "harness component working directory is missing", {
          source: "filesystem",
          componentId: component.id,
          expected: "existing directory",
          actual: component.workingDirectory,
        });
      }
      const componentEnvSamples = workingDirectory === rootDir || !existsSync(workingDirectory)
        ? { names: [], evidence: [] }
        : readEnvSampleNames(workingDirectory);
      const documentedEnvNames = new Set([...rootEnvSamples.names, ...componentEnvSamples.names]);

      for (const name of component.environment.required) {
        if (!documentedEnvNames.has(name)) {
          let targetPath = ".env.example";
          if (componentEnvSamples.evidence.length > 0) {
            targetPath = path.join(component.workingDirectory, componentEnvSamples.evidence[0]);
          } else if (rootEnvSamples.evidence.length > 0) {
            targetPath = rootEnvSamples.evidence[0];
          } else if (component.workingDirectory !== ".") {
            targetPath = path.join(component.workingDirectory, ".env.example");
          }
          const repoRelativeTarget = normalizeRepoRelativePath(rootDir, path.resolve(rootDir, targetPath));
          const recovery: HarnessRecovery = {
            type: "bootstrap_env",
            description: `Append missing required environment variable ${name} to ${repoRelativeTarget}`,
            steps: [
              {
                action: "write_file",
                path: repoRelativeTarget,
                content: `\n# Added by harness-doctor recovery\n${name}=\n`,
                mode: "append",
              },
            ],
          };
          addDoctorDiagnostic(diagnostics, environmentPlan.artifactPath, `$.harness.environments.${environmentId}.components.${component.id}.environment.required`, "required environment variable is not documented in an env sample file", {
            source: "environment",
            phase: "environment",
            componentId: component.id,
            expected: ENV_SAMPLE_FILES.join(", "),
            actual: name,
            recovery,
          });
        }
      }

      for (const port of component.ports) {
        const existing = seenPorts.get(port);
        if (existing !== undefined) {
          addDoctorDiagnostic(diagnostics, environmentPlan.artifactPath, `$.harness.environments.${environmentId}.components.${component.id}.ports`, "harness port is declared by multiple components in the same environment", {
            source: "reference",
            componentId: component.id,
            expected: `unique port in ${environmentId}`,
            actual: `${port} also declared by ${existing}`,
          });
        }
        seenPorts.set(port, component.id);
        const declarations = crossEnvironmentPorts.get(port) ?? [];
        declarations.push({ environmentId, componentId: component.id });
        crossEnvironmentPorts.set(port, declarations);
      }

      for (const operationName of ["start", "stop", "status", "logs"] as const) {
        const operation = component.operations[operationName];
        if (operation === undefined) continue;
        if (!operation.command) continue;
        const scriptName = extractPackageScriptName(operation.command);
        if (scriptName !== null) {
          const packageJson = readJsonFile<Record<string, unknown>>(path.join(workingDirectory, "package.json"));
          const scripts = getPackageScripts(packageJson);
          if (scripts[scriptName] === undefined) {
            addDoctorDiagnostic(diagnostics, environmentPlan.artifactPath, `$.harness.environments.${environmentId}.components.${component.id}.operations.${operationName}.command`, "harness operation references a missing package script", {
              source: "reference",
              phase: "environment",
              componentId: component.id,
              expected: `package.json scripts.${scriptName}`,
              actual: operation.command,
            });
          }
        }
        if (environmentPlan.environment.kind === "production" && (operationName === "start" || operationName === "stop") && operation.mode === "script" && !operation.requiresConfirmation) {
          addDoctorDiagnostic(diagnostics, environmentPlan.artifactPath, `$.harness.environments.${environmentId}.components.${component.id}.operations.${operationName}.requires_confirmation`, "production script lifecycle operation should require explicit confirmation", {
            source: "safety",
            phase: "environment",
            componentId: component.id,
            expected: "requires_confirmation: true",
            actual: "missing or false",
          });
        }
        if (STATEFUL_TYPES.has(component.type) && (operationName === "start" || operationName === "stop") && operation.mode === "script" && !operation.allowStatefulLifecycle) {
          addDoctorDiagnostic(diagnostics, environmentPlan.artifactPath, `$.harness.environments.${environmentId}.components.${component.id}.operations.${operationName}.allow_stateful_lifecycle`, "stateful script lifecycle operation should explicitly allow stateful lifecycle control", {
            source: "safety",
            phase: "environment",
            componentId: component.id,
            expected: "allow_stateful_lifecycle: true",
            actual: "missing or false",
          });
        }
      }
    }
  }

  for (const port of [...crossEnvironmentPorts.keys()].sort((a, b) => a - b)) {
    const declarations = crossEnvironmentPorts.get(port)!;
    const environmentIds = [...new Set(declarations.map((declaration) => declaration.environmentId))];
    if (environmentIds.length < 2) continue;
    const firstDeclaration = declarations[0];
    const involved = declarations.map((declaration) => `${declaration.environmentId}.${declaration.componentId}`).join(", ");
    addDoctorDiagnostic(diagnostics, artifactPath, `$.harness.environments.${firstDeclaration.environmentId}.components.${firstDeclaration.componentId}.ports`, "harness port is declared in multiple environments (possible cross-environment port conflict requiring human confirmation)", {
      source: "safety",
      componentId: firstDeclaration.componentId,
      expected: `port ${port} declared in a single environment, or explicit human confirmation that the shared port is intentional`,
      actual: `${port} declared in environments ${environmentIds.join(", ")} by ${involved}`,
    });
  }

  return { ok: diagnostics.length === 0, artifactPath, diagnostics };
}

export function fixHarnessDiagnostics(rootDir: string, diagnostics: HarnessDiagnostic[]): boolean {
  let anyFixed = false;
  const executedKeys = new Set<string>();

  for (const diag of diagnostics) {
    if (!diag.recovery) continue;
    for (const step of diag.recovery.steps) {
      if (step.action === "write_file") {
        const absolutePath = path.resolve(rootDir, step.path);
        const mode = step.mode ?? "overwrite";
        const key = `write_file::${absolutePath}::${mode}::${step.content}`;
        if (executedKeys.has(key)) continue;
        executedKeys.add(key);

        const dir = path.dirname(absolutePath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        if (mode === "append") {
          appendFileSync(absolutePath, step.content, "utf8");
        } else {
          writeFileSync(absolutePath, step.content, "utf8");
        }
        anyFixed = true;
      } else if (step.action === "run_cli") {
        const key = `run_cli::${step.args.join("\0")}`;
        if (executedKeys.has(key)) continue;
        executedKeys.add(key);

        const cliPath = path.resolve(process.argv[1]);
        const display = ["strict-spec-cli", ...step.args].join(" ");
        const result = spawnSync(process.execPath, [cliPath, ...step.args], { cwd: rootDir, encoding: "utf8" });
        if (result.error) {
          throw new Error(`Failed to execute recovery command: ${display}. Error: ${result.error.message}`);
        }
        if (result.status !== 0) {
          const detail = [result.stderr, result.stdout].map((s) => (s ?? "").trim()).filter((s) => s.length > 0).join("\n");
          throw new Error(`Failed to execute recovery command: ${display}${detail ? `\n${detail}` : ""}`);
        }
        anyFixed = true;
      }
    }
  }
  return anyFixed;
}

function wrapperContent(scriptName: (typeof SCRIPT_NAMES)[number]): string {
  const command = scriptName === "harness-session" ? "harness-session" : scriptName;
  return [
    "#!/usr/bin/env sh",
    "set -eu",
    "SCRIPT_DIR=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)",
    "ROOT_DIR=$(CDPATH= cd -- \"$SCRIPT_DIR/..\" && pwd)",
    "CLI=\"$ROOT_DIR/dist/scripts/strict-spec-driven.js\"",
    "if [ -f \"$CLI\" ]; then",
    `  exec node "$CLI" ${command} "$@"`,
    "fi",
    "if command -v strict-spec-cli >/dev/null 2>&1; then",
    `  exec strict-spec-cli ${command} "$@"`,
    "fi",
    "echo \"strict-spec-cli CLI not found; build this project or install the CLI\" >&2",
    "exit 1",
    "",
  ].join("\n");
}

export function generateHarnessScripts(rootDir: string): HarnessScriptsResult {
  const scriptsDir = path.join(rootDir, "scripts");
  mkdirSync(scriptsDir, { recursive: true });
  const created: string[] = [];
  for (const scriptName of SCRIPT_NAMES) {
    const absolutePath = path.join(scriptsDir, scriptName);
    writeFileSync(absolutePath, wrapperContent(scriptName), { encoding: "utf8", mode: 0o755 });
    created.push(normalizeRepoRelativePath(rootDir, absolutePath));
  }
  return { ok: true, scripts: SCRIPT_NAMES.map((name) => `scripts/${name}`), created, verified: [], diagnostics: [] };
}

export function verifyHarnessScripts(rootDir: string): HarnessScriptsResult {
  const diagnostics: HarnessDiagnostic[] = [];
  const verified: string[] = [];
  const recovery: HarnessRecovery = {
    type: "generate_scripts",
    description: "Generate missing or outdated project-local harness wrapper scripts under scripts/",
    steps: [
      {
        action: "run_cli",
        args: ["harness-scripts", "generate"],
      },
    ],
  };
  for (const scriptName of SCRIPT_NAMES) {
    const relativePath = `scripts/${scriptName}`;
    const absolutePath = path.join(rootDir, relativePath);
    if (!existsSync(absolutePath)) {
      diagnostics.push(
        createDiagnostic(relativePath, "$", "harness script is missing", {
          source: "scripts",
          phase: "scripts",
          expected: "generated wrapper",
          actual: "missing",
          recovery,
        }),
      );
      continue;
    }
    const content = readFileSync(absolutePath, "utf8");
    if (content !== wrapperContent(scriptName)) {
      diagnostics.push(
        createDiagnostic(relativePath, "$", "harness script content does not match generated wrapper", {
          source: "scripts",
          phase: "scripts",
          expected: "current generated wrapper",
          actual: "different content",
          recovery,
        }),
      );
      continue;
    }
    verified.push(relativePath);
  }
  return { ok: diagnostics.length === 0, scripts: SCRIPT_NAMES.map((name) => `scripts/${name}`), created: [], verified, diagnostics };
}

function normalizeHarnessSessionPath(rootDir: string, target: string): { artifactPath: string; absolutePath: string } {
  const normalized = target.split("\\").join("/");
  const looksLikePath = normalized.includes("/") || normalized.endsWith(".yaml");
  const repoRelativePath = looksLikePath ? normalized : `${HARNESS_SESSIONS_DIR}/${normalized}/${HARNESS_SESSION_FILE_NAME}`;
  const absolutePath = path.resolve(rootDir, repoRelativePath);
  return { artifactPath: normalizeRepoRelativePath(rootDir, absolutePath), absolutePath };
}

function formatLocalDate(date = new Date()): string {
  return `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildHarnessSessionArchiveDestination(rootDir: string, sessionId: string): string {
  const archiveRoot = path.join(rootDir, HARNESS_SESSION_ARCHIVE_DIR);
  mkdirSync(archiveRoot, { recursive: true });
  const baseName = `${formatLocalDate()}-${sessionId}`;
  let candidate = path.join(archiveRoot, baseName);
  let sequence = 2;
  while (existsSync(candidate)) {
    candidate = path.join(archiveRoot, `${baseName}-${sequence}`);
    sequence += 1;
  }
  return candidate;
}

function isDirectory(filePath: string): boolean {
  return existsSync(filePath) && statSync(filePath).isDirectory();
}

export function createHarnessSession(rootDir: string, sessionId: string): HarnessSessionCreateResult {
  const sessionDir = path.join(rootDir, HARNESS_SESSIONS_DIR, sessionId);
  const sessionPath = path.join(sessionDir, HARNESS_SESSION_FILE_NAME);
  const evidenceDir = path.join(sessionDir, "evidence");
  const relativeSessionDir = normalizeRepoRelativePath(rootDir, sessionDir);
  const relativeSessionPath = normalizeRepoRelativePath(rootDir, sessionPath);
  const relativeEvidenceDir = normalizeRepoRelativePath(rootDir, evidenceDir);
  if (!SESSION_ID_PATTERN.test(sessionId) || sessionId === "archive") {
    return { ok: false, sessionId, sessionDir: relativeSessionDir, sessionPath: relativeSessionPath, evidenceDir: relativeEvidenceDir, created: [], diagnostics: [createDiagnostic(relativeSessionPath, "$.harness_session.id", "harness-session id must be kebab-case and not reserved", { expected: "lowercase letters, numbers, hyphens, and not 'archive'", actual: sessionId })] };
  }
  if (existsSync(sessionPath) || existsSync(evidenceDir)) {
    return { ok: false, sessionId, sessionDir: relativeSessionDir, sessionPath: relativeSessionPath, evidenceDir: relativeEvidenceDir, created: [], diagnostics: [createDiagnostic(relativeSessionPath, "$", "harness-session already exists", { expected: "new harness-session directory", actual: relativeSessionDir })] };
  }
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(sessionPath, readBundledScaffoldTemplate(HARNESS_SESSION_TEMPLATE_PATH).replaceAll(TEMPLATE_SESSION_ID_PLACEHOLDER, sessionId), "utf8");
  return { ok: true, sessionId, sessionDir: relativeSessionDir, sessionPath: relativeSessionPath, evidenceDir: `${relativeEvidenceDir}/`, created: [relativeSessionPath, `${relativeEvidenceDir}/`], diagnostics: [] };
}

export function validateHarnessSession(rootDir: string, target: string): HarnessSessionValidateResult {
  const { artifactPath, absolutePath } = normalizeHarnessSessionPath(rootDir, target);
  if (!existsSync(absolutePath)) {
    return { valid: false, artifactPath, diagnostics: [createDiagnostic(artifactPath, "$", "harness-session artifact not found", { expected: "session.yaml file", actual: "missing" })] };
  }
  let artifact: unknown;
  try {
    artifact = parseYamlFile(absolutePath);
  } catch (error) {
    return { valid: false, artifactPath, diagnostics: [yamlDiagnosticFromError(artifactPath, error)] };
  }
  const validation = validateArtifact(loadBundledSchemaByArtifactType("harness_session"), artifact, artifactPath);
  return { valid: validation.valid, artifactPath, diagnostics: validation.diagnostics };
}

export function archiveHarnessSession(rootDir: string, target: string): HarnessSessionArchiveResult {
  const { artifactPath, absolutePath } = normalizeHarnessSessionPath(rootDir, target);
  const sourceDir = path.dirname(absolutePath);
  const relativeSourceDir = normalizeRepoRelativePath(rootDir, sourceDir);
  const missingResult = { ok: false, sessionId: null, sourceDir: relativeSourceDir, sourcePath: artifactPath, archiveDir: null, archivePath: null };
  if (!existsSync(absolutePath)) {
    return { ...missingResult, diagnostics: [createDiagnostic(artifactPath, "$", "harness-session artifact not found", { expected: "session.yaml file", actual: "missing" })] };
  }
  const activeRoot = path.resolve(rootDir, HARNESS_SESSIONS_DIR);
  const sourceParent = path.dirname(path.resolve(sourceDir));
  if (path.basename(absolutePath) !== HARNESS_SESSION_FILE_NAME || sourceParent !== activeRoot || !isDirectory(sourceDir)) {
    return { ...missingResult, diagnostics: [createDiagnostic(artifactPath, "$", "harness-session archive target must be an active session.yaml artifact", { expected: `${HARNESS_SESSIONS_DIR}/<session-id>/${HARNESS_SESSION_FILE_NAME}`, actual: artifactPath })] };
  }
  const validation = validateHarnessSession(rootDir, artifactPath);
  if (!validation.valid) return { ...missingResult, diagnostics: validation.diagnostics };
  const artifact = parseYamlFile<{ harness_session?: { id?: unknown; status?: unknown } }>(absolutePath);
  const sessionId = artifact.harness_session?.id;
  const status = artifact.harness_session?.status;
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    return { ...missingResult, diagnostics: [createDiagnostic(artifactPath, "$.harness_session.id", "harness-session artifact is missing a session id", { expected: "non-empty harness_session.id", actual: typeof sessionId })] };
  }
  if (sessionId === "archive") {
    return { ...missingResult, sessionId, diagnostics: [createDiagnostic(artifactPath, "$.harness_session.id", "harness-session id is reserved for archived sessions", { expected: "non-reserved harness-session id", actual: sessionId })] };
  }
  if (path.basename(sourceDir) !== sessionId) {
    return { ...missingResult, sessionId, diagnostics: [createDiagnostic(artifactPath, "$.harness_session.id", "harness-session id must match its active directory name", { expected: path.basename(sourceDir), actual: sessionId })] };
  }
  if (status !== "resolved" && status !== "blocked") {
    return { ...missingResult, sessionId, diagnostics: [createDiagnostic(artifactPath, "$.harness_session.status", "harness-session must be resolved or blocked before archive", { expected: "resolved or blocked", actual: typeof status === "string" ? status : typeof status })] };
  }
  const archiveDestination = buildHarnessSessionArchiveDestination(rootDir, sessionId);
  const archivePath = path.join(archiveDestination, HARNESS_SESSION_FILE_NAME);
  renameSync(sourceDir, archiveDestination);
  return {
    ok: true,
    sessionId,
    sourceDir: relativeSourceDir,
    sourcePath: artifactPath,
    archiveDir: normalizeRepoRelativePath(rootDir, archiveDestination),
    archivePath: normalizeRepoRelativePath(rootDir, archivePath),
    diagnostics: [],
  };
}
