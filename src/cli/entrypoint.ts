import { normalizeCliInvocation, resolveHelpRequest } from "./argv.js";
import { buildRootHelpPayload } from "./command-metadata.js";
import { writeErr, writeJson, writeOut } from "./output.js";
import { formatSharedSchemaCacheWarning, synchronizeSharedSchemaCache } from "../shared-schema-cache.js";
import { formatCliHelp, getRegisteredCommandNames, writeCliUsage } from "./usage.js";

export type CliCommandHandler = (argv: string[]) => number | void;
export type CliCommandTable = Record<string, CliCommandHandler>;

export function runCliEntrypoint(argv: string[], commands: CliCommandTable): number {
  const { subcommand, subcommandArgs } = normalizeCliInvocation(argv);

  const rootHelp = resolveHelpRequest(argv);
  if (rootHelp.requested) {
    if (rootHelp.json) {
      writeJson(buildRootHelpPayload(getRegisteredCommandNames(commands)));
    } else {
      writeOut(formatCliHelp(commands));
    }
    return 0;
  }

  // Help requests describe the CLI rather than reading workflow state, so they must never
  // create or refresh the shared schema cache.
  const subcommandHelp = subcommand !== undefined && subcommand in commands
    ? resolveHelpRequest(subcommandArgs)
    : { requested: false, json: false };
  if (!subcommandHelp.requested) {
    try {
      synchronizeSharedSchemaCache();
    } catch (error) {
      writeErr(`Warning: ${formatSharedSchemaCacheWarning(error)}\n`);
    }
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
