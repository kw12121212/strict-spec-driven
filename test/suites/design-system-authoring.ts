import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { TestContext, cli, loadDistModule, type YamlModule } from "../support/harness.js";

export async function runDesignSystemAuthoringSuite(context: TestContext): Promise<void> {
  context.section("[design-system-authoring] named YAML mutations");
  const yaml = await loadDistModule<YamlModule>("yaml.js");
  const root = mkdtempSync(path.join(os.tmpdir(), "strict-design-authoring-"));
  try {
    cli(["init"], { cwd: root });
    context.assert(cli(["design-init"], { cwd: root }).status === 0, "design-init creates its YAML through the shared boundary");
    const artifactPath = path.join(root, ".strict-spec-driven", "design-system.yaml");
    const token = cli(["design-edit", "--overview", "A compact interface", "--token-group", "colors", "--token", "primary", "--token-value", "#123456", "--do", "Use declared tokens", "--do", "Use declared tokens"], { cwd: root });
    const tokenPayload = JSON.parse(token.stdout) as { generatedDocument: { required: boolean } };
    const parsed = yaml.parseYamlFile<{ tokens: { colors: { primary: string } }; guidance: { do: string[] } }>(artifactPath);
    context.assert(token.status === 0 && tokenPayload.generatedDocument.required && parsed.tokens.colors.primary === "#123456" && parsed.guidance.do.length === 1, "design token and guidance updates are non-destructive and idempotent");

    context.assert(cli(["design-edit", "--component", "button", "--component-title", "Button", "--component-token", "background=colors.primary", "--implementation", "src/button.tsx", "--snapshot", "test/button.png"], { cwd: root }).status === 0, "design-edit records component token and visual mappings");
    const beforeInvalid = readFileSync(artifactPath, "utf8");
    const invalid = cli(["design-edit", "--token-group", "unknown", "--token", "bad", "--token-value", "value"], { cwd: root });
    context.assert(invalid.status !== 0 && readFileSync(artifactPath, "utf8") === beforeInvalid, "invalid design candidates preserve prior bytes");
    context.assert(cli(["design-edit", "--remove-token", "colors:primary"], { cwd: root }).status === 0, "design-edit removes one exact token");
    const removed = yaml.parseYamlFile<{ tokens: Record<string, unknown>; components: { button: unknown } }>(artifactPath);
    context.assert(removed.tokens.colors === undefined && removed.components.button !== undefined, "token removal preserves sibling design components");

    cli(["design-generate"], { cwd: root });
    context.assert(cli(["design-edit", "--delete"], { cwd: root }).status === 0 && existsSync(path.join(root, "DESIGN.md")), "design delete never removes the generated document implicitly");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
