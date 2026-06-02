import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import {
  ROOT,
  TestContext,
  cli,
  loadDistModule,
  type SkillValidationModule,
} from "../support/harness.js";

type StrictCliModule = {
  commands: Record<string, unknown>;
};

type CliRegistryModule = {
  COMMAND_REGISTRATION_ORDER: string[];
};

export async function runEntrypointAndSkillsSuite(context: TestContext): Promise<void> {
context.section("[1] entrypoint smoke test");

const expectedCommandOrder = [
  "init",
  "check-workflow-state",
  "propose",
  "generate",
  "apply",
  "verify",
  "ready",
  "next",
  "verify-spec-mappings",
  "validate-skills",
  "schema-list",
  "schema-show",
  "template-list",
  "template-show",
  "harness-infer",
  "harness-doctor",
  "harness-plan",
  "harness-start",
  "harness-stop",
  "harness-status",
  "harness-logs",
  "harness-scripts",
  "harness-session",
  "migrate",
  "roadmap-status",
  "roadmap-overview",
  "roadmap-sync",
  "roadmap-recommend",
  "maintenance",
  "ship",
  "commit-and-push",
  "archive",
  "list",
  "modify",
  "cancel",
];
const expectedCommandUsage = `Commands: ${expectedCommandOrder.join(", ")}`;

const noArgs = cli([]);
context.assert(noArgs.status !== 0, "no-arg invocation exits non-zero", `got exit code ${noArgs.status}`);
context.assert(
  noArgs.stderr.includes("Usage:"),
  "no-arg invocation prints usage hint to stderr",
  `stderr: ${noArgs.stderr.trim()}`,
);
context.assert(
  noArgs.stderr.includes(expectedCommandUsage),
  "no-arg invocation preserves canonical command listing order",
  `stderr: ${noArgs.stderr.trim()}`,
);

const unknownCmd = cli(["unknown-subcommand"]);
context.assert(unknownCmd.status !== 0, "unknown subcommand exits non-zero", `got exit code ${unknownCmd.status}`);
context.assert(
  unknownCmd.stderr.includes("Usage:"),
  "unknown subcommand prints usage hint to stderr",
  `stderr: ${unknownCmd.stderr.trim()}`,
);
context.assert(
  unknownCmd.stderr.includes(expectedCommandUsage),
  "unknown subcommand preserves canonical command listing order",
  `stderr: ${unknownCmd.stderr.trim()}`,
);

const rootHelp = cli(["--help"]);
context.assert(rootHelp.status === 0, "root help exits zero", `got exit code ${rootHelp.status}`);
context.assert(
  rootHelp.stdout.includes("Usage:") && rootHelp.stdout.includes(expectedCommandUsage),
  "root help prints usage and canonical command listing to stdout",
  `stdout: ${rootHelp.stdout.trim()}`,
);
context.assert(rootHelp.stderr.length === 0, "root help keeps stderr empty", `stderr: ${rootHelp.stderr.trim()}`);

for (const commandName of expectedCommandOrder) {
  const commandHelp = cli([commandName, "--help"], { cwd: ROOT });
  context.assert(commandHelp.status === 0, `${commandName} --help exits zero`, `stderr: ${commandHelp.stderr.trim()}`);
  context.assert(
    commandHelp.stdout.includes(`Usage: strict-spec-driven ${commandName}`),
    `${commandName} --help prints command usage to stdout`,
    `stdout: ${commandHelp.stdout.trim()}`,
  );
  context.assert(commandHelp.stderr.length === 0, `${commandName} --help keeps stderr empty`, `stderr: ${commandHelp.stderr.trim()}`);
}

const workflowStateSuccess = cli(["check-workflow-state"], { cwd: ROOT });
context.assert(
  workflowStateSuccess.status === 0,
  "check-workflow-state exits zero when .strict-spec-driven/ exists",
  `stdout: ${workflowStateSuccess.stdout.trim()} stderr: ${workflowStateSuccess.stderr.trim()}`,
);
context.assert(
  workflowStateSuccess.stdout.includes("strict workflow state exists"),
  "check-workflow-state reports existing strict workflow state",
  `stdout: ${workflowStateSuccess.stdout.trim()}`,
);

const missingWorkflowStateRoot = mkdtempSync(path.join(os.tmpdir(), "strict-workflow-state-missing-"));
try {
  const workflowStateMissing = cli(["check-workflow-state"], { cwd: missingWorkflowStateRoot });
  context.assert(
    workflowStateMissing.status !== 0,
    "check-workflow-state exits non-zero when .strict-spec-driven/ is missing",
    `stdout: ${workflowStateMissing.stdout.trim()} stderr: ${workflowStateMissing.stderr.trim()}`,
  );
  context.assert(
    workflowStateMissing.stderr.includes("strict workflow state is missing")
      && workflowStateMissing.stderr.includes("/strict-spec-init"),
    "check-workflow-state reports missing state and init guidance",
    `stderr: ${workflowStateMissing.stderr.trim()}`,
  );
} finally {
  rmSync(missingWorkflowStateRoot, { recursive: true, force: true });
}

const validateSkillsDispatch = cli(["validate-skills"], { cwd: ROOT });
context.assert(
  validateSkillsDispatch.status === 0,
  "known subcommand dispatches through the entrypoint",
  `stdout: ${validateSkillsDispatch.stdout.trim()} stderr: ${validateSkillsDispatch.stderr.trim()}`,
);
const validateSkillsDispatchJson = JSON.parse(validateSkillsDispatch.stdout.trim());
context.assert(
  validateSkillsDispatchJson.valid === true,
  "known subcommand preserves JSON stdout through the entrypoint",
);

const schemaList = cli(["schema-list"], { cwd: ROOT });
context.assert(schemaList.status === 0, "schema-list exits zero", `stderr: ${schemaList.stderr.trim()}`);
context.assert(
  schemaList.stdout.includes("strict-spec-driven/schemas/change-proposal.yaml"),
  "schema-list includes bundled schema asset keys",
  `stdout: ${schemaList.stdout.trim()}`,
);

const schemaShow = cli(["schema-show", "change-proposal"], { cwd: ROOT });
context.assert(schemaShow.status === 0, "schema-show exits zero for schema name", `stderr: ${schemaShow.stderr.trim()}`);
context.assert(
  schemaShow.stdout.includes("schema_id: strict-spec-driven/change-proposal/v1"),
  "schema-show prints embedded schema content",
  `stdout: ${schemaShow.stdout.trim()}`,
);

const templateShow = cli(["template-show", "scaffold/changes/proposal.yaml"], { cwd: ROOT });
context.assert(templateShow.status === 0, "template-show exits zero for scaffold key", `stderr: ${templateShow.stderr.trim()}`);
context.assert(
  templateShow.stdout.includes("change:\n  id: {{change_name}}"),
  "template-show prints embedded scaffold content",
  `stdout: ${templateShow.stdout.trim()}`,
);

const strictCliModule = await loadDistModule<StrictCliModule>("strict-spec-cli.js");
context.assert(
  JSON.stringify(Object.keys(strictCliModule.commands)) === JSON.stringify(expectedCommandOrder),
  "exported command table preserves canonical registration order",
);

const cliRegistryModule = await loadDistModule<CliRegistryModule>("cli/registry.js");
context.assert(
  JSON.stringify(cliRegistryModule.COMMAND_REGISTRATION_ORDER) === JSON.stringify(expectedCommandOrder),
  "registry module preserves canonical command order",
);

context.section("[2] strict skill packaging validation");

const skillValidationModule = await loadDistModule<SkillValidationModule>("skills.js");
const packageValidation = skillValidationModule.validateStrictSkillPackaging(ROOT);
context.assert(packageValidation.valid, "strict skill package validation passes in repository state");
context.assert(packageValidation.summary.skillCount > 0, "strict skill package validation reports non-zero skill count");
context.assert(
  packageValidation.summary.skillCount === packageValidation.summary.marketplaceCount,
  "marketplace metadata count matches discovered strict skills",
);

const validateSkillsCli = validateSkillsDispatch;
context.assert(validateSkillsCli.status === 0, "validate-skills CLI exits zero for valid strict skill packaging");
const validateSkillsJson = validateSkillsDispatchJson;
context.assert(validateSkillsJson.valid === true, "validate-skills CLI emits valid=true JSON");

  const reviewSkillContent = readFileSync(path.join(ROOT, "skills", "strict-spec-review", "SKILL.md"), "utf8");
  const proposeSkillContent = readFileSync(path.join(ROOT, "skills", "strict-spec-propose", "SKILL.md"), "utf8");
  const autoSkillContent = readFileSync(path.join(ROOT, "skills", "strict-spec-auto", "SKILL.md"), "utf8");
  const brainstormSkillContent = readFileSync(path.join(ROOT, "skills", "strict-spec-brainstorm", "SKILL.md"), "utf8");
  const roadmapPlanSkillContent = readFileSync(path.join(ROOT, "skills", "strict-roadmap-plan", "SKILL.md"), "utf8");
  const roadmapRecommendSkillContent = readFileSync(path.join(ROOT, "skills", "strict-roadmap-recommend", "SKILL.md"), "utf8");
  const harnessInitSkillContent = readFileSync(path.join(ROOT, "skills", "strict-spec-harness-init", "SKILL.md"), "utf8");
  const harnessSessionSkillContent = readFileSync(path.join(ROOT, "skills", "strict-spec-harness-session", "SKILL.md"), "utf8");
  const workflowConfigContent = readFileSync(path.join(ROOT, ".strict-spec-driven", "config.yaml"), "utf8");
  const normalizedReviewSkillContent = reviewSkillContent.replace(/\s+/g, " ");
  const normalizedProposeSkillContent = proposeSkillContent.replace(/\s+/g, " ");
  const normalizedAutoSkillContent = autoSkillContent.replace(/\s+/g, " ");
  const normalizedBrainstormSkillContent = brainstormSkillContent.replace(/\s+/g, " ");
  const normalizedRoadmapPlanSkillContent = roadmapPlanSkillContent.replace(/\s+/g, " ");
  const normalizedRoadmapRecommendSkillContent = roadmapRecommendSkillContent.replace(/\s+/g, " ");
  const normalizedHarnessInitSkillContent = harnessInitSkillContent.replace(/\s+/g, " ");
  const normalizedHarnessSessionSkillContent = harnessSessionSkillContent.replace(/\s+/g, " ");
  const normalizedWorkflowConfigContent = workflowConfigContent.replace(/\s+/g, " ");
context.assert(
  normalizedReviewSkillContent.includes("complete project-level regression test evidence")
    && normalizedReviewSkillContent.includes("actionable setup or waiting guidance")
    && normalizedReviewSkillContent.includes("direct code review evidence")
    && normalizedReviewSkillContent.includes("Automatically fix safe in-scope review findings")
    && normalizedReviewSkillContent.includes("rerun strict verification plus the configured complete regression command after review-time changes")
    && normalizedReviewSkillContent.includes("Do not call or rely on a `strict-spec-driven review` command")
    && !reviewSkillContent.includes("node {{SKILL_DIR}}/scripts/strict-spec-driven.js review <change-name>"),
  "strict-spec-review requires direct code review, automatic safe fixes, and regression evidence before archive recommendation",
);
  context.assert(
    normalizedProposeSkillContent.includes("Review and refine the generated planning artifacts")
      && normalizedProposeSkillContent.includes("before validation")
      && normalizedProposeSkillContent.includes("semantic self-review")
      && normalizedProposeSkillContent.includes("Do not expand scope or answer unresolved human questions")
      && normalizedProposeSkillContent.includes("review refinements made"),
    "strict-spec-propose reviews and refines generated planning artifacts before ready/verify handoff",
  );
  context.assert(
    normalizedAutoSkillContent.includes("complete project-level regression test evidence")
      && normalizedAutoSkillContent.includes("stop before archive")
      && normalizedAutoSkillContent.includes("actionable setup or waiting guidance")
      && normalizedAutoSkillContent.includes("direct code review evidence")
      && normalizedAutoSkillContent.includes("Automatically fix safe in-scope review findings")
      && normalizedAutoSkillContent.includes("rerun strict verification plus the configured complete regression command after review-time changes")
      && normalizedAutoSkillContent.includes("correctness, spec alignment")
      && normalizedAutoSkillContent.includes("dedicated lint Testing task before full unit or regression test tasks")
      && normalizedAutoSkillContent.includes("Reset context from targeted files")
      && normalizedAutoSkillContent.includes("resume the existing populated strict change scaffold without regenerating planning artifacts")
      && normalizedAutoSkillContent.includes("exactly matches the configured complete project regression command")
      && normalizedAutoSkillContent.includes("Review and refine the generated planning artifacts")
      && normalizedAutoSkillContent.includes("semantic self-review")
      && normalizedAutoSkillContent.includes("Do not expand scope or answer unresolved human questions")
      && !autoSkillContent.includes("node {{SKILL_DIR}}/scripts/strict-spec-driven.js review <change-name>"),
    "strict-spec-auto reviews generated planning artifacts, resumes populated scaffolds, and blocks archive without automatic safe fixes, complete regression, and direct code review evidence",
  );
  context.assert(
    normalizedBrainstormSkillContent.includes("Review and refine the generated planning artifacts")
      && normalizedBrainstormSkillContent.includes("before validation")
      && normalizedBrainstormSkillContent.includes("semantic self-review")
      && normalizedBrainstormSkillContent.includes("confirmed brainstorm summary")
      && normalizedBrainstormSkillContent.includes("Do not expand scope or answer unresolved human questions")
      && normalizedBrainstormSkillContent.includes("review refinements made"),
    "strict-spec-brainstorm reviews and refines generated planning artifacts before ready/verify handoff",
  );
  context.assert(
    roadmapPlanSkillContent.includes("check-workflow-state: node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state")
      && normalizedRoadmapPlanSkillContent.includes("Before any other step, run `node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state`")
      && normalizedRoadmapPlanSkillContent.includes("stop immediately and tell the user to run `/strict-spec-init`")
      && normalizedRoadmapPlanSkillContent.includes("executable planning context")
      && normalizedRoadmapPlanSkillContent.includes("Review the roadmap plan before handoff")
      && !roadmapPlanSkillContent.includes("node {{SKILL_DIR}}/scripts/strict-spec-driven.js init"),
    "strict-roadmap-plan requires existing strict workflow state, executable detail guidance, and review guidance",
  );
  context.assert(
    roadmapRecommendSkillContent.includes("roadmap-recommend: node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-recommend")
      && normalizedRoadmapRecommendSkillContent.includes("treat the command's selected planned change as authoritative")
      && normalizedRoadmapRecommendSkillContent.includes("before reading broad roadmap context")
      && normalizedRoadmapRecommendSkillContent.includes("Use `ready` as the proposal handoff validation")
      && normalizedRoadmapRecommendSkillContent.includes("populated change scaffold")
      && normalizedRoadmapRecommendSkillContent.includes("instead of manually choosing among planned changes"),
    "strict-roadmap-recommend requires scripted-first recommendation, ready handoff, and populated auto resume guidance",
  );
  context.assert(
    harnessInitSkillContent.includes("check-workflow-state: node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state")
      && normalizedHarnessInitSkillContent.includes("Before any other step, run `node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state`")
      && normalizedHarnessInitSkillContent.includes("template-show scaffold/harness.yaml")
      && normalizedHarnessInitSkillContent.includes("harness-infer")
      && normalizedHarnessInitSkillContent.includes("harness-doctor")
      && normalizedHarnessInitSkillContent.includes("harness-scripts generate")
      && normalizedHarnessInitSkillContent.includes("Treat `harness-infer` output as a draft")
      && normalizedHarnessInitSkillContent.includes("stop immediately and tell the user to run `/strict-spec-init`")
      && !harnessInitSkillContent.includes("node {{SKILL_DIR}}/scripts/strict-spec-driven.js init"),
    "strict-spec-harness-init requires existing strict workflow state and generates harness scripts",
  );
  context.assert(
    normalizedHarnessSessionSkillContent.includes("harness-session create")
      && normalizedHarnessSessionSkillContent.includes("harness-session validate")
      && normalizedHarnessSessionSkillContent.includes("harness-plan")
      && normalizedHarnessSessionSkillContent.includes("harness-start")
      && normalizedHarnessSessionSkillContent.includes("harness-stop")
      && normalizedHarnessSessionSkillContent.includes("human_checkpoints")
      && normalizedHarnessSessionSkillContent.includes("secrets_recorded: false")
      && normalizedHarnessSessionSkillContent.includes("generated `scripts/harness-*` wrappers")
      && !normalizedHarnessSessionSkillContent.includes("debug-session artifacts"),
    "strict-spec-harness-session covers creation, validation, harness lifecycle, human checkpoints, and secret boundaries",
  );
  context.assert(
    cli(["dev-session-plan"], { cwd: ROOT }).status !== 0
      && cli(["debug-session-create", "legacy"], { cwd: ROOT }).status !== 0,
    "retired dev-session and debug-session commands are not compatibility aliases",
  );
  context.assert(
    normalizedWorkflowConfigContent.includes("review_evidence:")
      && normalizedWorkflowConfigContent.includes("command: bun run build && bun test/run.ts")
    && normalizedWorkflowConfigContent.includes("complete project-level regression suite"),
  "workflow config documents the complete project regression command and review meaning",
);

const noTemplateSymlinkRoot = mkdtempSync(path.join(os.tmpdir(), "strict-skill-no-template-symlink-"));
try {
  const noTemplateSkillDir = path.join(noTemplateSymlinkRoot, "skills", "strict-spec-demo");
  mkdirSync(path.join(noTemplateSymlinkRoot, "dist", "scripts"), { recursive: true });
  mkdirSync(noTemplateSkillDir, { recursive: true });
  symlinkSync("../../dist/scripts", path.join(noTemplateSkillDir, "scripts"));

  writeFileSync(
    path.join(noTemplateSkillDir, "SKILL.md"),
    [
      "---",
      "name: strict-spec-demo",
      "description: demo",
      "metadata:",
      "  skill_id: strict_spec_demo",
      "  author: strict-spec-driven",
      "  type: agent_skill",
      "  version: 1.0.0",
      "---",
      "",
      "# strict-spec-demo",
      "",
      "## This Skill's Commands",
      "",
      "```yaml",
      "check-workflow-state: node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state",
      "demo: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify demo",
      "```",
      "",
      "## Prerequisites",
      "",
      "Run `node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state` before any workflow work. If `.strict-spec-driven/` is missing, stop immediately and tell the user to run `/strict-spec-init`. Do not run `init` from this skill.",
      "",
      "## Steps",
      "",
      "Before any other step, run `node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state`. If `.strict-spec-driven/` is missing, stop immediately and tell the user to run `/strict-spec-init`. Do not run `init` from this skill.",
      "",
      "1. **Run the demo command** — inspect strict workflow artifacts under `.strict-spec-driven/`.",
      "",
      "## Rules",
      "",
      "- Use strict workflow artifacts under `.strict-spec-driven/`.",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(noTemplateSymlinkRoot, "skills", "marketplace.json"),
    JSON.stringify(
      {
        schema: "strict-spec-driven/skill-marketplace/v1",
        namespace: "strict-spec-driven",
        skills: [{ name: "strict-spec-demo", family: "strict-spec" }],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const noTemplateResult = skillValidationModule.validateStrictSkillPackaging(noTemplateSymlinkRoot);
  context.assert(
    noTemplateResult.valid,
    "strict skill package validation permits missing templates symlink",
    JSON.stringify(noTemplateResult.diagnostics),
  );
} finally {
  rmSync(noTemplateSymlinkRoot, { recursive: true, force: true });
}

const invalidSkillsRoot = mkdtempSync(path.join(os.tmpdir(), "strict-skill-validation-invalid-"));
try {
  const invalidSkillsDir = path.join(invalidSkillsRoot, "skills", "strict-spec-demo");
  mkdirSync(invalidSkillsDir, { recursive: true });

  writeFileSync(
    path.join(invalidSkillsDir, "SKILL.md"),
    [
      "---",
      "name: strict-spec-demo",
      "description: demo",
      "metadata:",
      "  skill_id: strict_spec_demo",
      "  author: strict-spec-driven",
      "  type: agent_skill",
      "  version: 1.0.0",
      "---",
      "",
      "# strict-spec-demo",
      "",
      "## This Skill's Commands",
      "",
      "```yaml",
      "init: node {{SKILL_DIR}}/scripts/strict-spec-driven.js init",
      "demo: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify demo",
      "```",
      "",
      "## Notes",
      "",
      "Legacy reference: .spec-driven/changes",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(invalidSkillsRoot, "skills", "marketplace.json"),
    JSON.stringify(
      {
        schema: "strict-spec-driven/skill-marketplace/v1",
        namespace: "strict-spec-driven",
        skills: [{ name: "strict-spec-demo", family: "strict-spec" }],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const invalidResultA = skillValidationModule.validateStrictSkillPackaging(invalidSkillsRoot);
  const invalidResultB = skillValidationModule.validateStrictSkillPackaging(invalidSkillsRoot);
  context.assert(!invalidResultA.valid, "strict skill package validation fails for invalid packaging state");
  context.assert(
    invalidResultA.diagnostics.some((diagnostic) => diagnostic.code === "skill.scripts_symlink.missing"),
    "invalid packaging reports missing scripts symlink diagnostic",
  );
  context.assert(
    invalidResultA.diagnostics.some((diagnostic) => diagnostic.code === "skill.reference.legacy_workflow_dir"),
    "invalid packaging reports stale legacy workflow reference diagnostic",
  );
  context.assert(
    invalidResultA.diagnostics.some((diagnostic) => diagnostic.code === "skill.strict_workflow.precheck.missing"),
    "invalid packaging reports missing strict workflow precheck guidance",
  );
  context.assert(
    invalidResultA.diagnostics.some((diagnostic) => diagnostic.code === "skill.strict_workflow.check_command.missing"),
    "invalid packaging reports missing strict workflow check command mapping",
  );
  context.assert(
    invalidResultA.diagnostics.some((diagnostic) => diagnostic.code === "skill.strict_workflow.init_command.forbidden"),
    "invalid packaging reports forbidden init fallback command usage",
  );
  context.assert(
    JSON.stringify(invalidResultA) === JSON.stringify(invalidResultB),
    "strict skill package diagnostics are deterministic across runs",
  );

  const invalidValidateSkillsCliA = cli(["validate-skills"], { cwd: invalidSkillsRoot });
  const invalidValidateSkillsCliB = cli(["validate-skills"], { cwd: invalidSkillsRoot });
  context.assert(invalidValidateSkillsCliA.status !== 0, "validate-skills CLI exits non-zero for invalid packaging state");
  context.assert(
    invalidValidateSkillsCliA.stdout.trim() === invalidValidateSkillsCliB.stdout.trim(),
    "validate-skills CLI preserves diagnostic ordering across repeated invalid runs",
  );
} finally {
  rmSync(invalidSkillsRoot, { recursive: true, force: true });
}

const malformedSkillsRoot = mkdtempSync(path.join(os.tmpdir(), "strict-skill-validation-malformed-"));
try {
  const malformedSkillDir = path.join(malformedSkillsRoot, "skills", "strict-spec-malformed");
  mkdirSync(path.join(malformedSkillsRoot, "dist", "scripts"), { recursive: true });
  mkdirSync(path.join(malformedSkillsRoot, "dist", "templates"), { recursive: true });
  mkdirSync(malformedSkillDir, { recursive: true });

  symlinkSync("../../dist/scripts", path.join(malformedSkillDir, "scripts"));
  symlinkSync("../../dist/templates", path.join(malformedSkillDir, "templates"));

  writeFileSync(
    path.join(malformedSkillDir, "SKILL.md"),
    [
      "---",
      "name: strict-spec-malformed",
      "\tdescription: malformed frontmatter",
      "metadata:",
      "  skill_id: strict_spec_malformed",
      "  author: strict-spec-driven",
      "  type: agent_skill",
      "  version: 1.0.0",
      "---",
      "",
      "# strict-spec-malformed",
      "",
      "## This Skill's Commands",
      "",
      "```yaml",
      "demo: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify demo",
      "```",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(malformedSkillsRoot, "skills", "marketplace.json"),
    JSON.stringify(
      {
        schema: "strict-spec-driven/skill-marketplace/v1",
        namespace: "strict-spec-driven",
        skills: [{ name: "strict-spec-malformed", family: "strict-spec" }],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const malformedResult = skillValidationModule.validateStrictSkillPackaging(malformedSkillsRoot);
  const malformedDiagnostic = malformedResult.diagnostics.find(
    (diagnostic) => diagnostic.code === "skill.frontmatter.parse_error",
  );
  context.assert(!malformedResult.valid, "validate-skills fails for malformed YAML frontmatter");
  context.assert(Boolean(malformedDiagnostic), "validate-skills surfaces malformed frontmatter parse diagnostics");
  context.assert(
    malformedDiagnostic?.line === 2 && malformedDiagnostic.column === 1,
    "validate-skills malformed YAML diagnostics include line and column",
    `line: ${malformedDiagnostic?.line ?? "missing"} column: ${malformedDiagnostic?.column ?? "missing"}`,
  );
  context.assert(
    malformedDiagnostic?.offendingCharacter?.includes("tab") === true,
    "validate-skills malformed YAML diagnostics identify the offending special character",
    `offending character: ${malformedDiagnostic?.offendingCharacter ?? "missing"}`,
  );
  context.assert(
    Boolean(malformedDiagnostic?.snippet?.includes("description")),
    "validate-skills malformed YAML diagnostics include a YAML snippet",
  );
} finally {
  rmSync(malformedSkillsRoot, { recursive: true, force: true });
}

const invalidCoreSkillRoot = mkdtempSync(path.join(os.tmpdir(), "strict-core-skill-validation-invalid-"));
try {
  const invalidCoreSkillDir = path.join(invalidCoreSkillRoot, "skills", "strict-spec-init");
  mkdirSync(path.join(invalidCoreSkillRoot, "dist", "scripts"), { recursive: true });
  mkdirSync(path.join(invalidCoreSkillRoot, "dist", "templates"), { recursive: true });
  mkdirSync(invalidCoreSkillDir, { recursive: true });

  symlinkSync("../../dist/scripts", path.join(invalidCoreSkillDir, "scripts"));
  symlinkSync("../../dist/templates", path.join(invalidCoreSkillDir, "templates"));

  writeFileSync(
    path.join(invalidCoreSkillDir, "SKILL.md"),
    [
      "---",
      "name: strict-spec-init",
      "description: stub",
      "metadata:",
      "  skill_id: strict_spec_init",
      "  author: strict-spec-driven",
      "  type: agent_skill",
      "  version: 1.0.0",
      "---",
      "",
      "# strict-spec-init",
      "",
      "## This Skill's Commands",
      "",
      "```yaml",
      "cli: node {{SKILL_DIR}}/scripts/strict-spec-driven.js <command>",
      "```",
      "",
      "## Prerequisites",
      "",
      "Use strict workflow artifacts under .strict-spec-driven/.",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(invalidCoreSkillRoot, "skills", "marketplace.json"),
    JSON.stringify(
      {
        schema: "strict-spec-driven/skill-marketplace/v1",
        namespace: "strict-spec-driven",
        skills: [{ name: "strict-spec-init", family: "strict-spec" }],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const invalidCoreResult = skillValidationModule.validateStrictSkillPackaging(invalidCoreSkillRoot);
  context.assert(!invalidCoreResult.valid, "strict skill package validation fails for placeholder core skill content");
  context.assert(
    invalidCoreResult.diagnostics.some((diagnostic) => diagnostic.code === "skill.core.placeholder_command"),
    "placeholder core skill reports generic command placeholder diagnostic",
  );
  context.assert(
    invalidCoreResult.diagnostics.some((diagnostic) => diagnostic.code === "skill.core.required_heading.missing"),
    "placeholder core skill reports missing workflow heading diagnostic",
  );
} finally {
  rmSync(invalidCoreSkillRoot, { recursive: true, force: true });
}

const invalidGenericCommandSkillRoot = mkdtempSync(path.join(os.tmpdir(), "strict-skill-generic-command-invalid-"));
try {
  const invalidGenericCommandSkillDir = path.join(invalidGenericCommandSkillRoot, "skills", "strict-spec-simple-task");
  mkdirSync(path.join(invalidGenericCommandSkillRoot, "dist", "scripts"), { recursive: true });
  mkdirSync(path.join(invalidGenericCommandSkillRoot, "dist", "templates"), { recursive: true });
  mkdirSync(invalidGenericCommandSkillDir, { recursive: true });

  symlinkSync("../../dist/scripts", path.join(invalidGenericCommandSkillDir, "scripts"));
  symlinkSync("../../dist/templates", path.join(invalidGenericCommandSkillDir, "templates"));

  writeFileSync(
    path.join(invalidGenericCommandSkillDir, "SKILL.md"),
    [
      "---",
      "name: strict-spec-simple-task",
      "description: Handle a strict simple task.",
      "metadata:",
      "  skill_id: strict_spec_simple_task",
      "  author: strict-spec-driven",
      "  type: agent_skill",
      "  version: 1.0.0",
      "---",
      "",
      "You are helping the user with a strict simple task.",
      "",
      "## This Skill's Commands",
      "",
      "```yaml",
      "cli: node {{SKILL_DIR}}/scripts/strict-spec-driven.js <command>",
      "```",
      "",
      "## Prerequisites",
      "",
      "Use strict workflow artifacts under .strict-spec-driven/.",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(invalidGenericCommandSkillRoot, "skills", "marketplace.json"),
    JSON.stringify(
      {
        schema: "strict-spec-driven/skill-marketplace/v1",
        namespace: "strict-spec-driven",
        skills: [{ name: "strict-spec-simple-task", family: "strict-spec" }],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const invalidGenericCommandResult = skillValidationModule.validateStrictSkillPackaging(invalidGenericCommandSkillRoot);
  context.assert(!invalidGenericCommandResult.valid, "strict skill package validation fails for generic command placeholder in any skill");
  context.assert(
    invalidGenericCommandResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.commands_section.command.placeholder"
        && diagnostic.path === "skills/strict-spec-simple-task/SKILL.md#commands.cli",
    ),
    "generic command placeholder reports explicit subcommand diagnostic for non-core skill",
  );
} finally {
  rmSync(invalidGenericCommandSkillRoot, { recursive: true, force: true });
}

const invalidRoadmapPlanGuidanceRoot = mkdtempSync(path.join(os.tmpdir(), "strict-roadmap-plan-guidance-invalid-"));
try {
  const invalidRoadmapPlanSkillDir = path.join(invalidRoadmapPlanGuidanceRoot, "skills", "strict-roadmap-plan");
  mkdirSync(path.join(invalidRoadmapPlanGuidanceRoot, "dist", "scripts"), { recursive: true });
  mkdirSync(path.join(invalidRoadmapPlanGuidanceRoot, "dist", "templates"), { recursive: true });
  mkdirSync(invalidRoadmapPlanSkillDir, { recursive: true });

  symlinkSync("../../dist/scripts", path.join(invalidRoadmapPlanSkillDir, "scripts"));
  symlinkSync("../../dist/templates", path.join(invalidRoadmapPlanSkillDir, "templates"));

  writeFileSync(
    path.join(invalidRoadmapPlanSkillDir, "SKILL.md"),
    [
      "---",
      "name: strict-roadmap-plan",
      "description: stub",
      "metadata:",
      "  skill_id: strict_roadmap_plan",
      "  author: strict-spec-driven",
      "  type: agent_skill",
      "  version: 1.0.0",
      "---",
      "",
      "You are helping with strict roadmap work under .strict-spec-driven/roadmap/.",
      "",
      "## This Skill's Commands",
      "",
      "```yaml",
      "roadmap-status: node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-status",
      "roadmap-sync: node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-sync",
      "```",
      "",
      "## Prerequisites",
      "",
      "The `.strict-spec-driven/` directory must exist at the project root. If it is missing, stop immediately and tell the user to run `/strict-spec-init`. Do not run `init` from this skill.",
      "",
      "## Steps",
      "",
      "Before any other step, confirm `.strict-spec-driven/` exists at the project root. If it is missing, stop immediately and tell the user to run `/strict-spec-init`. Do not run `init` from this skill.",
      "",
      "1. Run roadmap-status and update roadmap YAML under .strict-spec-driven/roadmap/.",
      "2. Run roadmap-sync and summarize the result.",
      "",
      "## Rules",
      "",
      "- Keep all roadmap state under .strict-spec-driven/roadmap/.",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(invalidRoadmapPlanGuidanceRoot, "skills", "marketplace.json"),
    JSON.stringify(
      {
        schema: "strict-spec-driven/skill-marketplace/v1",
        namespace: "strict-spec-driven",
        skills: [{ name: "strict-roadmap-plan", family: "strict-roadmap" }],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const invalidRoadmapPlanGuidanceResult = skillValidationModule.validateStrictSkillPackaging(invalidRoadmapPlanGuidanceRoot);
  context.assert(!invalidRoadmapPlanGuidanceResult.valid, "strict skill validation fails when roadmap plan omits detail and review guidance");
  context.assert(
    invalidRoadmapPlanGuidanceResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.roadmap.required_snippet.missing"
        && diagnostic.path === "skills/strict-roadmap-plan/SKILL.md"
        && diagnostic.expected === "executable planning context",
    ),
    "roadmap plan skill validation requires executable detail guidance",
  );
  context.assert(
    invalidRoadmapPlanGuidanceResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.roadmap.required_snippet.missing"
        && diagnostic.path === "skills/strict-roadmap-plan/SKILL.md"
        && diagnostic.expected === "Review the roadmap plan before handoff",
    ),
    "roadmap plan skill validation requires post-sync review guidance",
  );
} finally {
  rmSync(invalidRoadmapPlanGuidanceRoot, { recursive: true, force: true });
}

const invalidSemanticSkillRoot = mkdtempSync(path.join(os.tmpdir(), "strict-core-skill-semantics-invalid-"));
try {
  const semanticSkillNames = ["strict-spec-propose", "strict-spec-archive", "strict-spec-review", "strict-spec-auto"];
  mkdirSync(path.join(invalidSemanticSkillRoot, "dist", "scripts"), { recursive: true });
  mkdirSync(path.join(invalidSemanticSkillRoot, "dist", "templates"), { recursive: true });

  for (const skillName of semanticSkillNames) {
    const skillDir = path.join(invalidSemanticSkillRoot, "skills", skillName);
    mkdirSync(skillDir, { recursive: true });
    symlinkSync("../../dist/scripts", path.join(skillDir, "scripts"));
    symlinkSync("../../dist/templates", path.join(skillDir, "templates"));
  }

  writeFileSync(
    path.join(invalidSemanticSkillRoot, "skills", "strict-spec-propose", "SKILL.md"),
    [
      "---",
      "name: strict-spec-propose",
      "description: Propose a new strict change. Scaffolds proposal.yaml, design.yaml, tasks.yaml, questions.yaml, and strict YAML delta specs under .strict-spec-driven/changes/<name>/.",
      "metadata:",
      "  skill_id: strict_spec_propose",
      "  author: strict-spec-driven",
      "  type: agent_skill",
      "  version: 1.0.0",
      "---",
      "",
      "You are helping the user create a strict YAML change proposal under .strict-spec-driven/.",
      "",
      "## This Skill's Commands",
      "",
      "```yaml",
      "propose: node {{SKILL_DIR}}/scripts/strict-spec-driven.js propose <change-name>",
      "verify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>",
      "```",
      "",
      "## Prerequisites",
      "",
      "Use strict workflow artifacts under .strict-spec-driven/.",
      "",
      "## Steps",
      "",
      "1. Draft the proposal.",
      "",
      "## Rules",
      "",
      "- Keep the proposal aligned with the strict CLI.",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(invalidSemanticSkillRoot, "skills", "strict-spec-archive", "SKILL.md"),
    [
      "---",
      "name: strict-spec-archive",
      "description: Archive a completed strict YAML change.",
      "metadata:",
      "  skill_id: strict_spec_archive",
      "  author: strict-spec-driven",
      "  type: agent_skill",
      "  version: 1.0.0",
      "---",
      "",
      "You are helping the user archive a strict YAML change under .strict-spec-driven/.",
      "",
      "## This Skill's Commands",
      "",
      "```yaml",
      "modify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js modify [change-name|archive-dir]",
      "verify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>",
      "verify-spec-mappings: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify-spec-mappings",
      "archive: node {{SKILL_DIR}}/scripts/strict-spec-driven.js archive <change-name>",
      "```",
      "",
      "## Prerequisites",
      "",
      "Use strict workflow artifacts under .strict-spec-driven/.",
      "",
      "## Steps",
      "",
      "1. Confirm the result.",
      "   - any change to roadmap state caused by archive",
      "",
      "## Rules",
      "",
      "- Use the strict archive command.",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(invalidSemanticSkillRoot, "skills", "strict-spec-review", "SKILL.md"),
    [
      "---",
      "name: strict-spec-review",
      "description: Review the code quality of a completed strict YAML change.",
      "metadata:",
      "  skill_id: strict_spec_review",
      "  author: strict-spec-driven",
      "  type: agent_skill",
      "  version: 1.0.0",
      "---",
      "",
      "You are reviewing the code quality of a completed strict YAML change.",
      "",
      "## This Skill's Commands",
      "",
      "```yaml",
      "modify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js modify [change-name|archive-dir]",
      "verify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>",
      "```",
      "",
      "## Prerequisites",
      "",
      "The `.strict-spec-driven/` directory must exist at the project root.",
      "",
      "## Steps",
      "",
      "Before any other step, confirm `.strict-spec-driven/` exists. If it is missing, stop immediately and tell the user to run `/strict-spec-init`. Do not run `init` from this skill.",
      "1. Read every changed file and require direct code review evidence.",
      "2. Confirm harness-plan guidance when harness evidence exists.",
      "3. Do not call or rely on a `strict-spec-driven review` command.",
      "",
      "## Harness Guidance",
      "",
      "Use harness-plan to evaluate harness evidence.",
      "",
      "## Rules",
      "",
      "- Require direct code review evidence.",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(invalidSemanticSkillRoot, "skills", "strict-spec-auto", "SKILL.md"),
    [
      "---",
      "name: strict-spec-auto",
      "description: Run the strict workflow end to end without extra confirmation unless open questions or empty-spec-impact decisions block progress.",
      "metadata:",
      "  skill_id: strict_spec_auto",
      "  author: strict-spec-driven",
      "  type: agent_skill",
      "  version: 1.0.0",
      "---",
      "",
      "You are running the strict workflow end to end for a single strict YAML change.",
      "",
      "## This Skill's Commands",
      "",
      "```yaml",
      "propose: node {{SKILL_DIR}}/scripts/strict-spec-driven.js propose <change-name>",
      "apply: node {{SKILL_DIR}}/scripts/strict-spec-driven.js apply <change-name>",
      "verify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>",
      "review: node {{SKILL_DIR}}/scripts/strict-spec-driven.js review <change-name>",
      "verify-spec-mappings: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify-spec-mappings",
      "archive: node {{SKILL_DIR}}/scripts/strict-spec-driven.js archive <change-name>",
      "```",
      "",
      "## Prerequisites",
      "",
      "Use strict workflow artifacts under .strict-spec-driven/.",
      "",
      "## Steps",
      "",
      "1. Run the workflow.",
      "2. If the change verifies and reviews cleanly, and any empty-spec-impact decision has been explicitly confirmed, archive it.",
      "",
      "## Rules",
      "",
      "- The workflow is automatic except when open questions or empty-spec-impact decisions block progress.",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(invalidSemanticSkillRoot, "skills", "marketplace.json"),
    JSON.stringify(
      {
        schema: "strict-spec-driven/skill-marketplace/v1",
        namespace: "strict-spec-driven",
        skills: semanticSkillNames.map((name) => ({ name, family: "strict-spec" })),
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const invalidSemanticResult = skillValidationModule.validateStrictSkillPackaging(invalidSemanticSkillRoot);
  context.assert(!invalidSemanticResult.valid, "strict skill package validation fails for misleading core skill claims");
  context.assert(
    invalidSemanticResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.core.forbidden_snippet.present"
        && diagnostic.path === "skills/strict-spec-propose/SKILL.md",
    ),
    "misleading propose scaffold claim reports forbidden snippet diagnostic",
  );
  context.assert(
    invalidSemanticResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.core.forbidden_snippet.present"
        && diagnostic.path === "skills/strict-spec-archive/SKILL.md",
    ),
    "misleading archive roadmap claim reports forbidden snippet diagnostic",
  );
  context.assert(
    invalidSemanticResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.core.forbidden_snippet.present"
        && diagnostic.path === "skills/strict-spec-auto/SKILL.md",
    ),
    "misleading auto empty-spec-impact claim reports forbidden snippet diagnostic",
  );
  context.assert(
    invalidSemanticResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.core.required_snippet.missing"
        && diagnostic.path === "skills/strict-spec-review/SKILL.md"
        && diagnostic.expected === "Automatically fix safe in-scope review findings",
    ),
    "review skill missing review auto-fix guidance reports required snippet diagnostic",
  );
  context.assert(
    invalidSemanticResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.core.required_snippet.missing"
        && diagnostic.path === "skills/strict-spec-review/SKILL.md"
        && diagnostic.expected === "rerun strict verification plus the configured complete regression command after review-time changes",
    ),
    "review skill missing post-review-fix regression guidance reports required snippet diagnostic",
  );
  context.assert(
    invalidSemanticResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.core.required_snippet.missing"
        && diagnostic.path === "skills/strict-spec-auto/SKILL.md"
        && diagnostic.expected === "/strict-spec-ship <change-name>",
    ),
    "auto skill missing optional ship handoff reports required snippet diagnostic",
  );
  context.assert(
    invalidSemanticResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.core.required_snippet.missing"
        && diagnostic.path === "skills/strict-spec-auto/SKILL.md"
        && diagnostic.expected === "Automatically fix safe in-scope review findings",
    ),
    "auto skill missing review auto-fix guidance reports required snippet diagnostic",
  );
  context.assert(
    invalidSemanticResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.core.required_snippet.missing"
        && diagnostic.path === "skills/strict-spec-auto/SKILL.md"
        && diagnostic.expected === "rerun strict verification plus the configured complete regression command after review-time changes",
    ),
    "auto skill missing post-review-fix regression guidance reports required snippet diagnostic",
  );
  context.assert(
    invalidSemanticResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.core.required_snippet.missing"
        && diagnostic.path === "skills/strict-spec-auto/SKILL.md"
        && diagnostic.expected === "resume the existing populated strict change scaffold without regenerating planning artifacts",
    ),
    "auto skill missing populated scaffold resume guidance reports required snippet diagnostic",
  );
} finally {
  rmSync(invalidSemanticSkillRoot, { recursive: true, force: true });
}

}
