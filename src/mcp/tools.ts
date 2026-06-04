import { spawnSync } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  MCP_MUTATING_TOOL_INVENTORY,
  MCP_READ_ONLY_TOOL_INVENTORY,
  type McpCapabilityInventory,
} from "./inventory.js";

const emptySchema = z.strictObject({});
const changeSchema = z.strictObject({ change: z.string().min(1) });
const generateArtifactSchema = z.strictObject({
  change: z.string().min(1),
  artifact: z.enum(["proposal", "design", "questions", "delta-spec", "delta-tech"]),
  args: z.array(z.string().min(1)).optional(),
});
const roadmapSyncSchema = z.strictObject({
  materializePlannedChanges: z.boolean().optional(),
});
const harnessPlanSchema = z.strictObject({
  environment: z.string().min(1).optional(),
  components: z.array(z.string().min(1)).optional(),
});
const harnessLogsSchema = z.strictObject({
  component: z.string().min(1).optional(),
  tail: z.number().int().positive().optional(),
  all: z.boolean().optional(),
});
const harnessLifecycleSchema = z.strictObject({
  environment: z.string().min(1).optional(),
  components: z.array(z.string().min(1)).optional(),
  confirm: z.boolean().optional(),
});
const harnessStopSchema = z.strictObject({
  confirm: z.boolean().optional(),
});
const harnessSessionCreateSchema = z.strictObject({
  session: z.string().min(1),
});

type ReadToolArgs = Record<string, unknown>;

export type StrictCliCommandResult = {
  status: number;
  stdout: string;
  stderr: string;
};

export type StrictCliCommandRunner = (
  args: string[],
  options: { cwd: string },
) => StrictCliCommandResult;

export type McpToolDefinition = McpCapabilityInventory["tools"][number] & {
  inputSchema: z.ZodType;
  toCliArgs: (args: ReadToolArgs) => string[];
};

function command(
  inventory: McpCapabilityInventory["tools"][number],
  toCliArgs: (args: ReadToolArgs) => string[],
  inputSchema = emptySchema,
): McpToolDefinition {
  return {
    ...inventory,
    inputSchema,
    toCliArgs,
  };
}

function inventoryFor(name: string): McpCapabilityInventory["tools"][number] {
  const inventory = [...MCP_READ_ONLY_TOOL_INVENTORY, ...MCP_MUTATING_TOOL_INVENTORY].find(
    (candidate) => candidate.name === name,
  );
  if (!inventory) throw new Error(`missing MCP inventory entry '${name}'`);
  return inventory;
}

export const READ_ONLY_TOOL_DEFINITIONS: McpToolDefinition[] = [
  command(inventoryFor("check_workflow_state"), () => ["check-workflow-state"]),
  command(inventoryFor("list_changes"), () => ["list"]),
  command(inventoryFor("ready_change"), (args) => ["ready", String(args.change)], changeSchema),
  command(inventoryFor("next_change_step"), (args) => ["next", String(args.change)], changeSchema),
  command(inventoryFor("verify_change"), (args) => ["verify", String(args.change)], changeSchema),
  command(inventoryFor("roadmap_status"), () => ["roadmap-status"]),
  command(inventoryFor("roadmap_overview"), () => ["roadmap-overview"]),
  command(inventoryFor("roadmap_recommend"), () => ["roadmap-recommend"]),
  command(inventoryFor("verify_spec_mappings"), () => ["verify-spec-mappings"]),
  command(inventoryFor("verify_tech_mappings"), () => ["verify-tech-mappings"]),
  command(inventoryFor("tech_status"), () => ["tech-status"]),
  command(inventoryFor("harness_plan"), (args) => {
    const cliArgs = ["harness-plan"];
    if (typeof args.environment === "string") cliArgs.push("--environment", args.environment);
    if (Array.isArray(args.components)) {
      for (const component of args.components) cliArgs.push("--component", String(component));
    }
    return cliArgs;
  }, harnessPlanSchema),
  command(inventoryFor("harness_status"), () => ["harness-status"]),
  command(inventoryFor("harness_logs"), (args) => {
    const cliArgs = ["harness-logs"];
    if (typeof args.component === "string") cliArgs.push(args.component);
    if (args.all === true) cliArgs.push("--all");
    if (typeof args.tail === "number") cliArgs.push("--tail", String(args.tail));
    return cliArgs;
  }, harnessLogsSchema),
];

