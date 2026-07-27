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
import { CHANGE_NAME_PATTERN, handleHelpRequest } from "./argv.js";
import { getCommandUsage } from "./command-metadata.js";
import { writeError, writeJson, writeOut, writeUsage } from "./output.js";

const HARNESS_PLAN_USAGE = getCommandUsage("harness-plan");
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
  if (!action || !target || extraArgs.length > 0 || !["create", "validate", "archive"].includes(action)) {
    writeUsage(HARNESS_SESSION_USAGE);
    return 1;
  }
  if (action === "create") {
    if (!CHANGE_NAME_PATTERN.test(target)) {
      writeError("harness-session id must be kebab-case (lowercase letters, numbers, and hyphens)");
      return 1;
    }
    const result = createHarnessSession(process.cwd(), target);
    writeJson(result);
    return result.ok ? 0 : 1;
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
