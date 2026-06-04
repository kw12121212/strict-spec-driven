import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { TestContext, cli, loadDistModule } from "../support/harness.js";

type ServerInvocation = { command: string; args: string[] };
type ClientRegistrationResult = { client: string; status: string; target?: string; detail?: string };

type McpInstallModule = {
  MCP_INSTALL_CLIENTS: readonly string[];
  DEFAULT_ENTRY_NAME: string;
  parseMcpInstallArgs(argv: string[]):
    | { ok: true; value: { clients: string[]; scope: string; entryName: string; projectRoot?: string; configPath?: string } }
    | { ok: false; error: string };
  buildServerInvocation(entrypointPath: string, projectRoot: string): ServerInvocation;
  resolveMcpEntrypointPath(packageRoot: string): string;
  mergeMcpServersConfig(existing: Record<string, unknown>, name: string, invocation: ServerInvocation): string;
  mergeOpencodeConfig(existing: Record<string, unknown>, name: string, invocation: ServerInvocation): string;
  mergeCopilotConfig(existing: Record<string, unknown>, name: string, invocation: ServerInvocation): string;
  resolveFileClientTarget(
    client: "opencode" | "copilot" | "json",
    scope: "project" | "user",
    projectRoot: string,
    configPath?: string,
  ): { ok: true; path: string } | { ok: false; error: string };
  registerClient(
    client: string,
    options: { scope: string; entryName: string; projectRoot: string; entrypointPath: string; configPath?: string },
    deps: { hasCommand: (command: string) => boolean; runCli: (command: string, args: string[]) => void },
  ): ClientRegistrationResult;
};

