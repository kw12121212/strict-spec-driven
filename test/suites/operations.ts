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
      "intake_questions:",
      "  - id: objective",
      "    question: What observable outcome should this milestone deliver?",
      "    context: Maintenance fixture milestones must satisfy the roadmap milestone schema.",
      "    impact: Missing intake questions would make maintenance workflow state invalid.",
      "    recommendation: Keep a minimal structured intake question on fixture milestones.",
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

// 22e: findings with one active change seed a second; findings at capacity skip seeding
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
  const unsyncedRoadmapIndex = readFileSync(path.join(strictDir, "roadmap", "INDEX.yaml"), "utf8");

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
      "intake_questions:",
      "  - id: objective",
      "    question: What observable outcome should this milestone deliver?",
      "    context: Maintenance fixture milestones must satisfy the roadmap milestone schema.",
      "    impact: Missing intake questions would make maintenance workflow state invalid.",
      "    recommendation: Keep a minimal structured intake question on fixture milestones.",
      "planned_changes: {}",
      "dependencies: []",
      "risks: []",
      "status: active",
      "notes: []",
    ].join("\n") + "\n",
    "utf8",
  );

  const seededSecondResult = cli(["maintenance"], { cwd: maintActiveChangeDir });
  context.assert(seededSecondResult.status === 0, "maintenance exits zero when seeding a second active change");
  const seededSecondJson = JSON.parse(seededSecondResult.stdout.trim()) as {
    findingsCount: number;
    generatedChange: string | null;
    seedingSkippedReason: string | null;
  };
  context.assert(seededSecondJson.findingsCount > 0, "maintenance reports findings before seeding a second active change");
  context.assert(typeof seededSecondJson.generatedChange === "string", "maintenance seeds when exactly one active change exists");
  context.assert(seededSecondJson.seedingSkippedReason === null, "maintenance does not report capacity while one slot remains");

  writeFileSync(path.join(strictDir, "roadmap", "INDEX.yaml"), unsyncedRoadmapIndex, "utf8");
  const activeEntriesBeforeSkip = readdirSync(path.join(strictDir, "changes")).filter((name) => name !== "archive").sort();
  context.assert(activeEntriesBeforeSkip.length === 2, "maintenance seeding fills the two-active-change capacity");

  const skippedResult = cli(["maintenance"], { cwd: maintActiveChangeDir });
  context.assert(skippedResult.status === 0, "maintenance exits zero when seeding is skipped at two active changes");
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
  context.assert(skippedJson.generatedChange === null, "maintenance generatedChange is null when two active changes exist");
  context.assert(
    typeof skippedJson.seedingSkippedReason === "string"
      && skippedJson.seedingSkippedReason.includes("'existing-active-change'")
      && skippedJson.seedingSkippedReason.includes(`'${seededSecondJson.generatedChange}'`)
      && skippedJson.seedingSkippedReason.includes("limit of two active changes"),
    "maintenance seedingSkippedReason names both blocking changes and the two-active limit",
    `seedingSkippedReason: ${skippedJson.seedingSkippedReason}`,
  );
  const activeEntries = readdirSync(path.join(strictDir, "changes")).filter((name) => name !== "archive").sort();
  context.assert(
    activeEntries.join(",") === activeEntriesBeforeSkip.join(","),
    "maintenance creates no third active change while capacity is full",
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

context.section("[24] maintenance generated-doc-check");

const GENERATED_DOC_CHECK_CONFIG = ["maintenance:", "  checks:", "    - type: generated-doc-check", ""].join("\n");

const MINIMAL_DESIGN_SYSTEM = [
  "schema: strict-spec-driven/design-system/v1",
  "schema_version: 1",
  "artifact_type: design_system",
  "schema_file: templates/strict-spec-driven/schemas/design-system.yaml",
  "design_system:",
  "  id: check-design-system",
  "  title: Check Design System",
  "tokens:",
  "  colors:",
  "    primary: '#1A73E8'",
  "components: {}",
  "guidance:",
  "  overview: The identity recorded before the artifact drifted.",
  "",
].join("\n");

type MaintenanceReport = {
  valid: boolean;
  checksRun: number;
  findingsCount: number;
  generatedChange: string | null;
};

/** Initializes a workspace whose config declares only the generated-doc-check. */
function createGeneratedDocCheckWorkspace(): string {
  const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "strict-spec-generated-doc-"));
  cli(["init"], { cwd: workspaceRoot });
  const configPath = path.join(workspaceRoot, ".strict-spec-driven", "config.yaml");
  writeFileSync(configPath, `${readFileSync(configPath, "utf8")}\n${GENERATED_DOC_CHECK_CONFIG}`, "utf8");
  return workspaceRoot;
}

