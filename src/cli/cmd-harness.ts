import {
  archiveHarnessSession,
  createHarnessSession,
  doctorHarness,
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
import { CHANGE_NAME_PATTERN, isHelpRequest } from "./argv.js";
import { writeError, writeHelp, writeJson, writeOut, writeUsage } from "./output.js";

const HARNESS_PLAN_USAGE = "Usage: strict-spec-driven harness-plan [--environment <id>] [--component <id> ...]\n";
const HARNESS_INFER_USAGE = "Usage: strict-spec-driven harness-infer [--write] [--force]\n";
const HARNESS_DOCTOR_USAGE = "Usage: strict-spec-driven harness-doctor\n";
const HARNESS_START_USAGE = "Usage: strict-spec-driven harness-start [--environment <id>] [--component <id> ...] [--confirm]\n";
const HARNESS_STOP_USAGE = "Usage: strict-spec-driven harness-stop [--confirm]\n";
const HARNESS_STATUS_USAGE = "Usage: strict-spec-driven harness-status\n";
const HARNESS_LOGS_USAGE = "Usage: strict-spec-driven harness-logs [component-id]\n";
const HARNESS_SCRIPTS_USAGE = "Usage: strict-spec-driven harness-scripts <generate|verify>\n";
const HARNESS_SESSION_USAGE = "Usage: strict-spec-driven harness-session <create|validate|archive> <session-id|session.yaml>\n";

type SelectionArgs = {
  environment?: string;
  components: string[];
  confirm: boolean;
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

export function runHarnessPlan(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp(HARNESS_PLAN_USAGE);
    return 0;
  }
  const selection = parseSelectionArgs(argv, HARNESS_PLAN_USAGE, false);
  if (selection === null) return 1;
  const result = getHarnessPlanResult(process.cwd(), selection.environment, selection.components);
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runHarnessInfer(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp(HARNESS_INFER_USAGE);
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
  if (isHelpRequest(argv)) {
    writeHelp(HARNESS_DOCTOR_USAGE);
    return 0;
  }
  if (argv.length > 0) {
    writeUsage(HARNESS_DOCTOR_USAGE);
    return 1;
  }
  const result = doctorHarness(process.cwd());
  writeJson(result);
  return result.ok ? 0 : 1;
}

export function runHarnessStart(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp(HARNESS_START_USAGE);
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
  if (isHelpRequest(argv)) {
    writeHelp(HARNESS_STOP_USAGE);
    return 0;
  }
  const selection = parseSelectionArgs(argv, HARNESS_STOP_USAGE, true);
  if (selection === null || selection.environment !== undefined || selection.components.length > 0) return 1;
  const result = stopHarness(process.cwd(), { confirm: selection.confirm });
  writeJson(result);
  return result.ok ? 0 : 1;
}

export function runHarnessStatus(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp(HARNESS_STATUS_USAGE);
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
  if (isHelpRequest(argv)) {
    writeHelp(HARNESS_LOGS_USAGE);
    return 0;
  }
  if (argv.length > 1) {
    writeUsage(HARNESS_LOGS_USAGE);
    return 1;
  }
  const result = getHarnessLogs(process.cwd(), argv[0]);
  if (!result.ok) {
    writeJson(result);
    return 1;
  }
  writeOut(result.content ?? "");
  return 0;
}

export function runHarnessScripts(argv: string[]): number {
  const [action, ...extraArgs] = argv;
  if (isHelpRequest(argv)) {
    writeHelp(HARNESS_SCRIPTS_USAGE);
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
  if (isHelpRequest(argv)) {
    writeHelp(HARNESS_SESSION_USAGE);
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
