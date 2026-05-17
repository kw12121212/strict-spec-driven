import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { TestContext, createCopiedProjectWorkspace, projectWorkspaceCli } from "../support/harness.js";

const FIXTURE_DEV_SESSION_YAML = [
  "schema: strict-spec-driven/dev-session/v1",
  "schema_version: 1",
  "artifact_type: dev_session",
  "schema_file: ../../templates/strict-spec-driven/schemas/dev-session.yaml",
  "session:",
  "  id: todo-app",
  "  description: Local development session for the todo-app fixture.",
  "  services:",
  "    web:",
  "      description: Todo app dev server.",
  "      command: npm run dev",
  "      working_directory: \".\"",
  "      environment:",
  "        required:",
  "          - PORT",
  "        optional: []",
  "      urls:",
  "        - \"http://127.0.0.1:3000\"",
  "      ports:",
  "        - 3000",
  "      readiness:",
  "        type: http",
  "        url: \"http://127.0.0.1:3000/health\"",
  "        timeout_seconds: 30",
  "        interval_seconds: 2",
  "        notes:",
  "          - Start the dev server before running browser smoke checks.",
  "      browser_targets:",
  "        - home",
  "      cleanup:",
  "        mode: signal",
  "        signal: SIGTERM",
  "        grace_period_seconds: 5",
  "      unavailable_conditions:",
  "        - Run npm install before starting the dev server.",
  "  browser_targets:",
  "    home:",
  "      url: \"http://127.0.0.1:3000\"",
  "      smoke_paths:",
  "        - /",
  "      evidence_labels:",
  "        - homepage-loaded",
  "      local_only: true",
  "      service: web",
  "      notes:",
  "        - Confirm the todo list renders without console errors.",
  "",
].join("\n");

const INVALID_DEV_SESSION_YAML = [
  "schema: strict-spec-driven/dev-session/v1",
  "schema_version: 1",
  "artifact_type: dev_session",
  "schema_file: ../../templates/strict-spec-driven/schemas/dev-session.yaml",
  "session:",
  "  id: todo-app",
  "  services:",
  "    web:",
  "      command: npm run dev",
  "      working_directory: \".\"",
  "      environment:",
  "        required: []",
  "        optional: []",
  "        values:",
  "          PORT: \"3000\"",
  "      urls: []",
  "      ports: []",
  "      readiness:",
  "        type: manual",
  "        timeout_seconds: 30",
  "        interval_seconds: 2",
  "      browser_targets: []",
  "      cleanup:",
  "        mode: none",
  "        grace_period_seconds: 0",
  "      unavailable_conditions: []",
  "  browser_targets: {}",
  "",
].join("\n");

function setupDevSession(workspaceRoot: string, content: string): void {
  const strictDir = path.join(workspaceRoot, ".strict-spec-driven");
  mkdirSync(strictDir, { recursive: true });
  writeFileSync(path.join(strictDir, "dev-session.yaml"), content, "utf8");
}

