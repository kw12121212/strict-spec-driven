import { runMaintenance } from "../maintenance.js";
import { migrateLegacyWorkflow } from "../migrate.js";
import { isHelpRequest } from "./argv.js";
import { writeErr, writeError, writeHelp, writeJson, writeUsage } from "./output.js";

export function runMigrate(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp("Usage: strict-spec-cli migrate\n");
    return 0;
  }
  if (argv.length > 0) {
    writeUsage("Usage: strict-spec-cli migrate\n");
    return 1;
  }

  try {
    const result = migrateLegacyWorkflow(process.cwd(), {
      onProgress: (phase) => writeErr(`[migrate ${new Date().toISOString()}] ${phase}\n`),
    });
    writeJson(result);
    return result.valid ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeError(message);
    return 1;
  }
}

export function runMaintenanceCommand(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp("Usage: strict-spec-cli maintenance\n");
    return 0;
  }
  if (argv.length > 0) {
    writeUsage("Usage: strict-spec-cli maintenance\n");
    return 1;
  }
  const result = runMaintenance(process.cwd());
  writeJson(result);
  return result.valid ? 0 : 1;
}
