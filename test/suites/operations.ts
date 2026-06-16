import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "fs";
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

export async function runOperationsSuite(context: TestContext): Promise<void> {
  const yamlModule = await loadDistModule<YamlModule>("yaml.js");

context.section("[21] ship command");

const shipNoArgs = cli(["ship"]);
context.assert(shipNoArgs.status !== 0, "ship with no args exits non-zero");
context.assert(shipNoArgs.stderr.includes("Usage:"), "ship with no args prints usage hint to stderr");

const shipMissingChange = (() => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "strict-ship-missing-"));
  try {
    mkdirSync(path.join(tempRoot, ".strict-spec-driven", "changes", "archive"), { recursive: true });
    return cli(["ship", "nonexistent-change"], { cwd: tempRoot });
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
})();
context.assert(shipMissingChange.status !== 0, "ship with missing archived change exits non-zero");
context.assert(shipMissingChange.stderr.includes("not found"), "ship with missing change reports not found");

const shipRoot = mkdtempSync(path.join(os.tmpdir(), "strict-ship-valid-"));
try {
  const archiveDir = path.join(shipRoot, ".strict-spec-driven", "changes", "archive");
  mkdirSync(archiveDir, { recursive: true });

  const exactArchiveName = "2026-04-25-test-ship-change";
  const exactArchiveDir = path.join(archiveDir, exactArchiveName);
  mkdirSync(exactArchiveDir, { recursive: true });
  writeFileSync(
    path.join(exactArchiveDir, "proposal.yaml"),
    yamlModule.stringifyYamlDocument({
      schema: "strict-spec-driven/change-proposal/v1",
      schema_version: 1,
      artifact_type: "change_proposal",
      schema_file: "test",
      change: { id: "test-ship-change", status: "complete" },
      summary: {
        what: ["Ship test change implementation", "Verify ship command output"],
        why: ["Testing ship command"],
      },
      scope: { in: [], out: [] },
      unchanged_behavior: [],
    }),
    "utf8",
  );

  const shipExact = cli(["ship", exactArchiveName], { cwd: shipRoot });
  context.assert(shipExact.status === 0, "ship exits zero for valid archived change (exact name)");
  const shipExactJson = JSON.parse(shipExact.stdout.trim());
  context.assert(shipExactJson.changeName === exactArchiveName, "ship json includes correct changeName");
  context.assert(
    typeof shipExactJson.archivePath === "string" && shipExactJson.archivePath.includes(exactArchiveName),
    "ship json includes archivePath referencing archive directory",
  );
  context.assert(
    shipExactJson.proposalSummary.includes("Ship test change implementation"),
    "ship json includes proposalSummary from proposal.yaml what array",
  );
  context.assert(
    shipExactJson.roadmapSnapshot !== null && typeof shipExactJson.roadmapSnapshot === "object",
    "ship json includes roadmapSnapshot object",
  );

  const shipBareDir = path.join(archiveDir, "2026-04-24-test-ship-bare");
  mkdirSync(shipBareDir, { recursive: true });
  writeFileSync(
    path.join(shipBareDir, "proposal.yaml"),
    yamlModule.stringifyYamlDocument({
      schema: "strict-spec-driven/change-proposal/v1",
      schema_version: 1,
      artifact_type: "change_proposal",
      schema_file: "test",
      change: { id: "test-ship-bare", status: "complete" },
      summary: { what: ["Bare name test"], why: [] },
      scope: { in: [], out: [] },
      unchanged_behavior: [],
    }),
    "utf8",
  );
  const shipBare = cli(["ship", "test-ship-bare"], { cwd: shipRoot });
  context.assert(shipBare.status === 0, "ship exits zero when resolving bare name via date-prefix expansion");
  const shipBareJson = JSON.parse(shipBare.stdout.trim());
  context.assert(
    shipBareJson.changeName === "2026-04-24-test-ship-bare",
    "ship bare name resolves to date-prefixed archive directory name",
  );

  const ambigDir1 = path.join(archiveDir, "2026-04-25-test-ship-ambig");
  const ambigDir2 = path.join(archiveDir, "2026-04-24-test-ship-ambig");
  mkdirSync(ambigDir1, { recursive: true });
  mkdirSync(ambigDir2, { recursive: true });
  const shipAmbig = cli(["ship", "test-ship-ambig"], { cwd: shipRoot });
  context.assert(shipAmbig.status !== 0, "ship exits non-zero for ambiguous bare name");
  context.assert(shipAmbig.stderr.includes("ambiguous"), "ship reports ambiguous error for multiple date-prefix matches");
} finally {
  rmSync(shipRoot, { recursive: true, force: true });
}

