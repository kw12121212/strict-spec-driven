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
const optionalArtifactKindSchema = z.strictObject({ artifactKind: z.string().min(1).optional() });
const confirmField = { confirm: z.boolean().optional() };
const confirmSchema = z.strictObject({ ...confirmField });
const changeConfirmSchema = z.strictObject({ change: z.string().min(1), ...confirmField });
const generateArtifactSchema = z.strictObject({
  change: z.string().min(1),
  artifact: z.enum(["proposal", "design", "questions", "delta-spec", "delta-tech"]),
  args: z.array(z.string().min(1)).optional(),
  ...confirmField,
});
const roadmapSyncSchema = z.strictObject({
  materializePlannedChanges: z.boolean().optional(),
  ...confirmField,
});
const artifactAuthorSchema = z.strictObject({
  args: z.array(z.string().min(1)).min(1),
  ...confirmField,
});
const liveArtifactAuthorSchema = z.strictObject({
  id: z.string().min(1),
  args: z.array(z.string().min(1)).min(1),
  ...confirmField,
});
const sceneStatusSchema = z.strictObject({
  area: z.string().min(1).optional(),
  scene: z.string().min(1).optional(),
});

type ReadToolArgs = Record<string, unknown>;

export type McpToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

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
  command(inventoryFor("yaml_authoring_protocol"), (args) => {
    const cliArgs = ["yaml-authoring-protocol"];
    if (typeof args.artifactKind === "string") cliArgs.push(args.artifactKind);
    return cliArgs;
  }, optionalArtifactKindSchema),
  command(inventoryFor("tech_status"), () => ["tech-status"]),
  command(inventoryFor("scene_status"), (args) => {
    const cliArgs = ["scene-status"];
    if (typeof args.area === "string") cliArgs.push("--area", args.area);
    if (typeof args.scene === "string") cliArgs.push("--scene", args.scene);
    return cliArgs;
  }, sceneStatusSchema),
];

export const MUTATING_TOOL_DEFINITIONS: McpToolDefinition[] = [
  command(inventoryFor("init_workflow"), () => ["init"], confirmSchema),
  command(inventoryFor("config_edit"), (args) => [
    "config-edit",
    ...(Array.isArray(args.args) ? args.args.map(String) : []),
  ], artifactAuthorSchema),
  command(inventoryFor("propose_change"), (args) => ["propose", String(args.change)], changeConfirmSchema),
  command(inventoryFor("generate_change_artifact"), (args) => [
    "generate",
    String(args.change),
    String(args.artifact),
    ...(Array.isArray(args.args) ? args.args.map(String) : []),
  ], generateArtifactSchema),
  command(inventoryFor("spec_edit"), (args) => [
    "spec-edit",
    String(args.id),
    ...(Array.isArray(args.args) ? args.args.map(String) : []),
  ], liveArtifactAuthorSchema),
  command(inventoryFor("tech_edit"), (args) => [
    "tech-edit",
    String(args.id),
    ...(Array.isArray(args.args) ? args.args.map(String) : []),
  ], liveArtifactAuthorSchema),
  command(inventoryFor("scene_edit"), (args) => [
    "scene-edit",
    String(args.id),
    ...(Array.isArray(args.args) ? args.args.map(String) : []),
  ], liveArtifactAuthorSchema),
  command(inventoryFor("mark_next_task_complete"), (args) => ["apply", String(args.change)], changeConfirmSchema),
  command(inventoryFor("cancel_change"), (args) => ["cancel", String(args.change)], changeConfirmSchema),
  command(inventoryFor("architecture_edit"), (args) => ["architecture-edit", ...(Array.isArray(args.args) ? args.args.map(String) : [])], artifactAuthorSchema),
  command(inventoryFor("design_edit"), (args) => ["design-edit", ...(Array.isArray(args.args) ? args.args.map(String) : [])], artifactAuthorSchema),
  command(inventoryFor("roadmap_sync"), (args) => {
    const cliArgs = ["roadmap-sync"];
    if (args.materializePlannedChanges === true) cliArgs.push("--materialize-planned-changes");
    return cliArgs;
  }, roadmapSyncSchema),
  command(inventoryFor("archive_change"), (args) => ["archive", String(args.change)], changeConfirmSchema),
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
  const executable = cliEntrypoint ? process.execPath : "strict-spec-cli";
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
): Promise<McpToolResult> {
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
): Promise<McpToolResult> {
  const definition = MUTATING_TOOL_DEFINITIONS.find((candidate) => candidate.name === name);
  if (!definition) {
    throw new Error(`unknown mutating MCP tool '${name}'`);
  }
  return callStrictTool(definition, args, options);
}

function toolErrorResult(definition: McpToolDefinition, stderr: string): McpToolResult {
  return errorOrEnvelope(definition, [], { status: 1, stdout: "", stderr }, true);
}

function errorOrEnvelope(
  definition: McpToolDefinition,
  cliArgs: string[],
  result: StrictCliCommandResult,
  isError: boolean,
): McpToolResult {
  const envelope = {
    tool: definition.name,
    command: definition.cliCommand,
    args: cliArgs,
    safety: definition.safety,
    mutates: definition.mutates,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    parsedJson: parseJsonOrNull(result.stdout),
  };
  const wrapped: McpToolResult = {
    content: [{ type: "text", text: JSON.stringify(envelope) }],
  };
  if (isError) wrapped.isError = true;
  return wrapped;
}

async function callStrictTool(
  definition: McpToolDefinition,
  args: ReadToolArgs,
  options: {
    projectRoot: string;
    runner?: StrictCliCommandRunner;
  },
): Promise<McpToolResult> {
  const parsed = definition.inputSchema.safeParse(args);
  if (!parsed.success) {
    return toolErrorResult(definition, parsed.error.message);
  }
  const data = parsed.data as ReadToolArgs;
  if (definition.mutates && data.confirm !== true) {
    return toolErrorResult(
      definition,
      `confirmation required: call ${definition.name} with confirm: true to authorize this ${definition.safety}-class mutation`,
    );
  }
  const cliArgs = definition.toCliArgs(data);
  const result = (options.runner ?? defaultStrictCliCommandRunner)(cliArgs, { cwd: options.projectRoot });
  return errorOrEnvelope(definition, cliArgs.slice(1), result, result.status !== 0);
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
