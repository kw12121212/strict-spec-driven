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

function crossEnvironmentHarnessYaml(developmentPort: number, productionPort: number): string {
  return [
    "schema: strict-spec-driven/harness/v1",
    "schema_version: 1",
    "artifact_type: harness",
    "schema_file: templates/strict-spec-driven/schemas/harness.yaml",
    "harness:",
    "  id: cross-env-ports",
    "  environments:",
    "    development:",
    "      kind: development",
    "      components:",
    "        app:",
    "          type: backend",
    "          working_directory: .",
    "          depends_on: []",
    "          environment:",
    "            required: []",
    "            optional: []",
    "          urls: []",
    "          ports:",
    `            - ${developmentPort}`,
    "          readiness:",
    "            type: manual",
    "            timeout_seconds: 60",
    "            interval_seconds: 5",
    "          operations:",
    "            start:",
    "              mode: manual",
    "            stop:",
    "              mode: manual",
    "            status:",
    "              mode: readonly",
    "            logs:",
    "              mode: readonly",
    "          evidence_labels: []",
    "          unavailable_conditions: []",
    "    production:",
    "      kind: production",
    "      components:",
    "        web:",
    "          type: external_resource",
    "          working_directory: .",
    "          depends_on: []",
    "          environment:",
    "            required: []",
    "            optional: []",
    "          urls: []",
    "          ports:",
    `            - ${productionPort}`,
    "          readiness:",
    "            type: manual",
    "            timeout_seconds: 60",
    "            interval_seconds: 5",
    "          operations:",
    "            start:",
    "              mode: disabled",
    "              requires_confirmation: true",
    "            stop:",
    "              mode: disabled",
    "              requires_confirmation: true",
    "            status:",
    "              mode: readonly",
    "            logs:",
    "              mode: readonly",
    "          evidence_labels: []",
    "          unavailable_conditions: []",
    "",
  ].join("\n");
}

