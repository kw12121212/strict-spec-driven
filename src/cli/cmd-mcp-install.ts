import { execFileSync, execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { handleHelpRequest } from "./argv.js";
import { getCommandUsage } from "./command-metadata.js";
import { writeError, writeJson, writeUsage } from "./output.js";

export const MCP_INSTALL_CLIENTS = ["claude-code", "codex", "opencode", "copilot", "json"] as const;
export type McpInstallClient = (typeof MCP_INSTALL_CLIENTS)[number];

// `all` expands to the concrete named clients; `json` is excluded because it has
// no default target and requires an explicit --config path.
export const MCP_INSTALL_ALL_CLIENTS: readonly McpInstallClient[] = MCP_INSTALL_CLIENTS.filter((client) => client !== "json");

export const MCP_INSTALL_SCOPES = ["project", "user"] as const;
export type McpInstallScope = (typeof MCP_INSTALL_SCOPES)[number];

export const DEFAULT_ENTRY_NAME = "strict-spec-driven";
const ENTRY_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

const USAGE = getCommandUsage("mcp-install");

export type ParsedMcpInstallArgs = {
  clients: McpInstallClient[];
  scope: McpInstallScope;
  entryName: string;
  projectRoot?: string;
  configPath?: string;
};

export type ServerInvocation = {
  command: string;
  args: string[];
};

export type ClientRegistrationStatus = "registered" | "skipped" | "error";

export type ClientRegistrationResult = {
  client: McpInstallClient;
  status: ClientRegistrationStatus;
  target?: string;
  detail?: string;
};

export type RegistrationDeps = {
  hasCommand: (command: string) => boolean;
  runCli: (command: string, args: string[]) => void;
};

export function parseMcpInstallArgs(argv: string[]): { ok: true; value: ParsedMcpInstallArgs } | { ok: false; error: string } {
  const selected: McpInstallClient[] = [];
  let scope: McpInstallScope = "project";
  let entryName = DEFAULT_ENTRY_NAME;
  let projectRoot: string | undefined;
  let configPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const readValue = (): string | undefined => {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        return undefined;
      }
      index += 1;
      return value;
    };

    switch (flag) {
      case "--client": {
        const value = readValue();
        if (value === undefined) return { ok: false, error: "--client requires a value" };
        if (value === "all") {
          for (const client of MCP_INSTALL_ALL_CLIENTS) {
            if (!selected.includes(client)) selected.push(client);
          }
          break;
        }
        if (!(MCP_INSTALL_CLIENTS as readonly string[]).includes(value)) {
          return { ok: false, error: `unsupported client '${value}'; supported: ${MCP_INSTALL_CLIENTS.join(", ")}, all` };
        }
        if (!selected.includes(value as McpInstallClient)) selected.push(value as McpInstallClient);
        break;
      }
      case "--scope": {
        const value = readValue();
        if (value === undefined) return { ok: false, error: "--scope requires a value" };
        if (!(MCP_INSTALL_SCOPES as readonly string[]).includes(value)) {
          return { ok: false, error: `unsupported scope '${value}'; supported: ${MCP_INSTALL_SCOPES.join(", ")}` };
        }
        scope = value as McpInstallScope;
        break;
      }
      case "--name": {
        const value = readValue();
        if (value === undefined) return { ok: false, error: "--name requires a value" };
        if (!ENTRY_NAME_PATTERN.test(value)) {
          return { ok: false, error: `invalid --name '${value}'; use letters, digits, hyphens, or underscores` };
        }
        entryName = value;
        break;
      }
      case "--project": {
        const value = readValue();
        if (value === undefined) return { ok: false, error: "--project requires a value" };
        projectRoot = value;
        break;
      }
      case "--config": {
        const value = readValue();
        if (value === undefined) return { ok: false, error: "--config requires a value" };
        configPath = value;
        break;
      }
      default:
        return { ok: false, error: `unsupported argument '${flag}'` };
    }
  }

  if (selected.length === 0) {
    return { ok: false, error: "at least one --client is required" };
  }

  return { ok: true, value: { clients: selected, scope, entryName, projectRoot, configPath } };
}

export function resolvePackageRoot(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDir, "..", "..");
}

export function resolveMcpEntrypointPath(packageRoot: string): string {
  return path.join(packageRoot, "dist", "scripts", "strict-spec-driven-mcp.js");
}

export function buildServerInvocation(entrypointPath: string, projectRoot: string): ServerInvocation {
  return { command: "node", args: [entrypointPath, "--project", projectRoot] };
}

