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
      "schema: strict-spec-driven/roadmap-index/v1",
      "schema_version: 1",
      "artifact_type: roadmap_index",
      "schema_file: ../schemas/roadmap-index.yaml",
      "milestones:",
      "  - id: test-maint-milestone",
      "    title: Test Maintenance Milestone",
      "    path: roadmap/milestones/test-maint.yaml",
      "    status: proposed",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(strictDir, "roadmap", "milestones", "test-maint.yaml"),
    [
      "schema: strict-spec-driven/roadmap-milestone/v1",
      "schema_version: 1",
      "artifact_type: roadmap_milestone",
      "schema_file: templates/strict-spec-driven/schemas/roadmap-milestone.yaml",
      "milestone:",
      "  id: test-maint-milestone",
      "  title: Test Maintenance Milestone",
      "goal: Test milestone for maintenance checks.",
      "scope:",
      "  in: []",
      "  out: []",
      "done_criteria: []",
      "planned_changes:",
      "  - schema: strict-spec-driven/planned-change-entry/v1",
      "    schema_version: 1",
      "    artifact_type: planned_change_entry",
      "    schema_file: templates/strict-spec-driven/schemas/planned-change-entry.yaml",
      "    id: test-maint-change",
      "    status: planned",
      "    summary: Test change for maintenance.",
      "    depends_on: []",
      "dependencies: []",
      "risks: []",
      "status: proposed",
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

}
