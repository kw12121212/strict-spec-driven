import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import net from "net";
import os from "os";
import path from "path";
import { TestContext, cli } from "../support/harness.js";

function createWorkspace(
  devSessionContent: string,
  files: Record<string, string>,
): { workspaceRoot: string; cleanup: () => void } {
  const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "strict-dev-session-lifecycle-"));
  mkdirSync(path.join(workspaceRoot, ".strict-spec-driven"), { recursive: true });
  writeFileSync(path.join(workspaceRoot, ".strict-spec-driven", "dev-session.yaml"), devSessionContent, "utf8");
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

function buildDevSessionDeclaration(command: string, port: number, timeoutSeconds: number): string {
  return [
    "schema: strict-spec-driven/dev-session/v1",
    "schema_version: 1",
    "artifact_type: dev_session",
    "schema_file: ../../templates/strict-spec-driven/schemas/dev-session.yaml",
    "session:",
    "  id: local-web-app",
    "  description: Local lifecycle test session.",
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
    `        timeout_seconds: ${timeoutSeconds}`,
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

export async function runDevSessionLifecycleSuite(context: TestContext): Promise<void> {
  context.section("[4] dev-session lifecycle commands");

  const successPort = await reservePort();
  const successWorkspace = createWorkspace(
    buildDevSessionDeclaration("node dev-server.cjs", successPort, 5),
    {
      "dev-server.cjs": [
        "const http = require('http');",
        "const port = Number(process.env.PORT);",
        "const server = http.createServer((req, res) => {",
        "  console.log(`request:${req.url}`);",
        "  if (req.url === '/health') {",
        "    res.writeHead(200, { 'content-type': 'text/plain' });",
        "    res.end('ok');",
        "    return;",
        "  }",
        "  res.writeHead(200, { 'content-type': 'text/plain' });",
        "  res.end('hello');",
        "});",
        "server.listen(port, '127.0.0.1', () => console.log(`listening:${port}`));",
        "const shutdown = () => server.close(() => process.exit(0));",
        "process.on('SIGTERM', shutdown);",
        "process.on('SIGINT', shutdown);",
        "setInterval(() => {}, 1000);",
        "",
      ].join("\n"),
    },
  );
  const successEnv = { ...process.env, PORT: String(successPort) };
  try {
    const startResult = cli(["dev-session-start"], { cwd: successWorkspace.workspaceRoot, env: successEnv });
    context.assert(startResult.status === 0, "dev-session-start exits zero for a ready declared service", startResult.stderr.trim());
    context.assert(startResult.stderr.length === 0, "dev-session-start keeps stderr empty on success", startResult.stderr.trim());
    const startJson = JSON.parse(startResult.stdout.trim()) as {
      ok: boolean;
      runtimeStatePath: string;
      services: Array<{ id: string; status: string; logPath: string; pid: number | null }>;
    };
    context.assert(startJson.ok === true, "dev-session-start reports ok=true on success", startResult.stdout.trim());
    context.assert(
      startJson.runtimeStatePath === ".strict-spec-driven/.runtime/dev-session/state.json"
        && startJson.services[0]?.id === "web"
        && startJson.services[0]?.status === "running"
        && startJson.services[0]?.logPath === ".strict-spec-driven/.runtime/dev-session/logs/web.log",
      "dev-session-start records deterministic runtime-state and log paths",
      startResult.stdout.trim(),
    );

    const statusResult = cli(["dev-session-status"], { cwd: successWorkspace.workspaceRoot, env: successEnv });
    context.assert(statusResult.status === 0, "dev-session-status exits zero for managed runtime state", statusResult.stderr.trim());
    const statusJson = JSON.parse(statusResult.stdout.trim()) as {
      ok: boolean;
      services: Array<{ id: string; status: string }>;
    };
    context.assert(
      statusJson.ok === true && statusJson.services[0]?.status === "running",
      "dev-session-status reports running services from managed runtime state",
      statusResult.stdout.trim(),
    );

    const logsResult = cli(["dev-session-logs"], { cwd: successWorkspace.workspaceRoot, env: successEnv });
    context.assert(logsResult.status === 0, "dev-session-logs exits zero for a single managed service", logsResult.stderr.trim());
    context.assert(logsResult.stderr.length === 0, "dev-session-logs keeps stderr empty on success", logsResult.stderr.trim());
    context.assert(
      logsResult.stdout.includes(`listening:${successPort}`) && logsResult.stdout.includes("request:/health"),
      "dev-session-logs prints the selected service log output without internal process ids",
      logsResult.stdout.trim(),
    );

    const stopResult = cli(["dev-session-stop"], { cwd: successWorkspace.workspaceRoot, env: successEnv });
    context.assert(stopResult.status === 0, "dev-session-stop exits zero for managed services", stopResult.stderr.trim());
    const stopJson = JSON.parse(stopResult.stdout.trim()) as {
      ok: boolean;
      services: Array<{ id: string; status: string }>;
    };
    context.assert(
      stopJson.ok === true && stopJson.services[0]?.status === "stopped",
      "dev-session-stop marks managed services as stopped",
      stopResult.stdout.trim(),
    );

    const stoppedStatusResult = cli(["dev-session-status"], { cwd: successWorkspace.workspaceRoot, env: successEnv });
    const stoppedStatusJson = JSON.parse(stoppedStatusResult.stdout.trim()) as {
      services: Array<{ id: string; status: string }>;
    };
    context.assert(
      stoppedStatusJson.services[0]?.status === "stopped",
      "dev-session-status reports stopped services after cleanup",
      stoppedStatusResult.stdout.trim(),
    );
  } finally {
    cli(["dev-session-stop"], { cwd: successWorkspace.workspaceRoot, env: successEnv });
    successWorkspace.cleanup();
  }

  const failurePort = await reservePort();
  const failureWorkspace = createWorkspace(
    buildDevSessionDeclaration("node idle-server.cjs", failurePort, 1),
    {
      "idle-server.cjs": [
        "console.log('idle');",
        "process.on('SIGTERM', () => process.exit(0));",
        "process.on('SIGINT', () => process.exit(0));",
        "setInterval(() => {}, 1000);",
        "",
      ].join("\n"),
    },
  );
  const failureEnv = { ...process.env, PORT: String(failurePort) };
  try {
    const failedStartResult = cli(["dev-session-start"], { cwd: failureWorkspace.workspaceRoot, env: failureEnv });
    context.assert(failedStartResult.status !== 0, "dev-session-start exits non-zero when readiness never succeeds", failedStartResult.stderr.trim());
    const failedStartJson = JSON.parse(failedStartResult.stdout.trim()) as {
      ok: boolean;
      diagnostics: Array<{ phase?: string }>;
      services: Array<{ id: string; status: string }>;
    };
    context.assert(
      failedStartJson.ok === false
        && failedStartJson.diagnostics[0]?.phase === "readiness"
        && failedStartJson.services[0]?.status === "failed",
      "dev-session-start records deterministic readiness-failure diagnostics and failed service state",
      failedStartResult.stdout.trim(),
    );

    const failedStatusResult = cli(["dev-session-status"], { cwd: failureWorkspace.workspaceRoot, env: failureEnv });
    const failedStatusJson = JSON.parse(failedStatusResult.stdout.trim()) as {
      services: Array<{ id: string; status: string }>;
    };
    context.assert(
      failedStatusJson.services[0]?.status === "failed",
      "dev-session-status preserves failed managed-service records after readiness cleanup",
      failedStatusResult.stdout.trim(),
    );
  } finally {
    failureWorkspace.cleanup();
  }

  const stalePort = await reservePort();
  const staleWorkspace = createWorkspace(
    buildDevSessionDeclaration("node stale-server.cjs", stalePort, 5),
    {
      "stale-server.cjs": [
        "const http = require('http');",
        "const port = Number(process.env.PORT);",
        "const server = http.createServer((req, res) => {",
        "  if (req.url === '/health') {",
        "    res.writeHead(200);",
        "    res.end('ok');",
        "    return;",
        "  }",
        "  res.writeHead(200);",
        "  res.end('hello');",
        "});",
        "server.listen(port, '127.0.0.1');",
        "process.on('SIGTERM', () => server.close(() => process.exit(0)));",
        "setInterval(() => {}, 1000);",
        "",
      ].join("\n"),
    },
  );
  const staleEnv = { ...process.env, PORT: String(stalePort) };
  try {
    const staleStartResult = cli(["dev-session-start"], { cwd: staleWorkspace.workspaceRoot, env: staleEnv });
    const staleStartJson = JSON.parse(staleStartResult.stdout.trim()) as {
      services: Array<{ pid: number | null }>;
    };
    const stalePid = staleStartJson.services[0]?.pid ?? null;
    if (stalePid !== null) {
      process.kill(stalePid, "SIGKILL");
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const staleStatusResult = cli(["dev-session-status"], { cwd: staleWorkspace.workspaceRoot, env: staleEnv });
    const staleStatusJson = JSON.parse(staleStatusResult.stdout.trim()) as {
      services: Array<{ id: string; status: string }>;
    };
    context.assert(
      staleStatusJson.services[0]?.status === "stale",
      "dev-session-status distinguishes stale runtime records from running services",
      staleStatusResult.stdout.trim(),
    );

    const staleStopResult = cli(["dev-session-stop"], { cwd: staleWorkspace.workspaceRoot, env: staleEnv });
    context.assert(staleStopResult.status === 0, "dev-session-stop tolerates stale runtime records", staleStopResult.stderr.trim());
    const staleStopJson = JSON.parse(staleStopResult.stdout.trim()) as {
      ok: boolean;
      services: Array<{ id: string; status: string }>;
    };
    context.assert(
      staleStopJson.ok === true && staleStopJson.services[0]?.status === "stale",
      "dev-session-stop reports stale records explicitly without failing cleanup",
      staleStopResult.stdout.trim(),
    );
  } finally {
    staleWorkspace.cleanup();
  }
}
