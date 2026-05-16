import { getDevSessionPlanResult } from "../dev-session.js";
import { isHelpRequest } from "./argv.js";
import { writeHelp, writeJson, writeUsage } from "./output.js";

const DEV_SESSION_PLAN_USAGE = "Usage: strict-spec-driven dev-session-plan\n";

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
