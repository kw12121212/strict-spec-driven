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

    const reservedCreate = cli(["debug-session-create", "archive"], { cwd: workspace.workspaceRoot });
    context.assert(reservedCreate.status !== 0, "debug-session-create rejects the reserved archive session id");
    const reservedCreateJson = JSON.parse(reservedCreate.stdout.trim()) as {
      ok: boolean;
      diagnostics: Array<{ fieldPath: string; actual?: string }>;
    };
    context.assert(
      reservedCreateJson.ok === false
        && reservedCreateJson.diagnostics[0]?.fieldPath === "$.debug_session.id"
        && reservedCreateJson.diagnostics[0]?.actual === "archive",
      "debug-session-create reports deterministic reserved archive id diagnostics",
      reservedCreate.stdout.trim(),
    );

    const legacyArchiveDir = path.join(workspace.workspaceRoot, ".strict-spec-driven", "debug-sessions", "archive");
    mkdirSync(path.join(legacyArchiveDir, "evidence"), { recursive: true });
    writeFileSync(
      path.join(legacyArchiveDir, "session.yaml"),
      readFileSync(path.join(workspace.workspaceRoot, createJson.sessionPath), "utf8")
        .replace("id: \"checkout-cdp-target\"", "id: \"archive\"")
        .replace("status: proposed", "status: resolved"),
      "utf8",
    );
    const legacyArchiveResult = cli(["debug-session-archive", "archive"], { cwd: workspace.workspaceRoot });
    context.assert(legacyArchiveResult.status !== 0, "debug-session-archive rejects legacy sessions using the reserved archive id");
    const legacyArchiveJson = JSON.parse(legacyArchiveResult.stdout.trim()) as {
      ok: boolean;
      diagnostics: Array<{ fieldPath: string; actual?: string }>;
    };
    context.assert(
      legacyArchiveJson.ok === false
        && legacyArchiveJson.diagnostics[0]?.fieldPath === "$.debug_session.id"
        && legacyArchiveJson.diagnostics[0]?.actual === "archive",
      "debug-session-archive reports deterministic reserved archive id diagnostics",
      legacyArchiveResult.stdout.trim(),
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

    const activeArchive = cli(["debug-session-archive", "checkout-cdp-target"], { cwd: workspace.workspaceRoot });
    context.assert(activeArchive.status !== 0, "debug-session-archive rejects active sessions before resolution");
    const activeArchiveJson = JSON.parse(activeArchive.stdout.trim()) as {
      ok: boolean;
      diagnostics: Array<{ fieldPath: string; expected?: string; actual?: string }>;
    };
    context.assert(
      activeArchiveJson.ok === false
        && activeArchiveJson.diagnostics.some(
          (diagnostic) =>
            diagnostic.fieldPath === "$.debug_session.status"
            && diagnostic.expected === "resolved or blocked"
            && diagnostic.actual === "proposed",
        ),
      "debug-session-archive reports deterministic status diagnostics for unresolved sessions",
      activeArchive.stdout.trim(),
    );

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

    const archiveCreate = cli(["debug-session-create", "resolved-debug"], { cwd: workspace.workspaceRoot });
    context.assert(archiveCreate.status === 0, "debug-session-create prepares a session for archive", archiveCreate.stderr.trim());
    const archiveSessionPath = path.join(
      workspace.workspaceRoot,
      ".strict-spec-driven",
      "debug-sessions",
      "resolved-debug",
      "session.yaml",
    );
    writeFileSync(
      archiveSessionPath,
      readFileSync(archiveSessionPath, "utf8").replace("status: proposed", "status: resolved"),
      "utf8",
    );
    writeFileSync(
      path.join(workspace.workspaceRoot, ".strict-spec-driven", "debug-sessions", "resolved-debug", "evidence", "done.txt"),
      "resolved evidence\n",
      "utf8",
    );

    const archiveResult = cli(
      ["debug-session-archive", ".strict-spec-driven/debug-sessions/resolved-debug/session.yaml"],
      { cwd: workspace.workspaceRoot },
    );
    context.assert(archiveResult.status === 0, "debug-session-archive exits zero for a resolved session", archiveResult.stderr.trim());
    context.assert(archiveResult.stderr.length === 0, "debug-session-archive keeps stderr empty on success", archiveResult.stderr.trim());
    const archiveJson = JSON.parse(archiveResult.stdout.trim()) as {
      ok: boolean;
      sessionId: string;
      sourceDir: string;
      sourcePath: string;
      archiveDir: string;
      archivePath: string;
      diagnostics: unknown[];
    };
    context.assert(
      archiveJson.ok === true
        && archiveJson.sessionId === "resolved-debug"
        && archiveJson.sourceDir === ".strict-spec-driven/debug-sessions/resolved-debug"
        && archiveJson.sourcePath === ".strict-spec-driven/debug-sessions/resolved-debug/session.yaml"
        && /^\.strict-spec-driven\/debug-sessions\/archive\/\d{4}-\d{2}-\d{2}-resolved-debug(?:-\d+)?$/.test(archiveJson.archiveDir)
        && archiveJson.archivePath === `${archiveJson.archiveDir}/session.yaml`
        && archiveJson.diagnostics.length === 0,
      "debug-session-archive reports deterministic archive paths",
      archiveResult.stdout.trim(),
    );
    context.assert(
      !existsSync(path.join(workspace.workspaceRoot, ".strict-spec-driven", "debug-sessions", "resolved-debug"))
        && existsSync(path.join(workspace.workspaceRoot, archiveJson.archivePath))
        && existsSync(path.join(workspace.workspaceRoot, archiveJson.archiveDir, "evidence", "done.txt")),
      "debug-session-archive moves the full session directory into debug-sessions/archive",
    );

    const archivedValidation = cli(["debug-session-validate", archiveJson.archivePath], { cwd: workspace.workspaceRoot });
    context.assert(archivedValidation.status === 0, "debug-session-validate accepts an archived explicit session path", archivedValidation.stderr.trim());
  } finally {
    workspace.cleanup();
  }

  const exampleValidation = cli(["debug-session-validate", path.join(ROOT, "examples", "strict-spec-driven", "debug-session.yaml")], { cwd: ROOT });
  context.assert(exampleValidation.status === 0, "debug-session example validates through the CLI", exampleValidation.stderr.trim());
}
