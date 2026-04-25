export type CliInvocation = {
  subcommand?: string;
  subcommandArgs: string[];
};

export function normalizeCliInvocation(argv: string[]): CliInvocation {
  const [subcommand, ...subcommandArgs] = argv;
  return { subcommand, subcommandArgs };
}
