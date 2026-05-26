import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { checkProposalReadiness, getWorkflowState } from "../workflow-state.js";
import { CHANGE_NAME_PATTERN, isHelpRequest } from "./argv.js";
import { writeError, writeHelp, writeJson, writeOut, writeUsage } from "./output.js";

const STRICT_WORKFLOW_STATE_DIR = ".strict-spec-driven";

export function runCheckWorkflowState(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp("Usage: strict-spec-driven check-workflow-state\n");
    return 0;
  }
  if (argv.length > 0) {
    writeUsage("Usage: strict-spec-driven check-workflow-state\n");
    return 1;
  }

  const workflowStatePath = path.join(process.cwd(), STRICT_WORKFLOW_STATE_DIR);
  if (existsSync(workflowStatePath) && statSync(workflowStatePath).isDirectory()) {
    writeOut("strict workflow state exists: .strict-spec-driven/\n");
    return 0;
  }

  writeError("strict workflow state is missing: .strict-spec-driven/");
  writeUsage("Run /strict-spec-init before using strict workflow commands.\n");
  return 1;
}

export function runReady(argv: string[]): number {
  const [changeName, ...extraArgs] = argv;
  if (isHelpRequest(argv)) {
    writeHelp("Usage: strict-spec-driven ready <change-name>\n");
    return 0;
  }
  if (!changeName || extraArgs.length > 0) {
    writeUsage("Usage: strict-spec-driven ready <change-name>\n");
    return 1;
  }
  if (!CHANGE_NAME_PATTERN.test(changeName)) {
    writeError("change name must be kebab-case (lowercase letters, numbers, and hyphens)");
    return 1;
  }

  try {
    const result = checkProposalReadiness(process.cwd(), changeName);
    writeJson(result);
    return result.ready ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeError(message);
    return 1;
  }
}

export function runNext(argv: string[]): number {
  const [changeName, ...extraArgs] = argv;
  if (isHelpRequest(argv)) {
    writeHelp("Usage: strict-spec-driven next <change-name>\n");
    return 0;
  }
  if (!changeName || extraArgs.length > 0) {
    writeUsage("Usage: strict-spec-driven next <change-name>\n");
    return 1;
  }
  if (!CHANGE_NAME_PATTERN.test(changeName)) {
    writeError("change name must be kebab-case (lowercase letters, numbers, and hyphens)");
    return 1;
  }

  try {
    writeJson(getWorkflowState(process.cwd(), changeName));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeError(message);
    return 1;
  }
}
