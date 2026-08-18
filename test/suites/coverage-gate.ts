import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import {
  ROOT,
  TestContext,
  cli,
  loadDistModule,
  runCommand,
  type CommandResult,
  type ValidationModule,
  type YamlModule,
} from "../support/harness.js";

const CONFIG_HEADER = [
  "schema: strict-spec-driven/config/v1",
  "schema_version: 1",
  "artifact_type: workflow_config",
].join("\n");

function configWithCoverage(coverageLines: string[]): string {
  return [
    CONFIG_HEADER,
    "review_evidence:",
    "  project_regression:",
    "    method: complete_project_regression",
    "    command: npm test",
    ...coverageLines.map((line) => `    ${line}`),
    "",
  ].join("\n");
}

function summaryEntry(total: number, covered: number): object {
  const pct = total === 0 ? 0 : (covered / total) * 100;
  return { lines: { total, covered, skipped: 0, pct } };
}

export async function runCoverageGateSuite(context: TestContext): Promise<void> {
  context.section("[coverage-gate] threshold checks against fixture summaries");

  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "strict-coverage-gate-"));
  const gate = (args: string[]): CommandResult =>
    runCommand("bun", [path.join(ROOT, "scripts", "coverage-gate.ts"), ...args], { cwd: ROOT });
  const fixtureRoot = path.join(tempRoot, "project");

  try {
    const summaryPath = path.join(tempRoot, "coverage-summary.json");
    writeFileSync(
      summaryPath,
      JSON.stringify({
        total: summaryEntry(1000, 1000),
        [path.join(fixtureRoot, "src", "a.ts")]: summaryEntry(150, 60),
        [path.join(fixtureRoot, "src", "cli", "b.ts")]: summaryEntry(50, 25),
        [path.join(fixtureRoot, "dist", "scripts", "src", "c.ts")]: summaryEntry(100, 35),
        [path.join(fixtureRoot, "src", "embedded-templates.ts")]: summaryEntry(500, 500),
        [path.join(fixtureRoot, "node_modules", "dep", "index.js")]: summaryEntry(400, 0),
        [path.join(fixtureRoot, "test", "x.ts")]: summaryEntry(300, 300),
      }),
    );
    // In-scope lines: 150+50+100 = 300 total, 60+25+35 = 120 covered -> 40%.

    const below = gate(["--summary", summaryPath, "--project-root", fixtureRoot, "--threshold", "50"]);
    context.assert(below.status === 1, "below-threshold summary exits 1");
    context.assert(below.stderr.includes("40%"), "failure diagnostic names the measured coverage");
    context.assert(below.stderr.includes("threshold 50%"), "failure diagnostic names the required threshold");
    context.assert(below.stderr.includes("120/300"), "failure diagnostic reports src-scope line counts, excluding generated, dependency, and test files");

    const at = gate(["--summary", summaryPath, "--project-root", fixtureRoot, "--threshold", "40"]);
    context.assert(at.status === 0, "at-threshold summary exits 0");
    context.assert(at.stdout.includes("PASS"), "at-threshold summary reports PASS");

    const above = gate(["--summary", summaryPath, "--project-root", fixtureRoot, "--threshold", "12.5"]);
    context.assert(above.status === 0, "above-threshold summary exits 0");

    const missing = gate(["--summary", path.join(tempRoot, "missing.json"), "--threshold", "10"]);
    context.assert(missing.status === 2, "missing summary file exits 2");
    context.assert(missing.stderr.includes("not found"), "missing summary diagnostic names the path problem");

    const malformedPath = path.join(tempRoot, "malformed.json");
    writeFileSync(malformedPath, "not json");
    const malformed = gate(["--summary", malformedPath, "--threshold", "10"]);
    context.assert(malformed.status === 2, "malformed summary exits 2");
    context.assert(malformed.stderr.includes("not valid JSON"), "malformed summary diagnostic names the parse problem");

    const emptyPath = path.join(tempRoot, "empty.json");
    writeFileSync(emptyPath, JSON.stringify({ total: summaryEntry(10, 10) }));
    const empty = gate(["--summary", emptyPath, "--project-root", fixtureRoot, "--threshold", "10"]);
    context.assert(empty.status === 2, "summary without src/** entries exits 2");
    context.assert(empty.stderr.includes("no src/** line coverage data"), "empty-scope diagnostic explains the missing data");

    const badThreshold = gate(["--summary", summaryPath, "--project-root", fixtureRoot, "--threshold", "150"]);
    context.assert(badThreshold.status === 2, "out-of-range threshold exits 2");
    context.assert(badThreshold.stderr.includes("between 0 and 100"), "threshold diagnostic explains the valid range");

    const unknownArg = gate(["--summary", summaryPath, "--nonsense"]);
    context.assert(unknownArg.status === 2, "unknown argument exits 2");
    context.assert(unknownArg.stderr.includes("--nonsense"), "unknown-argument diagnostic names the argument");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }

  context.section("[coverage-gate] config coverage declaration validation");

  const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "strict-coverage-config-"));
  const stateDir = path.join(workspaceRoot, ".strict-spec-driven");
  const configPath = path.join(stateDir, "config.yaml");
  const preflight = (): CommandResult => cli(["check-workflow-state"], { cwd: workspaceRoot });

  try {
    mkdirSync(stateDir, { recursive: true });

    const missingConfig = preflight();
    context.assert(missingConfig.status === 0, "workflow state without config.yaml stays valid");

    writeFileSync(configPath, configWithCoverage([]));
    const absentDeclaration = preflight();
    context.assert(absentDeclaration.status === 0, "config without a coverage declaration stays valid");
    context.assert(
      absentDeclaration.stdout.includes("strict workflow state exists"),
      "config without a coverage declaration keeps the existing success message",
    );

    writeFileSync(
      configPath,
      configWithCoverage(["coverage:", "  threshold: 80", "  metric: line", "  scope:", "    include:", "      - src/**", "    exclude:", "      - src/generated/**"]),
    );
    const validDeclaration = preflight();
    context.assert(validDeclaration.status === 0, "valid coverage declaration exits zero");

    writeFileSync(configPath, configWithCoverage(["coverage:", "  threshold: 150", "  metric: line"]));
    const outOfRange = preflight();
    context.assert(outOfRange.status === 1, "out-of-range threshold exits non-zero");
    context.assert(
      outOfRange.stderr.includes("$.review_evidence.project_regression.coverage.threshold"),
      "out-of-range threshold diagnostic names the field path",
    );

    writeFileSync(configPath, configWithCoverage(["coverage:", "  threshold: high", "  metric: line"]));
    const nonNumeric = preflight();
    context.assert(nonNumeric.status === 1, "non-numeric threshold exits non-zero");
    context.assert(nonNumeric.stderr.includes("coverage.threshold"), "non-numeric threshold diagnostic names the field");

    writeFileSync(configPath, configWithCoverage(["coverage:", "  threshold: 80", "  metric: branch"]));
    const unknownMetric = preflight();
    context.assert(unknownMetric.status === 1, "unknown metric exits non-zero");
    context.assert(unknownMetric.stderr.includes("coverage.metric"), "unknown metric diagnostic names the field");

    writeFileSync(configPath, configWithCoverage(["coverage:", "  threshold: 80", "  metric: line", "  scope:", "    include: []"]));
    const emptyInclude = preflight();
    context.assert(emptyInclude.status === 1, "empty scope include exits non-zero");
    context.assert(emptyInclude.stderr.includes("coverage.scope.include"), "empty include diagnostic names the field");

    writeFileSync(configPath, configWithCoverage(["coverage:", "  threshold: 80", "  metric: line", "  ratchet: true"]));
    const unknownKey = preflight();
    context.assert(unknownKey.status === 1, "unknown coverage subtree key exits non-zero");
    context.assert(unknownKey.stderr.includes("coverage"), "unknown-key diagnostic points at the coverage subtree");

    writeFileSync(configPath, "schema: [broken\n  nope");
    const malformedYaml = preflight();
    context.assert(malformedYaml.status === 1, "malformed YAML config exits non-zero");
    context.assert(malformedYaml.stderr.includes("not valid YAML"), "malformed YAML diagnostic names the problem");

    const missingDir = cli(["check-workflow-state"], { cwd: os.tmpdir() });
    context.assert(missingDir.status === 1, "missing workflow directory still exits non-zero");
    context.assert(
      missingDir.stderr.includes("strict workflow state is missing"),
      "missing workflow directory keeps the existing message",
    );
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }

  context.section("[coverage-gate] self-hosted coverage contract");

  const yamlModule = await loadDistModule<YamlModule>("yaml.js");
  const validationModule = await loadDistModule<ValidationModule>("validation.js");
  const selfConfigPath = path.join(ROOT, ".strict-spec-driven", "config.yaml");
  const selfConfig = yamlModule.parseYamlDocument<{
    preferred_human_language?: string;
    review_evidence?: {
      project_regression?: {
        command?: string;
        coverage?: { threshold?: number; metric?: string; scope?: { include?: string[]; exclude?: string[] } };
      };
    };
  }>(readFileSync(selfConfigPath, "utf8"));

  const configSchema = validationModule.loadBundledSchemaByArtifactType("workflow_config");
  const selfValidation = validationModule.validateArtifact(configSchema, selfConfig, ".strict-spec-driven/config.yaml");
  context.assert(selfValidation.valid, "self-hosted config validates against the bundled config schema");
  context.assert(
    selfConfig.preferred_human_language === "English",
    "self-hosted workflow config declares the default preferred human language",
  );

  const regression = selfConfig.review_evidence?.project_regression;
  const declaration = regression?.coverage;
  context.assert(declaration !== undefined, "self-hosted config declares a coverage contract");
  context.assert(typeof declaration?.threshold === "number", "self-hosted coverage threshold is numeric");
  context.assert(declaration?.metric === "line", "self-hosted coverage metric is line");
  context.assert(
    Array.isArray(declaration?.scope?.include) && declaration.scope.include.includes("src/**"),
    "self-hosted coverage scope includes src/**",
  );

  const command = regression?.command ?? "";
  context.assert(command.includes("scripts/coverage-gate.ts"), "regression command invokes the coverage gate");
  const thresholdMatch = command.match(/--threshold[= ](\d+(?:\.\d+)?)/);
  context.assert(thresholdMatch !== null, "regression command carries an explicit --threshold value");
  context.assert(
    thresholdMatch !== null && Number(thresholdMatch[1]) === declaration?.threshold,
    "regression command threshold equals the declared coverage threshold",
  );

  // A gate that only runs under an undocumented override reports the caller's environment rather
  // than the repository's state, and no two runs of it are comparable. The recorded form is the
  // only form callers use, so it must carry no environment prefix, and the resource the report step
  // needs must come from the script instead. The gate is not executed here — it runs this suite —
  // so the executed proof is the gate's own run in this change's verification evidence, and what is
  // asserted here is that neither half of the arrangement can drift away alone.
  context.assert(
    !/\bNODE_OPTIONS\b|^\s*\w+=/.test(command),
    "the recorded regression command carries no environment-variable override a caller has to supply",
    command,
  );
  const coverageGateSource = readFileSync(path.join(ROOT, "scripts", "coverage-gate.ts"), "utf8");
  const suppliesReportHeap = (source: string): boolean => /--max-old-space-size=/.test(source);
  context.assert(
    suppliesReportHeap(coverageGateSource),
    "the coverage gate supplies the report step's heap itself rather than relying on the caller",
  );
  context.assert(
    !suppliesReportHeap('runStep("coverage report", "node", [c8Binary, "report"]);'),
    "the heap predicate rejects a report step that passes no heap flag",
  );
  // The pair is only a guard if either half failing is visible: a recorded command that reinstates
  // the override must be rejected by the same predicate that accepts the current one.
  context.assert(
    /\bNODE_OPTIONS\b|^\s*\w+=/.test("NODE_OPTIONS=--max-old-space-size=5120 bun scripts/coverage-gate.ts --threshold 78"),
    "the recorded-command predicate rejects a command that reinstates the environment override",
  );

  context.section("[coverage-gate] coverage-consistent generated surfaces");

  const maintenanceWorkspace = mkdtempSync(path.join(os.tmpdir(), "strict-coverage-maint-"));
  try {
    const maintenanceStateDir = path.join(maintenanceWorkspace, ".strict-spec-driven");
    mkdirSync(path.join(maintenanceStateDir, "specs", "changes"), { recursive: true });
    writeFileSync(
      path.join(maintenanceStateDir, "config.yaml"),
      [
        "schema: strict-spec-driven/config/v1",
        "schema_version: 1",
        "artifact_type: workflow_config",
        "review_evidence:",
        "  project_regression:",
        "    method: complete_project_regression",
        "    command: npm run build && npm test -- --coverage",
        "maintenance:",
        "  checks:",
        "    - type: specs-directory-structure-check",
        "",
      ].join("\n"),
      "utf8",
    );
    const maintenanceRun = cli(["maintenance"], { cwd: maintenanceWorkspace });
    context.assert(maintenanceRun.status === 0, "maintenance run exits zero in the coverage workspace");
    const maintenanceJson = JSON.parse(maintenanceRun.stdout) as { generatedChange?: string | null };
    context.assert(
      typeof maintenanceJson.generatedChange === "string" && maintenanceJson.generatedChange.length > 0,
      "maintenance run generates a change from the planted finding",
    );
    const maintenanceTasks = readFileSync(
      path.join(maintenanceStateDir, "changes", String(maintenanceJson.generatedChange), "tasks.yaml"),
      "utf8",
    );
    context.assert(
      maintenanceTasks.includes("run-project-regression:")
        && maintenanceTasks.includes("npm run build && npm test -- --coverage")
        && !maintenanceTasks.includes("bun run build"),
      "maintenance-generated tasks carry the configured regression command instead of hardcoded toolchain commands",
    );
    context.assert(
      maintenanceTasks.includes("validation_task: run-project-regression")
        && maintenanceTasks.includes("unit_test_task: run-project-regression"),
      "maintenance-generated testing gates reference the project-regression task",
    );

    // A seeded change needs the interrogation gate as much as a hand-proposed one, and design.yaml
    // is deliberately left unauthored because the check results cannot supply an approach.
    const maintenanceChangeDir = path.join(maintenanceStateDir, "changes", String(maintenanceJson.generatedChange));
    const maintenanceQuestions = readFileSync(path.join(maintenanceChangeDir, "questions.yaml"), "utf8");
    context.assert(
      maintenanceQuestions.includes("id: requirement-problem")
        && maintenanceQuestions.includes("kind: requirement"),
      "maintenance-generated change carries the requirement-interrogation gate",
    );
    context.assert(
      !existsSync(path.join(maintenanceChangeDir, "design.yaml")),
      "maintenance writes no placeholder design artifact",
    );
  } finally {
    rmSync(maintenanceWorkspace, { recursive: true, force: true });
  }

  const reviewSkillText = readFileSync(path.join(ROOT, "skills", "strict-spec-review", "SKILL.md"), "utf8");
  const verifySkillText = readFileSync(path.join(ROOT, "skills", "strict-spec-verify", "SKILL.md"), "utf8");
  const autoSkillText = readFileSync(path.join(ROOT, "skills", "strict-spec-auto", "SKILL.md"), "utf8");
  const initSkillText = readFileSync(path.join(ROOT, "skills", "strict-spec-init", "SKILL.md"), "utf8");
  for (const [skillName, text] of [
    ["strict-spec-review", reviewSkillText],
    ["strict-spec-verify", verifySkillText],
    ["strict-spec-auto", autoSkillText],
  ] as const) {
    context.assert(
      text.includes("coverage contract") && text.includes("never advisory"),
      `${skillName} guidance treats a declared coverage contract as blocking review evidence`,
    );
  }
  context.assert(
    reviewSkillText.includes("complete project regression command")
      && autoSkillText.includes("complete project regression command"),
    "coverage wording preserves the drift-pinned regression command phrase",
  );
  context.assert(
    initSkillText.includes("coverage contract") && initSkillText.includes("review_evidence.project_regression.command"),
    "strict-spec-init guidance directs configuring the regression command and coverage contract",
  );
  const normalizedInitSkillText = initSkillText.replace(/\s+/g, " ");
  context.assert(
    normalizedInitSkillText.includes("preferred_human_language")
      && normalizedInitSkillText.includes("human language")
      && normalizedInitSkillText.includes("not a programming language")
      && normalizedInitSkillText.includes("English"),
    "strict-spec-init guidance directs configuring the preferred human language field",
  );
}
