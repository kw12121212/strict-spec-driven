import { runMaintenance } from "../maintenance.js";
import { migrateLegacyWorkflow } from "../migrate.js";
import { writeError, writeJson, writeUsage } from "./output.js";

export function runMigrate(argv: string[]): number {
  let force = false;
  for (const arg of argv) {
    if (arg === "--force" || arg === "-f") {
      force = true;
      continue;
    }
    writeUsage("Usage: strict-spec-driven migrate [--force|-f]\n");
    return 1;
  }

  try {
    const result = migrateLegacyWorkflow(process.cwd(), { force });
    writeJson(result);
    return result.valid ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeError(message);
    return 1;
  }
}

export function runMaintenanceCommand(argv: string[]): number {
  if (argv.length > 0) {
    writeUsage("Usage: strict-spec-driven maintenance\n");
    return 1;
  }
  const result = runMaintenance(process.cwd());
  writeJson(result);
  return result.valid ? 0 : 1;
}
