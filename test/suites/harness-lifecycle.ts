import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import net from "net";
import os from "os";
import path from "path";
import { TestContext, cli } from "../support/harness.js";

function createWorkspace(harnessContent: string, files: Record<string, string>): { workspaceRoot: string; cleanup: () => void } {
  const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "strict-harness-lifecycle-"));
  mkdirSync(path.join(workspaceRoot, ".strict-spec-driven"), { recursive: true });
  writeFileSync(path.join(workspaceRoot, ".strict-spec-driven", "harness.yaml"), harnessContent, "utf8");
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(workspaceRoot, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content, "utf8");
  }
  return { workspaceRoot, cleanup: () => rmSync(workspaceRoot, { recursive: true, force: true }) };
}

async function reservePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address !== "object") {
        reject(new Error("failed to reserve port"));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function buildHarness(
  command: string,
  port: number,
  type = "backend",
  extraStartFields = "",
  includeStatusAndLogs = true,
  requiredEnvironment = ["PORT"],
): string {
  return [
    "schema: strict-spec-driven/harness/v1",
    "schema_version: 1",
    "artifact_type: harness",
    "schema_file: templates/strict-spec-driven/schemas/harness.yaml",
    "harness:",
    "  id: local-web-app",
    "  environments:",
    "    development:",
    "      kind: development",
    "      components:",
    "        web:",
    `          type: ${type}`,
    "          working_directory: \".\"",
    "          depends_on: []",
    "          environment:",
    "            required:",
    ...requiredEnvironment.map((name) => `              - ${name}`),
    "            optional: []",
    `          urls:\n            - \"http://127.0.0.1:${port}\"`,
    `          ports:\n            - ${port}`,
    "          readiness:",
    "            type: http",
    `            url: \"http://127.0.0.1:${port}/health\"`,
    "            timeout_seconds: 5",
    "            interval_seconds: 1",
    "          operations:",
    "            start:",
    "              mode: script",
    `              command: ${command}`,
    extraStartFields,
    "            stop:",
    "              mode: script",
    "              command: node stop.cjs",
    ...(includeStatusAndLogs
      ? [
          "            status:",
          "              mode: readonly",
          "            logs:",
          "              mode: readonly",
        ]
      : []),
    "          evidence_labels:",
    "            - web-ready",
    "          unavailable_conditions: []",
    "",
  ].filter(Boolean).join("\n");
}

function buildPartialStartFailureHarness(apiPort: number, brokenPort: number): string {
  return [
    "schema: strict-spec-driven/harness/v1",
    "schema_version: 1",
    "artifact_type: harness",
    "schema_file: templates/strict-spec-driven/schemas/harness.yaml",
    "harness:",
    "  id: partial-start-recovery",
    "  environments:",
    "    development:",
    "      kind: development",
    "      components:",
    "        api:",
    "          type: backend",
    "          working_directory: \".\"",
    "          depends_on: []",
    "          environment:",
    "            required:",
    "              - API_PORT",
    "            optional: []",
    `          urls:\n            - "http://127.0.0.1:${apiPort}"`,
    `          ports:\n            - ${apiPort}`,
    "          readiness:",
    "            type: http",
    `            url: "http://127.0.0.1:${apiPort}/health"`,
    "            timeout_seconds: 5",
    "            interval_seconds: 1",
    "          operations:",
    "            start:",
    "              mode: script",
    "              command: node api.cjs",
    "            stop:",
    "              mode: script",
    "              command: node stop-api.cjs",
    "            status:",
    "              mode: readonly",
    "            logs:",
    "              mode: readonly",
    "          evidence_labels:",
    "            - api-ready",
    "          unavailable_conditions: []",
    "        broken:",
    "          type: backend",
    "          working_directory: \".\"",
    "          depends_on:",
    "            - api",
    "          environment:",
    "            required: []",
    "            optional: []",
    `          urls:\n            - "http://127.0.0.1:${brokenPort}"`,
    `          ports:\n            - ${brokenPort}`,
    "          readiness:",
    "            type: http",
    `            url: "http://127.0.0.1:${brokenPort}/health"`,
    "            timeout_seconds: 1",
    "            interval_seconds: 1",
    "          operations:",
    "            start:",
    "              mode: script",
    "              command: node broken.cjs",
    "            stop:",
    "              mode: script",
    "              command: node stop-broken.cjs",
    "            status:",
    "              mode: readonly",
    "            logs:",
    "              mode: readonly",
    "          evidence_labels:",
    "            - broken-ready",
    "          unavailable_conditions: []",
    "",
  ].join("\n");
}

export async function runHarnessLifecycleSuite(context: TestContext): Promise<void> {
  context.section("[5] harness lifecycle commands");

  const port = await reservePort();
  const workspace = createWorkspace(
    buildHarness("node server.cjs", port),
    {
      "server.cjs": [
        "const http = require('http');",
        "const fs = require('fs');",
        "const port = Number(process.env.PORT);",
        "const server = http.createServer((req, res) => {",
        "  console.log(`request:${req.url}`);",
        "  if (req.url === '/health') { res.writeHead(200); res.end('ok'); return; }",
        "  res.writeHead(200); res.end('hello');",
        "});",
        "server.listen(port, '127.0.0.1', () => { fs.writeFileSync('server.pid', String(process.pid)); console.log(`listening:${port}`); });",
        "process.on('SIGTERM', () => server.close(() => process.exit(0)));",
        "setInterval(() => {}, 1000);",
        "",
      ].join("\n"),
      "stop.cjs": "const fs = require('fs'); process.kill(Number(fs.readFileSync('server.pid', 'utf8')), 'SIGTERM');\n",
    },
  );
  const env = { ...process.env, PORT: String(port) };
  try {
    const scriptsGenerate = cli(["harness-scripts", "generate"], { cwd: workspace.workspaceRoot });
    context.assert(scriptsGenerate.status === 0, "harness-scripts generate exits zero", scriptsGenerate.stderr.trim());
    const scriptsVerify = cli(["harness-scripts", "verify"], { cwd: workspace.workspaceRoot });
    context.assert(scriptsVerify.status === 0, "harness-scripts verify exits zero after generation", scriptsVerify.stdout.trim());

    const start = cli(["harness-start", "--environment", "development"], { cwd: workspace.workspaceRoot, env });
    context.assert(start.status === 0, "harness-start exits zero for a ready component", start.stderr.trim());
    const startJson = JSON.parse(start.stdout.trim()) as { ok: boolean; runtimeStatePath: string; components: Array<{ id: string; status: string; logPath: string }> };
    context.assert(
      startJson.ok === true
        && startJson.runtimeStatePath === ".strict-spec-driven/.runtime/harness/state.json"
        && startJson.components[0]?.status === "running"
        && startJson.components[0]?.logPath === ".strict-spec-driven/.runtime/harness/logs/web.log",
      "harness-start records deterministic runtime state and log paths",
      start.stdout.trim(),
    );
    const componentLogPath = startJson.components[0]?.logPath;
    context.assert(typeof componentLogPath === "string", "harness-start returns a captured log path", start.stdout.trim());
    if (typeof componentLogPath !== "string") {
      throw new Error("expected harness-start to return a component log path");
    }

    const capturedLogLines = Array.from({ length: 250 }, (_, index) => `log-line-${String(index + 1).padStart(3, "0")}`);
    writeFileSync(path.join(workspace.workspaceRoot, componentLogPath), `${capturedLogLines.join("\n")}\n`, "utf8");

    const logs = cli(["harness-logs"], { cwd: workspace.workspaceRoot, env });
    context.assert(logs.status === 0, "harness-logs exits zero for a single managed component", logs.stderr.trim());
    const defaultLines = logs.stdout.trim().split(/\r?\n/);
    context.assert(
      defaultLines.length === 200
        && defaultLines[0] === "log-line-051"
        && defaultLines[199] === "log-line-250"
        && !logs.stdout.includes("log-line-050"),
      "harness-logs returns only the default bounded tail of a large captured log",
      logs.stdout.trim(),
    );

    const explicitTail = cli(["harness-logs", "--tail", "5"], { cwd: workspace.workspaceRoot, env });
    context.assert(explicitTail.status === 0, "harness-logs accepts an explicit tail size", explicitTail.stderr.trim());
    context.assert(
      explicitTail.stdout.trim() === capturedLogLines.slice(-5).join("\n"),
      "harness-logs returns the requested explicit tail line count",
      explicitTail.stdout.trim(),
    );

    const allLogs = cli(["harness-logs", "--all"], { cwd: workspace.workspaceRoot, env });
    context.assert(allLogs.status === 0, "harness-logs accepts the explicit full-output override", allLogs.stderr.trim());
    context.assert(
      allLogs.stdout.trim() === capturedLogLines.join("\n"),
      "harness-logs returns the full captured log when --all is provided",
      allLogs.stdout.trim(),
    );

    const help = cli(["harness-logs", "--help"], { cwd: workspace.workspaceRoot, env });
    context.assert(help.status === 0, "harness-logs help exits zero", help.stderr.trim());
    context.assert(
      help.stdout.includes("Usage: strict-spec-driven harness-logs [component-id] [--tail <n> | --all]"),
      "harness-logs help documents the tail and full-output flags",
      help.stdout.trim(),
    );

    const stop = cli(["harness-stop"], { cwd: workspace.workspaceRoot, env });
    context.assert(stop.status === 0, "harness-stop exits zero for a managed component", stop.stderr.trim());
    const stopJson = JSON.parse(stop.stdout.trim()) as { ok: boolean; components: Array<{ status: string }> };
    context.assert(stopJson.ok === true && stopJson.components[0]?.status === "stopped", "harness-stop marks component stopped", stop.stdout.trim());
  } finally {
    cli(["harness-stop"], { cwd: workspace.workspaceRoot, env });
    workspace.cleanup();
  }

  const optionalPort = await reservePort();
  const optionalWorkspace = createWorkspace(
    buildHarness("node server.cjs", optionalPort, "backend", "", false),
    {
      "server.cjs": [
        "const http = require('http');",
        "const fs = require('fs');",
        "const port = Number(process.env.PORT);",
        "const server = http.createServer((req, res) => {",
        "  if (req.url === '/health') { res.writeHead(200); res.end('ok'); return; }",
        "  res.writeHead(200); res.end('hello');",
        "});",
        "server.listen(port, '127.0.0.1', () => { fs.writeFileSync('server.pid', String(process.pid)); });",
        "process.on('SIGTERM', () => server.close(() => process.exit(0)));",
        "setInterval(() => {}, 1000);",
        "",
      ].join("\n"),
      "stop.cjs": "const fs = require('fs'); process.kill(Number(fs.readFileSync('server.pid', 'utf8')), 'SIGTERM');\n",
    },
  );
  const optionalEnv = { ...process.env, PORT: String(optionalPort) };
  try {
    const start = cli(["harness-start", "--environment", "development"], { cwd: optionalWorkspace.workspaceRoot, env: optionalEnv });
    context.assert(start.status === 0, "harness-start accepts components that omit status/logs declarations", start.stderr.trim());
    const startJson = JSON.parse(start.stdout.trim()) as { ok: boolean; components: Array<{ status: string; logPath: string }> };
    const optionalLogPath = startJson.components[0]?.logPath;
    context.assert(startJson.ok === true && typeof optionalLogPath === "string", "harness-start still captures runtime state and logs without status/logs declarations", start.stdout.trim());
    if (typeof optionalLogPath !== "string") {
      throw new Error("expected harness-start to return a log path when status/logs are omitted");
    }
    writeFileSync(path.join(optionalWorkspace.workspaceRoot, optionalLogPath), "optional-log-line\n", "utf8");

    const status = cli(["harness-status"], { cwd: optionalWorkspace.workspaceRoot, env: optionalEnv });
    context.assert(status.status === 0, "harness-status remains available when the declaration omits status/logs", status.stderr.trim());
    const statusJson = JSON.parse(status.stdout.trim()) as { ok: boolean; components: Array<{ status: string }> };
    context.assert(statusJson.ok === true && statusJson.components[0]?.status === "running", "harness-status still reports runtime-derived component state", status.stdout.trim());

    const logs = cli(["harness-logs"], { cwd: optionalWorkspace.workspaceRoot, env: optionalEnv });
    context.assert(logs.status === 0, "harness-logs remains available when the declaration omits status/logs", logs.stderr.trim());
    context.assert(logs.stdout.trim() === "optional-log-line", "harness-logs still reads the captured runtime log without status/logs declarations", logs.stdout.trim());
  } finally {
    cli(["harness-stop"], { cwd: optionalWorkspace.workspaceRoot, env: optionalEnv });
    optionalWorkspace.cleanup();
  }

  const statefulWorkspace = createWorkspace(buildHarness("node server.cjs", await reservePort(), "database"), { "server.cjs": "setInterval(() => {}, 1000);\n", "stop.cjs": "" });
  try {
    const result = cli(["harness-start", "--environment", "development"], { cwd: statefulWorkspace.workspaceRoot, env: { ...process.env, PORT: "1" } });
    context.assert(result.status !== 0, "harness-start rejects stateful lifecycle without explicit permission");
    const json = JSON.parse(result.stdout.trim()) as { diagnostics: Array<{ source: string; fieldPath: string }> };
    context.assert(
      json.diagnostics.some((diagnostic) => diagnostic.source === "safety" && diagnostic.fieldPath.includes("allow_stateful_lifecycle")),
      "stateful lifecycle diagnostics point to explicit permission",
      result.stdout.trim(),
    );
  } finally {
    statefulWorkspace.cleanup();
  }

  const envGuidancePort = await reservePort();
  const envGuidanceWorkspace = createWorkspace(
    buildHarness("node server.cjs", envGuidancePort, "backend", "", true, ["PORT", "API_KEY"]),
    {
      "server.cjs": [
        "const http = require('http');",
        "const fs = require('fs');",
        "const port = Number(process.env.PORT);",
        "const server = http.createServer((req, res) => {",
        "  if (req.url === '/health') { res.writeHead(200); res.end('ok'); return; }",
        "  res.writeHead(200); res.end('hello');",
        "});",
        "server.listen(port, '127.0.0.1', () => { fs.writeFileSync('server.pid', String(process.pid)); });",
        "process.on('SIGTERM', () => server.close(() => process.exit(0)));",
        "setInterval(() => {}, 1000);",
        "",
      ].join("\n"),
      "stop.cjs": "const fs = require('fs'); process.kill(Number(fs.readFileSync('server.pid', 'utf8')), 'SIGTERM');\n",
      ".env.example": "PORT=\nAPI_KEY=\n",
    },
  );
  try {
    const scriptsGenerate = cli(["harness-scripts", "generate"], { cwd: envGuidanceWorkspace.workspaceRoot });
    context.assert(scriptsGenerate.status === 0, "harness-scripts generate exits zero for documented environment guidance coverage", scriptsGenerate.stderr.trim());
    const scriptsVerify = cli(["harness-scripts", "verify"], { cwd: envGuidanceWorkspace.workspaceRoot });
    context.assert(scriptsVerify.status === 0, "harness-scripts verify exits zero for documented environment guidance coverage", scriptsVerify.stdout.trim());

    const doctor = cli(["harness-doctor"], { cwd: envGuidanceWorkspace.workspaceRoot });
    context.assert(doctor.status === 0, "harness-doctor accepts required env names documented in an env sample file before start", doctor.stdout.trim());

    const start = cli(["harness-start", "--environment", "development"], {
      cwd: envGuidanceWorkspace.workspaceRoot,
      env: { ...process.env, PORT: String(envGuidancePort) },
    });
    context.assert(start.status !== 0, "harness-start rejects required values that are documented but not exported", start.stdout.trim());
    const startJson = JSON.parse(start.stdout.trim()) as {
      ok: boolean;
      components: Array<{ status: string; message?: string }>;
      diagnostics: Array<{ message?: string; expected?: string; actual?: string }>;
    };
    const missingDiagnostic = startJson.diagnostics[0];
    context.assert(
      startJson.ok === false
        && startJson.components[0]?.status === "failed"
        && startJson.components[0]?.message?.includes("harness-doctor only checks that required names are documented in env sample files")
        && startJson.components[0]?.message?.includes("harness-start does not load .env files")
        && startJson.components[0]?.message?.includes("Export or source the missing values before retrying."),
      "harness-start explains that documented env sample entries do not satisfy runtime environment requirements",
      start.stdout.trim(),
    );
    context.assert(
      missingDiagnostic?.message === "required environment variables are missing from the current process environment for harness-start"
        && missingDiagnostic.expected?.includes("exported or sourced into the current process environment")
        && missingDiagnostic.expected?.includes("does not load .env files")
        && missingDiagnostic.actual === "API_KEY",
      "harness-start diagnostics explain how to supply documented required environment values",
      start.stdout.trim(),
    );
  } finally {
    envGuidanceWorkspace.cleanup();
  }

  const partialFailureApiPort = await reservePort();
  const partialFailureBrokenPort = await reservePort();
  const partialFailureWorkspace = createWorkspace(
    buildPartialStartFailureHarness(partialFailureApiPort, partialFailureBrokenPort),
    {
      "api.cjs": [
        "const http = require('http');",
        "const fs = require('fs');",
        "const port = Number(process.env.API_PORT);",
        "const server = http.createServer((req, res) => {",
        "  if (req.url === '/health') { res.writeHead(200); res.end('ok'); return; }",
        "  res.writeHead(200); res.end('hello');",
        "});",
        "server.listen(port, '127.0.0.1', () => { fs.writeFileSync('api.pid', String(process.pid)); });",
        "process.on('SIGTERM', () => server.close(() => process.exit(0)));",
        "setInterval(() => {}, 1000);",
        "",
      ].join("\n"),
      "stop-api.cjs": "const fs = require('fs'); process.kill(Number(fs.readFileSync('api.pid', 'utf8')), 'SIGTERM');\n",
      "broken.cjs": [
        "const fs = require('fs');",
        "fs.writeFileSync('broken.pid', String(process.pid));",
        "process.on('SIGTERM', () => process.exit(0));",
        "setInterval(() => {}, 1000);",
        "",
      ].join("\n"),
      "stop-broken.cjs": "const fs = require('fs'); process.kill(Number(fs.readFileSync('broken.pid', 'utf8')), 'SIGTERM');\n",
    },
  );
  const partialFailureEnv = { ...process.env, API_PORT: String(partialFailureApiPort) };
  try {
    const scriptsGenerate = cli(["harness-scripts", "generate"], { cwd: partialFailureWorkspace.workspaceRoot });
    context.assert(scriptsGenerate.status === 0, "harness-scripts generate exits zero for partial-start recovery coverage", scriptsGenerate.stderr.trim());
    const scriptsVerify = cli(["harness-scripts", "verify"], { cwd: partialFailureWorkspace.workspaceRoot });
    context.assert(scriptsVerify.status === 0, "harness-scripts verify exits zero for partial-start recovery coverage", scriptsVerify.stdout.trim());

    const start = cli(["harness-start", "--environment", "development"], {
      cwd: partialFailureWorkspace.workspaceRoot,
      env: partialFailureEnv,
    });
    context.assert(start.status !== 0, "harness-start exits non-zero when a later component fails after an earlier one starts", start.stdout.trim());
    const startJson = JSON.parse(start.stdout.trim()) as {
      ok: boolean;
      components: Array<{ id: string; status: string; message?: string }>;
      diagnostics: Array<{ source: string; phase?: string; message?: string; expected?: string; actual?: string }>;
    };
    const apiComponent = startJson.components.find((component) => component.id === "api");
    const brokenComponent = startJson.components.find((component) => component.id === "broken");
    const recoveryDiagnostic = startJson.diagnostics.find((diagnostic) => diagnostic.source === "runtime_state" && diagnostic.phase === "cleanup");
    context.assert(
      startJson.ok === false
        && apiComponent?.status === "running"
        && brokenComponent?.status === "failed"
        && recoveryDiagnostic?.message?.includes("api")
        && recoveryDiagnostic?.message?.includes("strict-spec-driven harness-stop")
        && recoveryDiagnostic?.expected === "strict-spec-driven harness-stop"
        && recoveryDiagnostic?.actual === "api",
      "harness-start partial failures report the running component and the harness-stop recovery instruction",
      start.stdout.trim(),
    );
  } finally {
    cli(["harness-stop"], { cwd: partialFailureWorkspace.workspaceRoot, env: partialFailureEnv });
    partialFailureWorkspace.cleanup();
  }
}
