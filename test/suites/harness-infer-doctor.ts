import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { TestContext, cli } from "../support/harness.js";

function createWorkspace(files: Record<string, string>): { workspaceRoot: string; cleanup: () => void } {
  const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "strict-harness-infer-"));
  mkdirSync(path.join(workspaceRoot, ".strict-spec-driven"), { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(workspaceRoot, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content, "utf8");
  }
  return { workspaceRoot, cleanup: () => rmSync(workspaceRoot, { recursive: true, force: true }) };
}

export async function runHarnessInferDoctorSuite(context: TestContext): Promise<void> {
  context.section("[5a] harness infer and doctor commands");

  const inferredWorkspace = createWorkspace({
    "package.json": JSON.stringify({
      name: "inferred-app",
      scripts: { dev: "vite --host 127.0.0.1 --port 4321" },
      devDependencies: { vite: "latest" },
    }, null, 2),
    ".env.example": "API_BASE_URL=\nPUBLIC_FEATURE_FLAG=\n",
    "bun.lock": "",
  });
  try {
    const infer = cli(["harness-infer"], { cwd: inferredWorkspace.workspaceRoot });
    context.assert(infer.status === 0, "harness-infer exits zero for discoverable metadata", infer.stderr.trim());
    const inferJson = JSON.parse(infer.stdout.trim()) as { ok: boolean; created: boolean; draft: string; evidence: string[] };
    context.assert(inferJson.ok === true && inferJson.created === false, "harness-infer reports a non-written valid draft");
    context.assert(
      inferJson.draft.includes("schema: strict-spec-driven/harness/v1")
        && inferJson.draft.includes("command: bun run dev")
        && inferJson.draft.includes("mode: manual")
        && inferJson.draft.includes("mode: readonly")
        && inferJson.draft.includes("mode: disabled")
        && inferJson.evidence.includes("package.json")
        && inferJson.evidence.includes(".env.example"),
      "harness-infer emits a safe draft with manual lifecycle defaults and descriptive readonly status/logs metadata",
      infer.stdout.trim(),
    );
    context.assert(
      !existsSync(path.join(inferredWorkspace.workspaceRoot, ".strict-spec-driven", "harness.yaml")),
      "harness-infer without --write does not create harness.yaml",
    );

    const write = cli(["harness-infer", "--write"], { cwd: inferredWorkspace.workspaceRoot });
    context.assert(write.status === 0, "harness-infer --write exits zero", write.stderr.trim());
    context.assert(
      readFileSync(path.join(inferredWorkspace.workspaceRoot, ".strict-spec-driven", "harness.yaml"), "utf8").includes("AI-assisted draft"),
      "harness-infer --write creates harness.yaml",
    );
    const plan = cli(["harness-plan", "--environment", "development"], { cwd: inferredWorkspace.workspaceRoot });
    context.assert(plan.status === 0, "harness-plan accepts inferred harness draft", plan.stderr.trim());

    const doctorBeforeScripts = cli(["harness-doctor"], { cwd: inferredWorkspace.workspaceRoot });
    context.assert(doctorBeforeScripts.status !== 0, "harness-doctor reports missing generated wrappers before generation");
    const doctorBeforeJson = JSON.parse(doctorBeforeScripts.stdout.trim()) as { diagnostics: Array<{ source: string; actual?: string }> };
    context.assert(
      doctorBeforeJson.diagnostics.some((diagnostic) => diagnostic.source === "scripts" && diagnostic.actual === "missing"),
      "harness-doctor identifies missing harness wrapper scripts",
      doctorBeforeScripts.stdout.trim(),
    );

    const scripts = cli(["harness-scripts", "generate"], { cwd: inferredWorkspace.workspaceRoot });
    context.assert(scripts.status === 0, "harness-scripts generate exits zero with infer and doctor wrappers", scripts.stderr.trim());
    const scriptJson = JSON.parse(scripts.stdout.trim()) as { scripts: string[] };
    context.assert(
      scriptJson.scripts.includes("scripts/harness-infer") && scriptJson.scripts.includes("scripts/harness-doctor"),
      "harness-scripts generate includes infer and doctor wrappers",
      scripts.stdout.trim(),
    );
    const doctorAfterScripts = cli(["harness-doctor"], { cwd: inferredWorkspace.workspaceRoot });
    context.assert(doctorAfterScripts.status === 0, "harness-doctor exits zero after generated wrappers satisfy inferred draft", doctorAfterScripts.stdout.trim());
  } finally {
    inferredWorkspace.cleanup();
  }

  const invalidWorkspace = createWorkspace({
    ".strict-spec-driven/harness.yaml": [
      "schema: strict-spec-driven/harness/v1",
      "schema_version: 1",
      "artifact_type: harness",
      "schema_file: templates/strict-spec-driven/schemas/harness.yaml",
      "harness:",
      "  id: invalid-doctor",
      "  environments:",
      "    development:",
      "      kind: development",
      "      components:",
      "        app:",
      "          type: backend",
      "          working_directory: missing-dir",
      "          depends_on: []",
      "          environment:",
      "            required:",
      "              - API_KEY",
      "            optional: []",
      "          urls: []",
      "          ports:",
      "            - 3000",
      "          readiness:",
      "            type: manual",
      "            timeout_seconds: 60",
      "            interval_seconds: 5",
      "          operations:",
      "            start:",
      "              mode: manual",
      "              command: bun run missing",
      "            stop:",
      "              mode: manual",
      "            status:",
      "              mode: manual",
      "            logs:",
      "              mode: manual",
      "          evidence_labels: []",
      "          unavailable_conditions: []",
      "        api:",
      "          type: backend",
      "          working_directory: .",
      "          depends_on: []",
      "          environment:",
      "            required: []",
      "            optional: []",
      "          urls: []",
      "          ports:",
      "            - 3000",
      "          readiness:",
      "            type: manual",
      "            timeout_seconds: 60",
      "            interval_seconds: 5",
      "          operations:",
      "            start:",
      "              mode: manual",
      "            stop:",
      "              mode: manual",
      "          evidence_labels: []",
      "          unavailable_conditions: []",
      "",
    ].join("\n"),
    "package.json": JSON.stringify({ scripts: { dev: "vite" } }, null, 2),
  });
  try {
    const result = cli(["harness-doctor"], { cwd: invalidWorkspace.workspaceRoot });
    context.assert(result.status !== 0, "harness-doctor exits non-zero for repairable declaration issues");
    const json = JSON.parse(result.stdout.trim()) as { diagnostics: Array<{ source: string; message: string; fieldPath: string }> };
    context.assert(
      json.diagnostics.some((diagnostic) => diagnostic.source === "filesystem" && diagnostic.fieldPath.includes("working_directory"))
        && json.diagnostics.some((diagnostic) => diagnostic.source === "environment" && diagnostic.fieldPath.includes("environment.required"))
        && json.diagnostics.some((diagnostic) => diagnostic.source === "reference" && diagnostic.message.includes("missing package script"))
        && json.diagnostics.some((diagnostic) => diagnostic.source === "reference" && diagnostic.message.includes("multiple components")),
      "harness-doctor reports working-directory, env-sample, package-script, and duplicate-port diagnostics",
      result.stdout.trim(),
    );
  } finally {
    invalidWorkspace.cleanup();
  }

  const componentEnvWorkspace = createWorkspace({
    ".strict-spec-driven/harness.yaml": [
      "schema: strict-spec-driven/harness/v1",
      "schema_version: 1",
      "artifact_type: harness",
      "schema_file: templates/strict-spec-driven/schemas/harness.yaml",
      "harness:",
      "  id: component-env",
      "  environments:",
      "    development:",
      "      kind: development",
      "      components:",
      "        app:",
      "          type: backend",
      "          working_directory: packages/app",
      "          depends_on: []",
      "          environment:",
      "            required:",
      "              - API_KEY",
      "            optional: []",
      "          urls: []",
      "          ports: []",
      "          readiness:",
      "            type: manual",
      "            timeout_seconds: 60",
      "            interval_seconds: 5",
      "          operations:",
      "            start:",
      "              mode: manual",
      "            stop:",
      "              mode: manual",
      "          evidence_labels: []",
      "          unavailable_conditions: []",
      "",
    ].join("\n"),
    "packages/app/.env.example": "API_KEY=\n",
  });
  try {
    cli(["harness-scripts", "generate"], { cwd: componentEnvWorkspace.workspaceRoot });
    const result = cli(["harness-doctor"], { cwd: componentEnvWorkspace.workspaceRoot });
    context.assert(result.status === 0, "harness-doctor accepts required env names documented in component-local sample files", result.stdout.trim());
  } finally {
    componentEnvWorkspace.cleanup();
  }
}