function readMaintenanceReport(cwd: string): MaintenanceReport {
  const result = cli(["maintenance"], { cwd });
  return JSON.parse(result.stdout.trim()) as MaintenanceReport;
}

/** Finding descriptions recorded in the seeded change's scope, which is where the check reports them. */
function readSeededFindings(workspaceRoot: string, changeName: string): string[] {
  const proposal = readFileSync(
    path.join(workspaceRoot, ".strict-spec-driven", "changes", changeName, "proposal.yaml"),
    "utf8",
  );
  return proposal.split("\n");
}

// 23a: a rendered document that still matches its sources is not a finding
const docCurrentDir = createGeneratedDocCheckWorkspace();
try {
  cli(["architecture-generate"], { cwd: docCurrentDir });
  const report = readMaintenanceReport(docCurrentDir);
  context.assert(report.checksRun === 1, "generated-doc-check counts as a run check", JSON.stringify(report));
  context.assert(report.findingsCount === 0, "a current generated document produces no finding", JSON.stringify(report));
  context.assert(report.generatedChange === null, "a current generated document seeds no maintenance change");
} finally {
  rmSync(docCurrentDir, { recursive: true, force: true });
}

// 23b: a document that was never rendered is declined, not stale
const docAbsentDir = createGeneratedDocCheckWorkspace();
try {
  const report = readMaintenanceReport(docAbsentDir);
  context.assert(report.checksRun === 1, "generated-doc-check runs when no document exists on disk");
  context.assert(report.findingsCount === 0, "an absent generated document produces no finding", JSON.stringify(report));
  context.assert(
    !existsSync(path.join(docAbsentDir, "ARCHITECTURE.md")),
    "generated-doc-check does not create a missing generated document",
  );
} finally {
  rmSync(docAbsentDir, { recursive: true, force: true });
}

// 23c: a stale document is reported, named with its stale source and re-render command, and left untouched
const docStaleDir = createGeneratedDocCheckWorkspace();
try {
  cli(["architecture-generate"], { cwd: docStaleDir });
  const documentPath = path.join(docStaleDir, "ARCHITECTURE.md");
  const renderedDocument = readFileSync(documentPath, "utf8");

  const artifactPath = path.join(docStaleDir, ".strict-spec-driven", "architecture.yaml");
  writeFileSync(
    artifactPath,
    readFileSync(artifactPath, "utf8").replace("title: Project Architecture", "title: Drifted Architecture"),
    "utf8",
  );

  const report = readMaintenanceReport(docStaleDir);
  context.assert(report.findingsCount === 1, "a stale generated document produces one finding", JSON.stringify(report));
  context.assert(typeof report.generatedChange === "string", "a stale generated document seeds a maintenance change");
  context.assert(
    readFileSync(documentPath, "utf8") === renderedDocument,
    "generated-doc-check leaves the stale document byte-identical",
  );

  const findingLines = readSeededFindings(docStaleDir, report.generatedChange as string);
  const architectureFinding = findingLines.find((line) => line.includes("ARCHITECTURE.md"));
  context.assert(architectureFinding !== undefined, "the finding names the stale document", findingLines.join("\n"));
  context.assert(
    (architectureFinding ?? "").includes(".strict-spec-driven/architecture.yaml"),
    "the finding names the source artifact that went stale",
    architectureFinding,
  );
  context.assert(
    (architectureFinding ?? "").includes("strict-spec-cli architecture-generate"),
    "the finding names the command that re-renders the document",
    architectureFinding,
  );
  context.assert(
    !findingLines.some((line) => line.includes("DESIGN.md")),
    "a project with no design-system artifact gets no design document finding",
    findingLines.join("\n"),
  );
} finally {
  rmSync(docStaleDir, { recursive: true, force: true });
}