export async function runDevSessionRegressionSuite(context: TestContext): Promise<void> {
  context.section("[5a] dev-session real-project fixture regression");

  // Valid plan output against the todo-app fixture.
  const validWorkspace = createCopiedProjectWorkspace("todo-app");
  try {
    setupDevSession(validWorkspace.workspaceRoot, FIXTURE_DEV_SESSION_YAML);
    const planResult = projectWorkspaceCli(validWorkspace.workspaceRoot, ["dev-session-plan"]);
    context.assert(planResult.status === 0, "dev-session-plan exits zero for todo-app fixture", planResult.stderr.trim());
    context.assert(planResult.stderr.length === 0, "dev-session-plan keeps stderr empty for todo-app fixture", planResult.stderr.trim());
    const planJson = JSON.parse(planResult.stdout.trim()) as {
      valid: boolean;
      artifactPath: string;
      diagnostics: unknown[];
      session: {
        id: string;
        services: Array<{ id: string; command: string; workingDirectory: string; browserTargets: string[] }>;
        browserTargets: Array<{ id: string; localOnly: boolean; service?: string }>;
      };
    };
    context.assert(planJson.valid === true, "dev-session-plan reports valid=true for todo-app fixture");
    context.assert(Array.isArray(planJson.diagnostics) && planJson.diagnostics.length === 0, "dev-session-plan produces no diagnostics for todo-app fixture");
    context.assert(planJson.session.id === "todo-app", "dev-session-plan emits the declared session id from the fixture");
    context.assert(
      planJson.session.services[0]?.id === "web"
        && planJson.session.services[0]?.command === "npm run dev"
        && planJson.session.services[0]?.workingDirectory === "."
        && planJson.session.services[0]?.browserTargets[0] === "home",
      "dev-session-plan emits fixture service details deterministically",
      planResult.stdout.trim(),
    );
    context.assert(
      planJson.session.browserTargets[0]?.id === "home"
        && planJson.session.browserTargets[0]?.service === "web"
        && planJson.session.browserTargets[0]?.localOnly === true,
      "dev-session-plan emits fixture browser target details deterministically",
      planResult.stdout.trim(),
    );

    // Evidence separation: plan must not create runtime state.
    const runtimeDir = path.join(validWorkspace.workspaceRoot, ".strict-spec-driven", ".runtime");
    context.assert(
      !existsSync(runtimeDir),
      "dev-session-plan does not create a runtime directory (plan is inspection-only, not a process start)",
    );
  } finally {
    validWorkspace.cleanup();
  }

  // Invalid metadata diagnostics in project fixture context.
  const invalidWorkspace = createCopiedProjectWorkspace("todo-app");
  try {
    setupDevSession(invalidWorkspace.workspaceRoot, INVALID_DEV_SESSION_YAML);
    const invalidResult = projectWorkspaceCli(invalidWorkspace.workspaceRoot, ["dev-session-plan"]);
    context.assert(invalidResult.status !== 0, "dev-session-plan exits non-zero for invalid fixture metadata");
    const invalidJson = JSON.parse(invalidResult.stdout.trim()) as {
      valid: boolean;
      diagnostics: Array<{ source: string; fieldPath: string }>;
    };
    context.assert(invalidJson.valid === false, "dev-session-plan reports valid=false for invalid fixture metadata");
    context.assert(
      invalidJson.diagnostics.some((d) => d.source === "schema"),
      "dev-session-plan reports schema diagnostics for invalid fixture metadata",
      invalidResult.stdout.trim(),
    );
  } finally {
    invalidWorkspace.cleanup();
  }

  // Stale runtime state recovery: stop with no prior start.
  const staleWorkspace = createCopiedProjectWorkspace("todo-app");
  try {
    setupDevSession(staleWorkspace.workspaceRoot, FIXTURE_DEV_SESSION_YAML);
    const stopResult = projectWorkspaceCli(staleWorkspace.workspaceRoot, ["dev-session-stop"]);
    context.assert(stopResult.status === 0, "dev-session-stop exits zero when no runtime state exists in fixture");
    const stopJson = JSON.parse(stopResult.stdout.trim()) as {
      ok: boolean;
      services: unknown[];
      diagnostics: unknown[];
    };
    context.assert(stopJson.ok === true, "dev-session-stop reports ok=true when no runtime state exists in fixture");
    context.assert(
      Array.isArray(stopJson.services) && stopJson.services.length === 0,
      "dev-session-stop reports an empty services list when nothing was started in fixture",
      stopResult.stdout.trim(),
    );
    context.assert(
      Array.isArray(stopJson.diagnostics) && stopJson.diagnostics.length === 0,
      "dev-session-stop produces no diagnostics when no runtime state exists in fixture",
      stopResult.stdout.trim(),
    );
  } finally {
    staleWorkspace.cleanup();
  }

  // Browser trial evidence derivation from declared browser targets.
  const trialWorkspace = createCopiedProjectWorkspace("todo-app");
  try {
    setupDevSession(trialWorkspace.workspaceRoot, FIXTURE_DEV_SESSION_YAML);
    const trialResult = projectWorkspaceCli(trialWorkspace.workspaceRoot, ["dev-session-trial"]);
    context.assert(trialResult.status === 0, "dev-session-trial exits zero for fixture with no running service");
    context.assert(trialResult.stderr.length === 0, "dev-session-trial keeps stderr empty for fixture JSON output", trialResult.stderr.trim());
    const trialJson = JSON.parse(trialResult.stdout.trim()) as {
      ok: boolean;
      runtimeStatePath: string;
      browserTargets: Array<{ id: string; provenance: string; trialReady: boolean }>;
    };
    context.assert(trialJson.ok === true, "dev-session-trial reports ok=true when reporting unavailable guidance for fixture");
    context.assert(
      trialJson.runtimeStatePath === ".strict-spec-driven/.runtime/dev-session/state.json",
      "dev-session-trial reports the canonical runtime state path for fixture",
      trialResult.stdout.trim(),
    );
    context.assert(
      trialJson.browserTargets[0]?.id === "home"
        && trialJson.browserTargets[0]?.provenance === "unavailable"
        && trialJson.browserTargets[0]?.trialReady === false,
      "dev-session-trial derives unavailable guidance from declared fixture browser targets without a running service",
      trialResult.stdout.trim(),
    );
  } finally {
    trialWorkspace.cleanup();
  }
}
