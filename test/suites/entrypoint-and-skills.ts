import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import {
  ROOT,
  TestContext,
  cli,
  createCopiedProjectWorkspace,
  fixturePath,
  formatLocalDateStamp,
  loadDistModule,
  projectFixturePath,
  projectWorkspaceCli,
  runCommand,
  type MigrateConverterModule,
  type RoadmapConverterModule,
  type ScaffoldModule,
  type SkillValidationModule,
  type ValidationModule,
  type YamlModule,
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
  "propose",
  "apply",
  "verify",
  "review",
  "verify-spec-mappings",
  "validate-skills",
  "migrate",
  "roadmap-status",
  "roadmap-sync",
  "maintenance",
  "ship",
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

const invalidSemanticSkillRoot = mkdtempSync(path.join(os.tmpdir(), "strict-core-skill-semantics-invalid-"));
try {
  const semanticSkillNames = ["strict-spec-propose", "strict-spec-archive", "strict-spec-auto"];
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
} finally {
  rmSync(invalidSemanticSkillRoot, { recursive: true, force: true });
}

context.section("[2a] strict skill installation surfaces");

const packageJson = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};
const packageScripts = packageJson.scripts ?? {};
context.assert(
  packageScripts["install-strict-skills"] === "bash install.sh",
  "package.json exposes strict global install script",
);
context.assert(
  packageScripts["install-strict-skills:project"] === "bash install.sh --project",
  "package.json exposes strict project install script",
);
context.assert(
  packageScripts["uninstall-strict-skills"] === "bash install.sh --uninstall",
  "package.json exposes strict global uninstall script",
);
context.assert(
  packageScripts["uninstall-strict-skills:project"] === "bash install.sh --uninstall --project",
  "package.json exposes strict project uninstall script",
);

const installSmokeRoot = mkdtempSync(path.join(os.tmpdir(), "strict-install-smoke-"));
try {
  const fakeBinDir = path.join(installSmokeRoot, "bin");
  const logPath = path.join(installSmokeRoot, "npx.log");
  const projectTarget = path.join(installSmokeRoot, "custom-project");
  const outsideDir = path.join(installSmokeRoot, "outside");
  mkdirSync(fakeBinDir, { recursive: true });
  mkdirSync(projectTarget, { recursive: true });
  mkdirSync(outsideDir, { recursive: true });

  writeFileSync(
    path.join(fakeBinDir, "npx"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "printf '%s\\n' \"$@\" > \"$STRICT_INSTALL_TEST_LOG\"",
    ].join("\n") + "\n",
    { encoding: "utf8", mode: 0o755 },
  );

  const installEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`,
    STRICT_INSTALL_TEST_LOG: logPath,
  };
  const installScript = path.join(ROOT, "install.sh");

  const defaultInstall = runCommand("bash", [installScript], {
    cwd: outsideDir,
    env: installEnv,
  });
  context.assert(defaultInstall.status === 0, "install.sh installs strict skills from the repo root by default");
  context.assert(
    defaultInstall.stdout.includes(`Installing strict skills from: ${ROOT}`),
    "install.sh reports the repo root as the default install target",
    `stdout: ${defaultInstall.stdout.trim()}`,
  );
  context.assert(
    readFileSync(logPath, "utf8") === `skills\nadd\n${ROOT}\n`,
    "install.sh invokes skills add for the repo root",
  );

  const projectInstall = runCommand("bash", [installScript, "--project", projectTarget], {
    cwd: outsideDir,
    env: installEnv,
  });
  context.assert(projectInstall.status === 0, "install.sh accepts an explicit project target");
  context.assert(
    projectInstall.stdout.includes(`Installing strict skills from: ${projectTarget}`),
    "install.sh reports the explicit project target",
    `stdout: ${projectInstall.stdout.trim()}`,
  );
  context.assert(
    readFileSync(logPath, "utf8") === `skills\nadd\n${projectTarget}\n`,
    "install.sh invokes skills add for the explicit project target",
  );

  const defaultUninstall = runCommand("bash", [installScript, "--project", "--uninstall"], {
    cwd: outsideDir,
    env: installEnv,
  });
  context.assert(defaultUninstall.status === 0, "install.sh handles project mode without mistaking --uninstall for a path");
  context.assert(
    defaultUninstall.stdout.includes(`Uninstalling strict skills from: ${ROOT}`),
    "install.sh keeps the repo root as the fallback project target when flags are reordered",
    `stdout: ${defaultUninstall.stdout.trim()}`,
  );
  context.assert(
    readFileSync(logPath, "utf8") === `skills\nremove\n${ROOT}\n`,
    "install.sh invokes skills remove for reordered project uninstall flags",
  );

  const lastInstallInvocation = readFileSync(logPath, "utf8");
  const projectHelp = runCommand("bash", [installScript, "--project", "-h"], {
    cwd: outsideDir,
    env: installEnv,
  });
  context.assert(projectHelp.status === 0, "install.sh treats -h after --project as help instead of a path");
  context.assert(
    projectHelp.stderr.includes("Usage:"),
    "install.sh prints usage when -h follows --project",
    `stderr: ${projectHelp.stderr.trim()}`,
  );
  context.assert(
    readFileSync(logPath, "utf8") === lastInstallInvocation,
    "install.sh does not invoke npx when help is requested after --project",
  );

  const unknownArg = runCommand("bash", [installScript, "--legacy-name"], {
    cwd: outsideDir,
    env: installEnv,
  });
  context.assert(unknownArg.status !== 0, "install.sh rejects unknown arguments");
  context.assert(
    unknownArg.stderr.includes("Unknown argument: --legacy-name"),
    "install.sh reports the unknown argument explicitly",
    `stderr: ${unknownArg.stderr.trim()}`,
  );
  context.assert(
    unknownArg.stderr.includes("Usage:"),
    "install.sh prints usage guidance for unknown arguments",
    `stderr: ${unknownArg.stderr.trim()}`,
  );

  const missingProject = runCommand("bash", [installScript, "--project", path.join(installSmokeRoot, "missing")], {
    cwd: outsideDir,
    env: installEnv,
  });
  context.assert(missingProject.status !== 0, "install.sh exits non-zero for a missing project directory");
  context.assert(
    missingProject.stderr.includes("Project directory does not exist:"),
    "install.sh reports a missing project directory diagnostic",
    `stderr: ${missingProject.stderr.trim()}`,
  );
} finally {
  rmSync(installSmokeRoot, { recursive: true, force: true });
}

}
