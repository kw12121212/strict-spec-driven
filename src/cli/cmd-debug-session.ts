import { createDebugSession, validateDebugSession } from "../debug-session.js";
import { CHANGE_NAME_PATTERN, isHelpRequest } from "./argv.js";
import { writeError, writeHelp, writeJson, writeUsage } from "./output.js";

const DEBUG_SESSION_CREATE_USAGE = "Usage: strict-spec-driven debug-session-create <session-id>\n";
const DEBUG_SESSION_VALIDATE_USAGE = "Usage: strict-spec-driven debug-session-validate <session-id|session.yaml>\n";

export function runDebugSessionCreate(argv: string[]): number {
  const [sessionId, ...extraArgs] = argv;
  if (isHelpRequest(argv)) {
    writeHelp(DEBUG_SESSION_CREATE_USAGE);
    return 0;
  }
  if (!sessionId || extraArgs.length > 0) {
    writeUsage(DEBUG_SESSION_CREATE_USAGE);
    return 1;
  }
  if (!CHANGE_NAME_PATTERN.test(sessionId)) {
    writeError("debug-session id must be kebab-case (lowercase letters, numbers, and hyphens)");
    return 1;
  }

  const result = createDebugSession(process.cwd(), sessionId);
  writeJson(result);
  return result.ok ? 0 : 1;
}

export function runDebugSessionValidate(argv: string[]): number {
  const [target, ...extraArgs] = argv;
  if (isHelpRequest(argv)) {
    writeHelp(DEBUG_SESSION_VALIDATE_USAGE);
    return 0;
  }
  if (!target || extraArgs.length > 0) {
    writeUsage(DEBUG_SESSION_VALIDATE_USAGE);
    return 1;
  }

  const result = validateDebugSession(process.cwd(), target);
  writeJson(result);
  return result.valid ? 0 : 1;
}