context.section("[21b] commit-and-push command");

const commitPushRoot = mkdtempSync(path.join(os.tmpdir(), "strict-commit-push-"));
const commitPushRemote = mkdtempSync(path.join(os.tmpdir(), "strict-commit-push-remote-"));
try {
  const gitInit = runCommand("git", ["init"], { cwd: commitPushRoot });
  context.assert(gitInit.status === 0, "commit-and-push fixture git init succeeds", gitInit.stderr.trim());
  const gitConfigEmail = runCommand("git", ["config", "user.email", "test@example.invalid"], { cwd: commitPushRoot });
  context.assert(gitConfigEmail.status === 0, "commit-and-push fixture git user.email configured", gitConfigEmail.stderr.trim());
  const gitConfigName = runCommand("git", ["config", "user.name", "Strict Test"], { cwd: commitPushRoot });
  context.assert(gitConfigName.status === 0, "commit-and-push fixture git user.name configured", gitConfigName.stderr.trim());
  const remoteInit = runCommand("git", ["init", "--bare", commitPushRemote]);
  context.assert(remoteInit.status === 0, "commit-and-push fixture bare remote init succeeds", remoteInit.stderr.trim());

  writeFileSync(path.join(commitPushRoot, "README.md"), "fixture\n", "utf8");
  const initialAdd = runCommand("git", ["add", "README.md"], { cwd: commitPushRoot });
  context.assert(initialAdd.status === 0, "commit-and-push fixture initial add succeeds", initialAdd.stderr.trim());
  const initialCommit = runCommand("git", ["commit", "-m", "chore: initial"], { cwd: commitPushRoot });
  context.assert(initialCommit.status === 0, "commit-and-push fixture initial commit succeeds", initialCommit.stderr.trim());
  const addRemote = runCommand("git", ["remote", "add", "origin", commitPushRemote], { cwd: commitPushRoot });
  context.assert(addRemote.status === 0, "commit-and-push fixture remote configured", addRemote.stderr.trim());
  const initialPush = runCommand("git", ["push", "-u", "origin", "HEAD"], { cwd: commitPushRoot });
  context.assert(initialPush.status === 0, "commit-and-push fixture upstream push succeeds", initialPush.stderr.trim());

  const archiveDir = path.join(commitPushRoot, ".strict-spec-driven", "changes", "archive");
  const olderCreatedDirName = "2026-05-01-older-created";
  const newerCreatedDirName = "2026-04-01-newer-created";
  const olderCreatedDir = path.join(archiveDir, olderCreatedDirName);
  mkdirSync(olderCreatedDir, { recursive: true });
  writeFileSync(path.join(olderCreatedDir, "proposal.yaml"), "change: older-created\n", "utf8");
  await new Promise((resolve) => setTimeout(resolve, 30));
  const newerCreatedDir = path.join(archiveDir, newerCreatedDirName);
  mkdirSync(newerCreatedDir, { recursive: true });
  writeFileSync(path.join(newerCreatedDir, "proposal.yaml"), "change: newer-created\n", "utf8");

  const commitAndPush = cli(["commit-and-push"], { cwd: commitPushRoot });
  context.assert(commitAndPush.status === 0, "commit-and-push exits zero with local upstream remote", commitAndPush.stderr.trim());
  const commitAndPushJson = JSON.parse(commitAndPush.stdout.trim()) as {
    changeName: string;
    archiveDir: string;
    commitMessage: string;
    pushed: boolean;
  };
  context.assert(
    commitAndPushJson.archiveDir === newerCreatedDirName
      && commitAndPushJson.changeName === "newer-created"
      && commitAndPushJson.commitMessage === "feat: newer-created"
      && commitAndPushJson.pushed === true,
    "commit-and-push selects latest archive directory by creation time",
    commitAndPush.stdout.trim(),
  );

  const latestCommitMessage = runCommand("git", ["log", "-1", "--pretty=%B"], { cwd: commitPushRoot });
  context.assert(
    latestCommitMessage.status === 0 && latestCommitMessage.stdout.trim() === "feat: newer-created",
    "commit-and-push creates commit for latest-created archived change",
    latestCommitMessage.stdout.trim() || latestCommitMessage.stderr.trim(),
  );
} finally {
  rmSync(commitPushRoot, { recursive: true, force: true });
  rmSync(commitPushRemote, { recursive: true, force: true });
}

