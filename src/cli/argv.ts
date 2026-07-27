import { buildCommandHelpPayload, formatCommandHelp } from "./command-metadata.js";
import { writeHelp, writeJson } from "./output.js";

export const CHANGE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type CliInvocation = {
  subcommand?: string;
  subcommandArgs: string[];
};

export type HelpRequest = {
  requested: boolean;
  json: boolean;
};

export function normalizeCliInvocation(argv: string[]): CliInvocation {
  const [subcommand, ...subcommandArgs] = argv;
  return { subcommand, subcommandArgs };
}

/**
 * Recognizes `--help`, `-h`, and the machine-readable `--help --json` form in either order.
 * Any other token makes the invocation a normal command rather than a help request.
 */
export function resolveHelpRequest(argv: string[]): HelpRequest {
  if (argv.length === 0 || argv.length > 2) {
    return { requested: false, json: false };
  }

  let help = false;
  let json = false;
  for (const token of argv) {
    if (token === "--help" || token === "-h") {
      if (help) return { requested: false, json: false };
      help = true;
      continue;
    }
    if (token === "--json") {
      if (json) return { requested: false, json: false };
      json = true;
      continue;
    }
    return { requested: false, json: false };
  }

  return help ? { requested: true, json } : { requested: false, json: false };
}

export function isHelpRequest(argv: string[]): boolean {
  return resolveHelpRequest(argv).requested;
}

/**
 * Writes command help when `argv` is a help request. Returns true when help was handled so the
 * caller can return zero without performing its normal behavior.
 */
export function handleHelpRequest(commandName: string, argv: string[]): boolean {
  const request = resolveHelpRequest(argv);
  if (!request.requested) {
    return false;
  }
  if (request.json) {
    writeJson(buildCommandHelpPayload(commandName));
    return true;
  }
  writeHelp(formatCommandHelp(commandName));
  return true;
}
