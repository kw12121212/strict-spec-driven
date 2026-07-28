import type { CliCommandHandler, CliCommandTable } from "./entrypoint.js";

export const COMMAND_REGISTRATION_ORDER = [
  "init",
  "check-workflow-state",
  "propose",
  "generate",
  "apply",
  "verify",
  "ready",
  "next",
  "verify-spec-mappings",
  "verify-tech-mappings",
  "tech-status",
  "architecture-generate",
  "architecture-status",
  "design-init",
  "design-generate",
  "design-status",
  "validate-skills",
  "schema-list",
  "schema-show",
  "sample-list",
  "sample-show",
  "template-list",
  "template-show",
  "harness-infer",
  "harness-doctor",
  "harness-plan",
  "harness-start",
  "harness-stop",
  "harness-status",
  "harness-logs",
  "harness-scripts",
  "harness-session",
  "mcp-install",
  "migrate",
  "roadmap-generate",
  "roadmap-status",
  "roadmap-overview",
  "roadmap-sync",
  "roadmap-reorder",
  "roadmap-renumber",
  "roadmap-move-planned-change",
  "roadmap-recommend",
  "roadmap-archive",
  "roadmap-reopen",
  "roadmap-pause",
  "roadmap-resume",
  "sop-create",
  "sop-list",
  "sop-show",
  "sop-edit",
  "sop-validate",
  "sop-category-list",
  "sop-category-show",
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
