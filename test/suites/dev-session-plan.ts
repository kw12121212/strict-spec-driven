import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { ROOT, TestContext, cli } from "../support/harness.js";

function createWorkspace(devSessionContent?: string): { workspaceRoot: string; cleanup: () => void } {
  const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "strict-dev-session-plan-"));
  mkdirSync(path.join(workspaceRoot, ".strict-spec-driven"), { recursive: true });
  if (devSessionContent !== undefined) {
    writeFileSync(path.join(workspaceRoot, ".strict-spec-driven", "dev-session.yaml"), devSessionContent, "utf8");
  }
  return {
    workspaceRoot,
    cleanup: () => rmSync(workspaceRoot, { recursive: true, force: true }),
  };
}

export async function runDevSessionPlanSuite(context: TestContext): Promise<void> {
  context.section("[3] dev-session-plan command");

  const validWorkspace = createWorkspace(
    readFileSync(path.join(ROOT, "examples", "strict-spec-driven", "dev-session.yaml"), "utf8"),
  );
  try {
    const validResult = cli(["dev-session-plan"], { cwd: validWorkspace.workspaceRoot });
    context.assert(validResult.status === 0, "dev-session-plan exits zero for a valid declaration", validResult.stderr.trim());
    context.assert(validResult.stderr.length === 0, "dev-session-plan keeps stderr empty for valid output", validResult.stderr.trim());
    const validJson = JSON.parse(validResult.stdout.trim()) as {
      valid: boolean;
      artifactPath: string;
      diagnostics: unknown[];
      session: {
        id: string;
        services: Array<{ id: string; command: string; workingDirectory: string; browserTargets: string[] }>;
        browserTargets: Array<{ id: string; localOnly: boolean; service?: string }>;
      };
    };
    context.assert(validJson.valid === true, "dev-session-plan reports valid=true for a valid declaration");
    context.assert(validJson.artifactPath === ".strict-spec-driven/dev-session.yaml", "dev-session-plan reports the canonical declaration path");
    context.assert(Array.isArray(validJson.diagnostics) && validJson.diagnostics.length === 0, "dev-session-plan returns an empty diagnostics array on success");
    context.assert(validJson.session.id === "local-web-app", "dev-session-plan preserves the declared session identifier");
    context.assert(
      validJson.session.services[0]?.id === "web"
        && validJson.session.services[0]?.command === "bun run dev"
        && validJson.session.services[0]?.workingDirectory === "."
        && validJson.session.services[0]?.browserTargets[0] === "home",
      "dev-session-plan emits machine-readable service details",
      validResult.stdout.trim(),
    );
    context.assert(
      validJson.session.browserTargets[0]?.id === "home"
        && validJson.session.browserTargets[0]?.service === "web"
        && validJson.session.browserTargets[0]?.localOnly === true,
      "dev-session-plan emits machine-readable browser target details",
      validResult.stdout.trim(),
    );
  } finally {
    validWorkspace.cleanup();
  }

  const missingWorkspace = createWorkspace();
  try {
    const missingResult = cli(["dev-session-plan"], { cwd: missingWorkspace.workspaceRoot });
    context.assert(missingResult.status !== 0, "dev-session-plan exits non-zero when the declaration is missing");
    context.assert(missingResult.stderr.length === 0, "dev-session-plan keeps stderr empty for missing-file diagnostics", missingResult.stderr.trim());
    const missingJson = JSON.parse(missingResult.stdout.trim()) as {
      valid: boolean;
      artifactPath: string;
      diagnostics: Array<{ source: string; fieldPath: string; message: string; actual?: string }>;
    };
    context.assert(missingJson.valid === false, "dev-session-plan reports valid=false when the declaration is missing");
    context.assert(
      missingJson.diagnostics[0]?.source === "filesystem"
        && missingJson.diagnostics[0]?.fieldPath === "$"
        && missingJson.diagnostics[0]?.actual === "missing",
      "dev-session-plan emits deterministic missing-file diagnostics",
      missingResult.stdout.trim(),
    );
  } finally {
    missingWorkspace.cleanup();
  }

  const invalidSchemaWorkspace = createWorkspace(
    [
      "schema: strict-spec-driven/dev-session/v1",
      "schema_version: 1",
      "artifact_type: dev_session",
      "schema_file: ../../templates/strict-spec-driven/schemas/dev-session.yaml",
      "session:",
      "  id: local-web-app",
      "  services:",
      "    web:",
      "      command: bun run dev",
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
      "        timeout_seconds: 60",
      "        interval_seconds: 5",
      "      browser_targets: []",
      "      cleanup:",
      "        mode: none",
      "        grace_period_seconds: 0",
      "      unavailable_conditions: []",
      "  browser_targets: {}",
      "",
    ].join("\n"),
  );
  try {
    const invalidSchemaResult = cli(["dev-session-plan"], { cwd: invalidSchemaWorkspace.workspaceRoot });
    context.assert(invalidSchemaResult.status !== 0, "dev-session-plan exits non-zero for schema-invalid declarations");
    context.assert(
      invalidSchemaResult.stderr.length === 0,
      "dev-session-plan keeps stderr empty for schema diagnostics",
      invalidSchemaResult.stderr.trim(),
    );
    const invalidSchemaJson = JSON.parse(invalidSchemaResult.stdout.trim()) as {
      valid: boolean;
      diagnostics: Array<{ source: string; fieldPath: string; message: string }>;
    };
    context.assert(invalidSchemaJson.valid === false, "dev-session-plan reports valid=false for schema-invalid declarations");
    context.assert(
      invalidSchemaJson.diagnostics.some(
        (diagnostic) =>
          diagnostic.source === "schema"
          && diagnostic.fieldPath === "$.session.services.web.environment.values",
      ),
      "dev-session-plan surfaces schema diagnostics for invalid declaration fields",
      invalidSchemaResult.stdout.trim(),
    );
  } finally {
    invalidSchemaWorkspace.cleanup();
  }
}
