import { spawn, type ChildProcess } from "child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { request } from "http";
import net from "net";
import os from "os";
import path from "path";
import { TestContext, cli } from "../support/harness.js";

function createWorkspace(
  devSessionContent?: string,
  files: Record<string, string> = {},
): { workspaceRoot: string; cleanup: () => void } {
  const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "strict-dev-session-trial-"));
  mkdirSync(path.join(workspaceRoot, ".strict-spec-driven"), { recursive: true });
  if (devSessionContent !== undefined) {
    writeFileSync(path.join(workspaceRoot, ".strict-spec-driven", "dev-session.yaml"), devSessionContent, "utf8");
  }
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(workspaceRoot, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content, "utf8");
  }
  return {
    workspaceRoot,
    cleanup: () => rmSync(workspaceRoot, { recursive: true, force: true }),
  };
}

function buildDevSessionDeclaration(command: string, port: number): string {
  return [
    "schema: strict-spec-driven/dev-session/v1",
    "schema_version: 1",
    "artifact_type: dev_session",
    "schema_file: ../../templates/strict-spec-driven/schemas/dev-session.yaml",
    "session:",
    "  id: local-web-app",
    "  description: Local trial test session.",
    "  services:",
    "    web:",
    `      command: ${command}`,
    "      working_directory: \".\"",
    "      environment:",
    "        required:",
    "          - PORT",
    "        optional: []",
    `      urls:\n        - \"http://127.0.0.1:${port}\"`,
    `      ports:\n        - ${port}`,
    "      readiness:",
    "        type: http",
    `        url: \"http://127.0.0.1:${port}/health\"`,
    "        timeout_seconds: 5",
    "        interval_seconds: 1",
    "      browser_targets:",
    "        - home",
    "      cleanup:",
    "        mode: signal",
    "        signal: SIGTERM",
    "        grace_period_seconds: 2",
    "      unavailable_conditions:",
    "        - Install dependencies before starting the session.",
    "  browser_targets:",
    "    home:",
    `      url: \"http://127.0.0.1:${port}\"`,
    "      smoke_paths:",
    "        - /",
    "      evidence_labels:",
    "        - homepage-loaded",
    "      local_only: true",
    "      service: web",
    "      notes:",
    "        - Confirm the page renders without console errors.",
    "",
  ].join("\n");
}

