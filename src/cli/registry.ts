import type { CliCommandHandler, CliCommandTable } from "./entrypoint.js";

export const COMMAND_REGISTRATION_ORDER = [
  "init",
  "propose",
  "generate",
  "apply",
  "verify",
  "ready",
  "next",
  "verify-spec-mappings",
  "validate-skills",
  "schema-list",
  "schema-show",
  "template-list",
  "template-show",
  "dev-session-plan",
  "dev-session-start",
  "dev-session-status",
  "dev-session-logs",
  "dev-session-trial",
  "dev-session-stop",
  "debug-session-create",
  "debug-session-validate",
  "migrate",
  "roadmap-status",
  "roadmap-overview",
  "roadmap-sync",
  "roadmap-recommend",
  "maintenance",
  "ship",
  "commit-and-push",
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