// 23d: both documents are covered by the one check type
const docBothDir = createGeneratedDocCheckWorkspace();
try {
  const designArtifactPath = path.join(docBothDir, ".strict-spec-driven", "design-system.yaml");
  writeFileSync(designArtifactPath, MINIMAL_DESIGN_SYSTEM, "utf8");
  cli(["architecture-generate"], { cwd: docBothDir });
  cli(["design-generate"], { cwd: docBothDir });

  const designDocumentPath = path.join(docBothDir, "DESIGN.md");
  const renderedDesignDocument = readFileSync(designDocumentPath, "utf8");
  writeFileSync(
    designArtifactPath,
    MINIMAL_DESIGN_SYSTEM.replace(
      "The identity recorded before the artifact drifted.",
      "The identity after the artifact drifted.",
    ),
    "utf8",
  );

  const report = readMaintenanceReport(docBothDir);
  context.assert(
    report.findingsCount === 1,
    "the stale design document is reported while the current architecture document is not",
    JSON.stringify(report),
  );
  context.assert(
    readFileSync(designDocumentPath, "utf8") === renderedDesignDocument,
    "generated-doc-check leaves the stale design document byte-identical",
  );

  const findingLines = readSeededFindings(docBothDir, report.generatedChange as string);
  const designFinding = findingLines.find((line) => line.includes("DESIGN.md"));
  context.assert(designFinding !== undefined, "the finding names the stale design document", findingLines.join("\n"));
  context.assert(
    (designFinding ?? "").includes(".strict-spec-driven/design-system.yaml")
      && (designFinding ?? "").includes("strict-spec-cli design-generate"),
    "the design finding names its source artifact and re-render command",
    designFinding,
  );
} finally {
  rmSync(docBothDir, { recursive: true, force: true });
}


context.section("[25] maintenance lesson-staleness-check");

const LESSON_STALENESS_CONFIG = ["maintenance:", "  checks:", "    - type: lesson-staleness-check", ""].join("\n");

function makeLessonStalenessWorkspace(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "strict-spec-lesson-stale-"));
  const strictDir = path.join(root, ".strict-spec-driven");
  mkdirSync(path.join(strictDir, "lessons"), { recursive: true });
  mkdirSync(path.join(strictDir, "changes", "archive"), { recursive: true });
  writeFileSync(
    path.join(strictDir, "config.yaml"),
    ["schema: strict-spec-driven/config/v1", "schema_version: 1", "artifact_type: workflow_config", LESSON_STALENESS_CONFIG].join("\n"),
    "utf8",
  );
  return root;
}

function runLessonStaleness(root: string): { checksRun: number; findingsCount: number; findings: string[] } {
  const result = cli(["maintenance"], { cwd: root });
  const parsed = JSON.parse(result.stdout.trim()) as { checksRun: number; findingsCount: number; generatedChange: string | null };
  const findings: string[] = [];
  if (parsed.generatedChange) {
    const tasksPath = path.join(root, ".strict-spec-driven", "changes", parsed.generatedChange, "tasks.yaml");
    if (existsSync(tasksPath)) findings.push(readFileSync(tasksPath, "utf8"));
  }
  return { checksRun: parsed.checksRun, findingsCount: parsed.findingsCount, findings };
}

