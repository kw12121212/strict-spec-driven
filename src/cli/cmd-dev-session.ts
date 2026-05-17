import {
  getDevSessionLogs,
  getDevSessionPlanResult,
  getDevSessionStatus,
  getDevSessionTrialResult,
  startDevSession,
  stopDevSession,
} from "../dev-session.js";
import { isHelpRequest } from "./argv.js";
import { writeHelp, writeJson, writeOut, writeUsage } from "./output.js";

const DEV_SESSION_PLAN_USAGE = "Usage: strict-spec-driven dev-session-plan\n";
const DEV_SESSION_START_USAGE = "Usage: strict-spec-driven dev-session-start\n";
const DEV_SESSION_STATUS_USAGE = "Usage: strict-spec-driven dev-session-status\n";
const DEV_SESSION_LOGS_USAGE = "Usage: strict-spec-driven dev-session-logs [service-id]\n";
const DEV_SESSION_TRIAL_USAGE = "Usage: strict-spec-driven dev-session-trial\n";
const DEV_SESSION_STOP_USAGE = "Usage: strict-spec-driven dev-session-stop\n";

export function runDevSessionPlan(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp(DEV_SESSION_PLAN_USAGE);
    return 0;
  }
  if (argv.length > 0) {
    writeUsage(DEV_SESSION_PLAN_USAGE);
    return 1;
  }

  const result = getDevSessionPlanResult(process.cwd());
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runDevSessionStart(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp(DEV_SESSION_START_USAGE);
    return 0;
  }
  if (argv.length > 0) {
    writeUsage(DEV_SESSION_START_USAGE);
    return 1;
  }

  const result = startDevSession(process.cwd());
  writeJson(result);
  return result.ok ? 0 : 1;
}

export function runDevSessionStatus(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp(DEV_SESSION_STATUS_USAGE);
    return 0;
  }
  if (argv.length > 0) {
    writeUsage(DEV_SESSION_STATUS_USAGE);
    return 1;
  }

  const result = getDevSessionStatus(process.cwd());
  writeJson(result);
  return result.ok ? 0 : 1;
}

export function runDevSessionLogs(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp(DEV_SESSION_LOGS_USAGE);
    return 0;
  }
  if (argv.length > 1) {
    writeUsage(DEV_SESSION_LOGS_USAGE);
    return 1;
  }

  const result = getDevSessionLogs(process.cwd(), argv[0]);
  if (!result.ok) {
    writeJson(result);
    return 1;
  }

  writeOut(result.content ?? "");
  return 0;
}

export function runDevSessionTrial(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp(DEV_SESSION_TRIAL_USAGE);
    return 0;
  }
  if (argv.length > 0) {
    writeUsage(DEV_SESSION_TRIAL_USAGE);
    return 1;
  }

  const result = getDevSessionTrialResult(process.cwd());
  writeJson(result);
  return result.ok ? 0 : 1;
}

export function runDevSessionStop(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp(DEV_SESSION_STOP_USAGE);
    return 0;
  }
  if (argv.length > 0) {
    writeUsage(DEV_SESSION_STOP_USAGE);
    return 1;
  }

  const result = stopDevSession(process.cwd());
  writeJson(result);
  return result.ok ? 0 : 1;
}
