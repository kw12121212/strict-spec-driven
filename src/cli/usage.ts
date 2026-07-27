import { formatRootHelp } from "./command-metadata.js";

type CommandTable = Record<string, unknown>;

export function getRegisteredCommandNames(commands: CommandTable): string[] {
  return Object.keys(commands);
}

/**
 * Compact usage hint written to stderr when an invocation is rejected. Help requests use the
 * richer grouped listing from `formatCliHelp` instead.
 */
export function formatCliUsage(commands: CommandTable): string {
  const commandNames = getRegisteredCommandNames(commands);
  let usage = "Usage: strict-spec-cli <command>\n";
  if (commandNames.length > 0) {
    usage += `Commands: ${commandNames.join(", ")}\n`;
  }
  usage += "Run 'strict-spec-cli <command> --help' for command usage.\n";
  return usage;
}

export function formatCliHelp(commands: CommandTable): string {
  return formatRootHelp(getRegisteredCommandNames(commands));
}

export function writeCliUsage(commands: CommandTable): void {
  process.stderr.write(formatCliUsage(commands));
}
