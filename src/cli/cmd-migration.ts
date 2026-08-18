import { runMaintenance } from "../maintenance.js";
import { migrateLegacyWorkflow } from "../migrate.js";
import { handleHelpRequest } from "./argv.js";
import { getCommandUsage } from "./command-metadata.js";
import { writeErr, writeError, writeJson, writeUsage } from "./output.js";

export function runMigrate(argv: string[]): number {
  if (handleHelpRequest("migrate", argv)) {
    return 0;
  }
  if (argv.length > 0) {
    writeUsage(getCommandUsage("migrate"));
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
  if (handleHelpRequest("maintenance", argv)) {
    return 0;
  }
  const seed = argv.includes("--seed");
  if (argv.length > (seed ? 1 : 0)) {
    writeUsage(getCommandUsage("maintenance"));
    return 1;
  }
  const result = runMaintenance(process.cwd(), { seed });
  writeJson(result);
  return result.valid ? 0 : 1;
}