export const MUTATING_TOOL_DEFINITIONS: McpToolDefinition[] = [
  command(inventoryFor("init_workflow"), () => ["init"]),
  command(inventoryFor("propose_change"), (args) => ["propose", String(args.change)], changeSchema),
  command(inventoryFor("generate_change_artifact"), (args) => [
    "generate",
    String(args.change),
    String(args.artifact),
    ...(Array.isArray(args.args) ? args.args.map(String) : []),
  ], generateArtifactSchema),
  command(inventoryFor("mark_next_task_complete"), (args) => ["apply", String(args.change)], changeSchema),
  command(inventoryFor("roadmap_sync"), (args) => {
    const cliArgs = ["roadmap-sync"];
    if (args.materializePlannedChanges === true) cliArgs.push("--materialize-planned-changes");
    return cliArgs;
  }, roadmapSyncSchema),
  command(inventoryFor("archive_change"), (args) => ["archive", String(args.change)], changeSchema),
  command(inventoryFor("harness_start"), (args) => {
    const cliArgs = ["harness-start"];
    if (typeof args.environment === "string") cliArgs.push("--environment", args.environment);
    if (Array.isArray(args.components)) {
      for (const component of args.components) cliArgs.push("--component", String(component));
    }
    if (args.confirm === true) cliArgs.push("--confirm");
    return cliArgs;
  }, harnessLifecycleSchema),
  command(inventoryFor("harness_stop"), (args) => {
    const cliArgs = ["harness-stop"];
    if (args.confirm === true) cliArgs.push("--confirm");
    return cliArgs;
  }, harnessStopSchema),
  command(inventoryFor("harness_session_create"), (args) => ["harness-session", "create", String(args.session)], harnessSessionCreateSchema),
];

export const MCP_TOOL_DEFINITIONS: McpToolDefinition[] = [
  ...READ_ONLY_TOOL_DEFINITIONS,
  ...MUTATING_TOOL_DEFINITIONS,
];

export function createReadOnlyToolInventory(): McpCapabilityInventory["tools"] {
  return MCP_READ_ONLY_TOOL_INVENTORY;
}

export function createMutatingToolInventory(): McpCapabilityInventory["tools"] {
  return MCP_MUTATING_TOOL_INVENTORY;
}

function findCliEntrypoint(): string | null {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(moduleDir, "strict-spec-driven.js"),
    path.join(moduleDir, "..", "strict-spec-cli.js"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

export const defaultStrictCliCommandRunner: StrictCliCommandRunner = (args, options) => {
  const cliEntrypoint = findCliEntrypoint();
  const executable = cliEntrypoint ? process.execPath : "strict-spec-driven";
  const commandArgs = cliEntrypoint ? [cliEntrypoint, ...args] : args;
  const result = spawnSync(executable, commandArgs, {
    cwd: options.cwd,
    encoding: "utf8",
  });
  return {
    status: typeof result.status === "number" ? result.status : 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
};

function parseJsonOrNull(stdout: string): unknown | null {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

export async function callReadOnlyTool(
  name: string,
  args: ReadToolArgs,
  options: {
    projectRoot: string;
    runner?: StrictCliCommandRunner;
  },
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const definition = READ_ONLY_TOOL_DEFINITIONS.find((candidate) => candidate.name === name);
  if (!definition) {
    throw new Error(`unknown read-only MCP tool '${name}'`);
  }
  return callStrictTool(definition, args, options);
}

export async function callMutatingTool(
  name: string,
  args: ReadToolArgs,
  options: {
    projectRoot: string;
    runner?: StrictCliCommandRunner;
  },
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const definition = MUTATING_TOOL_DEFINITIONS.find((candidate) => candidate.name === name);
  if (!definition) {
    throw new Error(`unknown mutating MCP tool '${name}'`);
  }
  return callStrictTool(definition, args, options);
}

async function callStrictTool(
  definition: McpToolDefinition,
  args: ReadToolArgs,
  options: {
    projectRoot: string;
    runner?: StrictCliCommandRunner;
  },
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const parsed = definition.inputSchema.safeParse(args);
  if (!parsed.success) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: definition.name,
          command: definition.cliCommand,
          args: [],
          safety: definition.safety,
          mutates: definition.mutates,
          status: 1,
          stdout: "",
          stderr: parsed.error.message,
          parsedJson: null,
        }),
      }],
    };
  }
  const cliArgs = definition.toCliArgs(parsed.data as ReadToolArgs);
  const result = (options.runner ?? defaultStrictCliCommandRunner)(cliArgs, { cwd: options.projectRoot });
  const envelope = {
    tool: definition.name,
    command: definition.cliCommand,
    args: cliArgs.slice(1),
    safety: definition.safety,
    mutates: definition.mutates,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    parsedJson: parseJsonOrNull(result.stdout),
  };
  return {
    content: [{ type: "text", text: JSON.stringify(envelope) }],
  };
}

export function registerReadOnlyTools(
  server: McpServer,
  projectRoot: string,
  runner?: StrictCliCommandRunner,
): void {
  for (const definition of READ_ONLY_TOOL_DEFINITIONS) {
    registerToolDefinition(server, definition, projectRoot, runner);
  }
}

export function registerMutatingTools(
  server: McpServer,
  projectRoot: string,
  runner?: StrictCliCommandRunner,
): void {
  for (const definition of MUTATING_TOOL_DEFINITIONS) {
    registerToolDefinition(server, definition, projectRoot, runner);
  }
}

function registerToolDefinition(
  server: McpServer,
  definition: McpToolDefinition,
  projectRoot: string,
  runner?: StrictCliCommandRunner,
): void {
  server.registerTool(
    definition.name,
    {
      description: definition.description,
      inputSchema: definition.inputSchema,
      _meta: {
        safety: definition.safety,
        mutates: definition.mutates,
        cliCommand: definition.cliCommand,
      },
    },
    async (args) => callStrictTool(definition, args as ReadToolArgs, { projectRoot, runner }),
  );
}
