import { mkdtempSync, readFileSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { TestContext, cli, loadDistModule, type YamlModule } from "../support/harness.js";

export async function runHarnessAuthoringSuite(context: TestContext): Promise<void> {
  context.section("[harness-authoring] named YAML mutations");
  const yaml = await loadDistModule<YamlModule>("yaml.js");
  const root = mkdtempSync(path.join(os.tmpdir(), "strict-harness-authoring-"));
  try {
    context.assert(cli(["init"], { cwd: root }).status === 0, "harness authoring fixture initializes");
    const artifactPath = path.join(root, ".strict-spec-driven", "harness.yaml");
    const add = cli([
      "harness-edit", "--component-environment", "development", "--component", "app",
      "--url", "http://127.0.0.1:3000", "--url", "http://127.0.0.1:3000", "--evidence-label", "smoke",
    ], { cwd: root });
    context.assert(add.status === 0, "harness-edit accepts additive named component fields", add.stderr.trim());
    const parsed = yaml.parseYamlFile<{ harness: { environments: { development: { components: { app: { urls: string[]; evidence_labels: string[] } } } } } }>(artifactPath);
    context.assert(parsed.harness.environments.development.components.app.urls.length === 1, "harness-edit de-duplicates repeated list additions");

    const beforeFailure = readFileSync(artifactPath, "utf8");
    const invalid = cli(["harness-edit", "--component-environment", "development", "--component", "app", "--depends-on", "missing"], { cwd: root });
    context.assert(invalid.status !== 0 && readFileSync(artifactPath, "utf8") === beforeFailure, "invalid harness relationships leave the artifact byte-identical");

    const remove = cli(["harness-edit", "--remove-url", "development:app:http://127.0.0.1:3000"], { cwd: root });
    context.assert(remove.status === 0, "harness-edit removes one exact nested list value", remove.stderr.trim());
    const removed = yaml.parseYamlFile<{ harness: { environments: { development: { components: { app: { urls: string[]; evidence_labels: string[] } } } } } }>(artifactPath);
    context.assert(removed.harness.environments.development.components.app.urls.length === 0 && removed.harness.environments.development.components.app.evidence_labels[0] === "smoke", "named removal preserves sibling component state");

    context.assert(cli(["harness-session", "create", "active-session"], { cwd: root }).status === 0, "active session fixture is created");
    const blockedDelete = cli(["harness-edit", "--delete"], { cwd: root });
    context.assert(blockedDelete.status !== 0 && readFileSync(artifactPath, "utf8").length > 0, "harness deletion is blocked while an active session exists");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