export async function runHarnessInferDoctorSuite(context: TestContext): Promise<void> {
  context.section("[5a] harness infer and doctor commands");

  const inferredWorkspace = createWorkspace({
    "package.json": JSON.stringify({
      name: "inferred-app",
      scripts: { dev: "vite --host 127.0.0.1 --port 4321" },
      devDependencies: { vite: "latest" },
    }, null, 2),
    "docker-compose.yml": [
      "services:",
      "  db:",
      "    image: postgres:16",
      "  app:",
      "    build: .",
      "    command: python -m http.server 8000",
      "    ports:",
      "      - \"8000:8000\"",
      "",
    ].join("\n"),
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
        && !inferJson.draft.includes("command: docker compose up app")
        && inferJson.draft.includes("mode: manual")
        && inferJson.draft.includes("mode: readonly")
        && inferJson.draft.includes("mode: disabled")
        && inferJson.evidence.includes("package.json")
        && inferJson.evidence.some((entry) => entry.includes("Selected package script 'dev'"))
        && inferJson.evidence.includes(".env.example"),
      "harness-infer keeps package scripts ahead of other runtime signals while preserving safe draft defaults",
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

  const composeWorkspace = createWorkspace({
    "package.json": JSON.stringify({
      name: "compose-app",
      scripts: { test: "bun test" },
    }, null, 2),
    "docker-compose.yml": [
      "services:",
      "  db:",
      "    image: postgres:16",
      "  app:",
      "    build: .",
      "    command: python -m http.server 8000",
      "    ports:",
      "      - \"8000:8000\"",
      "",
    ].join("\n"),
    ".env.example": "API_BASE_URL=\n",
  });
  try {
    const infer = cli(["harness-infer"], { cwd: composeWorkspace.workspaceRoot });
    context.assert(infer.status === 0, "harness-infer exits zero for compose metadata", infer.stderr.trim());
    const inferJson = JSON.parse(infer.stdout.trim()) as { ok: boolean; draft: string; evidence: string[] };
    context.assert(
      inferJson.ok === true
        && inferJson.draft.includes("command: docker compose up app")
        && inferJson.draft.includes("Inferred from compose service 'app' in docker-compose.yml.")
        && inferJson.draft.includes("port: 8000")
        && inferJson.evidence.includes("No package.json dev/start/serve script was found.")
        && inferJson.evidence.includes("docker-compose.yml")
        && inferJson.evidence.some((entry) => entry.includes("Selected compose service 'app'")),
      "harness-infer falls back to the first app-like compose service when no package script exists",
      infer.stdout.trim(),
    );
  } finally {
    composeWorkspace.cleanup();
  }

  const noSignalWorkspace = createWorkspace({
    "package.json": JSON.stringify({
      name: "manual-app",
      scripts: { test: "bun test" },
    }, null, 2),
    ".env.example": "API_BASE_URL=\n",
  });
  try {
    const infer = cli(["harness-infer"], { cwd: noSignalWorkspace.workspaceRoot });
    context.assert(infer.status === 0, "harness-infer exits zero when no lifecycle signal can be inferred", infer.stderr.trim());
    const inferJson = JSON.parse(infer.stdout.trim()) as { ok: boolean; draft: string; evidence: string[] };
    context.assert(
      inferJson.ok === true
        && inferJson.draft.includes("No lifecycle command could be inferred; replace manual operations before use.")
        && inferJson.draft.includes("No lifecycle command could be inferred from package.json,")
        && inferJson.draft.includes("docker-compose.yml/compose.yaml, Procfile, or Makefile.")
        && inferJson.evidence.includes("No package.json dev/start/serve script was found.")
        && inferJson.evidence.includes("No supported lifecycle command was inferred from package.json, docker-compose.yml/compose.yaml, Procfile, or Makefile."),
      "harness-infer emits explicit no-detection evidence when no supported runtime signal is present",
      infer.stdout.trim(),
    );
  } finally {
    noSignalWorkspace.cleanup();
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

  // Recovery and --fix testing
  const recoveryWorkspace = createWorkspace({
    ".strict-spec-driven/harness.yaml": [
      "schema: strict-spec-driven/harness/v1",
      "schema_version: 1",
      "artifact_type: harness",
      "schema_file: templates/strict-spec-driven/schemas/harness.yaml",
      "harness:",
      "  id: recovery-test",
      "  environments:",
      "    development:",
      "      kind: development",
      "      components:",
      "        app:",
      "          type: backend",
      "          working_directory: .",
      "          depends_on: []",
      "          environment:",
      "            required:",
      "              - APP_SECRET",
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
    ".env.example": "# initial config\n",
  });
  try {
    const doctorBefore = cli(["harness-doctor"], { cwd: recoveryWorkspace.workspaceRoot });
    context.assert(doctorBefore.status !== 0, "harness-doctor fails initially when scripts and env configs are missing");
    const jsonBefore = JSON.parse(doctorBefore.stdout.trim()) as {
      diagnostics: Array<{
        source: string;
        message: string;
        recovery?: {
          type: string;
          description: string;
          steps: Array<{ action: string; path?: string; args?: string[] }>;
        };
      }>;
    };

    const scriptsRecovery = jsonBefore.diagnostics.find(
      (d) => d.source === "scripts" && d.recovery?.type === "generate_scripts"
    )?.recovery;
    const hasEnvRecovery = jsonBefore.diagnostics.some(
      (d) => d.source === "environment" && d.recovery?.type === "bootstrap_env"
    );

    context.assert(Boolean(scriptsRecovery), "harness-doctor outputs recovery diagnostic for missing wrapper scripts");
    context.assert(hasEnvRecovery, "harness-doctor outputs recovery diagnostic for missing environment variables");

    const scriptsStep = scriptsRecovery?.steps[0];
    context.assert(
      scriptsStep?.action === "run_cli" && JSON.stringify(scriptsStep.args) === JSON.stringify(["harness-scripts", "generate"]),
      "scripts recovery is a shell-free run_cli action"
    );
    context.assert(
      !doctorBefore.stdout.includes(process.cwd()) && !/\/[^"]*node_modules/.test(doctorBefore.stdout),
      "doctor recovery output contains no machine-specific absolute paths"
    );

    const doctorFix = cli(["harness-doctor", "--fix"], { cwd: recoveryWorkspace.workspaceRoot });
    context.assert(doctorFix.status === 0, "harness-doctor --fix runs recovery actions and completes successfully", doctorFix.stderr.trim());

    context.assert(
      existsSync(path.join(recoveryWorkspace.workspaceRoot, "scripts", "harness-start")),
      "harness-doctor --fix generates missing scripts"
    );

    const envExampleContent = readFileSync(path.join(recoveryWorkspace.workspaceRoot, ".env.example"), "utf8");
    context.assert(
      envExampleContent.includes("APP_SECRET="),
      "harness-doctor --fix appends missing environment variables to .env.example"
    );

    const doctorAfter = cli(["harness-doctor"], { cwd: recoveryWorkspace.workspaceRoot });
    context.assert(doctorAfter.status === 0, "subsequent harness-doctor passes cleanly without --fix");
  } finally {
    recoveryWorkspace.cleanup();
  }

  const sharedPortWorkspace = createWorkspace({
    ".strict-spec-driven/harness.yaml": crossEnvironmentHarnessYaml(3000, 3000),
  });
  try {
    const result = cli(["harness-doctor"], { cwd: sharedPortWorkspace.workspaceRoot });
    context.assert(result.status !== 0, "harness-doctor exits non-zero when a port is shared across environments");
    const json = JSON.parse(result.stdout.trim()) as { diagnostics: Array<{ source: string; message: string; expected?: string; actual?: string; recovery?: unknown }> };
    const crossEnvDiagnostic = json.diagnostics.find(
      (diagnostic) => diagnostic.source === "safety" && diagnostic.message.includes("multiple environments"),
    );
    context.assert(
      Boolean(crossEnvDiagnostic)
        && crossEnvDiagnostic!.actual?.includes("development") === true
        && crossEnvDiagnostic!.actual?.includes("production") === true
        && crossEnvDiagnostic!.actual?.includes("3000") === true,
      "harness-doctor reports a safety diagnostic naming the shared port and both environments",
      result.stdout.trim(),
    );
    context.assert(
      !json.diagnostics.some((diagnostic) => diagnostic.recovery !== undefined && diagnostic.message.includes("multiple environments")),
      "cross-environment shared-port diagnostic offers no automatic recovery",
      result.stdout.trim(),
    );
  } finally {
    sharedPortWorkspace.cleanup();
  }

  const distinctPortWorkspace = createWorkspace({
    ".strict-spec-driven/harness.yaml": crossEnvironmentHarnessYaml(3000, 4000),
  });
  try {
    const result = cli(["harness-doctor"], { cwd: distinctPortWorkspace.workspaceRoot });
    const json = JSON.parse(result.stdout.trim()) as { diagnostics: Array<{ source: string; message: string }> };
    context.assert(
      !json.diagnostics.some((diagnostic) => diagnostic.source === "safety" && diagnostic.message.includes("multiple environments")),
      "harness-doctor reports no cross-environment shared-port diagnostic when environments use distinct ports",
      result.stdout.trim(),
    );
    context.assert(
      !json.diagnostics.some((diagnostic) => diagnostic.message.includes("multiple components")),
      "distinct cross-environment ports do not trigger the same-environment duplicate-port diagnostic",
      result.stdout.trim(),
    );
  } finally {
    distinctPortWorkspace.cleanup();
  }
}

