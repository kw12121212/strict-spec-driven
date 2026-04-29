export const CHANGE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type CliInvocation = {
  subcommand?: string;
  subcommandArgs: string[];
};

export function normalizeCliInvocation(argv: string[]): CliInvocation {
  const [subcommand, ...subcommandArgs] = argv;
  return { subcommand, subcommandArgs };
}

export function isHelpRequest(argv: string[]): boolean {
  return argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h");
}