export async function runMcpInstallSuite(context: TestContext): Promise<void> {
  const mod = await loadDistModule<McpInstallModule>("cli/cmd-mcp-install.js");
  const invocation: ServerInvocation = { command: "node", args: ["/pkg/dist/scripts/strict-spec-driven-mcp.js", "--project", "/proj"] };

  context.section("[mcp-install] argument parsing");

  const defaults = mod.parseMcpInstallArgs(["--client", "json"]);
  context.assert(defaults.ok === true, "parse accepts a single client");
  if (defaults.ok) {
    context.assert(defaults.value.scope === "project", "scope defaults to project");
    context.assert(defaults.value.entryName === mod.DEFAULT_ENTRY_NAME, "entry name defaults to strict-spec-driven");
    context.assert(defaults.value.clients.join(",") === "json", "selected client is recorded");
  }

  const all = mod.parseMcpInstallArgs(["--client", "all"]);
  context.assert(
    all.ok === true && all.value.clients.join(",") === "claude-code,codex,opencode,copilot" && !all.value.clients.includes("json"),
    "all expands to the concrete named clients and excludes json",
  );

  const repeated = mod.parseMcpInstallArgs(["--client", "opencode", "--client", "copilot", "--client", "opencode"]);
  context.assert(
    repeated.ok === true && repeated.value.clients.join(",") === "opencode,copilot",
    "repeatable --client dedupes while preserving order",
  );

  const overrides = mod.parseMcpInstallArgs(["--client", "json", "--scope", "user", "--name", "alt-name"]);
  context.assert(
    overrides.ok === true && overrides.value.scope === "user" && overrides.value.entryName === "alt-name",
    "scope and name overrides are honored",
  );

  const unknownClient = mod.parseMcpInstallArgs(["--client", "bogus"]);
  context.assert(unknownClient.ok === false, "unknown client is rejected");

  const badScope = mod.parseMcpInstallArgs(["--client", "json", "--scope", "global"]);
  context.assert(badScope.ok === false, "unsupported scope is rejected");

  const badName = mod.parseMcpInstallArgs(["--client", "json", "--name", "bad name"]);
  context.assert(badName.ok === false, "invalid entry name is rejected");

  const noClient = mod.parseMcpInstallArgs(["--scope", "user"]);
  context.assert(noClient.ok === false, "missing --client is rejected");

  context.section("[mcp-install] entrypoint and invocation resolution");

  const entrypoint = mod.resolveMcpEntrypointPath("/pkg");
  context.assert(
    entrypoint === path.join("/pkg", "dist", "scripts", "strict-spec-driven-mcp.js"),
    "entrypoint resolves under dist/scripts",
  );
  const built = mod.buildServerInvocation(entrypoint, "/proj");
  context.assert(
    built.command === "node" && built.args[0] === entrypoint && built.args.includes("--project") && built.args.includes("/proj"),
    "server invocation carries node, the entrypoint, and the project root",
  );

  context.section("[mcp-install] native-format idempotent merges");

  const genericFirst = mod.mergeMcpServersConfig({ mcpServers: { other: { command: "x" } }, keep: 1 }, "strict-spec-driven", invocation);
  const genericParsed = JSON.parse(genericFirst) as Record<string, any>;
  context.assert(genericParsed.keep === 1 && genericParsed.mcpServers.other !== undefined, "generic merge preserves unrelated fields and entries");
  context.assert(genericParsed.mcpServers["strict-spec-driven"].command === "node", "generic merge writes the strict-spec-driven entry");
  const genericSecond = mod.mergeMcpServersConfig(genericParsed, "strict-spec-driven", invocation);
  context.assert(
    Object.keys((JSON.parse(genericSecond) as any).mcpServers).length === 2,
    "generic merge is idempotent across repeated runs",
  );

  const opencodeMerged = JSON.parse(mod.mergeOpencodeConfig({}, "strict-spec-driven", invocation)) as any;
  context.assert(
    opencodeMerged.mcp["strict-spec-driven"].type === "local" && Array.isArray(opencodeMerged.mcp["strict-spec-driven"].command),
    "opencode merge uses the mcp key with a local command array",
  );

  const copilotMerged = JSON.parse(mod.mergeCopilotConfig({}, "strict-spec-driven", invocation)) as any;
  context.assert(
    copilotMerged.servers["strict-spec-driven"].type === "stdio" && copilotMerged.servers["strict-spec-driven"].command === "node",
    "copilot merge uses the servers key with a stdio command",
  );

  context.section("[mcp-install] file client target resolution");

  const jsonNoConfig = mod.resolveFileClientTarget("json", "project", "/proj");
  context.assert(jsonNoConfig.ok === false, "json target requires --config");
  const jsonWithConfig = mod.resolveFileClientTarget("json", "project", "/proj", "out/custom.json");
  context.assert(jsonWithConfig.ok === true && path.isAbsolute(jsonWithConfig.path), "json target resolves --config to an absolute path");
  const opencodeProject = mod.resolveFileClientTarget("opencode", "project", "/proj");
  context.assert(opencodeProject.ok === true && opencodeProject.path === path.join("/proj", "opencode.json"), "opencode project target is project-local");
  const copilotProject = mod.resolveFileClientTarget("copilot", "project", "/proj");
  context.assert(
    copilotProject.ok === true && copilotProject.path === path.join("/proj", ".vscode", "mcp.json"),
    "copilot project target is .vscode/mcp.json",
  );

  context.section("[mcp-install] client registration");

  const workdir = mkdtempSync(path.join(os.tmpdir(), "strict-mcp-install-"));
  try {
    const configFile = path.join(workdir, "client.json");
    writeFileSync(configFile, JSON.stringify({ mcpServers: { existing: { command: "keep" } } }, null, 2));
    const okDeps = { hasCommand: () => true, runCli: () => undefined };

    const jsonResult = mod.registerClient(
      "json",
      { scope: "project", entryName: "strict-spec-driven", projectRoot: workdir, entrypointPath: "/pkg/dist/scripts/strict-spec-driven-mcp.js", configPath: configFile },
      okDeps,
    );
    context.assert(jsonResult.status === "registered" && jsonResult.target === configFile, "json client registration writes to the config path");
    const afterFirst = JSON.parse(readFileSync(configFile, "utf8")) as any;
    context.assert(afterFirst.mcpServers.existing !== undefined, "json registration preserves the existing entry");

    mod.registerClient(
      "json",
      { scope: "project", entryName: "strict-spec-driven", projectRoot: workdir, entrypointPath: "/pkg/dist/scripts/strict-spec-driven-mcp.js", configPath: configFile },
      okDeps,
    );
    const afterSecond = JSON.parse(readFileSync(configFile, "utf8")) as any;
    context.assert(Object.keys(afterSecond.mcpServers).length === 2, "repeated json registration stays idempotent");

    const captured: Array<{ command: string; args: string[] }> = [];
    const claudeResult = mod.registerClient(
      "claude-code",
      { scope: "user", entryName: "strict-spec-driven", projectRoot: workdir, entrypointPath: "/pkg/dist/scripts/strict-spec-driven-mcp.js" },
      { hasCommand: () => true, runCli: (command, args) => captured.push({ command, args }) },
    );
    context.assert(claudeResult.status === "registered" && claudeResult.target === "claude (user)", "claude-code delegates to the claude CLI");
    const addCall = captured.find((call) => call.args.includes("add"));
    context.assert(
      addCall !== undefined && addCall.command === "claude" && addCall.args.includes("--scope") && addCall.args.includes("user"),
      "claude registration passes the resolved scope to the CLI",
    );

    const skipped = mod.registerClient(
      "codex",
      { scope: "project", entryName: "strict-spec-driven", projectRoot: workdir, entrypointPath: "/pkg/dist/scripts/strict-spec-driven-mcp.js" },
      { hasCommand: () => false, runCli: () => undefined },
    );
    context.assert(skipped.status === "skipped" && (skipped.detail ?? "").includes("codex"), "missing client CLI is skipped with a diagnostic");
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }

  context.section("[mcp-install] command surface");

  const noArgs = cli(["mcp-install"]);
  context.assert(noArgs.status !== 0 && noArgs.stderr.includes("Usage:"), "mcp-install with no args prints usage to stderr");
  const bogus = cli(["mcp-install", "--client", "bogus"]);
  context.assert(bogus.status === 1 && bogus.stderr.includes("unsupported client"), "mcp-install rejects an unsupported client");
  const help = cli(["mcp-install", "--help"]);
  context.assert(help.status === 0 && help.stdout.includes("Usage:"), "mcp-install help prints usage to stdout");
}
