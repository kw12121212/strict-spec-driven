import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { ROOT, TestContext, cli } from "../support/harness.js";

function createWorkspace(): { workspaceRoot: string; cleanup: () => void } {
  const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "strict-harness-session-"));
  mkdirSync(path.join(workspaceRoot, ".strict-spec-driven"), { recursive: true });
  writeFileSync(
    path.join(workspaceRoot, ".strict-spec-driven", "harness.yaml"),
    readFileSync(path.join(ROOT, "examples", "strict-spec-driven", "harness.yaml"), "utf8"),
    "utf8",
  );
  return { workspaceRoot, cleanup: () => rmSync(workspaceRoot, { recursive: true, force: true }) };
}

export async function runHarnessSessionSuite(context: TestContext): Promise<void> {
  context.section("[6] harness-session command");

  const workspace = createWorkspace();
  try {
    const create = cli(["harness-session", "create", "checkout-cdp-target"], { cwd: workspace.workspaceRoot });
    context.assert(create.status === 0, "harness-session create exits zero for a new session", create.stderr.trim());
    const createJson = JSON.parse(create.stdout.trim()) as { ok: boolean; sessionId: string; sessionPath: string; evidenceDir: string; created: string[] };
    context.assert(createJson.ok === true && createJson.sessionId === "checkout-cdp-target", "harness-session create reports the session id");
    context.assert(
      createJson.sessionPath === ".strict-spec-driven/harness-sessions/checkout-cdp-target/session.yaml"
        && createJson.evidenceDir === ".strict-spec-driven/harness-sessions/checkout-cdp-target/evidence/"
        && createJson.created.length === 2,
      "harness-session create reports session and evidence paths",
      create.stdout.trim(),
    );
    context.assert(
      existsSync(path.join(workspace.workspaceRoot, createJson.sessionPath))
        && existsSync(path.join(workspace.workspaceRoot, createJson.evidenceDir)),
      "harness-session create writes session.yaml and evidence directory",
    );

    const validate = cli(["harness-session", "validate", "checkout-cdp-target"], { cwd: workspace.workspaceRoot });
    context.assert(validate.status === 0, "harness-session validate exits zero for scaffolded session", validate.stderr.trim());

    const activeArchive = cli(["harness-session", "archive", "checkout-cdp-target"], { cwd: workspace.workspaceRoot });
    context.assert(activeArchive.status !== 0, "harness-session archive rejects unresolved sessions");
    const activeArchiveJson = JSON.parse(activeArchive.stdout.trim()) as { diagnostics: Array<{ fieldPath: string; expected?: string; actual?: string }> };
    context.assert(
      activeArchiveJson.diagnostics.some((diagnostic) => diagnostic.fieldPath === "$.harness_session.status" && diagnostic.expected === "resolved or blocked" && diagnostic.actual === "proposed"),
      "harness-session archive reports deterministic unresolved status diagnostics",
      activeArchive.stdout.trim(),
    );

    const sessionPath = path.join(workspace.workspaceRoot, ".strict-spec-driven", "harness-sessions", "checkout-cdp-target", "session.yaml");
    writeFileSync(sessionPath, readFileSync(sessionPath, "utf8").replace("status: proposed", "status: resolved"), "utf8");
    writeFileSync(path.join(workspace.workspaceRoot, ".strict-spec-driven", "harness-sessions", "checkout-cdp-target", "evidence", "done.txt"), "resolved evidence\n", "utf8");
    const archive = cli(["harness-session", "archive", "checkout-cdp-target"], { cwd: workspace.workspaceRoot });
    context.assert(archive.status === 0, "harness-session archive exits zero for a resolved session", archive.stderr.trim());
    const archiveJson = JSON.parse(archive.stdout.trim()) as { ok: boolean; archiveDir: string; archivePath: string };
    context.assert(
      archiveJson.ok === true
        && /^\.strict-spec-driven\/harness-sessions\/archive\/\d{4}-\d{2}-\d{2}-checkout-cdp-target(?:-\d+)?$/.test(archiveJson.archiveDir)
        && archiveJson.archivePath === `${archiveJson.archiveDir}/session.yaml`,
      "harness-session archive reports deterministic archive paths",
      archive.stdout.trim(),
    );
    context.assert(
      existsSync(path.join(workspace.workspaceRoot, archiveJson.archivePath))
        && existsSync(path.join(workspace.workspaceRoot, archiveJson.archiveDir, "evidence", "done.txt")),
      "harness-session archive moves the full session directory",
    );
  } finally {
    workspace.cleanup();
  }

  const exampleValidation = cli(["harness-session", "validate", path.join(ROOT, "examples", "strict-spec-driven", "harness-session.yaml")], { cwd: ROOT });
  context.assert(exampleValidation.status === 0, "harness-session example validates through the CLI", exampleValidation.stderr.trim());
}
