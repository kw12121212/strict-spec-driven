import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { TestContext, cli, loadDistModule, type YamlModule } from "../support/harness.js";

export async function runHarnessSessionAuthoringSuite(context: TestContext): Promise<void> {
  context.section("[harness-session-authoring] structured lifecycle mutations");
  const yaml = await loadDistModule<YamlModule>("yaml.js");
  const root = mkdtempSync(path.join(os.tmpdir(), "strict-session-authoring-"));
  try {
    cli(["init"], { cwd: root });
    context.assert(cli(["harness-session", "create", "checkout-session"], { cwd: root }).status === 0, "session creation commits through the shared boundary");
    const sessionPath = path.join(root, ".strict-spec-driven", "harness-sessions", "checkout-session", "session.yaml");
    const edit = cli([
      "harness-session", "edit", "checkout-session", "--status", "capturing", "--selected-component", "app",
      "--step", "reproduce", "--step-action", "Open checkout", "--step-expected", "Failure is visible",
      "--checkpoint", "human-login", "--checkpoint-reason", "Credentials required", "--checkpoint-action", "Complete login",
      "--checkpoint-sensitive", "true", "--checkpoint-status", "pending", "--checkpoint-resume", "Login completed",
    ], { cwd: root });
    context.assert(edit.status === 0, "harness-session edit upserts steps and checkpoints", edit.stderr.trim());
    const parsed = yaml.parseYamlFile<{ selected_components: string[]; reproduction: { steps: Array<{ id: string }> }; human_checkpoints: Array<{ id: string }> }>(sessionPath);
    context.assert(parsed.selected_components[0] === "app" && parsed.reproduction.steps.some((step) => step.id === "reproduce") && parsed.human_checkpoints[0]?.id === "human-login", "session edits preserve structured keyed state");

    const beforeInvalid = readFileSync(sessionPath, "utf8");
    const invalid = cli(["harness-session", "edit", "checkout-session", "--verification-status", "unknown"], { cwd: root });
    context.assert(invalid.status !== 0 && readFileSync(sessionPath, "utf8") === beforeInvalid, "invalid session candidates roll back without rewriting YAML");

    const evidencePath = path.join(root, ".strict-spec-driven", "harness-sessions", "checkout-session", "evidence", "result.txt");
    writeFileSync(evidencePath, "evidence\n", "utf8");
    context.assert(cli(["harness-session", "delete", "checkout-session"], { cwd: root }).status !== 0, "session delete refuses a non-empty evidence directory");
    context.assert(cli(["harness-session", "edit", "checkout-session", "--status", "resolved"], { cwd: root }).status === 0, "session status updates through named authoring");
    const archive = cli(["harness-session", "archive", "checkout-session"], { cwd: root });
    const payload = JSON.parse(archive.stdout) as { archiveDir: string };
    context.assert(archive.status === 0 && existsSync(path.join(root, payload.archiveDir, "evidence", "result.txt")), "archive preserves the complete evidence directory");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