// 25a: a lesson whose applies_when names a vanished path is nominated, and the lesson is untouched
const staleLessonDir = makeLessonStalenessWorkspace();
try {
  const created = JSON.parse(
    cli(
      [
        "lesson-create",
        "--title", "Guard the removed module",
        "--category", "coding",
        "--context", "editing a module that has since been deleted",
        "--observation", "the module silently swallowed an error",
        "--takeaway", "check the error path before trusting the module",
        "--applies-when", "touching src/module-that-no-longer-exists.ts in this repository",
        "--origin", "some-change",
        "--evidence", "a swallowed error surfaced only in production logs",
      ],
      { cwd: staleLessonDir },
    ).stdout.trim(),
  ) as { lessonId: string; path: string };

  const lessonFile = path.join(staleLessonDir, created.path);
  const before = readFileSync(lessonFile, "utf8");

  const staleRun = runLessonStaleness(staleLessonDir);
  context.assert(staleRun.checksRun === 1, "lesson-staleness-check runs when configured");
  context.assert(staleRun.findingsCount === 1, "a lesson naming a vanished path is reported as a staleness candidate");
  const staleText = staleRun.findings.join("\n");
  context.assert(
    staleText.includes(created.lessonId) && staleText.includes("src/module-that-no-longer-exists.ts"),
    "the finding names the lesson and the path that no longer exists",
    staleText,
  );
  context.assert(
    staleText.includes("lesson-obsolete"),
    "the finding names the command that retires the lesson",
    staleText,
  );

  const after = readFileSync(lessonFile, "utf8");
  context.assert(after === before, "the staleness check never rewrites a lesson file");
  const listed = JSON.parse(cli(["lesson-list"], { cwd: staleLessonDir }).stdout.trim()) as { lessons: Array<{ status: string }> };
  context.assert(
    listed.lessons.length === 1 && listed.lessons[0]?.status === "active",
    "the nominated lesson keeps active status; retirement stays an explicit human decision",
  );
} finally {
  rmSync(staleLessonDir, { recursive: true, force: true });
}

// 25b: a fresh lesson whose referenced paths still exist produces no findings
const freshLessonDir = makeLessonStalenessWorkspace();
try {
  mkdirSync(path.join(freshLessonDir, "src"), { recursive: true });
  writeFileSync(path.join(freshLessonDir, "src", "present.ts"), "export const present = true;\n", "utf8");

  cli(
    [
      "lesson-create",
      "--title", "Recently learned",
      "--category", "testing",
      "--context", "a recent change",
      "--observation", "something surprising happened",
      "--takeaway", "watch for it next time",
      "--applies-when", "working on src/present.ts in this repository",
      "--origin", "add-lessons-artifact-family",
      "--evidence", "observed during the change that introduced this lesson",
    ],
    { cwd: freshLessonDir },
  );

  const freshRun = runLessonStaleness(freshLessonDir);
  context.assert(freshRun.checksRun === 1, "lesson-staleness-check runs for a fresh lesson");
  context.assert(freshRun.findingsCount === 0, "a fresh lesson whose referenced paths still exist produces no findings");
} finally {
  rmSync(freshLessonDir, { recursive: true, force: true });
}

