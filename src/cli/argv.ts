import { CHANGE_NAME_PATTERN } from "../scaffold.js";
import { buildCommandHelpPayload, formatCommandHelp } from "./command-metadata.js";
import { writeHelp, writeJson } from "./output.js";

export { CHANGE_NAME_PATTERN };

export type CliInvocation = {
  subcommand?: string;
  subcommandArgs: string[];
};

export type HelpRequest = {
  requested: boolean;
  json: boolean;
};

/** Flags shared by every generated-document command: architecture-generate and design-generate. */
export type DocumentGenerateArgs = {
  check: boolean;
  outputPath?: string;
};

export function normalizeCliInvocation(argv: string[]): CliInvocation {
  const [subcommand, ...subcommandArgs] = argv;
  return { subcommand, subcommandArgs };
}

/**
 * Parses the --check and --output flags every generated-document command accepts. Returns null for
 * any unknown token, a repeated flag, or a missing --output value so the caller prints usage.
 */
export function parseDocumentGenerateArgs(argv: string[]): DocumentGenerateArgs | null {
  const parsed: DocumentGenerateArgs = { check: false };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--check") {
      if (parsed.check) return null;
      parsed.check = true;
      continue;
    }
    if (token === "--output") {
      const value = argv[index + 1];
      if (parsed.outputPath !== undefined || value === undefined || value.startsWith("--")) return null;
      parsed.outputPath = value;
      index += 1;
      continue;
    }
    if (token.startsWith("--output=")) {
      const value = token.slice("--output=".length);
      if (parsed.outputPath !== undefined || value.length === 0) return null;
      parsed.outputPath = value;
      continue;
    }
    return null;
  }

  return parsed;
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
