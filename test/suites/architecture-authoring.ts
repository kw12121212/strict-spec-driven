import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { TestContext, cli, loadDistModule, type YamlModule } from "../support/harness.js";

export async function runArchitectureAuthoringSuite(context: TestContext): Promise<void> {
  context.section("[architecture-authoring] named YAML mutations");
  const yaml = await loadDistModule<YamlModule>("yaml.js");
  const root = mkdtempSync(path.join(os.tmpdir(), "strict-architecture-authoring-"));
  try {
    cli(["init"], { cwd: root });
    const artifactPath = path.join(root, ".strict-spec-driven", "architecture.yaml");
    context.assert(cli(["architecture-edit", "--component", "api", "--component-title", "API", "--component-responsibility", "Serves requests", "--boundary", "Does not own storage"], { cwd: root }).status === 0, "architecture-edit creates a named component");
    context.assert(cli(["architecture-edit", "--component", "store", "--component-title", "Store", "--component-responsibility", "Owns persistence"], { cwd: root }).status === 0, "architecture-edit creates a sibling component");
    const dependency = cli(["architecture-edit", "--component", "api", "--depends-on", "store", "--depends-on", "store"], { cwd: root });
    const dependencyPayload = JSON.parse(dependency.stdout) as { generatedDocument: { required: boolean } };
    const parsed = yaml.parseYamlFile<{ components: { api: { depends_on: string[]; boundaries: string[] }; store: unknown } }>(artifactPath);
    context.assert(dependency.status === 0 && dependencyPayload.generatedDocument.required && parsed.components.api.depends_on.length === 1, "architecture updates are idempotent and report document reconciliation");

    const beforeInvalid = readFileSync(artifactPath, "utf8");
    const invalid = cli(["architecture-edit", "--component", "api", "--depends-on", "missing"], { cwd: root });
    context.assert(invalid.status !== 0 && readFileSync(artifactPath, "utf8") === beforeInvalid, "invalid architecture references preserve prior bytes");
    context.assert(cli(["architecture-edit", "--remove-boundary", "api:Does not own storage"], { cwd: root }).status === 0, "architecture-edit removes one exact nested value");
    const removed = yaml.parseYamlFile<{ components: { api: { boundaries: string[] }; store: unknown } }>(artifactPath);
    context.assert(removed.components.api.boundaries.length === 0 && removed.components.store !== undefined, "architecture named removal preserves sibling components");

    cli(["architecture-generate"], { cwd: root });
    context.assert(cli(["architecture-edit", "--delete"], { cwd: root }).status === 0 && existsSync(path.join(root, "ARCHITECTURE.md")), "architecture delete never deletes the generated document implicitly");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
