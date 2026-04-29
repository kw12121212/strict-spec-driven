import type { CliCommandHandler, CliCommandTable } from "./entrypoint.js";

export const COMMAND_REGISTRATION_ORDER = [
  "init",
  "propose",
  "generate",
  "apply",
  "verify",
  "review",
  "verify-spec-mappings",
  "validate-skills",
  "migrate",
  "roadmap-status",
  "roadmap-sync",
  "maintenance",
  "ship",
  "archive",
  "list",
  "modify",
  "cancel",
] as const;

export type RegisteredCliCommandName = (typeof COMMAND_REGISTRATION_ORDER)[number];
export type CliCommandRegistry = Record<RegisteredCliCommandName, CliCommandHandler>;

export function createCliCommandTable(registry: CliCommandRegistry): CliCommandTable {
  const commands: CliCommandTable = {};

  for (const commandName of COMMAND_REGISTRATION_ORDER) {
    commands[commandName] = registry[commandName];
  }

  return commands;
}
