type CommandTable = Record<string, unknown>;

export function getRegisteredCommandNames(commands: CommandTable): string[] {
  return Object.keys(commands);
}

export function formatCliUsage(commands: CommandTable): string {
  const commandNames = getRegisteredCommandNames(commands);
  let usage = "Usage: strict-spec-driven <command>\n";
  if (commandNames.length > 0) {
    usage += `Commands: ${commandNames.join(", ")}\n`;
  }
  usage += "Run 'strict-spec-driven <command> --help' for command usage.\n";
  return usage;
}

export function writeCliUsage(commands: CommandTable): void {
  process.stderr.write(formatCliUsage(commands));
}