context.section("[22] maintenance command");

// 22a: no config.yaml → clean exit with zero findings
const maintNoConfigDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-maint-"));
try {
  mkdirSync(path.join(maintNoConfigDir, ".strict-spec-driven"), { recursive: true });
  const noConfigResult = cli(["maintenance"], { cwd: maintNoConfigDir });
  context.assert(noConfigResult.status === 0, "maintenance exits zero when no config.yaml");
  const noConfigJson = JSON.parse(noConfigResult.stdout.trim()) as {
    valid: boolean;
    checksRun: number;
    findingsCount: number;
    generatedChange: string | null;
  };
  context.assert(typeof noConfigJson.valid === "boolean", "maintenance json includes valid field");
  context.assert(typeof noConfigJson.checksRun === "number", "maintenance json includes checksRun field");
  context.assert(typeof noConfigJson.findingsCount === "number", "maintenance json includes findingsCount field");
  context.assert("generatedChange" in noConfigJson, "maintenance json includes generatedChange field");
  context.assert(noConfigJson.checksRun === 0, "maintenance checksRun is 0 when no config.yaml");
  context.assert(noConfigJson.findingsCount === 0, "maintenance findingsCount is 0 when no config.yaml");
  context.assert(noConfigJson.generatedChange === null, "maintenance generatedChange is null when no config.yaml");
} finally {
  rmSync(maintNoConfigDir, { recursive: true, force: true });
}

// 22b: config with no maintenance section → clean exit with zero findings
const maintNoSectionDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-maint-"));
try {
  const strictDir = path.join(maintNoSectionDir, ".strict-spec-driven");
  mkdirSync(strictDir, { recursive: true });
  writeFileSync(
    path.join(strictDir, "config.yaml"),
    "schema: strict-spec-driven/config/v1\nschema_version: 1\nartifact_type: workflow_config\n",
    "utf8",
  );
  const noSectionResult = cli(["maintenance"], { cwd: maintNoSectionDir });
  context.assert(noSectionResult.status === 0, "maintenance exits zero when no maintenance section in config");
  const noSectionJson = JSON.parse(noSectionResult.stdout.trim()) as { checksRun: number; findingsCount: number };
  context.assert(noSectionJson.checksRun === 0, "maintenance checksRun is 0 when no maintenance config section");
  context.assert(noSectionJson.findingsCount === 0, "maintenance findingsCount is 0 when no maintenance config section");
} finally {
  rmSync(maintNoSectionDir, { recursive: true, force: true });
}

