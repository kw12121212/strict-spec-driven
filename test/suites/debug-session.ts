import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { ROOT, TestContext, cli } from "../support/harness.js";

function createWorkspace(): { workspaceRoot: string; cleanup: () => void } {
  const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "strict-debug-session-"));
  mkdirSync(path.join(workspaceRoot, ".strict-spec-driven"), { recursive: true });
  return {
    workspaceRoot,
    cleanup: () => rmSync(workspaceRoot, { recursive: true, force: true }),
  };
}

export async function runDebugSessionSuite(context: TestContext): Promise<void> {
  context.section("[4] debug-session commands");

  const workspace = createWorkspace();
  try {
    const createResult = cli(["debug-session-create", "checkout-cdp-target"], { cwd: workspace.workspaceRoot });
    context.assert(createResult.status === 0, "debug-session-create exits zero for a new session", createResult.stderr.trim());
    context.assert(createResult.stderr.length === 0, "debug-session-create keeps stderr empty on success", createResult.stderr.trim());
    const createJson = JSON.parse(createResult.stdout.trim()) as {
      ok: boolean;
      sessionId: string;
      sessionPath: string;
      evidenceDir: string;
      created: string[];
    };
    context.assert(createJson.ok === true, "debug-session-create reports ok=true");
    context.assert(createJson.sessionId === "checkout-cdp-target", "debug-session-create preserves the session id");
    context.assert(
      createJson.sessionPath === ".strict-spec-driven/debug-sessions/checkout-cdp-target/session.yaml"
        && createJson.evidenceDir === ".strict-spec-driven/debug-sessions/checkout-cdp-target/evidence/"
        && createJson.created.length === 2,
      "debug-session-create reports the session artifact and evidence directory",
      createResult.stdout.trim(),
    );
    context.assert(
      existsSync(path.join(workspace.workspaceRoot, createJson.sessionPath))
        && existsSync(path.join(workspace.workspaceRoot, createJson.evidenceDir)),
      "debug-session-create writes session.yaml and evidence directory",
    );

    const validateById = cli(["debug-session-validate", "checkout-cdp-target"], { cwd: workspace.workspaceRoot });
    context.assert(validateById.status === 0, "debug-session-validate exits zero for scaffolded session", validateById.stderr.trim());
    const validateByIdJson = JSON.parse(validateById.stdout.trim()) as { valid: boolean; diagnostics: unknown[] };
    context.assert(
      validateByIdJson.valid === true && validateByIdJson.diagnostics.length === 0,
      "debug-session-validate reports valid=true for scaffolded session",
      validateById.stdout.trim(),
    );

    const validateByPath = cli(
      ["debug-session-validate", ".strict-spec-driven/debug-sessions/checkout-cdp-target/session.yaml"],
      { cwd: workspace.workspaceRoot },
    );
    context.assert(validateByPath.status === 0, "debug-session-validate accepts an explicit session.yaml path", validateByPath.stderr.trim());

    const duplicateCreate = cli(["debug-session-create", "checkout-cdp-target"], { cwd: workspace.workspaceRoot });
    context.assert(duplicateCreate.status !== 0, "debug-session-create rejects an existing session");
    const duplicateJson = JSON.parse(duplicateCreate.stdout.trim()) as {
      ok: boolean;
      diagnostics: Array<{ source: string; fieldPath: string; actual?: string }>;
    };
    context.assert(
      duplicateJson.ok === false
        && duplicateJson.diagnostics[0]?.source === "filesystem"
        && duplicateJson.diagnostics[0]?.fieldPath === "$",
      "debug-session-create reports deterministic existing-session diagnostics",
      duplicateCreate.stdout.trim(),
    );

    const sessionPath = path.join(
      workspace.workspaceRoot,
      ".strict-spec-driven",
      "debug-sessions",
      "checkout-cdp-target",
      "session.yaml",
    );
    const invalidSecretContent = readFileSync(sessionPath, "utf8").replace(
      "manual_actions: []",
      [
        "manual_actions:",
        "  - id: human-login",
        "    checkpoint: login",
        "    actor: human",
        "    summary: Human entered credentials directly.",
        "    secrets_recorded: true",
        "    status: completed",
        "    evidence: []",
      ].join("\n"),
    );
    writeFileSync(sessionPath, invalidSecretContent, "utf8");
    const invalidSecret = cli(["debug-session-validate", "checkout-cdp-target"], { cwd: workspace.workspaceRoot });
    context.assert(invalidSecret.status !== 0, "debug-session-validate rejects secret-recording manual actions");
    const invalidSecretJson = JSON.parse(invalidSecret.stdout.trim()) as {
      valid: boolean;
      diagnostics: Array<{ source: string; fieldPath: string; expected?: string; actual?: string }>;
    };
    context.assert(
      invalidSecretJson.valid === false
        && invalidSecretJson.diagnostics.some(
          (diagnostic) =>
            diagnostic.source === "schema"
            && diagnostic.fieldPath === "$.manual_actions[0].secrets_recorded",
        ),
      "debug-session-validate points to forbidden secrets_recorded values",
      invalidSecret.stdout.trim(),
    );
  } finally {
    workspace.cleanup();
  }

  const exampleValidation = cli(["debug-session-validate", path.join(ROOT, "examples", "strict-spec-driven", "debug-session.yaml")], { cwd: ROOT });
  context.assert(exampleValidation.status === 0, "debug-session example validates through the CLI", exampleValidation.stderr.trim());
}