function parseExistingJsonObject(filePath: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (!existsSync(filePath)) {
    return { ok: true, value: {} };
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: `existing config at ${filePath} is not a JSON object` };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch (error) {
    return { ok: false, error: `failed to parse existing config at ${filePath}: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function mergeMcpServersConfig(existing: Record<string, unknown>, name: string, invocation: ServerInvocation): string {
  const root = { ...existing };
  const servers = { ...asObject(root.mcpServers) };
  servers[name] = { command: invocation.command, args: invocation.args };
  root.mcpServers = servers;
  return serializeJson(root);
}

export function mergeOpencodeConfig(existing: Record<string, unknown>, name: string, invocation: ServerInvocation): string {
  const root = { ...existing };
  const servers = { ...asObject(root.mcp) };
  servers[name] = { type: "local", command: [invocation.command, ...invocation.args], enabled: true };
  root.mcp = servers;
  return serializeJson(root);
}

export function mergeCopilotConfig(existing: Record<string, unknown>, name: string, invocation: ServerInvocation): string {
  const root = { ...existing };
  const servers = { ...asObject(root.servers) };
  servers[name] = { type: "stdio", command: invocation.command, args: invocation.args };
  root.servers = servers;
  return serializeJson(root);
}

function userConfigHome(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), ".config");
}

export function resolveFileClientTarget(
  client: "opencode" | "copilot" | "json",
  scope: McpInstallScope,
  projectRoot: string,
  configPath?: string,
): { ok: true; path: string } | { ok: false; error: string } {
  if (client === "json") {
    if (!configPath) {
      return { ok: false, error: "client 'json' requires --config <path>" };
    }
    return { ok: true, path: path.resolve(configPath) };
  }
  if (client === "opencode") {
    return {
      ok: true,
      path: scope === "user" ? path.join(userConfigHome(), "opencode", "opencode.json") : path.join(projectRoot, "opencode.json"),
    };
  }
  return {
    ok: true,
    path: scope === "user" ? path.join(userConfigHome(), "Code", "User", "mcp.json") : path.join(projectRoot, ".vscode", "mcp.json"),
  };
}

function registerFileClient(
  client: "opencode" | "copilot" | "json",
  targetPath: string,
  name: string,
  invocation: ServerInvocation,
): ClientRegistrationResult {
  const existing = parseExistingJsonObject(targetPath);
  if (!existing.ok) {
    return { client, status: "error", detail: existing.error };
  }
  let content: string;
  if (client === "opencode") {
    content = mergeOpencodeConfig(existing.value, name, invocation);
  } else if (client === "copilot") {
    content = mergeCopilotConfig(existing.value, name, invocation);
  } else {
    content = mergeMcpServersConfig(existing.value, name, invocation);
  }
  try {
    mkdirSync(path.dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, content);
  } catch (error) {
    return { client, status: "error", detail: `failed to write ${targetPath}: ${error instanceof Error ? error.message : String(error)}` };
  }
  return { client, status: "registered", target: targetPath };
}

function registerCliClient(
  client: "claude-code" | "codex",
  scope: McpInstallScope,
  name: string,
  invocation: ServerInvocation,
  deps: RegistrationDeps,
): ClientRegistrationResult {
  const cli = client === "claude-code" ? "claude" : "codex";
  if (!deps.hasCommand(cli)) {
    return { client, status: "skipped", detail: `${cli} CLI not found on PATH; install it to register ${client}` };
  }
  const addArgs =
    client === "claude-code"
      ? ["mcp", "add", name, "--scope", scope, "--", invocation.command, ...invocation.args]
      : ["mcp", "add", name, "--", invocation.command, ...invocation.args];
  try {
    // Best-effort removal keeps repeated runs idempotent; a missing entry is not an error.
    try {
      deps.runCli(cli, ["mcp", "remove", name]);
    } catch {
      // entry did not exist yet
    }
    deps.runCli(cli, addArgs);
  } catch (error) {
    return { client, status: "error", detail: `${cli} mcp add failed: ${error instanceof Error ? error.message : String(error)}` };
  }
  return { client, status: "registered", target: `${cli} (${scope})` };
}

export function registerClient(
  client: McpInstallClient,
  options: { scope: McpInstallScope; entryName: string; projectRoot: string; entrypointPath: string; configPath?: string },
  deps: RegistrationDeps,
): ClientRegistrationResult {
  const invocation = buildServerInvocation(options.entrypointPath, options.projectRoot);
  if (client === "claude-code" || client === "codex") {
    return registerCliClient(client, options.scope, options.entryName, invocation, deps);
  }
  const target = resolveFileClientTarget(client, options.scope, options.projectRoot, options.configPath);
  if (!target.ok) {
    return { client, status: "error", detail: target.error };
  }
  return registerFileClient(client, target.path, options.entryName, invocation);
}

function commandExists(command: string): boolean {
  const probe = process.platform === "win32" ? "where" : "command";
  const args = process.platform === "win32" ? [command] : ["-v", command];
  try {
    execFileSync(probe, args, { stdio: "ignore", shell: process.platform === "win32" ? false : true });
    return true;
  } catch {
    return false;
  }
}

const DEFAULT_DEPS: RegistrationDeps = {
  hasCommand: commandExists,
  runCli: (command, args) => {
    execFileSync(command, args, { stdio: "pipe" });
  },
};

export function buildProject(packageRoot: string): { ok: true } | { ok: false; error: string } {
  if (process.env.STRICT_SPEC_MCP_INSTALL_SKIP_BUILD === "1") {
    return { ok: true };
  }
  try {
    execSync("bun run build", { cwd: packageRoot, stdio: "pipe" });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: `project build failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export function runMcpInstall(argv: string[], deps: RegistrationDeps = DEFAULT_DEPS): number {
  if (handleHelpRequest("mcp-install", argv)) {
    return 0;
  }

  const parsed = parseMcpInstallArgs(argv);
  if (!parsed.ok) {
    writeError(parsed.error);
    writeUsage(USAGE);
    return 1;
  }

  const projectRoot = path.resolve(parsed.value.projectRoot ?? process.cwd());
  if (!existsSync(projectRoot) || !statSync(projectRoot).isDirectory()) {
    writeError(`project root '${projectRoot}' is not a directory`);
    return 1;
  }

  const packageRoot = resolvePackageRoot();
  const built = buildProject(packageRoot);
  if (!built.ok) {
    writeError(built.error);
    return 1;
  }

  const entrypointPath = resolveMcpEntrypointPath(packageRoot);

  const results = parsed.value.clients.map((client) =>
    registerClient(
      client,
      { scope: parsed.value.scope, entryName: parsed.value.entryName, projectRoot, entrypointPath, configPath: parsed.value.configPath },
      deps,
    ),
  );

  writeJson({
    entryName: parsed.value.entryName,
    scope: parsed.value.scope,
    projectRoot,
    entrypointPath,
    results,
  });

  return results.some((result) => result.status === "error") ? 1 : 0;
}
