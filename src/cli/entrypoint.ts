import { normalizeCliInvocation } from "./argv.js";
import { writeCliUsage } from "./usage.js";

export type CliCommandHandler = (argv: string[]) => number | void;
export type CliCommandTable = Record<string, CliCommandHandler>;

export function runCliEntrypoint(argv: string[], commands: CliCommandTable): number {
  const { subcommand, subcommandArgs } = normalizeCliInvocation(argv);
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