async function reservePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address !== "object") {
        reject(new Error("failed to determine reserved port"));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function waitForHttpReady(url: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() <= deadline) {
    const ready = await new Promise<boolean>((resolve) => {
      const req = request(url, { method: "GET" }, (res) => {
        const status = typeof res.statusCode === "number" ? res.statusCode : 0;
        res.resume();
        resolve(status >= 200 && status < 400);
      });
      req.on("error", () => resolve(false));
      req.end();
    });
    if (ready) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for ${url}`);
}

async function waitForChildExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    child.once("exit", () => resolve());
    child.once("error", reject);
  });
}

async function startExternalServer(port: number): Promise<{ close: () => Promise<void> }> {
  const script = [
    "const http = require('http');",
    "const port = Number(process.argv[1]);",
    "const server = http.createServer((req, res) => {",
    "  res.writeHead(200, { 'content-type': 'text/plain' });",
    "  res.end(req.url === '/health' ? 'ok' : 'hello');",
    "});",
    "server.listen(port, '127.0.0.1');",
    "process.on('SIGTERM', () => server.close(() => process.exit(0)));",
    "process.on('SIGINT', () => server.close(() => process.exit(0)));",
    "setInterval(() => {}, 1000);",
  ].join("");
  const child = spawn(process.execPath, ["-e", script, String(port)], { stdio: "ignore" });
  await waitForHttpReady(`http://127.0.0.1:${port}/health`);
  return {
    close: async () => {
      child.kill("SIGTERM");
      await waitForChildExit(child);
    },
  };
}

export async function runDevSessionTrialSuite(context: TestContext): Promise<void> {
  context.section("[4a] dev-session-trial command");

  const missingWorkspace = createWorkspace();
  try {
    const missingResult = cli(["dev-session-trial"], { cwd: missingWorkspace.workspaceRoot });
    context.assert(missingResult.status !== 0, "dev-session-trial exits non-zero when the declaration is missing", missingResult.stderr.trim());
    const missingJson = JSON.parse(missingResult.stdout.trim()) as {
      ok: boolean;
      diagnostics: Array<{ source: string; phase?: string; actual?: string }>;
    };
    context.assert(
      missingJson.ok === false
        && missingJson.diagnostics[0]?.source === "filesystem"
        && missingJson.diagnostics[0]?.phase === "declaration"
        && missingJson.diagnostics[0]?.actual === "missing",
      "dev-session-trial reports declaration diagnostics when dev-session.yaml is missing",
      missingResult.stdout.trim(),
    );
  } finally {
    missingWorkspace.cleanup();
  }

  const unavailablePort = await reservePort();
  const unavailableWorkspace = createWorkspace(buildDevSessionDeclaration("node dev-server.cjs", unavailablePort));
  try {
    const unavailableResult = cli(["dev-session-trial"], { cwd: unavailableWorkspace.workspaceRoot });
    context.assert(unavailableResult.status === 0, "dev-session-trial exits zero when it reports unavailable targets", unavailableResult.stderr.trim());
    context.assert(unavailableResult.stderr.length === 0, "dev-session-trial keeps stderr empty for JSON output", unavailableResult.stderr.trim());
    const unavailableJson = JSON.parse(unavailableResult.stdout.trim()) as {
      ok: boolean;
      runtimeStatePath: string;
      browserTargets: Array<{ id: string; provenance: string; trialReady: boolean }>;
    };
    context.assert(
      unavailableJson.ok === true
        && unavailableJson.runtimeStatePath === ".strict-spec-driven/.runtime/dev-session/state.json"
        && unavailableJson.browserTargets[0]?.id === "home"
        && unavailableJson.browserTargets[0]?.provenance === "unavailable"
        && unavailableJson.browserTargets[0]?.trialReady === false,
      "dev-session-trial reports deterministic unavailable guidance without managed runtime state",
      unavailableResult.stdout.trim(),
    );
  } finally {
    unavailableWorkspace.cleanup();
  }

  const externalPort = await reservePort();
  const externalServer = await startExternalServer(externalPort);
  const externalWorkspace = createWorkspace(buildDevSessionDeclaration("node dev-server.cjs", externalPort));
  try {
    const externalResult = cli(["dev-session-trial"], { cwd: externalWorkspace.workspaceRoot });
    context.assert(externalResult.status === 0, "dev-session-trial exits zero for already-available targets", externalResult.stderr.trim());
    const externalJson = JSON.parse(externalResult.stdout.trim()) as {
      ok: boolean;
      browserTargets: Array<{ provenance: string; trialReady: boolean; managedServiceStatus?: string }>;
    };
    context.assert(
      externalJson.ok === true
        && externalJson.browserTargets[0]?.provenance === "already_available"
        && externalJson.browserTargets[0]?.trialReady === true
        && externalJson.browserTargets[0]?.managedServiceStatus === undefined,
      "dev-session-trial reports externally available browser targets without claiming strict-managed provenance",
      externalResult.stdout.trim(),
    );
  } finally {
    await externalServer.close();
    externalWorkspace.cleanup();
  }

  const managedPort = await reservePort();
  const managedWorkspace = createWorkspace(
    buildDevSessionDeclaration("node dev-server.cjs", managedPort),
    {
      "dev-server.cjs": [
        "const http = require('http');",
        "const port = Number(process.env.PORT);",
        "const server = http.createServer((req, res) => {",
        "  res.writeHead(200, { 'content-type': 'text/plain' });",
        "  res.end(req.url === '/health' ? 'ok' : 'hello');",
        "});",
        "server.listen(port, '127.0.0.1');",
        "process.on('SIGTERM', () => server.close(() => process.exit(0)));",
        "process.on('SIGINT', () => server.close(() => process.exit(0)));",
        "setInterval(() => {}, 1000);",
        "",
      ].join("\n"),
    },
  );
  const managedEnv = { ...process.env, PORT: String(managedPort) };
  try {
    const startResult = cli(["dev-session-start"], { cwd: managedWorkspace.workspaceRoot, env: managedEnv });
    context.assert(startResult.status === 0, "dev-session-start succeeds for the managed browser-trial fixture", startResult.stderr.trim());
    const managedResult = cli(["dev-session-trial"], { cwd: managedWorkspace.workspaceRoot, env: managedEnv });
    context.assert(managedResult.status === 0, "dev-session-trial exits zero for strict-managed services", managedResult.stderr.trim());
    const managedJson = JSON.parse(managedResult.stdout.trim()) as {
      ok: boolean;
      browserTargets: Array<{ provenance: string; trialReady: boolean; managedServiceStatus?: string }>;
    };
    context.assert(
      managedJson.ok === true
        && managedJson.browserTargets[0]?.provenance === "started_by_strict"
        && managedJson.browserTargets[0]?.trialReady === true
        && managedJson.browserTargets[0]?.managedServiceStatus === "running",
      "dev-session-trial reports strict-managed provenance and running state after dev-session-start",
      managedResult.stdout.trim(),
    );
  } finally {
    cli(["dev-session-stop"], { cwd: managedWorkspace.workspaceRoot, env: managedEnv });
    managedWorkspace.cleanup();
  }
}
