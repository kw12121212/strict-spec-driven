import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { ROOT, TestContext, cli } from "../support/harness.js";

function createWorkspace(harnessContent?: string): { workspaceRoot: string; cleanup: () => void } {
  const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "strict-harness-plan-"));
  mkdirSync(path.join(workspaceRoot, ".strict-spec-driven"), { recursive: true });
  if (harnessContent !== undefined) {
    writeFileSync(path.join(workspaceRoot, ".strict-spec-driven", "harness.yaml"), harnessContent, "utf8");
  }
  return { workspaceRoot, cleanup: () => rmSync(workspaceRoot, { recursive: true, force: true }) };
}

export async function runHarnessPlanSuite(context: TestContext): Promise<void> {
  context.section("[4] harness-plan command");

  const validWorkspace = createWorkspace(readFileSync(path.join(ROOT, "examples", "strict-spec-driven", "harness.yaml"), "utf8"));
  try {
    const result = cli(["harness-plan", "--environment", "development"], { cwd: validWorkspace.workspaceRoot });
    context.assert(result.status === 0, "harness-plan exits zero for a valid declaration", result.stderr.trim());
    const json = JSON.parse(result.stdout.trim()) as {
      valid: boolean;
      artifactPath: string;
      environment: { id: string; kind: string };
      components: Array<{ id: string; type: string; operations: { start: { mode: string } } }>;
    };
    context.assert(json.valid === true, "harness-plan reports valid=true");
    context.assert(json.artifactPath === ".strict-spec-driven/harness.yaml", "harness-plan reports canonical declaration path");
    context.assert(json.environment.id === "development" && json.environment.kind === "development", "harness-plan reports selected environment");
    context.assert(
      json.components.map((component) => component.id).join(",") === "web,browser"
        && json.components[0]?.operations.start.mode === "script",
      "harness-plan emits dependency-ordered component details",
      result.stdout.trim(),
    );
  } finally {
    validWorkspace.cleanup();
  }

  const missingWorkspace = createWorkspace();
  try {
    const result = cli(["harness-plan"], { cwd: missingWorkspace.workspaceRoot });
    context.assert(result.status !== 0, "harness-plan exits non-zero when declaration is missing");
    const json = JSON.parse(result.stdout.trim()) as { valid: boolean; diagnostics: Array<{ source: string; actual?: string }> };
    context.assert(json.valid === false && json.diagnostics[0]?.source === "filesystem" && json.diagnostics[0]?.actual === "missing", "harness-plan emits missing-file diagnostics");
  } finally {
    missingWorkspace.cleanup();
  }

  const invalidWorkspace = createWorkspace(
    readFileSync(path.join(ROOT, "examples", "strict-spec-driven", "harness.yaml"), "utf8")
      .replace("depends_on:\n            - web", "depends_on:\n            - missing-api"),
  );
  try {
    const result = cli(["harness-plan", "--environment", "development"], { cwd: invalidWorkspace.workspaceRoot });
    context.assert(result.status !== 0, "harness-plan exits non-zero for missing component dependencies");
    const json = JSON.parse(result.stdout.trim()) as { diagnostics: Array<{ source: string; message: string; actual?: string }> };
    context.assert(
      json.diagnostics.some((diagnostic) => diagnostic.source === "reference" && diagnostic.actual === "missing-api"),
      "harness-plan reports deterministic dependency diagnostics",
      result.stdout.trim(),
    );
  } finally {
    invalidWorkspace.cleanup();
  }
}
