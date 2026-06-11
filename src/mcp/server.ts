import { existsSync, statSync } from "fs";
import path from "path";
import { McpServer, StdioServerTransport, type Transport } from "@modelcontextprotocol/server";
import { MCP_INVENTORY, type McpCapabilityInventory } from "./inventory.js";
import { registerStrictPrompts } from "./prompts.js";
import { registerStrictResources } from "./resources.js";
import { registerMutatingTools, registerReadOnlyTools, type StrictCliCommandRunner } from "./tools.js";
import { formatSharedSchemaCacheWarning, synchronizeSharedSchemaCache } from "../shared-schema-cache.js";

export class McpStartupError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "McpStartupError";
    this.code = code;
  }
}

export type ParsedMcpArgs = {
  projectRoot: string;
};

export type StrictMcpServerContext = {
  projectRoot: string;
  inventory: McpCapabilityInventory;
  server: McpServer;
};

export function parseMcpServerArgs(argv: string[], cwd = process.cwd()): ParsedMcpArgs {
  const projectIndex = argv.indexOf("--project");
  if (projectIndex === -1) {
    throw new McpStartupError("missing_project", "Missing required argument: --project <path>");
  }

  const rawProject = argv[projectIndex + 1];
  if (!rawProject || rawProject.startsWith("--")) {
    throw new McpStartupError("missing_project", "Missing required argument: --project <path>");
  }

  return {
    projectRoot: validateProjectRoot(path.resolve(cwd, rawProject)),
  };
}

export function validateProjectRoot(projectRoot: string): string {
  if (!existsSync(projectRoot)) {
    throw new McpStartupError("invalid_project", `Invalid project root: ${projectRoot} does not exist`);
  }
  if (!statSync(projectRoot).isDirectory()) {
    throw new McpStartupError("invalid_project", `Invalid project root: ${projectRoot} is not a directory`);
  }
  return projectRoot;
}

export function createStrictMcpServer(
  projectRoot: string,
  inventory = MCP_INVENTORY,
  runner?: StrictCliCommandRunner,
): StrictMcpServerContext {
  const server = new McpServer(inventory.server);
  registerStrictResources(server, projectRoot);
  registerReadOnlyTools(server, projectRoot, runner);
  registerMutatingTools(server, projectRoot, runner);
  registerStrictPrompts(server);
  return {
    projectRoot,
    inventory,
    server,
  };
}

export async function connectStrictMcpServer(
  context: StrictMcpServerContext,
  transport: Transport = new StdioServerTransport(),
): Promise<void> {
  await context.server.connect(transport);
}

export function formatMcpStartupError(error: unknown): string {
  if (error instanceof McpStartupError) {
    return JSON.stringify({ valid: false, code: error.code, message: error.message });
  }
  const message = error instanceof Error ? error.message : String(error);
  return JSON.stringify({ valid: false, code: "startup_error", message });
}

export async function runMcpServer(
  argv: string[],
  connect: (context: StrictMcpServerContext) => Promise<void> = connectStrictMcpServer,
): Promise<void> {
  const args = parseMcpServerArgs(argv);
  try {
    synchronizeSharedSchemaCache();
  } catch (error) {
    process.stderr.write(`Warning: ${formatSharedSchemaCacheWarning(error)}\n`);
  }
  const context = createStrictMcpServer(args.projectRoot);
  await connect(context);
}