// 22c: roadmap-sync-check with mismatches → findings and generated change
const maintMismatchDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-maint-"));
try {
  const strictDir = path.join(maintMismatchDir, ".strict-spec-driven");
  mkdirSync(path.join(strictDir, "roadmap", "milestones"), { recursive: true });
  mkdirSync(path.join(strictDir, "changes", "archive", "2026-04-01-test-maint-change"), { recursive: true });

  writeFileSync(
    path.join(strictDir, "config.yaml"),
    [
      "schema: strict-spec-driven/config/v1",
      "schema_version: 1",
      "artifact_type: workflow_config",
      "maintenance:",
      "  checks:",
      "    - type: roadmap-sync-check",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(strictDir, "roadmap", "INDEX.yaml"),
    [
      "schema: strict-spec-driven/roadmap-index/v2",
      "schema_version: 2",
      "artifact_type: roadmap_index",
      "schema_file: ../schemas/roadmap-index.yaml",
      "milestones:",
      "  0001-test-maint-milestone:",
      "    title: Test Maintenance Milestone",
      "    path: roadmap/milestones/test-maint.yaml",
      "    status: active",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(strictDir, "roadmap", "milestones", "test-maint.yaml"),
    [
      "schema: strict-spec-driven/roadmap-milestone/v2",
      "schema_version: 2",
      "artifact_type: roadmap_milestone",
      "schema_file: templates/strict-spec-driven/schemas/roadmap-milestone.yaml",
      "milestone:",
      "  0001-test-maint-milestone:",
      "    title: Test Maintenance Milestone",
      "goal: Test milestone for maintenance checks.",
      "scope:",
      "  in: []",
      "  out: []",
      "done_criteria: []",
      "planned_changes: {}",
      "dependencies: []",
      "risks: []",
      "status: active",
      "notes: []",
    ].join("\n") + "\n",
    "utf8",
  );

  const mismatchResult = cli(["maintenance"], { cwd: maintMismatchDir });
  context.assert(mismatchResult.status === 0, "maintenance exits zero when roadmap has mismatches");
  const mismatchJson = JSON.parse(mismatchResult.stdout.trim()) as {
    valid: boolean;
    checksRun: number;
    findingsCount: number;
    generatedChange: string | null;
  };
  context.assert(mismatchJson.checksRun === 1, "maintenance checksRun is 1 for roadmap-sync-check");
  context.assert(mismatchJson.findingsCount > 0, "maintenance findingsCount > 0 when roadmap has mismatches");
  context.assert(typeof mismatchJson.generatedChange === "string", "maintenance generatedChange is a string when findings exist");
  context.assert(
    "seedingSkippedReason" in mismatchJson && (mismatchJson as { seedingSkippedReason: string | null }).seedingSkippedReason === null,
    "maintenance seedingSkippedReason is null when seeding proceeds",
  );
  context.assert(
    existsSync(path.join(strictDir, "changes", mismatchJson.generatedChange as string)),
    "maintenance change directory is created under .strict-spec-driven/changes/",
  );

  // 22d: roadmap-sync-check aligned (roadmap already synced after previous run)
  const alignedResult = cli(["maintenance"], { cwd: maintMismatchDir });
  context.assert(alignedResult.status === 0, "maintenance exits zero when roadmap is aligned");
  const alignedJson = JSON.parse(alignedResult.stdout.trim()) as { findingsCount: number; generatedChange: string | null };
  context.assert(alignedJson.findingsCount === 0, "maintenance findingsCount is 0 when roadmap is aligned");
  context.assert(alignedJson.generatedChange === null, "maintenance generatedChange is null when no findings");
} finally {
  rmSync(maintMismatchDir, { recursive: true, force: true });
}

// 22e: findings with a pre-existing active change → zero exit, findings reported, seeding skipped
const maintActiveChangeDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-maint-active-"));
try {
  const strictDir = path.join(maintActiveChangeDir, ".strict-spec-driven");
  mkdirSync(path.join(strictDir, "roadmap", "milestones"), { recursive: true });
  mkdirSync(path.join(strictDir, "changes", "existing-active-change"), { recursive: true });

  writeFileSync(
    path.join(strictDir, "config.yaml"),
    [
      "schema: strict-spec-driven/config/v1",
      "schema_version: 1",
      "artifact_type: workflow_config",
      "maintenance:",
      "  checks:",
      "    - type: roadmap-sync-check",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(strictDir, "roadmap", "INDEX.yaml"),
    [
      "schema: strict-spec-driven/roadmap-index/v2",
      "schema_version: 2",
      "artifact_type: roadmap_index",
      "schema_file: ../schemas/roadmap-index.yaml",
      "milestones:",
      "  0001-test-maint-milestone:",
      "    title: Test Maintenance Milestone",
      "    path: roadmap/milestones/test-maint.yaml",
      "    status: active",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(strictDir, "roadmap", "milestones", "test-maint.yaml"),
    [
      "schema: strict-spec-driven/roadmap-milestone/v2",
      "schema_version: 2",
      "artifact_type: roadmap_milestone",
      "schema_file: templates/strict-spec-driven/schemas/roadmap-milestone.yaml",
      "milestone:",
      "  0001-test-maint-milestone:",
      "    title: Test Maintenance Milestone",
      "goal: Test milestone for maintenance checks.",
      "scope:",
      "  in: []",
      "  out: []",
      "done_criteria: []",
      "planned_changes: {}",
      "dependencies: []",
      "risks: []",
      "status: active",
      "notes: []",
    ].join("\n") + "\n",
    "utf8",
  );

  const skippedResult = cli(["maintenance"], { cwd: maintActiveChangeDir });
  context.assert(skippedResult.status === 0, "maintenance exits zero when seeding is skipped for an active change");
  const skippedJson = JSON.parse(skippedResult.stdout.trim()) as {
    valid: boolean;
    checksRun: number;
    findingsCount: number;
    generatedChange: string | null;
    seedingSkippedReason: string | null;
  };
  context.assert(skippedJson.valid === true, "maintenance stays valid when seeding is skipped for an active change");
  context.assert(skippedJson.checksRun === 1, "maintenance still reports checksRun when seeding is skipped");
  context.assert(skippedJson.findingsCount > 0, "maintenance keeps findings visible when seeding is skipped");
  context.assert(skippedJson.generatedChange === null, "maintenance generatedChange is null when an active change exists");
  context.assert(
    typeof skippedJson.seedingSkippedReason === "string"
      && skippedJson.seedingSkippedReason.includes("'existing-active-change'")
      && skippedJson.seedingSkippedReason.includes("only one active change"),
    "maintenance seedingSkippedReason names the blocking active change and the single-active rule",
    `seedingSkippedReason: ${skippedJson.seedingSkippedReason}`,
  );
  const activeEntries = readdirSync(path.join(strictDir, "changes")).filter((name) => name !== "archive").sort();
  context.assert(
    activeEntries.join(",") === "existing-active-change",
    "maintenance creates no maintenance change while an active change exists",
    `active entries: ${activeEntries.join(",")}`,
  );
} finally {
  rmSync(maintActiveChangeDir, { recursive: true, force: true });
}

context.section("[23] tech standards commands");

const techMissingDir = mkdtempSync(path.join(os.tmpdir(), "strict-tech-missing-"));
try {
  const statusMissing = cli(["tech-status"], { cwd: techMissingDir });
  context.assert(statusMissing.status === 0, "tech-status exits zero when tech dir is absent");
  const statusMissingJson = JSON.parse(statusMissing.stdout.trim()) as { techDirExists: boolean; standardCount: number };
  context.assert(statusMissingJson.techDirExists === false && statusMissingJson.standardCount === 0, "tech-status reports no tech dir");

  const verifyMissing = cli(["verify-tech-mappings"], { cwd: techMissingDir });
  context.assert(verifyMissing.status === 1, "verify-tech-mappings exits non-zero when tech dir is absent");
  const verifyMissingJson = JSON.parse(verifyMissing.stdout.trim()) as { valid: boolean; diagnostics: Array<{ source: string }> };
  context.assert(
    verifyMissingJson.valid === false && verifyMissingJson.diagnostics.some((d) => d.source === "mapping_input"),
    "verify-tech-mappings reports missing tech dir as mapping_input diagnostic",
  );
} finally {
  rmSync(techMissingDir, { recursive: true, force: true });
}

const techValidDir = mkdtempSync(path.join(os.tmpdir(), "strict-tech-valid-"));
try {
  const techDir = path.join(techValidDir, ".strict-spec-driven", "tech");
  mkdirSync(techDir, { recursive: true });
  writeFileSync(path.join(techValidDir, "src-file.ts"), "export const x = 1;\n", "utf8");
  writeFileSync(path.join(techValidDir, "eslint.config.js"), "export default [];\n", "utf8");
  writeFileSync(
    path.join(techDir, "coding.yaml"),
    [
      "schema: strict-spec-driven/main-tech/v1",
      "schema_version: 1",
      "artifact_type: main_tech",
      "schema_file: ../../templates/strict-spec-driven/schemas/main-tech.yaml",
      "standard:",
      "  id: coding-baseline",
      "  title: Coding Baseline",
      "  category: coding",
      "mapping:",
      "  implementation:",
      "    - src-file.ts",
      "  enforcement:",
      "    - eslint.config.js",
      "rules:",
      "  esm-only:",
      "    strength: MUST",
      "    statement: Modules MUST be ESM.",
      "    rationale: Consistency.",
      "    enforcement:",
      "      method: ci",
      "",
    ].join("\n"),
    "utf8",
  );

  const statusValid = cli(["tech-status"], { cwd: techValidDir });
  context.assert(statusValid.status === 0, "tech-status exits zero with a valid standard");
  const statusValidJson = JSON.parse(statusValid.stdout.trim()) as {
    standardCount: number;
    ruleCount: number;
    strengthCounts: { MUST: number };
    standards: Array<{ id: string; category: string; ruleCount: number }>;
  };
  context.assert(
    statusValidJson.standardCount === 1 && statusValidJson.ruleCount === 1 && statusValidJson.strengthCounts.MUST === 1,
    "tech-status summarizes standards and rule strengths",
  );
  context.assert(
    statusValidJson.standards[0]?.id === "coding-baseline" && statusValidJson.standards[0]?.category === "coding",
    "tech-status reports standard identity and category",
  );

  const verifyValid = cli(["verify-tech-mappings"], { cwd: techValidDir });
  context.assert(verifyValid.status === 0, "verify-tech-mappings exits zero when mapping paths resolve");
  const verifyValidJson = JSON.parse(verifyValid.stdout.trim()) as { valid: boolean; summary: { standardCount: number; mappedImplementationCount: number } };
  context.assert(
    verifyValidJson.valid === true && verifyValidJson.summary.mappedImplementationCount === 1,
    "verify-tech-mappings validates resolvable mapping entries",
  );

  writeFileSync(
    path.join(techDir, "broken.yaml"),
    [
      "schema: strict-spec-driven/main-tech/v1",
      "schema_version: 1",
      "artifact_type: main_tech",
      "schema_file: ../../templates/strict-spec-driven/schemas/main-tech.yaml",
      "standard:",
      "  id: broken",
      "  title: Broken",
      "  category: coding",
      "mapping:",
      "  implementation:",
      "    - does-not-exist.ts",
      "  enforcement: []",
      "rules: {}",
      "",
    ].join("\n"),
    "utf8",
  );
  const verifyBroken = cli(["verify-tech-mappings"], { cwd: techValidDir });
  context.assert(verifyBroken.status === 1, "verify-tech-mappings exits non-zero when a mapping path is missing");
  const verifyBrokenJson = JSON.parse(verifyBroken.stdout.trim()) as { valid: boolean; diagnostics: Array<{ message: string }> };
  context.assert(
    verifyBrokenJson.valid === false && verifyBrokenJson.diagnostics.some((d) => d.message.includes("does not exist")),
    "verify-tech-mappings flags mapping entries that point to missing files",
  );

  rmSync(path.join(techDir, "broken.yaml"));
  writeFileSync(
    path.join(techDir, "undeclared-enforcement.yaml"),
    [
      "schema: strict-spec-driven/main-tech/v1",
      "schema_version: 1",
      "artifact_type: main_tech",
      "schema_file: ../../templates/strict-spec-driven/schemas/main-tech.yaml",
      "standard:",
      "  id: undeclared-enforcement",
      "  title: Undeclared Enforcement",
      "  category: tooling",
      "mapping:",
      "  implementation:",
      "    - src-file.ts",
      "  enforcement: []",
      "rules:",
      "  must-lint:",
      "    strength: MUST",
      "    statement: Code MUST pass the linter.",
      "    rationale: Consistency.",
      "    enforcement:",
      "      method: lint",
      "",
    ].join("\n"),
    "utf8",
  );
  const verifyUndeclared = cli(["verify-tech-mappings"], { cwd: techValidDir });
  context.assert(verifyUndeclared.status === 1, "verify-tech-mappings exits non-zero when a mechanical-enforcement rule maps no enforcement files");
  const verifyUndeclaredJson = JSON.parse(verifyUndeclared.stdout.trim()) as { valid: boolean; diagnostics: Array<{ source: string; message: string }> };
  context.assert(
    verifyUndeclaredJson.valid === false
      && verifyUndeclaredJson.diagnostics.some((d) => d.source === "enforcement_declaration" && d.message.includes("must-lint")),
    "verify-tech-mappings reports an enforcement_declaration diagnostic for lint/ci/test rules without enforcement files",
  );
} finally {
  rmSync(techValidDir, { recursive: true, force: true });
}

}
