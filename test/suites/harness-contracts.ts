import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { ROOT, TestContext, cli, loadDistModule, type ScaffoldModule, type ValidationModule, type YamlModule } from "../support/harness.js";

export async function runHarnessContractsSuite(context: TestContext): Promise<void> {
  context.section("[3] harness contracts");

  const yamlModule = await loadDistModule<YamlModule>("yaml.js");
  const validationModule = await loadDistModule<ValidationModule>("validation.js");
  const scaffoldModule = await loadDistModule<ScaffoldModule>("scaffold.js");

  const harnessSchema = validationModule.loadBundledSchemaByArtifactType("harness") as Record<string, unknown>;
  const harnessSessionSchema = validationModule.loadBundledSchemaByArtifactType("harness_session") as Record<string, unknown>;
  context.assert((harnessSchema.properties as Record<string, unknown>)?.harness !== undefined, "harness schema resolves by artifact type");
  context.assert((harnessSessionSchema.properties as Record<string, unknown>)?.harness_session !== undefined, "harness-session schema resolves by artifact type");

  const harnessExample = yamlModule.parseYamlFile<Record<string, unknown>>(path.join(ROOT, "examples", "strict-spec-driven", "harness.yaml"));
  const harnessValidation = validationModule.validateArtifact(harnessSchema, harnessExample, "examples/strict-spec-driven/harness.yaml");
  context.assert(harnessValidation.valid, "harness example validates against harness schema", JSON.stringify(harnessValidation.diagnostics));

  const harnessWithoutStatusLogs = JSON.parse(JSON.stringify(harnessExample)) as Record<string, unknown>;
  const browserComponent = ((((harnessWithoutStatusLogs.harness as Record<string, unknown>).environments as Record<string, unknown>).development as Record<string, unknown>).components as Record<string, unknown>).browser as Record<string, unknown>;
  delete (browserComponent.operations as Record<string, unknown>).status;
  delete (browserComponent.operations as Record<string, unknown>).logs;
  const optionalOperationValidation = validationModule.validateArtifact(harnessSchema, harnessWithoutStatusLogs, "memory://harness-without-status-logs");
  context.assert(optionalOperationValidation.valid, "harness schema accepts components that omit status/logs declarations", JSON.stringify(optionalOperationValidation.diagnostics));

  const harnessWithSecret = JSON.parse(JSON.stringify(harnessExample)) as Record<string, unknown>;
  const development = (((harnessWithSecret.harness as Record<string, unknown>).environments as Record<string, unknown>).development as Record<string, unknown>);
  const web = ((development.components as Record<string, unknown>).web as Record<string, unknown>);
  (web.environment as Record<string, unknown>).values = { PORT: "3000" };
  const secretValidation = validationModule.validateArtifact(harnessSchema, harnessWithSecret, "memory://harness-secret");
  context.assert(secretValidation.valid === false, "harness schema rejects embedded secret values");
  context.assert(
    secretValidation.diagnostics.some((diagnostic) => diagnostic.fieldPath === "$.harness.environments.development.components.web.environment.values"),
    "harness secret diagnostics point to unexpected environment values",
    JSON.stringify(secretValidation.diagnostics),
  );

  const harnessSessionExample = yamlModule.parseYamlFile<Record<string, unknown>>(path.join(ROOT, "examples", "strict-spec-driven", "harness-session.yaml"));
  const sessionValidation = validationModule.validateArtifact(harnessSessionSchema, harnessSessionExample, "examples/strict-spec-driven/harness-session.yaml");
  context.assert(sessionValidation.valid, "harness-session example validates against harness-session schema", JSON.stringify(sessionValidation.diagnostics));
  const sessionWithSecret = JSON.parse(JSON.stringify(harnessSessionExample)) as Record<string, unknown>;
  ((sessionWithSecret.manual_actions as Array<Record<string, unknown>>)[0] as Record<string, unknown>).secrets_recorded = true;
  const sessionSecretValidation = validationModule.validateArtifact(harnessSessionSchema, sessionWithSecret, "memory://harness-session-secret");
  context.assert(sessionSecretValidation.valid === false, "harness-session schema rejects manual actions that record secrets");
  context.assert(
    sessionSecretValidation.diagnostics.some((diagnostic) => diagnostic.fieldPath === "$.manual_actions[0].secrets_recorded"),
    "harness-session secret diagnostics point to forbidden secrets_recorded values",
  );

  context.assert(
    scaffoldModule.getRequiredBundledScaffoldAssets().includes("harness.yaml")
      && !scaffoldModule.getRequiredBundledScaffoldAssets().includes("dev-session.yaml"),
    "strict init scaffold requires harness.yaml instead of dev-session.yaml",
  );

  const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "strict-harness-init-"));
  try {
    const initResult = cli(["init"], { cwd: workspaceRoot });
    context.assert(initResult.status === 0, "init succeeds with harness scaffold", initResult.stderr.trim());
    context.assert(
      readFileSync(path.join(workspaceRoot, ".strict-spec-driven", "harness.yaml"), "utf8").includes("artifact_type: harness"),
      "init writes .strict-spec-driven/harness.yaml",
    );
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }

  const sessionWorkspace = mkdtempSync(path.join(os.tmpdir(), "strict-harness-session-template-"));
  try {
    mkdirSync(path.join(sessionWorkspace, ".strict-spec-driven"), { recursive: true });
    writeFileSync(path.join(sessionWorkspace, ".strict-spec-driven", "harness.yaml"), readFileSync(path.join(ROOT, "examples", "strict-spec-driven", "harness.yaml"), "utf8"));
    const createResult = cli(["harness-session", "create", "contract-session"], { cwd: sessionWorkspace });
    context.assert(createResult.status === 0, "harness-session create uses harness-session scaffold", createResult.stderr.trim());
    const validateResult = cli(["harness-session", "validate", "contract-session"], { cwd: sessionWorkspace });
    context.assert(validateResult.status === 0, "created harness-session scaffold validates", validateResult.stdout.trim());
  } finally {
    rmSync(sessionWorkspace, { recursive: true, force: true });
  }
}