// 25c: an unconfigured project never runs the check
const unconfiguredLessonDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-lesson-stale-"));
try {
  const strictDir = path.join(unconfiguredLessonDir, ".strict-spec-driven");
  mkdirSync(path.join(strictDir, "lessons"), { recursive: true });
  writeFileSync(
    path.join(strictDir, "config.yaml"),
    "schema: strict-spec-driven/config/v1\nschema_version: 1\nartifact_type: workflow_config\n",
    "utf8",
  );
  const unconfigured = JSON.parse(cli(["maintenance"], { cwd: unconfiguredLessonDir }).stdout.trim()) as { checksRun: number };
  context.assert(unconfigured.checksRun === 0, "lesson-staleness-check does not run unless the project declares it");
} finally {
  rmSync(unconfiguredLessonDir, { recursive: true, force: true });
}


  context.section("[operations] cli-only-yaml-policy maintenance check");

  const policyWorkspace = mkdtempSync(path.join(os.tmpdir(), "strict-policy-maint-"));
  try {
    const policyStateDir = path.join(policyWorkspace, ".strict-spec-driven");
    mkdirSync(path.join(policyStateDir, "specs"), { recursive: true });
    mkdirSync(path.join(policyStateDir, "tech"), { recursive: true });
    mkdirSync(path.join(policyWorkspace, "docs"), { recursive: true });
    writeFileSync(
      path.join(policyStateDir, "config.yaml"),
      [
        "schema: strict-spec-driven/config/v1",
        "schema_version: 1",
        "artifact_type: workflow_config",
        "maintenance:",
        "  checks:",
        "    - type: cli-only-yaml-policy",
        "",
      ].join("\n"),
      "utf8",
    );

    // One violation per governed surface, each phrased as an instruction rather than a prohibition.
    writeFileSync(
      path.join(policyStateDir, "specs", "seeded.yaml"),
      "statement: Run apply_patch on .strict-spec-driven/specs/seeded.yaml to add the requirement.\n",
      "utf8",
    );
    writeFileSync(
      path.join(policyStateDir, "tech", "seeded.yaml"),
      "statement: If the command is unavailable, instead edit the .strict-spec-driven/tech/seeded.yaml by hand.\n",
      "utf8",
    );
    writeFileSync(
      path.join(policyWorkspace, "docs", "seeded.md"),
      "Create a temporary YAML payload file and pass it to the command.\n",
      "utf8",
    );

    const seededRun = cli(["maintenance"], { cwd: policyWorkspace });
    context.assert(seededRun.status === 0, "maintenance exits zero while reporting policy findings");
    const seededJson = JSON.parse(seededRun.stdout) as { checksRun: number; findingsCount: number; generatedChange?: string | null };
    context.assert(seededJson.checksRun === 1, "the configured cli-only-yaml-policy check runs");
    context.assert(
      seededJson.findingsCount >= 3,
      "each seeded governed surface produces a policy finding",
      `got ${seededJson.findingsCount}`,
    );

    const seededChange = seededJson.generatedChange;
    context.assert(typeof seededChange === "string" && seededChange.length > 0, "policy findings seed a maintenance change");
    const seededProposal = readFileSync(
      path.join(policyStateDir, "changes", String(seededChange), "proposal.yaml"),
      "utf8",
    );
    for (const surface of ["specs/seeded.yaml", "tech/seeded.yaml", "docs/seeded.md"]) {
      context.assert(
        seededProposal.includes(surface),
        `the policy finding names the offending file ${surface}`,
      );
    }
    context.assert(
      seededProposal.includes("[direct-file-edit]")
        && seededProposal.includes("[hand-edit-fallback]")
        && seededProposal.includes("[raw-yaml-payload]"),
      "each finding names the policy category it matched",
    );
    context.assert(
      seededProposal.includes("strict CLI command") || seededProposal.includes("no-direct-edit-fallback"),
      "each finding names what to do instead of the direct mutation",
    );
  } finally {
    rmSync(policyWorkspace, { recursive: true, force: true });
  }

  const compliantWorkspace = mkdtempSync(path.join(os.tmpdir(), "strict-policy-clean-"));
  try {
    const compliantStateDir = path.join(compliantWorkspace, ".strict-spec-driven");
    mkdirSync(path.join(compliantStateDir, "specs"), { recursive: true });
    mkdirSync(path.join(compliantWorkspace, "docs"), { recursive: true });
    writeFileSync(
      path.join(compliantStateDir, "config.yaml"),
      [
        "schema: strict-spec-driven/config/v1",
        "schema_version: 1",
        "artifact_type: workflow_config",
        "maintenance:",
        "  checks:",
        "    - type: cli-only-yaml-policy",
        "",
      ].join("\n"),
      "utf8",
    );
    // Permitted surfaces: a prohibition, a read-only lookup, and a documented human-only note.
    writeFileSync(
      path.join(compliantStateDir, "specs", "clean.yaml"),
      "statement: Never edit .strict-spec-driven/specs/clean.yaml directly with apply_patch on clean.yaml; use spec-edit.\n",
      "utf8",
    );
    writeFileSync(
      path.join(compliantWorkspace, "docs", "clean.md"),
      [
        "Inspect .strict-spec-driven/config.yaml with schema-show to confirm its shape.",
        "Run strict-spec-cli config-edit --set preferred_human_language --value English.",
        "A human may use apply_patch on config.yaml (human-manual-edit).",
        "",
      ].join("\n"),
      "utf8",
    );

    const cleanRun = cli(["maintenance"], { cwd: compliantWorkspace });
    context.assert(cleanRun.status === 0, "maintenance exits zero on a compliant repository");
    const cleanJson = JSON.parse(cleanRun.stdout) as { checksRun: number; findingsCount: number; generatedChange?: string | null };
    context.assert(cleanJson.checksRun === 1, "the policy check still runs when it finds nothing");
    context.assert(
      cleanJson.findingsCount === 0,
      "permitted surfaces produce no policy finding",
      `got ${cleanJson.findingsCount}`,
    );
    context.assert(cleanJson.generatedChange === null, "a clean policy run seeds no maintenance change");
  } finally {
    rmSync(compliantWorkspace, { recursive: true, force: true });
  }

}
