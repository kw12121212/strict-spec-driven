import { isHelpRequest, normalizeCliInvocation } from "./argv.js";
import { writeErr, writeOut } from "./output.js";
import { formatSharedSchemaCacheWarning, synchronizeSharedSchemaCache } from "../shared-schema-cache.js";
import { formatCliUsage, writeCliUsage } from "./usage.js";

export type CliCommandHandler = (argv: string[]) => number | void;
export type CliCommandTable = Record<string, CliCommandHandler>;

export function runCliEntrypoint(argv: string[], commands: CliCommandTable): number {
  const { subcommand, subcommandArgs } = normalizeCliInvocation(argv);
  if (isHelpRequest(argv)) {
    writeOut(formatCliUsage(commands));
    return 0;
  }

  try {
    synchronizeSharedSchemaCache();
  } catch (error) {
    writeErr(`Warning: ${formatSharedSchemaCacheWarning(error)}\n`);
  }
  if (!subcommand || !(subcommand in commands)) {
    writeCliUsage(commands);
    return 1;
  }

  const status = commands[subcommand](subcommandArgs);
  return typeof status === "number" ? status : 0;
}

export function exitCliEntrypoint(argv: string[], commands: CliCommandTable): never {
  process.exit(runCliEntrypoint(argv, commands));
}
