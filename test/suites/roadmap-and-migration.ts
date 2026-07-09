import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "fs";
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

const TEST_MILESTONE_INTAKE_QUESTION = {
  id: "objective",
  question: "What observable outcome should this milestone deliver?",
  context: "Test milestones need explicit planning questions before child changes are proposed.",
  impact: "Missing intake questions would make milestone planning ambiguous.",
  recommendation: "Keep at least one structured intake question on every milestone artifact.",
};

export async function runRoadmapAndMigrationSuite(context: TestContext): Promise<void> {
  const yamlModule = await loadDistModule<YamlModule>("yaml.js");
  const skillValidationModule = await loadDistModule<SkillValidationModule>("skills.js");
context.section("[17] roadmap workflow commands");

function writeRoadmapIndexArtifact(
  rootDir: string,
  milestones: Array<{ id: string; title: string; path: string; status: string }>,
): void {
  const indexPath = path.join(rootDir, ".strict-spec-driven", "roadmap", "INDEX.yaml");
  mkdirSync(path.dirname(indexPath), { recursive: true });
  const milestonesMap: Record<string, { title: string; path: string; status: string }> = {};
  for (const m of milestones) {
    milestonesMap[m.id] = { title: m.title, path: m.path, status: m.status };
  }
  writeFileSync(
    indexPath,
    yamlModule.stringifyYamlDocument({
      schema: "strict-spec-driven/roadmap-index/v2",
      schema_version: 2,
      artifact_type: "roadmap_index",
      schema_file: "../schemas/roadmap-index.yaml",
      milestones: milestonesMap,
    }),
    "utf8",
  );
}

function writeRoadmapMilestoneArtifact(
  rootDir: string,
  fileName: string,
  options: {
    id: string;
    title: string;
    goal: string;
    status: string;
    plannedChanges: Array<{ id: string; status: string; summary: string; depends_on: string[] }>;
    order?: number;
    details?: string;
  },
): void {
  const milestonePath = path.join(rootDir, ".strict-spec-driven", "roadmap", "milestones", fileName);
  mkdirSync(path.dirname(milestonePath), { recursive: true });
  const milestoneKeyed: Record<string, { title: string }> = {};
  milestoneKeyed[options.id] = { title: options.title };
  const plannedChangesMap: Record<string, { status: string; summary: string; details: string; depends_on: string[] }> = {};
  for (const pc of options.plannedChanges) {
    plannedChangesMap[pc.id] = { status: pc.status, summary: pc.summary, details: "Test details for " + pc.id, depends_on: pc.depends_on };
  }
  writeFileSync(
    milestonePath,
    yamlModule.stringifyYamlDocument({
      schema: "strict-spec-driven/roadmap-milestone/v2",
      schema_version: 2,
      artifact_type: "roadmap_milestone",
      schema_file: "../schemas/roadmap-milestone.yaml",
      milestone: milestoneKeyed,
      ...(options.order !== undefined ? { order: options.order } : {}),
      goal: options.goal,
      scope: {
        in: ["Strict roadmap workflow behavior."],
        out: ["Unrelated behavior."],
      },
      done_criteria: ["The roadmap workflow is implemented and verified."],
      intake_questions: [{ ...TEST_MILESTONE_INTAKE_QUESTION }],
      planned_changes: plannedChangesMap,
      dependencies: [],
      risks: [],
      status: options.status,
      notes: [],
      ...(options.details != null ? { details: options.details } : {}),
    }),
    "utf8",
  );
}

function writeStandalonePlannedChangeArtifact(
  rootDir: string,
  relativePath: string,
  options: {
    id: string;
    milestone: string;
    status: string;
    summary: string;
    details: string;
    depends_on: string[];
    team?: Record<string, unknown>;
    extensions?: Record<string, unknown>;
  },
): void {
  const plannedChangePath = path.join(rootDir, ".strict-spec-driven", "roadmap", relativePath);
  mkdirSync(path.dirname(plannedChangePath), { recursive: true });
  writeFileSync(
    plannedChangePath,
    yamlModule.stringifyYamlDocument({
      schema: "strict-spec-driven/planned-change/v1",
      schema_version: 1,
      artifact_type: "planned_change",
      schema_file: "../../templates/strict-spec-driven/schemas/planned-change.yaml",
      planned_change: {
        id: options.id,
        milestone: options.milestone,
      },
      status: options.status,
      summary: options.summary,
      details: options.details,
      depends_on: options.depends_on,
      ...(options.team != null ? { team: options.team } : {}),
      ...(options.extensions != null ? { extensions: options.extensions } : {}),
    }),
    "utf8",
  );
}

const roadmapHappyDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-happy-"));
try {
  mkdirSync(path.join(roadmapHappyDir, ".strict-spec-driven", "changes", "active-change"), { recursive: true });
  mkdirSync(
    path.join(roadmapHappyDir, ".strict-spec-driven", "changes", "archive", `${formatLocalDateStamp()}-archived-change`),
    { recursive: true },
  );

  writeRoadmapMilestoneArtifact(roadmapHappyDir, "0001-roadmap.yaml", {
    id: "0001-roadmap",
    title: "Roadmap Workflow",
    goal: "Keep strict roadmap state aligned with change state.",
    status: "blocked",
    plannedChanges: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapHappyDir, "planned-changes/0001-roadmap-active-change.yaml", {
    id: "active-change",
    milestone: "0001-roadmap",
    status: "planned",
    summary: "Active work remains in progress.",
    details: "Standalone details for active-change.",
    depends_on: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapHappyDir, "planned-changes/0001-roadmap-archived-change.yaml", {
    id: "archived-change",
    milestone: "0001-roadmap",
    status: "planned",
    summary: "Archived work should reconcile to complete.",
    details: "Standalone details for archived-change.",
    depends_on: ["active-change"],
  });
  writeStandalonePlannedChangeArtifact(roadmapHappyDir, "planned-changes/0001-roadmap-blocked-change.yaml", {
    id: "blocked-change",
    milestone: "0001-roadmap",
    status: "planned",
    summary: "Blocked work still depends on active change state.",
    details: "Standalone details for blocked-change.",
    depends_on: ["active-change"],
  });
  writeStandalonePlannedChangeArtifact(roadmapHappyDir, "planned-changes/0001-roadmap-next-change.yaml", {
    id: "next-change",
    milestone: "0001-roadmap",
    status: "planned",
    summary: "Ready work depends only on archived strict history.",
    details: "Standalone details for next-change.",
    depends_on: ["archived-change"],
  });

  writeRoadmapIndexArtifact(roadmapHappyDir, [
    {
      id: "0001-roadmap",
      title: "Roadmap Workflow",
      path: "roadmap/milestones/0001-roadmap.yaml",
      status: "blocked",
    },
  ]);

  const roadmapStatusBefore = cli(["roadmap-status"], { cwd: roadmapHappyDir });
  context.assert(roadmapStatusBefore.status === 0, "roadmap-status exits zero for a structurally valid roadmap");
  const roadmapStatusBeforeJson = JSON.parse(roadmapStatusBefore.stdout.trim());
  context.assert(roadmapStatusBeforeJson.valid === true, "roadmap-status reports valid=true for structurally valid roadmap");
  context.assert(roadmapStatusBeforeJson.milestones.length === 1, "roadmap-status reports one milestone");
  context.assert(
    roadmapStatusBeforeJson.milestones[0].path === "roadmap/milestones/0001-roadmap.yaml",
    "roadmap-status reports milestone path in roadmap order",
  );
  context.assert(
    roadmapStatusBeforeJson.milestones[0].file === undefined
      && roadmapStatusBeforeJson.milestones[0].goal === undefined
      && roadmapStatusBeforeJson.milestones[0].plannedChanges[0].summary === undefined,
    "roadmap-status omits bulky or redundant roadmap fields from default output",
  );
  context.assert(
    roadmapStatusBeforeJson.milestones[0].declaredStatus === "blocked"
      && roadmapStatusBeforeJson.milestones[0].derivedStatus === "active",
    "roadmap-status reports declared and derived milestone statuses",
  );
  context.assert(
    roadmapStatusBeforeJson.milestones[0].plannedChanges[0].state === "active"
      && roadmapStatusBeforeJson.milestones[0].plannedChanges[1].state === "archived",
    "roadmap-status derives planned change state from active and archived strict changes",
  );
  context.assert(
    roadmapStatusBeforeJson.milestones[0].plannedChanges[1].derivedStatus === "complete",
    "roadmap-status derives archived planned changes as complete",
  );
  context.assert(
    roadmapStatusBeforeJson.milestones[0].plannedChanges[0].source === "standalone"
      && roadmapStatusBeforeJson.milestones[0].plannedChanges[0].path === "roadmap/planned-changes/0001-roadmap-active-change.yaml"
      && roadmapStatusBeforeJson.milestones[0].plannedChanges[1].path === "roadmap/planned-changes/0001-roadmap-archived-change.yaml",
    "roadmap-status reports standalone planned-change source and path",
  );
  context.assert(
    roadmapStatusBeforeJson.milestones[0].mismatches.length === 1
      && roadmapStatusBeforeJson.milestones[0].plannedChanges[1].mismatches.length === 1,
    "roadmap-status reports mismatch details without failing structural validation",
  );
  const roadmapOverviewBefore = cli(["roadmap-overview"], { cwd: roadmapHappyDir });
  context.assert(roadmapOverviewBefore.status === 0, "roadmap-overview exits zero for a structurally valid roadmap");
  context.assert(
    roadmapOverviewBefore.stdout.includes("Roadmap overview (valid)")
      && roadmapOverviewBefore.stdout.includes("Milestone summary:")
      && roadmapOverviewBefore.stdout.includes("0001-roadmap"),
    "roadmap-overview reports human-readable milestone summary content",
  );
  context.assert(
    roadmapOverviewBefore.stdout.includes("Declared")
      && roadmapOverviewBefore.stdout.includes("Derived")
      && roadmapOverviewBefore.stdout.includes("Roadmap Workflow"),
    "roadmap-overview renders milestone table headers and title content",
  );
  context.assert(
    roadmapOverviewBefore.stdout.includes("[0001-roadmap] Roadmap Workflow")
      && roadmapOverviewBefore.stdout.includes("planned changes:")
      && roadmapOverviewBefore.stdout.includes("active-change | state=active")
      && roadmapOverviewBefore.stdout.includes("roadmap/planned-changes/0001-roadmap-active-change.yaml"),
    "roadmap-overview groups planned-change detail under the owning milestone with workflow state and path",
  );
  context.assert(
    !roadmapOverviewBefore.stdout.includes("goal: Keep strict roadmap state aligned with change state.")
      && !roadmapOverviewBefore.stdout.includes("summary: Active work remains in progress."),
    "roadmap-overview omits bulky milestone goal and planned-change summary text by default",
  );
  const roadmapOverviewBeforeRepeat = cli(["roadmap-overview"], { cwd: roadmapHappyDir });
  context.assert(
    roadmapOverviewBeforeRepeat.status === roadmapOverviewBefore.status
      && roadmapOverviewBeforeRepeat.stdout === roadmapOverviewBefore.stdout,
    "roadmap-overview keeps deterministic output ordering across repeated valid runs",
  );
  const roadmapRecommend = cli(["roadmap-recommend"], { cwd: roadmapHappyDir });
  context.assert(roadmapRecommend.status === 0, "roadmap-recommend exits zero when an eligible candidate exists");
  const roadmapRecommendJson = JSON.parse(roadmapRecommend.stdout.trim());
  context.assert(
    roadmapRecommendJson.valid === true
      && roadmapRecommendJson.status === "recommended"
      && roadmapRecommendJson.recommendation?.id === "next-change"
      && roadmapRecommendJson.recommendation?.path === "roadmap/planned-changes/0001-roadmap-next-change.yaml"
      && roadmapRecommendJson.recommendation?.milestone?.id === "0001-roadmap"
      && roadmapRecommendJson.recommendation?.summary === undefined
      && roadmapRecommendJson.recommendation?.reason === undefined,
    "roadmap-recommend returns a compact first eligible standalone planned change in roadmap order",
  );
  context.assert(
    roadmapRecommendJson.candidates === undefined
      && roadmapRecommendJson.candidateSummary?.total === 4
      && roadmapRecommendJson.candidateSummary?.eligible === 1
      && roadmapRecommendJson.candidateSummary?.skippedByCode?.["dependency-incomplete"] === 2,
    "roadmap-recommend summarizes candidates without emitting the full candidate list by default",
  );
  const roadmapRecommendDetails = cli(["roadmap-recommend", "--details"], { cwd: roadmapHappyDir });
  context.assert(roadmapRecommendDetails.status === 0, "roadmap-recommend --details exits zero when an eligible candidate exists");
  const roadmapRecommendDetailsJson = JSON.parse(roadmapRecommendDetails.stdout.trim());
  context.assert(
    roadmapRecommendDetailsJson.recommendation?.summary === "Ready work depends only on archived strict history.",
    "roadmap-recommend --details preserves the full recommendation summary",
  );
  context.assert(
    typeof roadmapRecommendDetailsJson.recommendation?.reason === "string",
    "roadmap-recommend --details preserves the full recommendation reason",
  );
  context.assert(
    roadmapRecommendDetailsJson.candidates.some(
      (candidate: {
        id: string;
        eligible: boolean;
        skipReasons: Array<{ code: string; message: string }>;
      }) =>
        candidate.id === "blocked-change"
        && candidate.eligible === false
        && candidate.skipReasons.some(
          (reason) => reason.code === "dependency-incomplete" && reason.message.includes("active-change"),
        ),
    ),
    "roadmap-recommend --details reports deterministic skip reasons for dependency-blocked planned changes",
  );

  const roadmapSync = cli(["roadmap-sync"], { cwd: roadmapHappyDir });
  context.assert(roadmapSync.status === 0, "roadmap-sync exits zero for reconcilable roadmap state", `got ${roadmapSync.status}`);
  const roadmapSyncJson = JSON.parse(roadmapSync.stdout.trim());
  context.assert(roadmapSyncJson.valid === true, "roadmap-sync reports valid=true after reconciliation");
  context.assert(
    roadmapSyncJson.milestones[0].file === undefined
      && roadmapSyncJson.milestones[0].goal === undefined
      && roadmapSyncJson.milestones[0].plannedChanges[0].summary === undefined,
    "roadmap-sync omits bulky or redundant roadmap fields from command output",
  );
  context.assert(
    roadmapSyncJson.updatedFiles.includes(".strict-spec-driven/roadmap/INDEX.yaml")
      && roadmapSyncJson.updatedFiles.includes(".strict-spec-driven/roadmap/milestones/0001-roadmap.yaml")
      && roadmapSyncJson.updatedFiles.includes(".strict-spec-driven/roadmap/planned-changes/0001-roadmap-archived-change.yaml"),
    "roadmap-sync reports updated index, milestone, and standalone planned-change files",
    `updatedFiles: ${JSON.stringify(roadmapSyncJson.updatedFiles)}`,
  );

  const syncedMilestone = yamlModule.parseYamlFile<{
    status: string;
    planned_changes: Record<string, { status: string }>;
  }>(path.join(roadmapHappyDir, ".strict-spec-driven", "roadmap", "milestones", "0001-roadmap.yaml"));
  context.assert(syncedMilestone.status === "active", "roadmap-sync rewrites milestone status to derived status");
  context.assert(
    Object.keys(syncedMilestone.planned_changes).length === 0,
    "roadmap-sync keeps milestone planned_changes empty for standalone-only roadmaps",
  );

  const syncedIndex = yamlModule.parseYamlFile<{
    milestones: Array<{ id: string; title: string; path: string; status: string }>;
  }>(path.join(roadmapHappyDir, ".strict-spec-driven", "roadmap", "INDEX.yaml"));
  context.assert(
    Object.keys(syncedIndex.milestones).length === 1
      && syncedIndex.milestones["0001-roadmap"]?.status === "active"
      && syncedIndex.milestones["0001-roadmap"]?.path === "roadmap/milestones/0001-roadmap.yaml",
    "roadmap-sync regenerates canonical roadmap index entries from milestone state",
  );

  const roadmapStatusAfter = cli(["roadmap-status"], { cwd: roadmapHappyDir });
  context.assert(roadmapStatusAfter.status === 0, "roadmap-status stays zero after roadmap-sync");
  const roadmapStatusAfterJson = JSON.parse(roadmapStatusAfter.stdout.trim());
  context.assert(
    roadmapStatusAfterJson.milestones[0].mismatches.length === 0
      && roadmapStatusAfterJson.milestones[0].plannedChanges.every((plannedChange: { mismatches: unknown[] }) => plannedChange.mismatches.length === 0),
    "roadmap-sync clears milestone and planned change mismatch state",
  );
} finally {
  rmSync(roadmapHappyDir, { recursive: true, force: true });
}

const roadmapScopedRecommendDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-scoped-recommend-"));
try {
  writeRoadmapMilestoneArtifact(roadmapScopedRecommendDir, "0001-first.yaml", {
    id: "0001-first",
    title: "First Milestone",
    goal: "Keep the first milestone eligible.",
    status: "planned",
    plannedChanges: [],
  });
  writeRoadmapMilestoneArtifact(roadmapScopedRecommendDir, "0002-target.yaml", {
    id: "0002-target",
    title: "Target Milestone",
    goal: "Keep target milestone selection isolated.",
    status: "planned",
    plannedChanges: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapScopedRecommendDir, "planned-changes/0001-first-first-ready.yaml", {
    id: "first-ready",
    milestone: "0001-first",
    status: "planned",
    summary: "First milestone ready work.",
    details: "Standalone details for first-ready.",
    depends_on: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapScopedRecommendDir, "planned-changes/0002-target-target-blocked.yaml", {
    id: "target-blocked",
    milestone: "0002-target",
    status: "planned",
    summary: "Target milestone blocked work.",
    details: "Standalone details for target-blocked.",
    depends_on: ["first-ready"],
  });
  writeStandalonePlannedChangeArtifact(roadmapScopedRecommendDir, "planned-changes/0002-target-target-ready.yaml", {
    id: "target-ready",
    milestone: "0002-target",
    status: "planned",
    summary: "Target milestone ready work.",
    details: "Standalone details for target-ready.",
    depends_on: [],
  });
  writeRoadmapIndexArtifact(roadmapScopedRecommendDir, [
    {
      id: "0001-first",
      title: "First Milestone",
      path: "roadmap/milestones/0001-first.yaml",
      status: "planned",
    },
    {
      id: "0002-target",
      title: "Target Milestone",
      path: "roadmap/milestones/0002-target.yaml",
      status: "planned",
    },
  ]);

  const globalRecommend = cli(["roadmap-recommend"], { cwd: roadmapScopedRecommendDir });
  context.assert(globalRecommend.status === 0, "roadmap-recommend keeps global recommendation behavior without milestone scope");
  const globalRecommendJson = JSON.parse(globalRecommend.stdout.trim());
  context.assert(
    globalRecommendJson.recommendation?.id === "first-ready"
      && globalRecommendJson.candidateSummary?.total === 3
      && globalRecommendJson.candidateSummary?.eligible === 2,
    "roadmap-recommend without --milestone selects the first eligible planned change in global roadmap order",
  );

  const scopedRecommend = cli(["roadmap-recommend", "--milestone", "0002-target"], { cwd: roadmapScopedRecommendDir });
  context.assert(scopedRecommend.status === 0, "roadmap-recommend --milestone exits zero when the selected milestone has an eligible candidate");
  const scopedRecommendJson = JSON.parse(scopedRecommend.stdout.trim());
  context.assert(
    scopedRecommendJson.recommendation?.id === "target-ready"
      && scopedRecommendJson.recommendation?.milestone?.id === "0002-target"
      && scopedRecommendJson.candidateSummary?.total === 2
      && scopedRecommendJson.candidateSummary?.eligible === 1
      && scopedRecommendJson.candidateSummary?.skippedByCode?.["dependency-incomplete"] === 1
      && scopedRecommendJson.detailsCommand === "strict-spec-cli roadmap-recommend --milestone 0002-target --details",
    "roadmap-recommend --milestone scopes compact recommendation and candidate summaries to the selected milestone",
  );

  const scopedDetailsRecommend = cli(["roadmap-recommend", "--details", "--milestone=0002-target"], { cwd: roadmapScopedRecommendDir });
  context.assert(scopedDetailsRecommend.status === 0, "roadmap-recommend --details composes with --milestone");
  const scopedDetailsRecommendJson = JSON.parse(scopedDetailsRecommend.stdout.trim());
  context.assert(
    scopedDetailsRecommendJson.recommendation?.summary === "Target milestone ready work."
      && scopedDetailsRecommendJson.candidates.length === 2
      && scopedDetailsRecommendJson.candidates.every((candidate: { milestone: { id: string } }) => candidate.milestone.id === "0002-target"),
    "roadmap-recommend --details with --milestone preserves full scoped candidate detail",
  );

  const missingMilestoneRecommend = cli(["roadmap-recommend", "--milestone", "missing-milestone"], { cwd: roadmapScopedRecommendDir });
  context.assert(missingMilestoneRecommend.status !== 0, "roadmap-recommend --milestone exits non-zero when the selected milestone has no candidates");
  const missingMilestoneRecommendJson = JSON.parse(missingMilestoneRecommend.stdout.trim());
  context.assert(
    missingMilestoneRecommendJson.status === "no-candidate"
      && missingMilestoneRecommendJson.recommendation === null
      && missingMilestoneRecommendJson.candidateSummary?.total === 0,
    "roadmap-recommend --milestone does not fall back to eligible planned changes from other milestones",
  );
} finally {
  rmSync(roadmapScopedRecommendDir, { recursive: true, force: true });
}

const roadmapOrderingDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-ordering-"));
try {
  writeRoadmapMilestoneArtifact(roadmapOrderingDir, "alpha.yaml", {
    id: "alpha",
    title: "Alpha",
    goal: "Exercise slug-only milestone identity.",
    status: "proposed",
    order: 300,
    plannedChanges: [],
  });
  writeRoadmapMilestoneArtifact(roadmapOrderingDir, "beta.yaml", {
    id: "beta",
    title: "Beta",
    goal: "Exercise order sorting before filename sorting.",
    status: "proposed",
    order: 100,
    plannedChanges: [],
  });
  writeRoadmapMilestoneArtifact(roadmapOrderingDir, "gamma.yaml", {
    id: "gamma",
    title: "Gamma",
    goal: "Exercise reorder commands.",
    status: "proposed",
    order: 200,
    plannedChanges: [],
  });
  writeRoadmapMilestoneArtifact(roadmapOrderingDir, "legacy-single.yaml", {
    id: "0002-a",
    title: "Legacy Single",
    goal: "Exercise a legacy prefixed id with a one-character slug.",
    status: "proposed",
    order: 250,
    plannedChanges: [],
  });
  writeRoadmapMilestoneArtifact(roadmapOrderingDir, "legacy-missing-order.yaml", {
    id: "0001-legacy",
    title: "Legacy Missing Order",
    goal: "Remain valid without an order value.",
    status: "proposed",
    plannedChanges: [],
  });
  writeRoadmapIndexArtifact(roadmapOrderingDir, [
    {
      id: "alpha",
      title: "Alpha",
      path: "roadmap/milestones/alpha.yaml",
      status: "proposed",
    },
    {
      id: "beta",
      title: "Beta",
      path: "roadmap/milestones/beta.yaml",
      status: "proposed",
    },
    {
      id: "gamma",
      title: "Gamma",
      path: "roadmap/milestones/gamma.yaml",
      status: "proposed",
    },
    {
      id: "0002-a",
      title: "Legacy Single",
      path: "roadmap/milestones/legacy-single.yaml",
      status: "proposed",
    },
    {
      id: "0001-legacy",
      title: "Legacy Missing Order",
      path: "roadmap/milestones/legacy-missing-order.yaml",
      status: "proposed",
    },
  ]);

  const orderStatus = cli(["roadmap-status"], { cwd: roadmapOrderingDir });
  context.assert(orderStatus.status === 0, "roadmap-status accepts slug-only milestone ids and optional order");
  const orderStatusJson = JSON.parse(orderStatus.stdout.trim()) as { milestones: Array<{ id: string; order?: number; displayOrdinal: number }> };
  context.assert(
    orderStatusJson.milestones.map((milestone) => milestone.id).join(",") === "beta,gamma,0002-a,alpha,0001-legacy"
      && orderStatusJson.milestones.map((milestone) => milestone.displayOrdinal).join(",") === "1,2,3,4,5",
    "roadmap-status reports milestones in order-field order with derived display ordinals",
    orderStatus.stdout,
  );

  const orderSync = cli(["roadmap-sync"], { cwd: roadmapOrderingDir });
  context.assert(orderSync.status === 0, "roadmap-sync succeeds for ordered slug milestones", orderSync.stdout || orderSync.stderr);
  const orderedIndex = yamlModule.parseYamlFile<{ milestones: Record<string, { path: string }> }>(
    path.join(roadmapOrderingDir, ".strict-spec-driven", "roadmap", "INDEX.yaml"),
  );
  context.assert(
    Object.keys(orderedIndex.milestones).join(",") === "beta,gamma,0002-a,alpha,0001-legacy",
    "roadmap-sync regenerates the index in order-field order rather than id-prefix or filename order",
  );

  const alphaPath = path.join(roadmapOrderingDir, ".strict-spec-driven", "roadmap", "milestones", "alpha.yaml");
  const betaPath = path.join(roadmapOrderingDir, ".strict-spec-driven", "roadmap", "milestones", "beta.yaml");
  const gammaPath = path.join(roadmapOrderingDir, ".strict-spec-driven", "roadmap", "milestones", "gamma.yaml");
  const legacyBeforeCollision = readFileSync(
    path.join(roadmapOrderingDir, ".strict-spec-driven", "roadmap", "milestones", "legacy-missing-order.yaml"),
    "utf8",
  );
  const collidingAlpha = yamlModule.parseYamlFile<Record<string, unknown>>(alphaPath);
  collidingAlpha.order = 100;
  writeFileSync(alphaPath, yamlModule.stringifyYamlDocument(collidingAlpha), "utf8");
  const collisionSync = cli(["roadmap-sync"], { cwd: roadmapOrderingDir });
  context.assert(collisionSync.status === 0, "roadmap-sync resolves exact order collisions", collisionSync.stdout || collisionSync.stderr);
  const alphaAfterCollision = yamlModule.parseYamlFile<{ order?: number }>(alphaPath);
  const betaAfterCollision = yamlModule.parseYamlFile<{ order?: number }>(betaPath);
  const gammaAfterCollision = yamlModule.parseYamlFile<{ order?: number }>(gammaPath);
  context.assert(
    alphaAfterCollision.order === 100
      && betaAfterCollision.order === 101
      && gammaAfterCollision.order === 200
      && readFileSync(path.join(roadmapOrderingDir, ".strict-spec-driven", "roadmap", "milestones", "legacy-missing-order.yaml"), "utf8") === legacyBeforeCollision,
    "roadmap-sync nudges only the slug-selected colliding milestone, leaves distinct orders and missing-order milestones untouched",
    collisionSync.stdout,
  );

  const reorderGamma = cli(["roadmap-reorder", "gamma", "--before", "alpha"], { cwd: roadmapOrderingDir });
  context.assert(reorderGamma.status === 0, "roadmap-reorder moves one milestone before a neighbor", reorderGamma.stdout || reorderGamma.stderr);
  const reorderGammaJson = JSON.parse(reorderGamma.stdout.trim()) as { updatedFiles: string[]; target: { id: string; order: number } };
  const gammaAfterReorder = yamlModule.parseYamlFile<{ order?: number }>(gammaPath);
  context.assert(
    reorderGammaJson.target.id === "gamma"
      && reorderGammaJson.target.order === 0
      && gammaAfterReorder.order === 0
      && reorderGammaJson.updatedFiles.includes(".strict-spec-driven/roadmap/milestones/gamma.yaml")
      && !reorderGammaJson.updatedFiles.includes(".strict-spec-driven/roadmap/milestones/alpha.yaml")
      && !reorderGammaJson.updatedFiles.includes(".strict-spec-driven/roadmap/milestones/beta.yaml"),
    "roadmap-reorder rewrites the target milestone order without rewriting other milestone files",
    reorderGamma.stdout,
  );

  const explicitOrder = cli(["roadmap-reorder", "alpha", "--order", "400"], { cwd: roadmapOrderingDir });
  context.assert(explicitOrder.status === 0, "roadmap-reorder accepts an explicit integer order", explicitOrder.stdout || explicitOrder.stderr);
  const alphaAfterExplicit = yamlModule.parseYamlFile<{ order?: number }>(alphaPath);
  context.assert(alphaAfterExplicit.order === 400, "roadmap-reorder writes explicit order values");

  const selfReference = cli(["roadmap-reorder", "alpha", "--after", "alpha"], { cwd: roadmapOrderingDir });
  context.assert(
    selfReference.status !== 0 && selfReference.stdout.includes("target cannot be its own neighbor"),
    "roadmap-reorder rejects self-referential neighbor requests",
    selfReference.stdout,
  );
  const unknownReorder = cli(["roadmap-reorder", "missing", "--after", "alpha"], { cwd: roadmapOrderingDir });
  context.assert(
    unknownReorder.status !== 0 && unknownReorder.stdout.includes("target milestone was not found in the active roadmap"),
    "roadmap-reorder rejects unknown active milestones",
    unknownReorder.stdout,
  );

  mkdirSync(path.join(roadmapOrderingDir, ".strict-spec-driven", "roadmap", "archive", "milestones"), { recursive: true });
  writeFileSync(
    path.join(roadmapOrderingDir, ".strict-spec-driven", "roadmap", "archive", "milestones", "archived.yaml"),
    yamlModule.stringifyYamlDocument({
      schema: "strict-spec-driven/roadmap-milestone/v2",
      schema_version: 2,
      artifact_type: "roadmap_milestone",
      schema_file: "../schemas/roadmap-milestone.yaml",
      milestone: { archived: { title: "Archived" } },
      order: 50,
      goal: "Stay archived.",
      scope: { in: ["Archived work."], out: [] },
      done_criteria: ["Archived."],
      intake_questions: [{ ...TEST_MILESTONE_INTAKE_QUESTION }],
      planned_changes: {},
      dependencies: [],
      risks: [],
      status: "complete",
      notes: [],
    }),
    "utf8",
  );
  const archivedReorder = cli(["roadmap-reorder", "archived", "--after", "alpha"], { cwd: roadmapOrderingDir });
  context.assert(
    archivedReorder.status !== 0 && archivedReorder.stdout.includes("target milestone is archived"),
    "roadmap-reorder rejects archived targets",
    archivedReorder.stdout,
  );

  const renumber = cli(["roadmap-renumber"], { cwd: roadmapOrderingDir });
  context.assert(renumber.status === 0, "roadmap-renumber respreads active order values", renumber.stdout || renumber.stderr);
  const statusAfterRenumber = JSON.parse(cli(["roadmap-status"], { cwd: roadmapOrderingDir }).stdout.trim()) as {
    milestones: Array<{ id: string; order?: number }>;
  };
  context.assert(
    statusAfterRenumber.milestones
      .filter((milestone) => milestone.id !== "0001-legacy")
      .map((milestone) => `${milestone.id}:${milestone.order}`)
      .join(",") === "gamma:100,beta:200,0002-a:300,alpha:400",
    "roadmap-renumber preserves relative order while respreading active milestone orders to gap spacing",
  );
} finally {
  rmSync(roadmapOrderingDir, { recursive: true, force: true });
}

const roadmapGenerateDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-generate-"));
try {
  const createMilestone = cli([
    "roadmap-generate",
    "milestone",
    "--id",
    "authoring",
    "--title",
    "Authoring Milestone",
    "--goal",
    "Create milestone artifacts through the roadmap authoring command.",
    "--scope-in",
    "Milestone YAML shape is command-authored.",
    "--scope-out",
    "Standalone planned-change generation.",
    "--done",
    "The milestone artifact validates after command generation.",
    "--intake-question",
    "objective|What observable outcome should this milestone deliver?|Milestone creation needs explicit planning questions.|Missing questions affect proposal scope for child changes.|Use one observable milestone outcome as the first answer.",
    "--intake-question",
    "scope-boundary|What is in and out of scope?|Milestone scope fields must be turned into explicit clarification questions.|Unclear scope affects planned-change ownership.|Keep scope-in and scope-out aligned with this answer.",
    "--dependency",
    "Existing roadmap schema.",
    "--risk",
    "Accidental field replacement.",
    "--note",
    "Created by roadmap-generate milestone.",
  ], { cwd: roadmapGenerateDir });
  context.assert(createMilestone.status === 0, "roadmap-generate milestone creates a valid milestone", createMilestone.stderr);
  const createMilestoneJson = JSON.parse(createMilestone.stdout.trim());
  context.assert(
    createMilestoneJson.valid === true
      && createMilestoneJson.updatedFiles.includes(".strict-spec-driven/roadmap/milestones/authoring.yaml")
      && createMilestoneJson.updatedFiles.includes(".strict-spec-driven/roadmap/INDEX.yaml"),
    "roadmap-generate milestone reports created milestone and synced index files",
    createMilestone.stdout,
  );

  const generatedMilestonePath = path.join(
    roadmapGenerateDir,
    ".strict-spec-driven",
    "roadmap",
    "milestones",
    "authoring.yaml",
  );
  const generatedMilestone = yamlModule.parseYamlFile<{
    milestone: Record<string, { title: string }>;
    order?: number;
    goal: string;
    scope: { in: string[]; out: string[] };
    done_criteria: string[];
    intake_questions: Array<{ id: string; question: string; context: string; impact: string; recommendation: string }>;
    planned_changes: Record<string, unknown>;
    dependencies: string[];
    risks: string[];
    status: string;
    notes: string[];
    details?: string;
    source_ticket?: string;
  }>(generatedMilestonePath);
  context.assert(
    generatedMilestone.milestone["authoring"]?.title === "Authoring Milestone"
      && generatedMilestone.order === 100
      && generatedMilestone.status === "proposed"
      && generatedMilestone.intake_questions.length === 2
      && generatedMilestone.intake_questions[0]?.id === "objective"
      && Object.keys(generatedMilestone.planned_changes).length === 0,
    "roadmap-generate milestone writes slug-only keyed identity, initial order, intake questions, proposed status, and empty planned_changes",
  );
  context.assert(
    generatedMilestone.scope.in.includes("Milestone YAML shape is command-authored.")
      && generatedMilestone.scope.out.includes("Standalone planned-change generation.")
      && generatedMilestone.done_criteria.includes("The milestone artifact validates after command generation."),
    "roadmap-generate milestone writes structured planning fields from named arguments",
  );

  const generatedIndex = yamlModule.parseYamlFile<{
    milestones: Record<string, { title: string; path: string; status: string }>;
  }>(path.join(roadmapGenerateDir, ".strict-spec-driven", "roadmap", "INDEX.yaml"));
  context.assert(
    generatedIndex.milestones["authoring"]?.path === "roadmap/milestones/authoring.yaml"
      && generatedIndex.milestones["authoring"]?.status === "proposed",
    "roadmap-generate milestone synchronizes the roadmap index",
  );

  writeStandalonePlannedChangeArtifact(roadmapGenerateDir, "planned-changes/authoring-existing-work.yaml", {
    id: "existing-work",
    milestone: "authoring",
    status: "planned",
    summary: "Existing standalone planned change stays on its current authoring path.",
    details: "Existing standalone planned-change details must not be rewritten by milestone authoring.",
    depends_on: [],
  });
  const standalonePath = path.join(
    roadmapGenerateDir,
    ".strict-spec-driven",
    "roadmap",
    "planned-changes",
    "authoring-existing-work.yaml",
  );
  const standaloneBeforeUpdate = readFileSync(standalonePath, "utf8");
  const milestoneWithSourceTicket = yamlModule.parseYamlFile<Record<string, unknown>>(generatedMilestonePath);
  milestoneWithSourceTicket.source_ticket = "captured-ticket";
  writeFileSync(generatedMilestonePath, yamlModule.stringifyYamlDocument(milestoneWithSourceTicket), "utf8");

  const appendMilestone = cli([
    "roadmap-generate",
    "milestone",
    "--id",
    "authoring",
    "--scope-in",
    "Additional milestone scope.",
    "--details",
    "Long-form milestone guidance added by the authoring command.",
    "--intake-question",
    "verification-evidence|How will the milestone be verified?|Updates can append missing milestone questions.|Missing verification affects testing tasks.|Name the command or evidence that proves completion.",
  ], { cwd: roadmapGenerateDir });
  context.assert(appendMilestone.status === 0, "roadmap-generate milestone appends list fields and fills absent scalar fields", appendMilestone.stderr);
  const appendedMilestone = yamlModule.parseYamlFile<{
    scope: { in: string[] };
    intake_questions: Array<{ id: string }>;
    details?: string;
    source_ticket?: string;
  }>(generatedMilestonePath);
  context.assert(
    appendedMilestone.scope.in.includes("Milestone YAML shape is command-authored.")
      && appendedMilestone.scope.in.includes("Additional milestone scope.")
      && appendedMilestone.intake_questions.map((question) => question.id).join(",") === "objective,scope-boundary,verification-evidence"
      && appendedMilestone.details === "Long-form milestone guidance added by the authoring command."
      && appendedMilestone.source_ticket === "captured-ticket",
    "roadmap-generate milestone preserves existing milestone metadata and appends intake questions while applying safe updates",
  );
  context.assert(
    readFileSync(standalonePath, "utf8") === standaloneBeforeUpdate,
    "roadmap-generate milestone does not rewrite standalone planned-change files",
  );

  const beforeConflict = readFileSync(generatedMilestonePath, "utf8");
  const conflictingMilestone = cli([
    "roadmap-generate",
    "milestone",
    "--id",
    "authoring",
    "--goal",
    "Replace the goal without reset.",
  ], { cwd: roadmapGenerateDir });
  context.assert(conflictingMilestone.status !== 0, "roadmap-generate milestone rejects conflicting scalar updates without --reset");
  context.assert(
    conflictingMilestone.stdout.includes("conflicting content")
      && readFileSync(generatedMilestonePath, "utf8") === beforeConflict,
    "roadmap-generate milestone reports the conflict and leaves the milestone unchanged before write",
    conflictingMilestone.stdout,
  );

  const resetMilestone = cli([
    "roadmap-generate",
    "milestone",
    "--id",
    "authoring",
    "--reset",
    "--goal",
    "Replace the goal with explicit reset.",
    "--scope-in",
    "Reset milestone scope.",
    "--done",
    "Reset done criterion.",
    "--intake-question",
    "risks|What milestone risks could change the plan?|Reset can intentionally replace milestone questions.|Missing risk review affects dependencies and tests.|Record concrete compatibility, data, security, or release risks.",
    "--note",
    "Reset note.",
  ], { cwd: roadmapGenerateDir });
  context.assert(resetMilestone.status === 0, "roadmap-generate milestone replaces supplied fields with --reset", resetMilestone.stderr);
  const resetArtifact = yamlModule.parseYamlFile<{
    goal: string;
    scope: { in: string[] };
    done_criteria: string[];
    intake_questions: Array<{ id: string }>;
    notes: string[];
    source_ticket?: string;
  }>(generatedMilestonePath);
  context.assert(
    resetArtifact.goal === "Replace the goal with explicit reset."
      && resetArtifact.scope.in.join("\n") === "Reset milestone scope."
      && resetArtifact.done_criteria.join("\n") === "Reset done criterion."
      && resetArtifact.intake_questions.map((question) => question.id).join(",") === "objective,scope-boundary,verification-evidence,risks"
      && resetArtifact.notes.join("\n") === "Reset note."
      && resetArtifact.source_ticket === "captured-ticket",
    "roadmap-generate milestone reset replaces supplied list fields but merges intake questions additively while preserving source_ticket",
  );
  context.assert(
    readFileSync(standalonePath, "utf8") === standaloneBeforeUpdate,
    "roadmap-generate milestone reset still does not rewrite standalone planned-change files",
  );

  const beforeIntakeConflict = readFileSync(generatedMilestonePath, "utf8");
  const resetIntakeConflict = cli([
    "roadmap-generate",
    "milestone",
    "--id",
    "authoring",
    "--reset",
    "--intake-question",
    "objective|What different outcome should this milestone deliver?|Global reset must not resolve intake conflicts by replacement.|Silent replacement loses recorded planning questions.|Surface the conflict for explicit resolution.",
  ], { cwd: roadmapGenerateDir });
  context.assert(
    resetIntakeConflict.status !== 0
      && resetIntakeConflict.stdout.includes("conflicting content")
      && readFileSync(generatedMilestonePath, "utf8") === beforeIntakeConflict,
    "roadmap-generate milestone with global --reset reports same-id intake conflicts instead of replacing existing intake questions",
    resetIntakeConflict.stdout,
  );

  const replaceIntakeQuestions = cli([
    "roadmap-generate",
    "milestone",
    "--id",
    "authoring",
    "--reset-intake-questions",
    "--intake-question",
    "final-outcome|What single outcome closes this milestone?|Explicit replacement consolidates milestone intake questions.|The consolidated question defines proposal scope for child changes.|Answer with the milestone's one observable completion outcome.",
  ], { cwd: roadmapGenerateDir });
  context.assert(replaceIntakeQuestions.status === 0, "roadmap-generate milestone replaces intake questions with --reset-intake-questions", replaceIntakeQuestions.stderr);
  const replacedIntakeArtifact = yamlModule.parseYamlFile<{
    goal: string;
    intake_questions: Array<{ id: string }>;
    source_ticket?: string;
  }>(generatedMilestonePath);
  context.assert(
    replacedIntakeArtifact.intake_questions.map((question) => question.id).join(",") === "final-outcome"
      && replacedIntakeArtifact.goal === "Replace the goal with explicit reset."
      && replacedIntakeArtifact.source_ticket === "captured-ticket",
    "roadmap-generate milestone --reset-intake-questions replaces the intake list with exactly the supplied entries while leaving other fields untouched",
  );

  const beforeRejectedIntakeReset = readFileSync(generatedMilestonePath, "utf8");
  const resetIntakeWithoutEntries = cli([
    "roadmap-generate",
    "milestone",
    "--id",
    "authoring",
    "--reset-intake-questions",
  ], { cwd: roadmapGenerateDir });
  context.assert(
    resetIntakeWithoutEntries.status !== 0
      && resetIntakeWithoutEntries.stderr.includes("--reset-intake-questions requires at least one --intake-question value")
      && readFileSync(generatedMilestonePath, "utf8") === beforeRejectedIntakeReset,
    "roadmap-generate milestone rejects --reset-intake-questions without --intake-question and leaves the milestone unchanged",
    resetIntakeWithoutEntries.stderr,
  );

  const missingIntakeQuestionMilestone = cli([
    "roadmap-generate",
    "milestone",
    "--id",
    "0002-missing-intake",
    "--title",
    "Missing Intake",
    "--goal",
    "Reject milestone creation without explicit intake questions.",
  ], { cwd: roadmapGenerateDir });
  context.assert(
    missingIntakeQuestionMilestone.status !== 0
      && missingIntakeQuestionMilestone.stdout.includes("new roadmap milestones require at least one --intake-question"),
    "roadmap-generate milestone rejects new milestones without intake questions",
    missingIntakeQuestionMilestone.stdout,
  );

  const unknownSelector = cli(["roadmap-generate", "not-a-selector", "--id", "x"], { cwd: roadmapGenerateDir });
  context.assert(unknownSelector.status !== 0, "roadmap-generate rejects unknown generation selectors");
  context.assert(
    unknownSelector.stderr.includes("Usage: strict-spec-cli roadmap-generate milestone")
      && unknownSelector.stderr.includes("strict-spec-cli roadmap-generate planned-change"),
    "roadmap-generate unknown selector prints milestone and planned-change usage",
  );

  const plannedChangeMissingMilestoneArg = cli(["roadmap-generate", "planned-change", "--id", "no-milestone"], { cwd: roadmapGenerateDir });
  context.assert(
    plannedChangeMissingMilestoneArg.status !== 0
      && plannedChangeMissingMilestoneArg.stderr.includes("missing required argument --milestone"),
    "roadmap-generate planned-change requires --milestone",
    plannedChangeMissingMilestoneArg.stderr,
  );
} finally {
  rmSync(roadmapGenerateDir, { recursive: true, force: true });
}

const plannedChangeAuthoringDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-planned-change-authoring-"));
try {
  writeRoadmapMilestoneArtifact(plannedChangeAuthoringDir, "0001-naming.yaml", {
    id: "0001-naming",
    title: "Canonical Naming",
    goal: "Exercise planned-change authoring and canonical filename enforcement.",
    status: "proposed",
    plannedChanges: [],
  });
  writeRoadmapMilestoneArtifact(plannedChangeAuthoringDir, "0002-other.yaml", {
    id: "0002-other",
    title: "Other Milestone",
    goal: "Reject planned-change moves between milestones.",
    status: "proposed",
    plannedChanges: [],
  });
  writeRoadmapIndexArtifact(plannedChangeAuthoringDir, [
    {
      id: "0001-naming",
      title: "Canonical Naming",
      path: "roadmap/milestones/0001-naming.yaml",
      status: "proposed",
    },
    {
      id: "0002-other",
      title: "Other Milestone",
      path: "roadmap/milestones/0002-other.yaml",
      status: "proposed",
    },
  ]);
  const plannedChangesDir = path.join(plannedChangeAuthoringDir, ".strict-spec-driven", "roadmap", "planned-changes");

  const createPlannedChange = cli([
    "roadmap-generate",
    "planned-change",
    "--milestone",
    "0001-naming",
    "--id",
    "add-widget",
    "--summary",
    "Add the widget workflow.",
    "--details",
    "Concrete planning detail for the widget work.",
  ], { cwd: plannedChangeAuthoringDir });
  context.assert(createPlannedChange.status === 0, "roadmap-generate planned-change creates a new planned change", createPlannedChange.stdout || createPlannedChange.stderr);
  const createPlannedChangeJson = JSON.parse(createPlannedChange.stdout.trim());
  context.assert(
    createPlannedChangeJson.valid === true
      && createPlannedChangeJson.plannedChange.id === "add-widget"
      && createPlannedChangeJson.plannedChange.milestone === "0001-naming"
      && createPlannedChangeJson.plannedChange.path === "roadmap/planned-changes/0001-naming-add-widget.yaml",
    "roadmap-generate planned-change reports the canonical milestone-prefixed planned-change path",
    createPlannedChange.stdout,
  );
  context.assert(
    existsSync(path.join(plannedChangesDir, "0001-naming-add-widget.yaml")),
    "roadmap-generate planned-change writes the artifact at its canonical CLI-computed filename",
  );
  const createdArtifact = yamlModule.parseYamlFile<{
    status: string;
    summary: string;
    details: string;
    depends_on: string[];
    planned_change: { id: string; milestone: string };
  }>(path.join(plannedChangesDir, "0001-naming-add-widget.yaml"));
  context.assert(
    createdArtifact.planned_change.id === "add-widget"
      && createdArtifact.planned_change.milestone === "0001-naming"
      && createdArtifact.status === "planned"
      && createdArtifact.summary === "Add the widget workflow."
      && createdArtifact.depends_on.length === 0,
    "roadmap-generate planned-change writes a valid planned-change artifact with default planned status",
  );

  const collapsePlannedChange = cli([
    "roadmap-generate",
    "planned-change",
    "--milestone",
    "0001-naming",
    "--id",
    "0001-naming-followup",
    "--summary",
    "Follow-up work.",
    "--details",
    "Details for follow-up work.",
    "--depends-on",
    "add-widget",
  ], { cwd: plannedChangeAuthoringDir });
  context.assert(collapsePlannedChange.status === 0, "roadmap-generate planned-change accepts ids that already start with the milestone id", collapsePlannedChange.stdout || collapsePlannedChange.stderr);
  const collapsePlannedChangeJson = JSON.parse(collapsePlannedChange.stdout.trim());
  context.assert(
    collapsePlannedChangeJson.plannedChange.path === "roadmap/planned-changes/0001-naming-followup.yaml"
      && existsSync(path.join(plannedChangesDir, "0001-naming-followup.yaml")),
    "roadmap-generate planned-change collapses the duplicate milestone prefix instead of repeating it",
    collapsePlannedChange.stdout,
  );

  const conflictingUpdate = cli([
    "roadmap-generate",
    "planned-change",
    "--milestone",
    "0001-naming",
    "--id",
    "add-widget",
    "--summary",
    "A different summary without reset.",
  ], { cwd: plannedChangeAuthoringDir });
  context.assert(
    conflictingUpdate.status !== 0
      && conflictingUpdate.stdout.includes("existing milestone field has conflicting content; rerun with --reset to replace it"),
    "roadmap-generate planned-change rejects conflicting scalar updates without --reset",
    conflictingUpdate.stdout,
  );

  const resetUpdate = cli([
    "roadmap-generate",
    "planned-change",
    "--milestone",
    "0001-naming",
    "--id",
    "add-widget",
    "--summary",
    "Replaced summary after reset.",
    "--reset",
  ], { cwd: plannedChangeAuthoringDir });
  context.assert(resetUpdate.status === 0, "roadmap-generate planned-change replaces scalar fields with --reset", resetUpdate.stdout || resetUpdate.stderr);
  const updatedArtifact = yamlModule.parseYamlFile<{ summary: string; details: string }>(
    path.join(plannedChangesDir, "0001-naming-add-widget.yaml"),
  );
  context.assert(
    updatedArtifact.summary === "Replaced summary after reset."
      && updatedArtifact.details === "Concrete planning detail for the widget work.",
    "roadmap-generate planned-change reset updates supplied fields and preserves the rest",
  );

  const unknownMilestone = cli([
    "roadmap-generate",
    "planned-change",
    "--milestone",
    "0009-missing",
    "--id",
    "orphan-work",
    "--summary",
    "Orphan.",
    "--details",
    "Orphan details.",
  ], { cwd: plannedChangeAuthoringDir });
  context.assert(
    unknownMilestone.status !== 0
      && unknownMilestone.stdout.includes("planned change references a missing milestone")
      && !existsSync(path.join(plannedChangesDir, "0009-missing-orphan-work.yaml")),
    "roadmap-generate planned-change rejects an unknown milestone without writing a file",
    unknownMilestone.stdout,
  );

  const milestoneMove = cli([
    "roadmap-generate",
    "planned-change",
    "--milestone",
    "0002-other",
    "--id",
    "add-widget",
    "--summary",
    "Moved.",
  ], { cwd: plannedChangeAuthoringDir });
  context.assert(
    milestoneMove.status !== 0
      && milestoneMove.stdout.includes("planned change already belongs to a different milestone"),
    "roadmap-generate planned-change rejects moving a planned change to a different milestone",
    milestoneMove.stdout,
  );

  // Misnamed active planned-change files are a blocking diagnostic that
  // --fix-names repairs; default sync only reports.
  renameSync(
    path.join(plannedChangesDir, "0001-naming-add-widget.yaml"),
    path.join(plannedChangesDir, "add-widget.yaml"),
  );
  const misnamedStatus = cli(["roadmap-status"], { cwd: plannedChangeAuthoringDir });
  context.assert(misnamedStatus.status !== 0, "roadmap-status exits non-zero for a misnamed active planned-change file");
  const misnamedStatusJson = JSON.parse(misnamedStatus.stdout.trim());
  const misnamedDiagnostic = misnamedStatusJson.diagnostics.find((diagnostic: { message: string }) =>
    diagnostic.message.includes("does not match the canonical milestone-prefixed filename")
  );
  context.assert(
    misnamedStatusJson.valid === false
      && misnamedDiagnostic
      && misnamedDiagnostic.expected === "0001-naming-add-widget.yaml"
      && misnamedDiagnostic.actual === "add-widget.yaml"
      && misnamedDiagnostic.artifactPath === ".strict-spec-driven/roadmap/planned-changes/add-widget.yaml",
    "roadmap-status reports a blocking diagnostic naming the expected canonical planned-change filename",
    misnamedStatus.stdout,
  );

  const defaultSync = cli(["roadmap-sync"], { cwd: plannedChangeAuthoringDir });
  context.assert(
    defaultSync.status !== 0
      && existsSync(path.join(plannedChangesDir, "add-widget.yaml"))
      && !existsSync(path.join(plannedChangesDir, "0001-naming-add-widget.yaml")),
    "roadmap-sync without --fix-names surfaces the misnaming diagnostic and does not rename the file",
    defaultSync.stdout,
  );

  const fixNamesSync = cli(["roadmap-sync", "--fix-names"], { cwd: plannedChangeAuthoringDir });
  context.assert(fixNamesSync.status === 0, "roadmap-sync --fix-names exits zero after repairing misnamed planned-change files", fixNamesSync.stdout || fixNamesSync.stderr);
  const fixNamesSyncJson = JSON.parse(fixNamesSync.stdout.trim());
  context.assert(
    fixNamesSyncJson.valid === true
      && Array.isArray(fixNamesSyncJson.renamedFiles)
      && fixNamesSyncJson.renamedFiles.length === 1
      && fixNamesSyncJson.renamedFiles[0].from === ".strict-spec-driven/roadmap/planned-changes/add-widget.yaml"
      && fixNamesSyncJson.renamedFiles[0].to === ".strict-spec-driven/roadmap/planned-changes/0001-naming-add-widget.yaml",
    "roadmap-sync --fix-names reports the deterministic rename from the misnamed file to its canonical name",
    fixNamesSync.stdout,
  );
  context.assert(
    existsSync(path.join(plannedChangesDir, "0001-naming-add-widget.yaml"))
      && !existsSync(path.join(plannedChangesDir, "add-widget.yaml")),
    "roadmap-sync --fix-names renames the misnamed planned-change file on disk",
  );

  const statusAfterFix = cli(["roadmap-status"], { cwd: plannedChangeAuthoringDir });
  context.assert(
    statusAfterFix.status === 0 && JSON.parse(statusAfterFix.stdout.trim()).valid === true,
    "roadmap-status is valid again after roadmap-sync --fix-names",
    statusAfterFix.stdout,
  );

  const noRenameSync = cli(["roadmap-sync", "--fix-names"], { cwd: plannedChangeAuthoringDir });
  const noRenameSyncJson = JSON.parse(noRenameSync.stdout.trim());
  context.assert(
    noRenameSync.status === 0
      && Array.isArray(noRenameSyncJson.renamedFiles)
      && noRenameSyncJson.renamedFiles.length === 0,
    "roadmap-sync --fix-names reports no renames when every planned-change filename is already canonical",
    noRenameSync.stdout,
  );
} finally {
  rmSync(plannedChangeAuthoringDir, { recursive: true, force: true });
}

const roadmapGenerateInlineDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-generate-inline-"));
try {
  writeRoadmapMilestoneArtifact(roadmapGenerateInlineDir, "0001-inline.yaml", {
    id: "0001-inline",
    title: "Inline Legacy",
    goal: "Keep legacy inline planned-change data on the existing materialization path.",
    status: "proposed",
    plannedChanges: [
      {
        id: "inline-work",
        status: "planned",
        summary: "Legacy inline planned change.",
        depends_on: [],
      },
    ],
  });
  writeRoadmapIndexArtifact(roadmapGenerateInlineDir, [
    {
      id: "0001-inline",
      title: "Inline Legacy",
      path: "roadmap/milestones/0001-inline.yaml",
      status: "proposed",
    },
  ]);
  const inlineMilestonePath = path.join(
    roadmapGenerateInlineDir,
    ".strict-spec-driven",
    "roadmap",
    "milestones",
    "0001-inline.yaml",
  );
  const inlineBefore = readFileSync(inlineMilestonePath, "utf8");
  const inlineUpdate = cli([
    "roadmap-generate",
    "milestone",
    "--id",
    "0001-inline",
    "--scope-in",
    "Do not partially update inline legacy roadmap data.",
  ], { cwd: roadmapGenerateInlineDir });
  context.assert(inlineUpdate.status !== 0, "roadmap-generate milestone rejects legacy inline planned changes");
  const inlineUpdateJson = JSON.parse(inlineUpdate.stdout.trim());
  context.assert(
    inlineUpdateJson.valid === false
      && inlineUpdateJson.updatedFiles.length === 0
      && inlineUpdateJson.diagnostics.some(
        (diagnostic: { fieldPath: string; message: string }) =>
          diagnostic.fieldPath === "$.planned_changes"
          && diagnostic.message.includes("roadmap-sync --materialize-planned-changes"),
      )
      && readFileSync(inlineMilestonePath, "utf8") === inlineBefore,
    "roadmap-generate milestone leaves inline legacy milestone bytes unchanged and reports the materialization path",
    inlineUpdate.stdout,
  );
} finally {
  rmSync(roadmapGenerateInlineDir, { recursive: true, force: true });
}

const roadmapGenerateStandaloneDriftDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-generate-standalone-drift-"));
try {
  writeRoadmapMilestoneArtifact(roadmapGenerateStandaloneDriftDir, "0001-drift.yaml", {
    id: "0001-drift",
    title: "Standalone Drift",
    goal: "Keep standalone planned-change reconciliation outside milestone authoring.",
    status: "proposed",
    plannedChanges: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapGenerateStandaloneDriftDir, "planned-changes/0001-drift-drifted-work.yaml", {
    id: "drifted-work",
    milestone: "0001-drift",
    status: "complete",
    summary: "A standalone planned change whose status needs roadmap-sync reconciliation.",
    details: "The milestone command must not fix this planned-change artifact as a side effect.",
    depends_on: [],
  });
  writeRoadmapIndexArtifact(roadmapGenerateStandaloneDriftDir, [
    {
      id: "0001-drift",
      title: "Standalone Drift",
      path: "roadmap/milestones/0001-drift.yaml",
      status: "proposed",
    },
  ]);
  const driftMilestonePath = path.join(
    roadmapGenerateStandaloneDriftDir,
    ".strict-spec-driven",
    "roadmap",
    "milestones",
    "0001-drift.yaml",
  );
  const driftPlannedChangePath = path.join(
    roadmapGenerateStandaloneDriftDir,
    ".strict-spec-driven",
    "roadmap",
    "planned-changes",
    "0001-drift-drifted-work.yaml",
  );
  const driftMilestoneBefore = readFileSync(driftMilestonePath, "utf8");
  const driftPlannedChangeBefore = readFileSync(driftPlannedChangePath, "utf8");
  const driftUpdate = cli([
    "roadmap-generate",
    "milestone",
    "--id",
    "0001-drift",
    "--scope-in",
    "Do not rewrite standalone planned-change drift.",
  ], { cwd: roadmapGenerateStandaloneDriftDir });
  context.assert(driftUpdate.status !== 0, "roadmap-generate milestone rejects updates that would rewrite standalone planned-change artifacts");
  const driftUpdateJson = JSON.parse(driftUpdate.stdout.trim());
  context.assert(
    driftUpdateJson.valid === false
      && driftUpdateJson.updatedFiles.length === 0
      && driftUpdateJson.diagnostics.some(
        (diagnostic: { message: string; artifactPath: string }) =>
          diagnostic.message.includes("would rewrite a standalone planned-change artifact")
          && diagnostic.artifactPath.endsWith("0001-drift-drifted-work.yaml"),
      )
      && readFileSync(driftMilestonePath, "utf8") === driftMilestoneBefore
      && readFileSync(driftPlannedChangePath, "utf8") === driftPlannedChangeBefore,
    "roadmap-generate milestone reports standalone planned-change drift and leaves both files unchanged",
    driftUpdate.stdout,
  );
} finally {
  rmSync(roadmapGenerateStandaloneDriftDir, { recursive: true, force: true });
}

const roadmapArchiveDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-archive-"));
try {
  for (const changeName of ["complete-one", "complete-two", "skipped-complete"]) {
    mkdirSync(
      path.join(roadmapArchiveDir, ".strict-spec-driven", "changes", "archive", `${formatLocalDateStamp()}-${changeName}`),
      { recursive: true },
    );
  }
  mkdirSync(path.join(roadmapArchiveDir, ".strict-spec-driven", "changes", "active-change"), { recursive: true });

  writeRoadmapMilestoneArtifact(roadmapArchiveDir, "0001-complete.yaml", {
    id: "0001-complete",
    title: "Complete Milestone",
    goal: "Archive completed roadmap work.",
    status: "complete",
    plannedChanges: [],
  });
  writeRoadmapMilestoneArtifact(roadmapArchiveDir, "0002-active.yaml", {
    id: "0002-active",
    title: "Active Milestone",
    goal: "Keep active roadmap work visible.",
    status: "active",
    plannedChanges: [],
  });
  writeRoadmapMilestoneArtifact(roadmapArchiveDir, "0003-pending.yaml", {
    id: "0003-pending",
    title: "Pending Milestone",
    goal: "Keep pending roadmap work visible.",
    status: "planned",
    plannedChanges: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapArchiveDir, "planned-changes/0001-complete-complete-one.yaml", {
    id: "complete-one",
    milestone: "0001-complete",
    status: "planned",
    summary: "Completed work one.",
    details: "Completed standalone planned change one.",
    depends_on: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapArchiveDir, "planned-changes/0001-complete-complete-two.yaml", {
    id: "complete-two",
    milestone: "0001-complete",
    status: "planned",
    summary: "Completed work two.",
    details: "Completed standalone planned change two.",
    depends_on: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapArchiveDir, "planned-changes/0002-active-active-change.yaml", {
    id: "active-change",
    milestone: "0002-active",
    status: "planned",
    summary: "Active work.",
    details: "Active standalone planned change.",
    depends_on: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapArchiveDir, "planned-changes/0002-active-skipped-complete.yaml", {
    id: "skipped-complete",
    milestone: "0002-active",
    status: "complete",
    summary: "Completed work in an active milestone.",
    details: "This must stay active because its milestone is not complete.",
    depends_on: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapArchiveDir, "planned-changes/0003-pending-pending-change.yaml", {
    id: "pending-change",
    milestone: "0003-pending",
    status: "planned",
    summary: "Pending work.",
    details: "Pending standalone planned change.",
    depends_on: [],
  });
  writeRoadmapIndexArtifact(roadmapArchiveDir, [
    {
      id: "0001-complete",
      title: "Complete Milestone",
      path: "roadmap/milestones/0001-complete.yaml",
      status: "complete",
    },
    {
      id: "0002-active",
      title: "Active Milestone",
      path: "roadmap/milestones/0002-active.yaml",
      status: "active",
    },
    {
      id: "0003-pending",
      title: "Pending Milestone",
      path: "roadmap/milestones/0003-pending.yaml",
      status: "planned",
    },
  ]);

  const archiveDefault = cli(["roadmap-archive"], { cwd: roadmapArchiveDir });
  context.assert(archiveDefault.status === 0, "roadmap-archive defaults to all unarchived milestones", archiveDefault.stderr);
  const archiveDefaultJson = JSON.parse(archiveDefault.stdout.trim());
  context.assert(
    archiveDefaultJson.valid === true
      && archiveDefaultJson.archivedMilestones.length === 1
      && archiveDefaultJson.archivedMilestones[0].id === "0001-complete"
      && archiveDefaultJson.archivedMilestones[0].plannedChanges.length === 2,
    "roadmap-archive archives only the complete milestone by default",
    archiveDefault.stdout,
  );
  context.assert(
    archiveDefaultJson.skippedMilestones.map((milestone: { id: string }) => milestone.id).join(",") === "0002-active,0003-pending",
    "roadmap-archive reports incomplete milestones as skipped in deterministic order",
    archiveDefault.stdout,
  );

  const archivedMilestonePath = path.join(roadmapArchiveDir, ".strict-spec-driven", "roadmap", "archive", "milestones", "0001-complete.yaml");
  const archivedPlannedChangePath = path.join(roadmapArchiveDir, ".strict-spec-driven", "roadmap", "archive", "planned-changes", "0001-complete-complete-one.yaml");
  const archivedSecondPlannedChangePath = path.join(roadmapArchiveDir, ".strict-spec-driven", "roadmap", "archive", "planned-changes", "0001-complete-complete-two.yaml");
  context.assert(
    existsSync(archivedMilestonePath)
      && existsSync(archivedPlannedChangePath)
      && existsSync(archivedSecondPlannedChangePath)
      && !existsSync(path.join(roadmapArchiveDir, ".strict-spec-driven", "roadmap", "milestones", "0001-complete.yaml"))
      && !existsSync(path.join(roadmapArchiveDir, ".strict-spec-driven", "roadmap", "planned-changes", "0001-complete-complete-one.yaml")),
    "roadmap-archive moves completed milestone and its completed planned changes into roadmap archive",
  );
  context.assert(
    existsSync(path.join(roadmapArchiveDir, ".strict-spec-driven", "roadmap", "planned-changes", "0002-active-active-change.yaml"))
      && existsSync(path.join(roadmapArchiveDir, ".strict-spec-driven", "roadmap", "planned-changes", "0002-active-skipped-complete.yaml"))
      && existsSync(path.join(roadmapArchiveDir, ".strict-spec-driven", "roadmap", "planned-changes", "0003-pending-pending-change.yaml")),
    "roadmap-archive leaves active and pending planned changes in active roadmap locations",
  );
  const archivedPlannedChange = yamlModule.parseYamlFile<{ status: string }>(archivedPlannedChangePath);
  context.assert(archivedPlannedChange.status === "complete", "roadmap-archive writes archived planned changes with complete status");

  const indexAfterArchive = yamlModule.parseYamlFile<{
    milestones: Record<string, { path: string; status: string }>;
  }>(path.join(roadmapArchiveDir, ".strict-spec-driven", "roadmap", "INDEX.yaml"));
  context.assert(
    !("0001-complete" in indexAfterArchive.milestones)
      && indexAfterArchive.milestones["0002-active"]?.path === "roadmap/milestones/0002-active.yaml"
      && indexAfterArchive.milestones["0003-pending"]?.path === "roadmap/milestones/0003-pending.yaml",
    "roadmap-archive rewrites the active roadmap index without archived milestones",
  );
  const statusAfterArchive = JSON.parse(cli(["roadmap-status"], { cwd: roadmapArchiveDir }).stdout.trim());
  context.assert(
    statusAfterArchive.valid === true
      && statusAfterArchive.milestones.length === 2
      && statusAfterArchive.milestones.every((milestone: { id: string }) => milestone.id !== "0001-complete"),
    "roadmap-status ignores roadmap archive files after milestone archive",
  );

  const syncAfterArchive = cli(["roadmap-sync"], { cwd: roadmapArchiveDir });
  context.assert(syncAfterArchive.status === 0, "roadmap-sync exits zero after roadmap-archive", syncAfterArchive.stderr);
  const syncAfterArchiveJson = JSON.parse(syncAfterArchive.stdout.trim());
  context.assert(
    syncAfterArchiveJson.valid === true
      && syncAfterArchiveJson.milestones.length === 2
      && syncAfterArchiveJson.milestones.every((milestone: { id: string }) => milestone.id !== "0001-complete"),
    "roadmap-sync keeps archived milestones out of active sync status after roadmap-archive",
    syncAfterArchive.stdout,
  );

  const indexAfterSync = yamlModule.parseYamlFile<{
    milestones: Record<string, { path: string; status: string }>;
  }>(path.join(roadmapArchiveDir, ".strict-spec-driven", "roadmap", "INDEX.yaml"));
  context.assert(
    !("0001-complete" in indexAfterSync.milestones)
      && indexAfterSync.milestones["0002-active"]?.path === "roadmap/milestones/0002-active.yaml"
      && indexAfterSync.milestones["0003-pending"]?.path === "roadmap/milestones/0003-pending.yaml",
    "roadmap-sync preserves the active roadmap index boundary after roadmap-archive",
  );
  const statusAfterSyncArchive = JSON.parse(cli(["roadmap-status"], { cwd: roadmapArchiveDir }).stdout.trim());
  context.assert(
    statusAfterSyncArchive.valid === true
      && statusAfterSyncArchive.milestones.length === 2
      && statusAfterSyncArchive.milestones.every((milestone: { id: string }) => milestone.id !== "0001-complete")
      && existsSync(archivedMilestonePath)
      && existsSync(archivedPlannedChangePath)
      && existsSync(archivedSecondPlannedChangePath),
    "roadmap-status and archived files preserve the archive boundary after roadmap-sync",
  );
} finally {
  rmSync(roadmapArchiveDir, { recursive: true, force: true });
}

const roadmapArchiveExplicitDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-archive-explicit-"));
try {
  for (const changeName of ["first-complete", "second-complete"]) {
    mkdirSync(
      path.join(roadmapArchiveExplicitDir, ".strict-spec-driven", "changes", "archive", `${formatLocalDateStamp()}-${changeName}`),
      { recursive: true },
    );
  }
  writeRoadmapMilestoneArtifact(roadmapArchiveExplicitDir, "0001-first.yaml", {
    id: "0001-first",
    title: "First Complete",
    goal: "Remain active until explicitly archived.",
    status: "complete",
    plannedChanges: [],
  });
  writeRoadmapMilestoneArtifact(roadmapArchiveExplicitDir, "0002-second.yaml", {
    id: "0002-second",
    title: "Second Complete",
    goal: "Archive explicitly.",
    status: "complete",
    plannedChanges: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapArchiveExplicitDir, "planned-changes/0001-first-first-complete.yaml", {
    id: "first-complete",
    milestone: "0001-first",
    status: "complete",
    summary: "First complete work.",
    details: "First complete details.",
    depends_on: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapArchiveExplicitDir, "planned-changes/0002-second-second-complete.yaml", {
    id: "second-complete",
    milestone: "0002-second",
    status: "complete",
    summary: "Second complete work.",
    details: "Second complete details.",
    depends_on: [],
  });
  writeRoadmapIndexArtifact(roadmapArchiveExplicitDir, [
    {
      id: "0001-first",
      title: "First Complete",
      path: "roadmap/milestones/0001-first.yaml",
      status: "complete",
    },
    {
      id: "0002-second",
      title: "Second Complete",
      path: "roadmap/milestones/0002-second.yaml",
      status: "complete",
    },
  ]);

  const archiveExplicit = cli(["roadmap-archive", "0002-second"], { cwd: roadmapArchiveExplicitDir });
  context.assert(archiveExplicit.status === 0, "roadmap-archive accepts an explicit complete milestone id", archiveExplicit.stderr);
  const archiveExplicitJson = JSON.parse(archiveExplicit.stdout.trim());
  context.assert(
    archiveExplicitJson.archivedMilestones.length === 1
      && archiveExplicitJson.archivedMilestones[0].id === "0002-second"
      && existsSync(path.join(roadmapArchiveExplicitDir, ".strict-spec-driven", "roadmap", "milestones", "0001-first.yaml"))
      && !existsSync(path.join(roadmapArchiveExplicitDir, ".strict-spec-driven", "roadmap", "milestones", "0002-second.yaml")),
    "roadmap-archive archives only the explicitly selected complete milestone",
    archiveExplicit.stdout,
  );
} finally {
  rmSync(roadmapArchiveExplicitDir, { recursive: true, force: true });
}

const roadmapArchiveInvalidDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-archive-invalid-"));
try {
  mkdirSync(
    path.join(roadmapArchiveInvalidDir, ".strict-spec-driven", "changes", "archive", `${formatLocalDateStamp()}-duplicate-work`),
    { recursive: true },
  );
  writeRoadmapMilestoneArtifact(roadmapArchiveInvalidDir, "0001-invalid.yaml", {
    id: "0001-invalid",
    title: "Invalid Roadmap",
    goal: "Reject malformed archive input.",
    status: "complete",
    plannedChanges: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapArchiveInvalidDir, "planned-changes/0001-invalid-duplicate-work.yaml", {
    id: "duplicate-work",
    milestone: "0001-invalid",
    status: "complete",
    summary: "Duplicate A.",
    details: "Duplicate planned change A.",
    depends_on: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapArchiveInvalidDir, "planned-changes/0002-duplicate-b.yaml", {
    id: "duplicate-work",
    milestone: "0001-invalid",
    status: "complete",
    summary: "Duplicate B.",
    details: "Duplicate planned change B.",
    depends_on: [],
  });
  writeRoadmapIndexArtifact(roadmapArchiveInvalidDir, [
    {
      id: "0001-invalid",
      title: "Invalid Roadmap",
      path: "roadmap/milestones/0001-invalid.yaml",
      status: "complete",
    },
  ]);

  const archiveInvalid = cli(["roadmap-archive"], { cwd: roadmapArchiveInvalidDir });
  context.assert(archiveInvalid.status !== 0, "roadmap-archive rejects invalid roadmap artifacts");
  const archiveInvalidJson = JSON.parse(archiveInvalid.stdout.trim());
  context.assert(
    archiveInvalidJson.valid === false
      && archiveInvalidJson.diagnostics.some((diagnostic: { message: string }) => diagnostic.message.includes("duplicate planned change id"))
      && existsSync(path.join(roadmapArchiveInvalidDir, ".strict-spec-driven", "roadmap", "milestones", "0001-invalid.yaml"))
      && existsSync(path.join(roadmapArchiveInvalidDir, ".strict-spec-driven", "roadmap", "planned-changes", "0001-invalid-duplicate-work.yaml")),
    "roadmap-archive reports diagnostics and does not move files for invalid roadmap input",
    archiveInvalid.stdout,
  );
} finally {
  rmSync(roadmapArchiveInvalidDir, { recursive: true, force: true });
}

const roadmapReopenDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-reopen-"));
try {
  // A milestone whose single planned change is archived → milestone derives complete.
  mkdirSync(
    path.join(roadmapReopenDir, ".strict-spec-driven", "changes", "archive", `${formatLocalDateStamp()}-archived-change`),
    { recursive: true },
  );

  writeRoadmapMilestoneArtifact(roadmapReopenDir, "0001-reopen.yaml", {
    id: "0001-reopen",
    title: "Reopen Workflow",
    goal: "Reopen a completed milestone when gaps are discovered.",
    status: "complete",
    plannedChanges: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapReopenDir, "planned-changes/0001-reopen-archived-change.yaml", {
    id: "archived-change",
    milestone: "0001-reopen",
    status: "complete",
    summary: "Work that already shipped.",
    details: "Standalone details for archived-change.",
    depends_on: [],
  });

  writeRoadmapIndexArtifact(roadmapReopenDir, [
    {
      id: "0001-reopen",
      title: "Reopen Workflow",
      path: "roadmap/milestones/0001-reopen.yaml",
      status: "complete",
    },
  ]);

  const archivedPlannedChangePath = path.join(
    roadmapReopenDir,
    ".strict-spec-driven",
    "roadmap",
    "planned-changes",
    "0001-reopen-archived-change.yaml",
  );
  const archivedPlannedChangeBefore = readFileSync(archivedPlannedChangePath, "utf8");

  const reopenStatusBefore = cli(["roadmap-status"], { cwd: roadmapReopenDir });
  context.assert(reopenStatusBefore.status === 0, "roadmap-status exits zero for a completed milestone before reopen");
  const reopenStatusBeforeJson = JSON.parse(reopenStatusBefore.stdout.trim());
  context.assert(
    reopenStatusBeforeJson.milestones[0].declaredStatus === "complete"
      && reopenStatusBeforeJson.milestones[0].derivedStatus === "complete",
    "roadmap-status reports a complete milestone before reopen",
  );
  context.assert(
    reopenStatusBeforeJson.milestones[0].plannedChanges[0].state === "archived"
      && reopenStatusBeforeJson.milestones[0].plannedChanges[0].derivedStatus === "complete",
    "roadmap-status reports the single planned change as archived/complete before reopen",
  );

  const roadmapReopen = cli(
    ["roadmap-reopen", "0001-reopen", "--reason", "missing edge-case coverage discovered in production"],
    { cwd: roadmapReopenDir },
  );
  context.assert(roadmapReopen.status === 0, "roadmap-reopen exits zero for a completed milestone", `got ${roadmapReopen.status}: ${roadmapReopen.stdout}`);
  const roadmapReopenJson = JSON.parse(roadmapReopen.stdout.trim());
  context.assert(roadmapReopenJson.valid === true, "roadmap-reopen reports valid=true");
  context.assert(
    roadmapReopenJson.reopened.id === "0001-reopen"
      && roadmapReopenJson.reopened.previousStatus === "complete"
      && roadmapReopenJson.reopened.newStatus === "proposed",
    "roadmap-reopen moves the milestone from complete to its derived proposed status",
  );
  context.assert(
    roadmapReopenJson.reopened.frozenPlannedChanges.length === 1
      && roadmapReopenJson.reopened.frozenPlannedChanges[0].id === "archived-change"
      && roadmapReopenJson.reopened.frozenPlannedChanges[0].state === "archived",
    "roadmap-reopen reports the archived planned change as frozen",
  );
  context.assert(
    roadmapReopenJson.reopened.seededFollowUp
      && roadmapReopenJson.reopened.seededFollowUp.id === "0001-reopen-followup"
      && roadmapReopenJson.reopened.seededFollowUp.path === "roadmap/planned-changes/0001-reopen-followup.yaml",
    "roadmap-reopen reports the seeded pending follow-up planned change at its canonical milestone-prefixed path",
    `seededFollowUp: ${JSON.stringify(roadmapReopenJson.reopened.seededFollowUp)}`,
  );
  context.assert(
    roadmapReopenJson.updatedFiles.some((file: string) => file.endsWith("roadmap/milestones/0001-reopen.yaml"))
      && roadmapReopenJson.updatedFiles.some((file: string) => file === `.strict-spec-driven/${roadmapReopenJson.reopened.seededFollowUp.path}`),
    "roadmap-reopen records the milestone file and the seeded follow-up as updated",
    `updatedFiles: ${JSON.stringify(roadmapReopenJson.updatedFiles)}`,
  );

  // The seeded follow-up exists as a pending standalone planned change.
  const seededFollowUpArtifact = yamlModule.parseYamlFile<{
    status: string;
    planned_change: { id: string; milestone: string };
    depends_on: string[];
  }>(path.join(roadmapReopenDir, ".strict-spec-driven", roadmapReopenJson.reopened.seededFollowUp.path));
  context.assert(
    seededFollowUpArtifact.status === "planned"
      && seededFollowUpArtifact.planned_change.id === "0001-reopen-followup"
      && seededFollowUpArtifact.planned_change.milestone === "0001-reopen"
      && seededFollowUpArtifact.depends_on.includes("archived-change"),
    "roadmap-reopen seeds a pending follow-up planned change linked to the milestone and the latest archived change",
  );

  // The archived planned-change file must be byte-identical after reopen.
  const archivedPlannedChangeAfter = readFileSync(archivedPlannedChangePath, "utf8");
  context.assert(
    archivedPlannedChangeAfter === archivedPlannedChangeBefore,
    "roadmap-reopen leaves archived planned-change files byte-identical (immutable)",
  );

  // The milestone file now declares its derived proposed status and carries the
  // reopen note. It is proposed (not active) because the seeded follow-up is
  // pending, not yet an in-progress strict change.
  const reopenedMilestoneArtifact = yamlModule.parseYamlFile<{ status: string; notes: string[] }>(
    path.join(roadmapReopenDir, ".strict-spec-driven", "roadmap", "milestones", "0001-reopen.yaml"),
  );
  context.assert(reopenedMilestoneArtifact.status === "proposed", "roadmap-reopen writes the derived proposed status to the milestone file");
  context.assert(
    reopenedMilestoneArtifact.notes.some((note: string) => note.startsWith("Reopened on ") && note.includes("missing edge-case coverage discovered in production")),
    "roadmap-reopen appends a dated reopen note carrying the reason",
  );

  const reopenStatusAfter = cli(["roadmap-status"], { cwd: roadmapReopenDir });
  context.assert(reopenStatusAfter.status === 0, "roadmap-status stays zero after reopen");
  const reopenStatusAfterJson = JSON.parse(reopenStatusAfter.stdout.trim());
  context.assert(
    reopenStatusAfterJson.milestones[0].declaredStatus === "proposed"
      && reopenStatusAfterJson.milestones[0].derivedStatus === "proposed",
    "roadmap-status reports the reopened milestone as proposed with no declared/derived mismatch",
  );
  context.assert(
    reopenStatusAfterJson.milestones[0].plannedChanges.some(
      (pc: { id: string; state: string; derivedStatus: string }) => pc.id === "archived-change" && pc.state === "archived" && pc.derivedStatus === "complete",
    )
      && reopenStatusAfterJson.milestones[0].plannedChanges.some(
        (pc: { id: string; derivedStatus: string }) => pc.id === "0001-reopen-followup" && pc.derivedStatus === "planned",
      ),
    "roadmap-status keeps the archived planned change complete and shows the seeded pending follow-up after reopen",
  );

  // An intermediate roadmap-sync must NOT revert the reopen. The milestone stays
  // proposed because it has pending non-archived planned work (the seeded
  // follow-up), not because any declared status is held sticky.
  const intermediateSync = cli(["roadmap-sync"], { cwd: roadmapReopenDir });
  context.assert(intermediateSync.status === 0, "roadmap-sync exits zero after reopen");
  const intermediateMilestone = yamlModule.parseYamlFile<{ status: string }>(
    path.join(roadmapReopenDir, ".strict-spec-driven", "roadmap", "milestones", "0001-reopen.yaml"),
  );
  context.assert(
    intermediateMilestone.status === "proposed",
    "roadmap-sync keeps the reopened milestone proposed instead of reverting to complete",
  );

  // Adding another follow-up planned change after reopen keeps the milestone in
  // its pending-work derived state.
  writeStandalonePlannedChangeArtifact(roadmapReopenDir, "planned-changes/0001-reopen-followup-change.yaml", {
    id: "followup-change",
    milestone: "0001-reopen",
    status: "planned",
    summary: "New follow-up work for the discovered gap.",
    details: "Standalone details for followup-change.",
    depends_on: ["archived-change"],
  });
  const followupSync = cli(["roadmap-sync"], { cwd: roadmapReopenDir });
  context.assert(followupSync.status === 0, "roadmap-sync accepts a new follow-up planned change after reopen");
  const followupStatus = JSON.parse(cli(["roadmap-status"], { cwd: roadmapReopenDir }).stdout.trim());
  context.assert(
    followupStatus.milestones[0].declaredStatus === "proposed"
      && followupStatus.milestones[0].plannedChanges.some((pc: { id: string }) => pc.id === "followup-change")
      && followupStatus.milestones[0].plannedChanges.some((pc: { id: string; derivedStatus: string }) => pc.id === "archived-change" && pc.derivedStatus === "complete"),
    "roadmap-status shows the new follow-up change alongside the still-complete archived change after reopen",
  );

  // nonexistent milestone id is rejected.
  const reopenMissing = cli(["roadmap-reopen", "does-not-exist"], { cwd: roadmapReopenDir });
  context.assert(reopenMissing.status !== 0, "roadmap-reopen exits non-zero for an unknown milestone id");
  const reopenMissingJson = JSON.parse(reopenMissing.stdout.trim());
  context.assert(
    reopenMissingJson.valid === false
      && reopenMissingJson.diagnostics.some((d: { message: string }) => d.message.includes("was not found in the roadmap")),
    "roadmap-reopen reports a not-found diagnostic for an unknown milestone id",
  );

  // missing milestone-id argument prints usage.
  const reopenNoArg = cli(["roadmap-reopen"], { cwd: roadmapReopenDir });
  context.assert(reopenNoArg.status !== 0, "roadmap-reopen exits non-zero when no milestone id is supplied");
} finally {
  rmSync(roadmapReopenDir, { recursive: true, force: true });
}

const roadmapPlannedAliasDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-planned-alias-"));
try {
  // `planned` is an accepted alias of `proposed` for an incomplete milestone.
  writeRoadmapMilestoneArtifact(roadmapPlannedAliasDir, "0001-planned-alias.yaml", {
    id: "0001-planned-alias",
    title: "Planned Alias",
    goal: "Verify the planned status alias is accepted.",
    status: "planned",
    plannedChanges: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapPlannedAliasDir, "planned-changes/0001-planned-alias-pending-change.yaml", {
    id: "pending-change",
    milestone: "0001-planned-alias",
    status: "planned",
    summary: "Pending work with no strict change yet.",
    details: "Standalone details for pending-change.",
    depends_on: [],
  });
  writeRoadmapIndexArtifact(roadmapPlannedAliasDir, [
    {
      id: "0001-planned-alias",
      title: "Planned Alias",
      path: "roadmap/milestones/0001-planned-alias.yaml",
      status: "planned",
    },
  ]);

  const plannedAliasStatus = cli(["roadmap-status"], { cwd: roadmapPlannedAliasDir });
  context.assert(plannedAliasStatus.status === 0, "roadmap-status accepts a milestone with the planned status alias");
  const plannedAliasStatusJson = JSON.parse(plannedAliasStatus.stdout.trim());
  context.assert(
    plannedAliasStatusJson.valid === true
      && plannedAliasStatusJson.milestones[0].declaredStatus === "planned"
      && plannedAliasStatusJson.milestones[0].derivedStatus === "proposed"
      && plannedAliasStatusJson.milestones[0].mismatches.length === 0,
    "roadmap-status treats planned as equivalent to proposed without a mismatch",
  );

  // roadmap-sync preserves the declared `planned` spelling (alias is stable).
  const plannedAliasSync = cli(["roadmap-sync"], { cwd: roadmapPlannedAliasDir });
  context.assert(plannedAliasSync.status === 0, "roadmap-sync exits zero for a planned-status milestone");
  const plannedAliasMilestoneAfter = yamlModule.parseYamlFile<{ status: string }>(
    path.join(roadmapPlannedAliasDir, ".strict-spec-driven", "roadmap", "milestones", "0001-planned-alias.yaml"),
  );
  context.assert(
    plannedAliasMilestoneAfter.status === "planned",
    "roadmap-sync preserves the declared planned status spelling instead of rewriting to proposed",
  );
} finally {
  rmSync(roadmapPlannedAliasDir, { recursive: true, force: true });
}

const roadmapNoCandidateDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-no-candidate-"));
try {
  mkdirSync(path.join(roadmapNoCandidateDir, ".strict-spec-driven", "changes", "active-change"), { recursive: true });

  writeRoadmapMilestoneArtifact(roadmapNoCandidateDir, "0001-no-candidate.yaml", {
    id: "0001-no-candidate",
    title: "No Candidate",
    goal: "Report when roadmap work is blocked by dependencies.",
    status: "active",
    plannedChanges: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapNoCandidateDir, "planned-changes/0001-no-candidate-active-change.yaml", {
    id: "active-change",
    milestone: "0001-no-candidate",
    status: "planned",
    summary: "Active work blocks the remaining roadmap entry.",
    details: "Standalone details for active-change.",
    depends_on: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapNoCandidateDir, "planned-changes/0001-no-candidate-blocked-change.yaml", {
    id: "blocked-change",
    milestone: "0001-no-candidate",
    status: "planned",
    summary: "Blocked work still depends on an active change.",
    details: "Standalone details for blocked-change.",
    depends_on: ["active-change"],
  });

  writeRoadmapIndexArtifact(roadmapNoCandidateDir, [
    {
      id: "0001-no-candidate",
      title: "No Candidate",
      path: "roadmap/milestones/0001-no-candidate.yaml",
      status: "active",
    },
  ]);

  const roadmapNoCandidate = cli(["roadmap-recommend"], { cwd: roadmapNoCandidateDir });
  context.assert(roadmapNoCandidate.status !== 0, "roadmap-recommend exits non-zero when no eligible candidate exists");
  const roadmapNoCandidateJson = JSON.parse(roadmapNoCandidate.stdout.trim());
  context.assert(
    roadmapNoCandidateJson.valid === true && roadmapNoCandidateJson.status === "no-candidate" && roadmapNoCandidateJson.recommendation === null,
    "roadmap-recommend reports a valid roadmap with no selected recommendation when all candidates are ineligible",
  );
  context.assert(
    roadmapNoCandidateJson.candidates === undefined
      && roadmapNoCandidateJson.candidateSummary?.total === 2
      && roadmapNoCandidateJson.candidateSummary?.eligible === 0
      && roadmapNoCandidateJson.blockers.some(
        (candidate: { id: string; skipReasonCodes: string[]; skipReasons?: unknown[] }) =>
          candidate.id === "blocked-change"
          && candidate.skipReasons === undefined
          && candidate.skipReasonCodes.includes("dependency-incomplete"),
      ),
    "roadmap-recommend keeps actionable blocker reason codes in concise no-candidate output",
  );
  const roadmapNoCandidateDetails = cli(["roadmap-recommend", "--details"], { cwd: roadmapNoCandidateDir });
  context.assert(roadmapNoCandidateDetails.status !== 0, "roadmap-recommend --details exits non-zero when no eligible candidate exists");
  const roadmapNoCandidateDetailsJson = JSON.parse(roadmapNoCandidateDetails.stdout.trim());
  context.assert(
    roadmapNoCandidateDetailsJson.candidates.some(
      (candidate: { id: string; skipReasons: Array<{ code: string }> }) =>
        candidate.id === "blocked-change" && candidate.skipReasons.some((reason) => reason.code === "dependency-incomplete"),
    ),
    "roadmap-recommend --details keeps inspected candidate skip reasons when no eligible recommendation exists",
  );
} finally {
  rmSync(roadmapNoCandidateDir, { recursive: true, force: true });
}

const roadmapSplitFilesDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-split-files-"));
try {
  mkdirSync(path.join(roadmapSplitFilesDir, ".strict-spec-driven", "changes", "inline-active"), { recursive: true });
  mkdirSync(path.join(roadmapSplitFilesDir, ".strict-spec-driven", "changes", "split-active"), { recursive: true });
  mkdirSync(
    path.join(roadmapSplitFilesDir, ".strict-spec-driven", "changes", "archive", `${formatLocalDateStamp()}-split-archived`),
    { recursive: true },
  );

  writeRoadmapMilestoneArtifact(roadmapSplitFilesDir, "0001-split.yaml", {
    id: "0001-split",
    title: "Split Roadmap",
    goal: "Load inline and standalone planned changes together.",
    status: "proposed",
    plannedChanges: [
      {
        id: "inline-active",
        status: "planned",
        summary: "Inline planned change remains compatible.",
        depends_on: [],
      },
    ],
  });

  writeStandalonePlannedChangeArtifact(roadmapSplitFilesDir, "planned-changes/0001-split-split-active.yaml", {
    id: "split-active",
    milestone: "0001-split",
    status: "planned",
    summary: "Standalone active change.",
    details: "Standalone details for split-active.",
    depends_on: [],
    team: {
      owner: "alice",
      reviewers: ["bob", "carol"],
      blocked: {
        status: false,
      },
      labels: ["roadmap", "team"],
      external_refs: [
        {
          label: "Tracking issue",
          target: "https://example.com/issues/123",
        },
      ],
    },
  });
  writeStandalonePlannedChangeArtifact(roadmapSplitFilesDir, "planned-changes/0001-split-split-archived.yaml", {
    id: "split-archived",
    milestone: "0001-split",
    status: "planned",
    summary: "Standalone archived change.",
    details: "Standalone details for split-archived.",
    depends_on: ["split-active"],
  });

  writeRoadmapIndexArtifact(roadmapSplitFilesDir, [
    {
      id: "0001-split",
      title: "Split Roadmap",
      path: "roadmap/milestones/0001-split.yaml",
      status: "proposed",
    },
  ]);

  const splitStatus = cli(["roadmap-status"], { cwd: roadmapSplitFilesDir });
  context.assert(splitStatus.status !== 0, "roadmap-status rejects legacy inline milestone planned changes by default");
  const splitStatusJson = JSON.parse(splitStatus.stdout.trim());
  context.assert(
    splitStatusJson.valid === false
      && splitStatusJson.diagnostics.some(
        (diagnostic: { fieldPath: string; message: string }) =>
          diagnostic.fieldPath === "$.planned_changes"
          && diagnostic.message.includes("roadmap-sync --materialize-planned-changes"),
      ),
    "roadmap-status reports an explicit materialization command for legacy inline roadmap data",
  );

  const splitSync = cli(["roadmap-sync"], { cwd: roadmapSplitFilesDir });
  context.assert(splitSync.status !== 0, "roadmap-sync rejects legacy inline milestone planned changes without explicit materialization");
  const splitSyncJson = JSON.parse(splitSync.stdout.trim());
  context.assert(
    splitSyncJson.valid === false
      && splitSyncJson.updatedFiles.length === 0
      && splitSyncJson.diagnostics.some(
        (diagnostic: { fieldPath: string; message: string }) =>
          diagnostic.fieldPath === "$.planned_changes"
          && diagnostic.message.includes("roadmap-sync --materialize-planned-changes"),
      ),
    "roadmap-sync blocks rewrites and surfaces the materialization command when inline planned changes remain",
  );

  const syncedStandaloneArchived = yamlModule.parseYamlFile<{
    status: string;
    planned_change: { id: string; milestone: string };
  }>(path.join(roadmapSplitFilesDir, ".strict-spec-driven", "roadmap", "planned-changes", "0001-split-split-archived.yaml"));
  context.assert(
    syncedStandaloneArchived.status === "planned"
      && syncedStandaloneArchived.planned_change.id === "split-archived"
      && syncedStandaloneArchived.planned_change.milestone === "0001-split",
    "roadmap-sync leaves standalone planned-change files unchanged when inline legacy data blocks reconciliation",
  );

  const syncedStandaloneActive = yamlModule.parseYamlFile<{
    team: {
      owner: string;
      reviewers: string[];
      blocked: { status: boolean };
      labels: string[];
      external_refs: Array<{ label: string; target: string }>;
    };
  }>(path.join(roadmapSplitFilesDir, ".strict-spec-driven", "roadmap", "planned-changes", "0001-split-split-active.yaml"));
  context.assert(
    syncedStandaloneActive.team.owner === "alice"
      && syncedStandaloneActive.team.reviewers.join(",") === "bob,carol"
      && syncedStandaloneActive.team.blocked.status === false
      && syncedStandaloneActive.team.labels.join(",") === "roadmap,team"
      && syncedStandaloneActive.team.external_refs[0]?.label === "Tracking issue"
      && syncedStandaloneActive.team.external_refs[0]?.target === "https://example.com/issues/123",
    "roadmap-sync preserves standalone planned-change owner, reviewers, blocked state, labels, and external references while blocked by inline legacy data",
  );

  const splitMaterialize = cli(["roadmap-sync", "--materialize-planned-changes"], { cwd: roadmapSplitFilesDir });
  context.assert(splitMaterialize.status === 0, "roadmap-sync materializes inline planned changes when the explicit flag is provided");
  const splitMaterializeJson = JSON.parse(splitMaterialize.stdout.trim());
  context.assert(splitMaterializeJson.valid === true, "roadmap-sync materialization reports valid=true");
  context.assert(
    splitMaterializeJson.updatedFiles.includes(".strict-spec-driven/roadmap/planned-changes/0001-split-inline-active.yaml")
      && splitMaterializeJson.updatedFiles.includes(".strict-spec-driven/roadmap/milestones/0001-split.yaml"),
    "roadmap-sync materialization reports the created planned-change file and rewritten milestone file",
    `updatedFiles: ${JSON.stringify(splitMaterializeJson.updatedFiles)}`,
  );

  const materializedMilestone = yamlModule.parseYamlFile<{
    status: string;
    planned_changes: Record<string, { status: string }>;
  }>(path.join(roadmapSplitFilesDir, ".strict-spec-driven", "roadmap", "milestones", "0001-split.yaml"));
  context.assert(
    materializedMilestone.status === "active" && Object.keys(materializedMilestone.planned_changes).length === 0,
    "roadmap-sync materialization removes converted inline planned changes from the milestone file and reconciles milestone status",
  );

  const materializedInline = yamlModule.parseYamlFile<{
    status: string;
    summary: string;
    details: string;
    depends_on: string[];
    planned_change: { id: string; milestone: string };
  }>(path.join(roadmapSplitFilesDir, ".strict-spec-driven", "roadmap", "planned-changes", "0001-split-inline-active.yaml"));
  context.assert(
    materializedInline.planned_change.id === "inline-active"
      && materializedInline.planned_change.milestone === "0001-split"
      && materializedInline.status === "planned"
      && materializedInline.summary === "Inline planned change remains compatible."
      && materializedInline.details === "Test details for inline-active"
      && materializedInline.depends_on.length === 0,
    "roadmap-sync materialization preserves inline planned-change identity, owner, status, summary, details, and dependencies",
  );

  const splitStatusAfterMaterialize = cli(["roadmap-status"], { cwd: roadmapSplitFilesDir });
  context.assert(splitStatusAfterMaterialize.status === 0, "roadmap-status accepts the roadmap after explicit materialization");
  const splitStatusAfterMaterializeJson = JSON.parse(splitStatusAfterMaterialize.stdout.trim());
  const splitPlannedChangeIds = splitStatusAfterMaterializeJson.milestones[0].plannedChanges.map((entry: { id: string }) => entry.id);
  context.assert(
    splitPlannedChangeIds.join(",") === "inline-active,split-active,split-archived",
    "roadmap-status reports materialized and standalone planned changes together after conversion",
    `got ${splitPlannedChangeIds.join(",")}`,
  );
  context.assert(
    splitStatusAfterMaterializeJson.milestones[0].plannedChanges[0].state === "active"
      && splitStatusAfterMaterializeJson.milestones[0].plannedChanges[1].state === "active"
      && splitStatusAfterMaterializeJson.milestones[0].plannedChanges[2].state === "archived",
    "roadmap-status derives planned-change state after explicit materialization",
  );
  context.assert(
    splitStatusAfterMaterializeJson.milestones[0].plannedChanges[0].source === "standalone"
      && splitStatusAfterMaterializeJson.milestones[0].plannedChanges[0].path === "roadmap/planned-changes/0001-split-inline-active.yaml"
      && splitStatusAfterMaterializeJson.milestones[0].plannedChanges[1].path === "roadmap/planned-changes/0001-split-split-active.yaml",
    "roadmap-status reports planned-change file paths after explicit materialization",
  );
} finally {
  rmSync(roadmapSplitFilesDir, { recursive: true, force: true });
}

const roadmapInvalidTeamMetadataDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-invalid-team-metadata-"));
try {
  writeRoadmapMilestoneArtifact(roadmapInvalidTeamMetadataDir, "0001-team.yaml", {
    id: "0001-team",
    title: "Team Metadata",
    goal: "Reject malformed team metadata.",
    status: "proposed",
    plannedChanges: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapInvalidTeamMetadataDir, "planned-changes/0001-team-invalid-team.yaml", {
    id: "invalid-team",
    milestone: "0001-team",
    status: "planned",
    summary: "Standalone entry with malformed team metadata.",
    details: "Invalid team metadata details.",
    depends_on: [],
    team: {
      owner: "",
      reviewers: ["bob", ""],
      blocked: {
        status: "yes",
      },
      labels: [""],
      external_refs: [
        {
          label: "Tracker",
        },
      ],
    },
  });

  writeRoadmapIndexArtifact(roadmapInvalidTeamMetadataDir, [
    {
      id: "0001-team",
      title: "Team Metadata",
      path: "roadmap/milestones/0001-team.yaml",
      status: "proposed",
    },
  ]);

  const invalidTeamStatus = cli(["roadmap-status"], { cwd: roadmapInvalidTeamMetadataDir });
  context.assert(invalidTeamStatus.status !== 0, "roadmap-status exits non-zero for malformed planned-change team metadata");
  const invalidTeamJson = JSON.parse(invalidTeamStatus.stdout.trim());
  const invalidTeamDiagnostics = invalidTeamJson.diagnostics.map(
    (diagnostic: { fieldPath: string; message: string }) => `${diagnostic.fieldPath}: ${diagnostic.message}`,
  );
  context.assert(
    invalidTeamDiagnostics.some((message: string) => message.includes("$.team.owner"))
      && invalidTeamDiagnostics.some((message: string) => message.includes("$.team.reviewers[1]"))
      && invalidTeamDiagnostics.some((message: string) => message.includes("$.team.blocked.status"))
      && invalidTeamDiagnostics.some((message: string) => message.includes("$.team.labels[0]"))
      && invalidTeamDiagnostics.some((message: string) => message.includes("$.team.external_refs[0].target")),
    "roadmap-status reports deterministic field paths for malformed planned-change team metadata",
    `diagnostics: ${JSON.stringify(invalidTeamDiagnostics)}`,
  );

  const invalidTeamStatusRepeat = cli(["roadmap-status"], { cwd: roadmapInvalidTeamMetadataDir });
  context.assert(
    invalidTeamStatusRepeat.status === invalidTeamStatus.status
      && invalidTeamStatusRepeat.stdout.trim() === invalidTeamStatus.stdout.trim(),
    "roadmap-status preserves malformed team metadata diagnostic ordering across repeated runs",
  );
} finally {
  rmSync(roadmapInvalidTeamMetadataDir, { recursive: true, force: true });
}

const roadmapCrossFileConflictDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-cross-file-conflict-"));
try {
  mkdirSync(path.join(roadmapCrossFileConflictDir, ".strict-spec-driven", "changes", "shared-active"), { recursive: true });

  writeRoadmapMilestoneArtifact(roadmapCrossFileConflictDir, "0001-conflict.yaml", {
    id: "0001-conflict",
    title: "Cross File Conflict",
    goal: "Reject invalid split-file roadmap coordination state.",
    status: "proposed",
    plannedChanges: [],
  });

  writeStandalonePlannedChangeArtifact(roadmapCrossFileConflictDir, "planned-changes/0001-conflict-duplicate-work.yaml", {
    id: "duplicate-work",
    milestone: "0001-conflict",
    status: "planned",
    summary: "Standalone entry with a duplicate standalone identity.",
    details: "Duplicate identity details.",
    depends_on: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapCrossFileConflictDir, "planned-changes/0001b-duplicate-work.yaml", {
    id: "duplicate-work",
    milestone: "0001-conflict",
    status: "planned",
    summary: "Second standalone entry with the same identity.",
    details: "Second duplicate identity details.",
    depends_on: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapCrossFileConflictDir, "planned-changes/9999-missing-orphan-work.yaml", {
    id: "orphan-work",
    milestone: "9999-missing",
    status: "planned",
    summary: "Standalone entry with a missing milestone.",
    details: "Missing milestone details.",
    depends_on: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapCrossFileConflictDir, "planned-changes/0001-conflict-missing-dependency-work.yaml", {
    id: "missing-dependency-work",
    milestone: "0001-conflict",
    status: "planned",
    summary: "Standalone entry with a missing dependency.",
    details: "Missing dependency details.",
    depends_on: ["not-present"],
  });
  writeStandalonePlannedChangeArtifact(roadmapCrossFileConflictDir, "planned-changes/0001-conflict-ambiguous-owner-work.yaml", {
    id: "ambiguous-owner-work",
    milestone: "0001-conflict",
    status: "planned",
    summary: "Standalone entry with ambiguous owner extension data.",
    details: "Ambiguous owner details.",
    depends_on: [],
    extensions: {
      owner: "alice",
      owners: ["alice", "bob"],
    },
  });
  writeStandalonePlannedChangeArtifact(roadmapCrossFileConflictDir, "planned-changes/0001-conflict-shared-active.yaml", {
    id: "shared-active",
    milestone: "0001-conflict",
    status: "planned",
    summary: "Standalone entry that conflicts with active work.",
    details: "Active conflict details.",
    depends_on: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapCrossFileConflictDir, "planned-changes/0005b-shared-active.yaml", {
    id: "shared-active",
    milestone: "0001-conflict",
    status: "planned",
    summary: "Second standalone entry that conflicts with active work.",
    details: "Second active conflict details.",
    depends_on: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapCrossFileConflictDir, "planned-changes/0001-conflict-cycle-a.yaml", {
    id: "cycle-a",
    milestone: "0001-conflict",
    status: "planned",
    summary: "First standalone side of a cross-file cycle.",
    details: "Cycle-a details.",
    depends_on: ["cycle-b"],
  });
  writeStandalonePlannedChangeArtifact(roadmapCrossFileConflictDir, "planned-changes/0001-conflict-cycle-b.yaml", {
    id: "cycle-b",
    milestone: "0001-conflict",
    status: "planned",
    summary: "Standalone side of a cross-file cycle.",
    details: "Cycle details.",
    depends_on: ["cycle-a"],
  });

  writeRoadmapIndexArtifact(roadmapCrossFileConflictDir, [
    {
      id: "0001-conflict",
      title: "Cross File Conflict",
      path: "roadmap/milestones/0001-conflict.yaml",
      status: "proposed",
    },
  ]);

  const crossFileConflictStatus = cli(["roadmap-status"], { cwd: roadmapCrossFileConflictDir });
  context.assert(crossFileConflictStatus.status !== 0, "roadmap-status exits non-zero for cross-file roadmap conflicts");
  const crossFileConflictJson = JSON.parse(crossFileConflictStatus.stdout.trim());
  const crossFileMessages = crossFileConflictJson.diagnostics.map((diagnostic: { message: string }) => diagnostic.message);
  context.assert(
    crossFileMessages.some((message: string) => message.includes("duplicate planned change id across roadmap planned-change sources")),
    "roadmap-status reports duplicate planned change identities across standalone sources",
  );
  context.assert(
    crossFileMessages.some((message: string) => message.includes("missing milestone")),
    "roadmap-status reports standalone planned changes with missing milestone references",
  );
  context.assert(
    crossFileMessages.some((message: string) => message.includes("dependency is missing from roadmap planned-change sources")),
    "roadmap-status reports cross-file dependency reference errors",
  );
  context.assert(
    crossFileMessages.some((message: string) => message.includes("ownership metadata is ambiguous")),
    "roadmap-status reports ambiguous advisory ownership metadata",
  );
  context.assert(
    crossFileMessages.some((message: string) => message.includes("conflicts with active strict change state")),
    "roadmap-status reports duplicate planned change identities that conflict with active strict changes",
  );
  context.assert(
    crossFileMessages.some((message: string) => message.includes("acyclic across roadmap planned-change sources")),
    "roadmap-status reports dependency cycles that span standalone planned-change sources",
  );

  const crossFileConflictStatusRepeat = cli(["roadmap-status"], { cwd: roadmapCrossFileConflictDir });
  context.assert(
    crossFileConflictStatusRepeat.status === crossFileConflictStatus.status
      && crossFileConflictStatusRepeat.stdout.trim() === crossFileConflictStatus.stdout.trim(),
    "roadmap-status preserves cross-file conflict diagnostic ordering across repeated runs",
  );

  const crossFileConflictSync = cli(["roadmap-sync"], { cwd: roadmapCrossFileConflictDir });
  context.assert(crossFileConflictSync.status !== 0, "roadmap-sync exits non-zero for cross-file roadmap conflicts");
} finally {
  rmSync(roadmapCrossFileConflictDir, { recursive: true, force: true });
}

const roadmapDetailsPresentDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-details-present-"));
try {
  writeRoadmapMilestoneArtifact(roadmapDetailsPresentDir, "0001-details.yaml", {
    id: "0001-details",
    title: "Details Preservation",
    goal: "Verify details survive sync.",
    status: "active",
    plannedChanges: [],
    details: "This is long-form planning guidance that must survive sync.",
  });

  writeRoadmapIndexArtifact(roadmapDetailsPresentDir, [
    {
      id: "0001-details",
      title: "Details Preservation",
      path: "roadmap/milestones/0001-details.yaml",
      status: "active",
    },
  ]);

  const detailsStatus = cli(["roadmap-status"], { cwd: roadmapDetailsPresentDir });
  context.assert(detailsStatus.status === 0, "roadmap-status exits zero for milestone with details");
  const detailsStatusJson = JSON.parse(detailsStatus.stdout.trim());
  context.assert(detailsStatusJson.valid === true, "roadmap-status accepts milestone with details");

  const detailsSync = cli(["roadmap-sync"], { cwd: roadmapDetailsPresentDir });
  context.assert(detailsSync.status === 0, "roadmap-sync exits zero for milestone with details");
  const syncedDetailsMilestone = yamlModule.parseYamlFile<{
    details?: string;
  }>(path.join(roadmapDetailsPresentDir, ".strict-spec-driven", "roadmap", "milestones", "0001-details.yaml"));
  context.assert(
    syncedDetailsMilestone.details === "This is long-form planning guidance that must survive sync.",
    "roadmap-sync preserves details field when present in milestone",
  );
} finally {
  rmSync(roadmapDetailsPresentDir, { recursive: true, force: true });
}

const roadmapDetailsAbsentDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-details-absent-"));
try {
  writeRoadmapMilestoneArtifact(roadmapDetailsAbsentDir, "0001-no-details.yaml", {
    id: "0001-no-details",
    title: "No Details",
    goal: "Verify details is absent when omitted.",
    status: "active",
    plannedChanges: [],
  });

  writeRoadmapIndexArtifact(roadmapDetailsAbsentDir, [
    {
      id: "0001-no-details",
      title: "No Details",
      path: "roadmap/milestones/0001-no-details.yaml",
      status: "active",
    },
  ]);

  const noDetailsStatus = cli(["roadmap-status"], { cwd: roadmapDetailsAbsentDir });
  context.assert(noDetailsStatus.status === 0, "roadmap-status exits zero for milestone without details");
  const noDetailsStatusJson = JSON.parse(noDetailsStatus.stdout.trim());
  context.assert(noDetailsStatusJson.valid === true, "roadmap-status accepts milestone without details");

  const noDetailsSync = cli(["roadmap-sync"], { cwd: roadmapDetailsAbsentDir });
  context.assert(noDetailsSync.status === 0, "roadmap-sync exits zero for milestone without details");
  const syncedNoDetailsMilestone = yamlModule.parseYamlFile<Record<string, unknown>>(
    path.join(roadmapDetailsAbsentDir, ".strict-spec-driven", "roadmap", "milestones", "0001-no-details.yaml"),
  );
  context.assert(
    !("details" in syncedNoDetailsMilestone),
    "roadmap-sync omits details field when source milestone has none",
  );
} finally {
  rmSync(roadmapDetailsAbsentDir, { recursive: true, force: true });
}

const roadmapAmbiguousDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-ambiguous-"));
try {
  mkdirSync(path.join(roadmapAmbiguousDir, ".strict-spec-driven", "changes", "shared-change"), { recursive: true });
  mkdirSync(
    path.join(roadmapAmbiguousDir, ".strict-spec-driven", "changes", "archive", `${formatLocalDateStamp()}-shared-change`),
    { recursive: true },
  );

  writeRoadmapMilestoneArtifact(roadmapAmbiguousDir, "0001-ambiguous.yaml", {
    id: "0001-ambiguous",
    title: "Ambiguous Roadmap Workflow",
    goal: "Surface duplicate active and archived change ids as ambiguity.",
    status: "complete",
    plannedChanges: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapAmbiguousDir, "planned-changes/0001-ambiguous-shared-change.yaml", {
    id: "shared-change",
    milestone: "0001-ambiguous",
    status: "complete",
    summary: "This change was archived but a duplicate active copy remains.",
    details: "Standalone ambiguous change details.",
    depends_on: [],
  });

  writeRoadmapIndexArtifact(roadmapAmbiguousDir, [
    {
      id: "0001-ambiguous",
      title: "Ambiguous Roadmap Workflow",
      path: "roadmap/milestones/0001-ambiguous.yaml",
      status: "complete",
    },
  ]);

  const ambiguousRoadmapStatus = cli(["roadmap-status"], { cwd: roadmapAmbiguousDir });
  context.assert(ambiguousRoadmapStatus.status === 0, "roadmap-status exits zero for ambiguous but structurally valid roadmap state");
  const ambiguousRoadmapJson = JSON.parse(ambiguousRoadmapStatus.stdout.trim());
  context.assert(ambiguousRoadmapJson.valid === true, "roadmap-status keeps ambiguous duplicate history as valid roadmap structure");
  context.assert(
    ambiguousRoadmapJson.milestones[0].plannedChanges[0].state === "ambiguous",
    "roadmap-status marks duplicate active and archived change ids as ambiguous state",
  );
  context.assert(
    ambiguousRoadmapJson.milestones[0].plannedChanges[0].derivedStatus === "planned",
    "roadmap-status does not derive ambiguous duplicate change ids as complete",
  );
  context.assert(
    ambiguousRoadmapJson.milestones[0].derivedStatus === "active",
    "roadmap-status derives milestone status as active when a planned change is ambiguous",
  );
  context.assert(
    ambiguousRoadmapJson.milestones[0].plannedChanges[0].mismatches.some(
      (mismatch: string) => mismatch.includes("both active and archived strict change state"),
    ),
    "roadmap-status reports an explicit ambiguity mismatch for duplicate active and archived change history",
  );

  const ambiguousRoadmapSync = cli(["roadmap-sync"], { cwd: roadmapAmbiguousDir });
  context.assert(ambiguousRoadmapSync.status === 0, "roadmap-sync exits zero for reconcilable ambiguous roadmap state");
  const syncedAmbiguousMilestone = yamlModule.parseYamlFile<{
    status: string;
    planned_changes: Record<string, { status: string }>;
  }>(path.join(roadmapAmbiguousDir, ".strict-spec-driven", "roadmap", "milestones", "0001-ambiguous.yaml"));
  context.assert(syncedAmbiguousMilestone.status === "active", "roadmap-sync rewrites ambiguous milestone status to active");
  context.assert(
    Object.keys(syncedAmbiguousMilestone.planned_changes).length === 0,
    "roadmap-sync keeps milestone planned_changes empty for standalone ambiguous roadmap entries",
  );
  const syncedAmbiguousStandalone = yamlModule.parseYamlFile<{
    status: string;
  }>(path.join(roadmapAmbiguousDir, ".strict-spec-driven", "roadmap", "planned-changes", "0001-ambiguous-shared-change.yaml"));
  context.assert(
    syncedAmbiguousStandalone.status === "planned",
    "roadmap-sync rewrites ambiguous standalone planned change status to planned instead of complete",
  );
} finally {
  rmSync(roadmapAmbiguousDir, { recursive: true, force: true });
}

const roadmapInvalidDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-invalid-"));
try {
  writeRoadmapIndexArtifact(roadmapInvalidDir, [
    {
      id: "0001-invalid",
      title: "Invalid Milestone",
      path: "roadmap/milestones/0001-invalid.yaml",
      status: "proposed",
    },
  ]);

  const invalidMilestonePath = path.join(
    roadmapInvalidDir,
    ".strict-spec-driven",
    "roadmap",
    "milestones",
    "0001-invalid.yaml",
  );
  mkdirSync(path.dirname(invalidMilestonePath), { recursive: true });
  writeFileSync(
    invalidMilestonePath,
    yamlModule.stringifyYamlDocument({
      schema: "strict-spec-driven/roadmap-milestone/v2",
      schema_version: 2,
      artifact_type: "roadmap_milestone",
      schema_file: "../schemas/roadmap-milestone.yaml",
      milestone: {
        "0001-invalid": {
          title: "Invalid Milestone",
        },
      },
      goal: "Broken milestone artifact",
      scope: {
        in: ["Test invalid roadmap artifact"],
        out: [],
      },
      done_criteria: ["Needs planned changes"],
      dependencies: [],
      risks: [],
      status: "proposed",
      notes: [],
    }),
    "utf8",
  );

  const invalidRoadmapStatus = cli(["roadmap-status"], { cwd: roadmapInvalidDir });
  context.assert(invalidRoadmapStatus.status !== 0, "roadmap-status exits non-zero for invalid roadmap artifacts");
  const invalidRoadmapJson = JSON.parse(invalidRoadmapStatus.stdout.trim());
  context.assert(invalidRoadmapJson.valid === false, "roadmap-status reports valid=false for invalid roadmap artifact");
  context.assert(
    invalidRoadmapJson.diagnostics.some(
      (diagnostic: { artifactPath: string; fieldPath: string }) =>
        diagnostic.artifactPath === ".strict-spec-driven/roadmap/milestones/0001-invalid.yaml"
        && diagnostic.fieldPath.includes("planned_changes"),
    ),
    "roadmap-status diagnostics identify the invalid artifact path and field path",
  );
  const invalidRoadmapStatusRepeat = cli(["roadmap-status"], { cwd: roadmapInvalidDir });
  context.assert(
    invalidRoadmapStatusRepeat.status === invalidRoadmapStatus.status
      && invalidRoadmapStatusRepeat.stdout.trim() === invalidRoadmapStatus.stdout.trim(),
    "roadmap-status preserves diagnostic ordering across repeated invalid runs",
  );
  const invalidRoadmapOverview = cli(["roadmap-overview"], { cwd: roadmapInvalidDir });
  context.assert(invalidRoadmapOverview.status !== 0, "roadmap-overview exits non-zero for invalid roadmap artifacts");
  context.assert(
    invalidRoadmapOverview.stdout.includes("Roadmap overview (invalid)")
      && invalidRoadmapOverview.stdout.includes("Diagnostics:")
      && invalidRoadmapOverview.stdout.includes(".strict-spec-driven/roadmap/milestones/0001-invalid.yaml")
      && invalidRoadmapOverview.stdout.includes("planned_changes"),
    "roadmap-overview prints actionable diagnostics for invalid roadmap artifacts",
  );
  const invalidRoadmapOverviewRepeat = cli(["roadmap-overview"], { cwd: roadmapInvalidDir });
  context.assert(
    invalidRoadmapOverviewRepeat.status === invalidRoadmapOverview.status
      && invalidRoadmapOverviewRepeat.stdout === invalidRoadmapOverview.stdout,
    "roadmap-overview preserves diagnostic ordering across repeated invalid runs",
  );
  const invalidRoadmapRecommend = cli(["roadmap-recommend"], { cwd: roadmapInvalidDir });
  context.assert(invalidRoadmapRecommend.status !== 0, "roadmap-recommend exits non-zero for invalid roadmap artifacts");
  const invalidRoadmapRecommendJson = JSON.parse(invalidRoadmapRecommend.stdout.trim());
  context.assert(
    invalidRoadmapRecommendJson.valid === false
      && invalidRoadmapRecommendJson.status === "roadmap-error"
      && invalidRoadmapRecommendJson.diagnostics.some(
        (diagnostic: { artifactPath: string; fieldPath: string }) =>
          diagnostic.artifactPath === ".strict-spec-driven/roadmap/milestones/0001-invalid.yaml"
          && diagnostic.fieldPath.includes("planned_changes"),
      ),
    "roadmap-recommend preserves deterministic diagnostics for invalid roadmap artifacts",
  );

  const invalidRoadmapSync = cli(["roadmap-sync"], { cwd: roadmapInvalidDir });
  context.assert(invalidRoadmapSync.status !== 0, "roadmap-sync exits non-zero when milestone artifacts are invalid");
} finally {
  rmSync(roadmapInvalidDir, { recursive: true, force: true });
}

const invalidRoadmapSkillRoot = mkdtempSync(path.join(os.tmpdir(), "strict-roadmap-skill-invalid-"));
try {
  const invalidRoadmapSkillDir = path.join(invalidRoadmapSkillRoot, "skills", "strict-roadmap-recommend");
  mkdirSync(path.join(invalidRoadmapSkillRoot, "dist", "scripts"), { recursive: true });
  mkdirSync(path.join(invalidRoadmapSkillRoot, "dist", "templates"), { recursive: true });
  mkdirSync(invalidRoadmapSkillDir, { recursive: true });

  symlinkSync("../../dist/scripts", path.join(invalidRoadmapSkillDir, "scripts"));
  symlinkSync("../../dist/templates", path.join(invalidRoadmapSkillDir, "templates"));

  writeFileSync(
    path.join(invalidRoadmapSkillDir, "SKILL.md"),
    [
      "---",
      "name: strict-roadmap-recommend",
      "description: stub",
      "metadata:",
      "  skill_id: strict_roadmap_recommend",
      "  author: strict-spec-driven",
      "  type: agent_skill",
      "  version: 1.0.0",
      "---",
      "",
      "You are helping with roadmap work.",
      "",
      "## This Skill's Commands",
      "",
      "```yaml",
      "cli: strict-spec-cli <command>",
      "```",
      "",
      "## Prerequisites",
      "",
      "Use strict workflow artifacts.",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(invalidRoadmapSkillRoot, "skills", "marketplace.json"),
    JSON.stringify(
      {
        schema: "strict-spec-driven/skill-marketplace/v1",
        namespace: "strict-spec-driven",
        skills: [{ name: "strict-roadmap-recommend", family: "strict-roadmap" }],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const invalidRoadmapSkillResult = skillValidationModule.validateStrictSkillPackaging(invalidRoadmapSkillRoot);
  context.assert(!invalidRoadmapSkillResult.valid, "strict skill validation fails for placeholder roadmap skill content");
  context.assert(
    invalidRoadmapSkillResult.diagnostics.some((diagnostic) => diagnostic.code === "skill.roadmap.placeholder_command"),
    "placeholder roadmap skill reports roadmap-specific placeholder diagnostic",
  );
  context.assert(
    invalidRoadmapSkillResult.diagnostics.some((diagnostic) => diagnostic.code === "skill.roadmap.required_heading.missing"),
    "placeholder roadmap skill reports missing roadmap workflow heading diagnostic",
  );
  context.assert(
    invalidRoadmapSkillResult.diagnostics.some((diagnostic) => diagnostic.code === "skill.roadmap.required_snippet.missing"),
    "placeholder roadmap skill reports missing strict roadmap artifact reference diagnostic",
  );
} finally {
  rmSync(invalidRoadmapSkillRoot, { recursive: true, force: true });
}

const invalidRoadmapRecommendSkillRoot = mkdtempSync(path.join(os.tmpdir(), "strict-roadmap-recommend-skill-invalid-"));
try {
  const invalidRoadmapRecommendSkillDir = path.join(invalidRoadmapRecommendSkillRoot, "skills", "strict-roadmap-recommend");
  mkdirSync(path.join(invalidRoadmapRecommendSkillRoot, "dist", "scripts"), { recursive: true });
  mkdirSync(path.join(invalidRoadmapRecommendSkillRoot, "dist", "templates"), { recursive: true });
  mkdirSync(invalidRoadmapRecommendSkillDir, { recursive: true });

  symlinkSync("../../dist/scripts", path.join(invalidRoadmapRecommendSkillDir, "scripts"));
  symlinkSync("../../dist/templates", path.join(invalidRoadmapRecommendSkillDir, "templates"));

  writeFileSync(
    path.join(invalidRoadmapRecommendSkillDir, "SKILL.md"),
    [
      "---",
      "name: strict-roadmap-recommend",
      "description: stub",
      "metadata:",
      "  skill_id: strict_roadmap_recommend",
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
      "roadmap-status: strict-spec-cli roadmap-status",
      "propose: strict-spec-cli propose <change-name>",
      "generate: strict-spec-cli generate <change-name> <proposal|design|questions|delta-spec> --<named-args>",
      "ready: strict-spec-cli ready <change-name>",
      "verify: strict-spec-cli verify <change-name>",
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
      "1. Read roadmap context under `.strict-spec-driven/roadmap/`, including each standalone planned-change artifact and any relevant `details` field guidance.",
      "2. Use roadmap-status to find active strict change conflicts and manually choose the next planned change.",
      "3. Continue with `/strict-spec-auto` after the manual selection.",
      "",
      "## Rules",
      "",
      "- Keep the roadmap source of truth in `.strict-spec-driven/roadmap/`.",
      "- Use standalone planned-change artifacts instead of milestone-local copies.",
      "- Respect active strict change conflicts when choosing roadmap work.",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(invalidRoadmapRecommendSkillRoot, "skills", "marketplace.json"),
    JSON.stringify(
      {
        schema: "strict-spec-driven/skill-marketplace/v1",
        namespace: "strict-spec-driven",
        skills: [{ name: "strict-roadmap-recommend", family: "strict-roadmap" }],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const invalidRoadmapRecommendSkillResult = skillValidationModule.validateStrictSkillPackaging(invalidRoadmapRecommendSkillRoot);
  context.assert(
    !invalidRoadmapRecommendSkillResult.valid,
    "strict skill validation fails when roadmap recommend omits the scripted selection command",
  );
  context.assert(
    invalidRoadmapRecommendSkillResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.roadmap.command.missing"
        && diagnostic.path === "skills/strict-roadmap-recommend/SKILL.md#commands.roadmap-recommend",
    ),
    "roadmap skill validation requires the roadmap-recommend command mapping",
  );
  context.assert(
    invalidRoadmapRecommendSkillResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.roadmap.required_snippet.missing"
        && diagnostic.path === "skills/strict-roadmap-recommend/SKILL.md"
        && diagnostic.expected === "treat the command's selected planned change as authoritative",
    ),
    "roadmap skill validation requires authoritative scripted recommendation guidance",
  );
  context.assert(
    invalidRoadmapRecommendSkillResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.roadmap.required_snippet.missing"
        && diagnostic.path === "skills/strict-roadmap-recommend/SKILL.md"
        && diagnostic.expected === "Use `ready` as the proposal handoff validation",
    ),
    "roadmap skill validation requires ready-only handoff guidance",
  );
  context.assert(
    invalidRoadmapRecommendSkillResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.roadmap.required_snippet.missing"
        && diagnostic.path === "skills/strict-roadmap-recommend/SKILL.md"
        && diagnostic.expected === "proposal checkpoint",
    ),
    "roadmap skill validation requires proposal checkpoint guidance",
  );
  context.assert(
    invalidRoadmapRecommendSkillResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.roadmap.required_snippet.missing"
        && diagnostic.path === "skills/strict-roadmap-recommend/SKILL.md"
        && diagnostic.expected === "decision-ready detail",
    ),
    "roadmap skill validation requires decision-ready checkpoint detail guidance",
  );
  context.assert(
    invalidRoadmapRecommendSkillResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.roadmap.required_snippet.missing"
        && diagnostic.path === "skills/strict-roadmap-recommend/SKILL.md"
        && diagnostic.expected === "scope, unchanged behavior, design decisions, task coverage, unresolved-question impact, delta spec scenarios, delta tech use when applicable, and structured mapping fields",
    ),
    "roadmap skill validation requires concrete checkpoint criteria guidance",
  );
} finally {
  rmSync(invalidRoadmapRecommendSkillRoot, { recursive: true, force: true });
}

const invalidRoadmapDetailsSkillRoot = mkdtempSync(path.join(os.tmpdir(), "strict-roadmap-details-skill-invalid-"));
try {
  const invalidRoadmapDetailsSkillDir = path.join(invalidRoadmapDetailsSkillRoot, "skills", "strict-roadmap-recommend");
  mkdirSync(path.join(invalidRoadmapDetailsSkillRoot, "dist", "scripts"), { recursive: true });
  mkdirSync(path.join(invalidRoadmapDetailsSkillRoot, "dist", "templates"), { recursive: true });
  mkdirSync(invalidRoadmapDetailsSkillDir, { recursive: true });

  symlinkSync("../../dist/scripts", path.join(invalidRoadmapDetailsSkillDir, "scripts"));
  symlinkSync("../../dist/templates", path.join(invalidRoadmapDetailsSkillDir, "templates"));

  writeFileSync(
    path.join(invalidRoadmapDetailsSkillDir, "SKILL.md"),
    [
      "---",
      "name: strict-roadmap-recommend",
      "description: stub",
      "metadata:",
      "  skill_id: strict_roadmap_recommend",
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
      "roadmap-status: strict-spec-cli roadmap-status",
      "propose: strict-spec-cli propose <change-name>",
      "verify: strict-spec-cli verify <change-name>",
      "```",
      "",
      "## Prerequisites",
      "",
      "Use strict workflow artifacts under .strict-spec-driven/roadmap/.",
      "",
      "## Steps",
      "",
      "1. Read roadmap context and scaffold the strict change.",
      "",
      "## Rules",
      "",
      "- Keep the roadmap source of truth in .strict-spec-driven/roadmap/.",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(invalidRoadmapDetailsSkillRoot, "skills", "marketplace.json"),
    JSON.stringify(
      {
        schema: "strict-spec-driven/skill-marketplace/v1",
        namespace: "strict-spec-driven",
        skills: [{ name: "strict-roadmap-recommend", family: "strict-roadmap" }],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const invalidRoadmapDetailsSkillResult = skillValidationModule.validateStrictSkillPackaging(invalidRoadmapDetailsSkillRoot);
  context.assert(!invalidRoadmapDetailsSkillResult.valid, "strict skill validation fails when roadmap recommend guidance omits details handling");
  context.assert(
    invalidRoadmapDetailsSkillResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.roadmap.required_snippet.missing"
        && diagnostic.path === "skills/strict-roadmap-recommend/SKILL.md"
        && diagnostic.expected === "`details` field",
    ),
    "roadmap skill validation requires details guidance for proposal handoff",
  );
  context.assert(
    invalidRoadmapDetailsSkillResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.roadmap.required_snippet.missing"
        && diagnostic.path === "skills/strict-roadmap-recommend/SKILL.md"
        && diagnostic.expected === "standalone planned-change",
    ),
    "roadmap skill validation requires split planned-change handoff guidance",
  );
  context.assert(
    invalidRoadmapDetailsSkillResult.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "skill.roadmap.required_snippet.missing"
        && diagnostic.path === "skills/strict-roadmap-recommend/SKILL.md"
        && diagnostic.expected === "active strict change conflicts",
    ),
    "roadmap skill validation requires active conflict handoff guidance",
  );
} finally {
  rmSync(invalidRoadmapDetailsSkillRoot, { recursive: true, force: true });
}

const invalidPlanningSkillRoot = mkdtempSync(path.join(os.tmpdir(), "strict-planning-skill-invalid-"));
try {
  const invalidPlanningSkillDir = path.join(invalidPlanningSkillRoot, "skills", "strict-spec-sync-specs");
  mkdirSync(path.join(invalidPlanningSkillRoot, "dist", "scripts"), { recursive: true });
  mkdirSync(path.join(invalidPlanningSkillRoot, "dist", "templates"), { recursive: true });
  mkdirSync(invalidPlanningSkillDir, { recursive: true });

  symlinkSync("../../dist/scripts", path.join(invalidPlanningSkillDir, "scripts"));
  symlinkSync("../../dist/templates", path.join(invalidPlanningSkillDir, "templates"));

  writeFileSync(
    path.join(invalidPlanningSkillDir, "SKILL.md"),
    [
      "---",
      "name: strict-spec-sync-specs",
      "description: stub",
      "metadata:",
      "  skill_id: strict_spec_sync_specs",
      "  author: strict-spec-driven",
      "  type: agent_skill",
      "  version: 1.0.0",
      "---",
      "",
      "You are helping with strict spec syncing.",
      "",
      "## This Skill's Commands",
      "",
      "```yaml",
      "cli: strict-spec-cli <command>",
      "```",
      "",
      "## Prerequisites",
      "",
      "Use strict workflow artifacts.",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(invalidPlanningSkillRoot, "skills", "marketplace.json"),
    JSON.stringify(
      {
        schema: "strict-spec-driven/skill-marketplace/v1",
        namespace: "strict-spec-driven",
        skills: [{ name: "strict-spec-sync-specs", family: "strict-spec" }],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const invalidPlanningSkillResult = skillValidationModule.validateStrictSkillPackaging(invalidPlanningSkillRoot);
  context.assert(!invalidPlanningSkillResult.valid, "strict skill validation fails for placeholder planning skill content");
  context.assert(
    invalidPlanningSkillResult.diagnostics.some((diagnostic) => diagnostic.code === "skill.planning.placeholder_command"),
    "placeholder planning skill reports planning-specific placeholder diagnostic",
  );
  context.assert(
    invalidPlanningSkillResult.diagnostics.some((diagnostic) => diagnostic.code === "skill.planning.required_heading.missing"),
    "placeholder planning skill reports missing planning workflow heading diagnostic",
  );
  context.assert(
    invalidPlanningSkillResult.diagnostics.some((diagnostic) => diagnostic.code === "skill.planning.required_snippet.missing"),
    "placeholder planning skill reports missing strict planning artifact reference diagnostic",
  );
} finally {
  rmSync(invalidPlanningSkillRoot, { recursive: true, force: true });
}

const invalidMigrationSkillRoot = mkdtempSync(path.join(os.tmpdir(), "strict-migration-skill-invalid-"));
try {
  const invalidMigrationSkillDir = path.join(invalidMigrationSkillRoot, "skills", "strict-spec-migrate");
  mkdirSync(path.join(invalidMigrationSkillRoot, "dist", "scripts"), { recursive: true });
  mkdirSync(path.join(invalidMigrationSkillRoot, "dist", "templates"), { recursive: true });
  mkdirSync(invalidMigrationSkillDir, { recursive: true });

  symlinkSync("../../dist/scripts", path.join(invalidMigrationSkillDir, "scripts"));
  symlinkSync("../../dist/templates", path.join(invalidMigrationSkillDir, "templates"));

  writeFileSync(
    path.join(invalidMigrationSkillDir, "SKILL.md"),
    [
      "---",
      "name: strict-spec-migrate",
      "description: stub",
      "metadata:",
      "  skill_id: strict_spec_migrate",
      "  author: strict-spec-driven",
      "  type: agent_skill",
      "  version: 1.0.0",
      "---",
      "",
      "You are helping with strict migration work.",
      "",
      "## This Skill's Commands",
      "",
      "```yaml",
      "cli: strict-spec-cli <command>",
      "```",
      "",
      "## Prerequisites",
      "",
      "Use workflow artifacts.",
    ].join("\n") + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(invalidMigrationSkillRoot, "skills", "marketplace.json"),
    JSON.stringify(
      {
        schema: "strict-spec-driven/skill-marketplace/v1",
        namespace: "strict-spec-driven",
        skills: [{ name: "strict-spec-migrate", family: "strict-spec" }],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const invalidMigrationSkillResult = skillValidationModule.validateStrictSkillPackaging(invalidMigrationSkillRoot);
  context.assert(!invalidMigrationSkillResult.valid, "strict skill validation fails for placeholder migration skill content");
  context.assert(
    invalidMigrationSkillResult.diagnostics.some((diagnostic) => diagnostic.code === "skill.migration.placeholder_command"),
    "placeholder migration skill reports migration-specific placeholder diagnostic",
  );
  context.assert(
    invalidMigrationSkillResult.diagnostics.some((diagnostic) => diagnostic.code === "skill.migration.required_heading.missing"),
    "placeholder migration skill reports missing migration workflow heading diagnostic",
  );
  context.assert(
    invalidMigrationSkillResult.diagnostics.some((diagnostic) => diagnostic.code === "skill.migration.required_snippet.missing"),
    "placeholder migration skill reports missing migration workflow reference diagnostic",
  );
} finally {
  rmSync(invalidMigrationSkillRoot, { recursive: true, force: true });
}

const roadmapCycleDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-cycle-"));
try {
  writeRoadmapIndexArtifact(roadmapCycleDir, [
    {
      id: "0001-cycle",
      title: "Cycle Milestone",
      path: "roadmap/milestones/0001-cycle.yaml",
      status: "proposed",
    },
  ]);

  writeRoadmapMilestoneArtifact(roadmapCycleDir, "0001-cycle.yaml", {
    id: "0001-cycle",
    title: "Cycle Milestone",
    goal: "Detect invalid dependency cycles.",
    status: "proposed",
    plannedChanges: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapCycleDir, "planned-changes/0001-cycle-change-a.yaml", {
    id: "change-a",
    milestone: "0001-cycle",
    status: "planned",
    summary: "First change",
    details: "Cycle test details for change-a.",
    depends_on: ["change-b"],
  });
  writeStandalonePlannedChangeArtifact(roadmapCycleDir, "planned-changes/0001-cycle-change-b.yaml", {
    id: "change-b",
    milestone: "0001-cycle",
    status: "planned",
    summary: "Second change",
    details: "Cycle test details for change-b.",
    depends_on: ["change-a"],
  });

  const cycleStatus = cli(["roadmap-status"], { cwd: roadmapCycleDir });
  context.assert(cycleStatus.status !== 0, "roadmap-status exits non-zero for cyclic planned change dependencies");
  const cycleJson = JSON.parse(cycleStatus.stdout.trim());
  context.assert(
    cycleJson.diagnostics.some((diagnostic: { message: string }) => diagnostic.message.includes("acyclic")),
    "roadmap-status reports a cycle diagnostic for planned change dependencies",
  );
} finally {
  rmSync(roadmapCycleDir, { recursive: true, force: true });
}

context.section("[17b] copied real project roadmap workflow");

const todoProjectRoot = projectFixturePath("todo-app");
const todoProjectRoadmapIndexPath = path.join(todoProjectRoot, ".spec-driven", "roadmap", "INDEX.md");
const todoProjectRoadmapMilestonePath = path.join(
  todoProjectRoot,
  ".spec-driven",
  "roadmap",
  "milestones",
  "01-core-todo-workflows.md",
);
function runCopiedWorkspaceRoadmapFlowScenario(): {
  statusBeforeStatus: number;
  statusBeforeStdout: string;
  migrateStatus: number;
  migrateStdout: string;
  statusAfterStatus: number;
  statusAfterStdout: string;
  syncStatus: number;
  syncStdout: string;
  syncedIndexText: string;
  syncedMilestoneText: string;
} {
  const copiedWorkspaceRoadmapFlow = createCopiedProjectWorkspace("todo-app");
  const { workspaceRoot } = copiedWorkspaceRoadmapFlow;
  try {
    const copiedRoadmapIndexBefore = readFileSync(
      path.join(workspaceRoot, ".spec-driven", "roadmap", "INDEX.md"),
      "utf8",
    );
    const copiedRoadmapMilestoneBefore = readFileSync(
      path.join(workspaceRoot, ".spec-driven", "roadmap", "milestones", "01-core-todo-workflows.md"),
      "utf8",
    );
    const baselineRoadmapIndex = readFileSync(todoProjectRoadmapIndexPath, "utf8");
    const baselineRoadmapMilestone = readFileSync(todoProjectRoadmapMilestonePath, "utf8");

    context.assert(
      !existsSync(path.join(workspaceRoot, ".strict-spec-driven")),
      "copied workspace roadmap flow starts without strict migrated state",
    );

    const copiedRoadmapStatusBefore = projectWorkspaceCli(workspaceRoot, ["roadmap-status"]);
    const copiedRoadmapStatusBeforeStdout = copiedRoadmapStatusBefore.stdout.trim();
    context.assert(
      copiedRoadmapStatusBefore.status !== 0,
      "copied workspace roadmap-status exits non-zero before migrate creates strict roadmap state",
      `stdout: ${copiedRoadmapStatusBeforeStdout} stderr: ${copiedRoadmapStatusBefore.stderr.trim()}`,
    );
    const copiedRoadmapStatusBeforeJson = JSON.parse(copiedRoadmapStatusBeforeStdout);
    context.assert(
      copiedRoadmapStatusBeforeJson.diagnostics.some(
        (diagnostic: { artifactPath: string; message: string }) =>
          diagnostic.artifactPath === ".strict-spec-driven/roadmap"
          && diagnostic.message.includes("strict roadmap directory not found"),
      ),
      "copied workspace roadmap-status reports missing strict roadmap directory before migrate",
    );

    const copiedMigrateForRoadmap = projectWorkspaceCli(workspaceRoot, ["migrate"]);
    const copiedMigrateForRoadmapStdout = copiedMigrateForRoadmap.stdout.trim();
    context.assert(
      copiedMigrateForRoadmap.status === 0,
      "copied workspace migrate prepares strict roadmap state for roadmap command coverage",
      `stdout: ${copiedMigrateForRoadmapStdout} stderr: ${copiedMigrateForRoadmap.stderr.trim()}`,
    );
    const copiedMigrateForRoadmapJson = JSON.parse(copiedMigrateForRoadmapStdout);
    context.assert(
      copiedMigrateForRoadmapJson.valid === true,
      "copied workspace migrate reports valid=true before roadmap assertions",
    );

    const copiedRoadmapStatusAfter = projectWorkspaceCli(workspaceRoot, ["roadmap-status"]);
    const copiedRoadmapStatusAfterStdout = copiedRoadmapStatusAfter.stdout.trim();
    context.assert(
      copiedRoadmapStatusAfter.status !== 0,
      "copied workspace roadmap-status rejects migrated strict roadmap state until inline planned changes are materialized",
      `stdout: ${copiedRoadmapStatusAfterStdout} stderr: ${copiedRoadmapStatusAfter.stderr.trim()}`,
    );
    const copiedRoadmapStatusAfterJson = JSON.parse(copiedRoadmapStatusAfterStdout);
    context.assert(
      copiedRoadmapStatusAfterJson.valid === false
        && copiedRoadmapStatusAfterJson.diagnostics.some(
          (diagnostic: { fieldPath: string; message: string }) =>
            diagnostic.fieldPath === "$.planned_changes"
            && diagnostic.message.includes("roadmap-sync --materialize-planned-changes"),
        ),
      "copied workspace roadmap-status tells the operator to materialize migrated inline roadmap data",
    );

    const copiedRoadmapSync = projectWorkspaceCli(workspaceRoot, ["roadmap-sync"]);
    const copiedRoadmapSyncStdout = copiedRoadmapSync.stdout.trim();
    context.assert(
      copiedRoadmapSync.status !== 0,
      "copied workspace roadmap-sync rejects migrated inline roadmap data without explicit materialization",
      `stdout: ${copiedRoadmapSyncStdout} stderr: ${copiedRoadmapSync.stderr.trim()}`,
    );
    const copiedRoadmapSyncJson = JSON.parse(copiedRoadmapSyncStdout);
    context.assert(
      copiedRoadmapSyncJson.valid === false
        && copiedRoadmapSyncJson.updatedFiles.length === 0
        && copiedRoadmapSyncJson.diagnostics.some(
          (diagnostic: { fieldPath: string; message: string }) =>
            diagnostic.fieldPath === "$.planned_changes"
            && diagnostic.message.includes("roadmap-sync --materialize-planned-changes"),
        ),
      "copied workspace roadmap-sync blocks rewrites and surfaces the explicit materialization command",
      `updatedFiles: ${JSON.stringify(copiedRoadmapSyncJson.updatedFiles)}`,
    );

    const copiedRoadmapMaterialize = projectWorkspaceCli(workspaceRoot, ["roadmap-sync", "--materialize-planned-changes"]);
    const copiedRoadmapMaterializeStdout = copiedRoadmapMaterialize.stdout.trim();
    context.assert(
      copiedRoadmapMaterialize.status === 0,
      "copied workspace roadmap-sync materializes migrated inline roadmap data when explicitly requested",
      `stdout: ${copiedRoadmapMaterializeStdout} stderr: ${copiedRoadmapMaterialize.stderr.trim()}`,
    );
    const copiedRoadmapMaterializeJson = JSON.parse(copiedRoadmapMaterializeStdout);
    context.assert(
      copiedRoadmapMaterializeJson.valid === true
        && copiedRoadmapMaterializeJson.updatedFiles.includes(".strict-spec-driven/roadmap/milestones/0001-core-todo-workflows.yaml")
        && copiedRoadmapMaterializeJson.updatedFiles.includes(".strict-spec-driven/roadmap/INDEX.yaml")
        && copiedRoadmapMaterializeJson.updatedFiles.includes(".strict-spec-driven/roadmap/planned-changes/0001-core-todo-workflows-add-due-dates.yaml")
        && copiedRoadmapMaterializeJson.updatedFiles.includes(".strict-spec-driven/roadmap/planned-changes/0001-core-todo-workflows-add-tag-filtering.yaml"),
      "copied workspace roadmap-sync materializes migrated roadmap items into standalone files and rewrites canonical artifacts",
      `updatedFiles: ${JSON.stringify(copiedRoadmapMaterializeJson.updatedFiles)}`,
    );

    const copiedSyncedRoadmapIndexPath = path.join(workspaceRoot, ".strict-spec-driven", "roadmap", "INDEX.yaml");
    const copiedSyncedRoadmapMilestonePath = path.join(
      workspaceRoot,
      ".strict-spec-driven",
      "roadmap",
      "milestones",
      "0001-core-todo-workflows.yaml",
    );
    const copiedSyncedRoadmapIndexText = readFileSync(copiedSyncedRoadmapIndexPath, "utf8");
    const copiedSyncedRoadmapMilestoneText = readFileSync(copiedSyncedRoadmapMilestonePath, "utf8");
    const copiedSyncedRoadmapIndex = yamlModule.parseYamlFile<{
      milestones: Record<string, { title: string; path: string; status: string }>;
    }>(copiedSyncedRoadmapIndexPath);
    const syncedIndexEntries = Object.entries(copiedSyncedRoadmapIndex.milestones);
    context.assert(
      syncedIndexEntries.length === 1
        && syncedIndexEntries[0]?.[0] === "0001-core-todo-workflows"
        && syncedIndexEntries[0]?.[1].path === "roadmap/milestones/0001-core-todo-workflows.yaml"
        && syncedIndexEntries[0]?.[1].status === "active",
      "copied workspace roadmap-sync materialization rewrites migrated roadmap index status to the derived active value",
    );
    const copiedSyncedRoadmapMilestone = yamlModule.parseYamlFile<{
      status: string;
      planned_changes: Record<string, { status: string; summary: string; details: string; depends_on: string[] }>;
    }>(copiedSyncedRoadmapMilestonePath);
    context.assert(
      copiedSyncedRoadmapMilestone.status === "active",
      "copied workspace roadmap-sync materialization rewrites the migrated milestone declared status to active",
    );
    const syncedChangeEntries = Object.entries(copiedSyncedRoadmapMilestone.planned_changes);
    context.assert(
      syncedChangeEntries.length === 0,
      "copied workspace roadmap-sync materialization clears migrated inline planned changes from the milestone file",
    );
    const copiedRoadmapStatusMaterialized = projectWorkspaceCli(workspaceRoot, ["roadmap-status"]);
    const copiedRoadmapStatusMaterializedStdout = copiedRoadmapStatusMaterialized.stdout.trim();
    context.assert(
      copiedRoadmapStatusMaterialized.status === 0,
      "copied workspace roadmap-status accepts migrated roadmap state after explicit materialization",
      `stdout: ${copiedRoadmapStatusMaterializedStdout} stderr: ${copiedRoadmapStatusMaterialized.stderr.trim()}`,
    );
    const copiedRoadmapStatusMaterializedJson = JSON.parse(copiedRoadmapStatusMaterializedStdout);
    context.assert(
      copiedRoadmapStatusMaterializedJson.valid === true && copiedRoadmapStatusMaterializedJson.milestones.length === 1,
      "copied workspace roadmap-status reports one valid migrated milestone after explicit materialization",
    );
    context.assert(
      copiedRoadmapStatusMaterializedJson.milestones[0].path === "roadmap/milestones/0001-core-todo-workflows.yaml"
        && copiedRoadmapStatusMaterializedJson.milestones[0].declaredStatus === "active"
        && copiedRoadmapStatusMaterializedJson.milestones[0].derivedStatus === "active",
      "copied workspace roadmap-status preserves migrated milestone path and reports active state after materialization",
    );
    context.assert(
      copiedRoadmapStatusMaterializedJson.milestones[0].plannedChanges.length === 2
        && copiedRoadmapStatusMaterializedJson.milestones[0].plannedChanges[0]?.id === "add-due-dates"
        && copiedRoadmapStatusMaterializedJson.milestones[0].plannedChanges[0]?.state === "active"
        && copiedRoadmapStatusMaterializedJson.milestones[0].plannedChanges[1]?.id === "add-tag-filtering"
        && copiedRoadmapStatusMaterializedJson.milestones[0].plannedChanges[1]?.state === "missing",
      "copied workspace roadmap-status derives active and missing planned change states from the materialized migrated fixture history",
    );
    context.assert(
      copiedRoadmapStatusMaterializedJson.milestones[0].plannedChanges[0]?.path === "roadmap/planned-changes/0001-core-todo-workflows-add-due-dates.yaml"
        && copiedRoadmapStatusMaterializedJson.milestones[0].plannedChanges[1]?.path === "roadmap/planned-changes/0001-core-todo-workflows-add-tag-filtering.yaml",
      "copied workspace roadmap-status reports materialized planned-change paths",
    );
    context.assert(
      copiedRoadmapStatusMaterializedJson.milestones[0].mismatches.length === 0,
      "copied workspace roadmap-status clears the milestone mismatch after explicit materialization",
    );
    context.assert(
      readFileSync(path.join(workspaceRoot, ".spec-driven", "roadmap", "INDEX.md"), "utf8") === copiedRoadmapIndexBefore
        && readFileSync(
          path.join(workspaceRoot, ".spec-driven", "roadmap", "milestones", "01-core-todo-workflows.md"),
          "utf8",
        ) === copiedRoadmapMilestoneBefore,
      "copied workspace roadmap flow leaves legacy bootstrap roadmap inputs unchanged",
    );
    context.assert(
      readFileSync(todoProjectRoadmapIndexPath, "utf8") === baselineRoadmapIndex
        && readFileSync(todoProjectRoadmapMilestonePath, "utf8") === baselineRoadmapMilestone
        && !existsSync(path.join(todoProjectRoot, ".strict-spec-driven")),
      "committed todo-project fixture baseline stays unchanged during copied workspace roadmap coverage",
    );

    return {
      statusBeforeStatus: copiedRoadmapStatusBefore.status,
      statusBeforeStdout: copiedRoadmapStatusBeforeStdout,
      migrateStatus: copiedMigrateForRoadmap.status,
      migrateStdout: copiedMigrateForRoadmapStdout,
      statusAfterStatus: copiedRoadmapStatusMaterialized.status,
      statusAfterStdout: copiedRoadmapStatusMaterializedStdout,
      syncStatus: copiedRoadmapMaterialize.status,
      syncStdout: copiedRoadmapMaterializeStdout,
      syncedIndexText: copiedSyncedRoadmapIndexText,
      syncedMilestoneText: copiedSyncedRoadmapMilestoneText,
    };
  } finally {
    copiedWorkspaceRoadmapFlow.cleanup();
    context.assert(
      !existsSync(workspaceRoot),
      "copied workspace cleanup removes roadmap flow temp workspace",
    );
  }
}

const copiedWorkspaceRoadmapFirstRun = runCopiedWorkspaceRoadmapFlowScenario();
const copiedWorkspaceRoadmapSecondRun = runCopiedWorkspaceRoadmapFlowScenario();
context.assert(
  copiedWorkspaceRoadmapFirstRun.statusBeforeStatus === copiedWorkspaceRoadmapSecondRun.statusBeforeStatus
    && copiedWorkspaceRoadmapFirstRun.statusBeforeStdout === copiedWorkspaceRoadmapSecondRun.statusBeforeStdout,
  "copied workspace roadmap-status pre-migrate output stays stable across repeated copied-fixture runs",
);
context.assert(
  copiedWorkspaceRoadmapFirstRun.migrateStatus === copiedWorkspaceRoadmapSecondRun.migrateStatus
    && copiedWorkspaceRoadmapFirstRun.migrateStdout === copiedWorkspaceRoadmapSecondRun.migrateStdout,
  "copied workspace migrate-for-roadmap output stays stable across repeated copied-fixture runs",
);
context.assert(
  copiedWorkspaceRoadmapFirstRun.statusAfterStatus === copiedWorkspaceRoadmapSecondRun.statusAfterStatus
    && copiedWorkspaceRoadmapFirstRun.statusAfterStdout === copiedWorkspaceRoadmapSecondRun.statusAfterStdout,
  "copied workspace roadmap-status post-migrate output stays stable across repeated copied-fixture runs",
);
context.assert(
  copiedWorkspaceRoadmapFirstRun.syncStatus === copiedWorkspaceRoadmapSecondRun.syncStatus
    && copiedWorkspaceRoadmapFirstRun.syncStdout === copiedWorkspaceRoadmapSecondRun.syncStdout,
  "copied workspace roadmap-sync output stays stable across repeated copied-fixture runs",
);
context.assert(
  copiedWorkspaceRoadmapFirstRun.syncedIndexText === copiedWorkspaceRoadmapSecondRun.syncedIndexText,
  "copied workspace roadmap-sync rewrites the same canonical roadmap index across repeated copied-fixture runs",
);
context.assert(
  copiedWorkspaceRoadmapFirstRun.syncedMilestoneText === copiedWorkspaceRoadmapSecondRun.syncedMilestoneText,
  "copied workspace roadmap-sync rewrites the same canonical milestone artifact across repeated copied-fixture runs",
);

context.section("[17c] copied real project split roadmap regression");

type CopiedSplitRoadmapWorkspace = {
  workspaceRoot: string;
  cleanup: () => void;
  milestonePath: string;
  splitActivePath: string;
  splitArchivedPath: string;
  inlineMaterializedPath: string;
  handoffChangeName: string;
};

function createCopiedSplitRoadmapWorkspace(): CopiedSplitRoadmapWorkspace {
  const workspace = createCopiedProjectWorkspace("todo-app");
  const { workspaceRoot } = workspace;
  const migrateResult = projectWorkspaceCli(workspaceRoot, ["migrate"]);
  context.assert(
    migrateResult.status === 0,
    "copied split roadmap regression: migrate succeeds before split-file setup",
    `stdout: ${migrateResult.stdout.trim()} stderr: ${migrateResult.stderr.trim()}`,
  );

  const strictRoadmapRoot = path.join(workspaceRoot, ".strict-spec-driven", "roadmap");
  const milestonePath = path.join(strictRoadmapRoot, "milestones", "0001-core-todo-workflows.yaml");
  writeStandalonePlannedChangeArtifact(workspaceRoot, "planned-changes/0001-core-todo-workflows-split-active.yaml", {
    id: "split-active",
    milestone: "0001-core-todo-workflows",
    status: "planned",
    summary: "Exercise active standalone planned-change regression coverage.",
    details: "Standalone copied-project details for split-active.",
    depends_on: [],
    team: {
      owner: "todo-owner",
      reviewers: ["todo-reviewer"],
      blocked: {
        status: false,
      },
      labels: ["copied-project", "roadmap"],
      external_refs: [
        {
          label: "Tracker",
          target: "https://example.com/todo/split-active",
        },
      ],
    },
  });
  writeStandalonePlannedChangeArtifact(workspaceRoot, "planned-changes/0001-core-todo-workflows-split-archived.yaml", {
    id: "split-archived",
    milestone: "0001-core-todo-workflows",
    status: "planned",
    summary: "Exercise archived standalone planned-change regression coverage.",
    details: "Standalone copied-project details for split-archived.",
    depends_on: ["split-active"],
  });

  mkdirSync(path.join(workspaceRoot, ".strict-spec-driven", "changes", "split-active"), { recursive: true });
  mkdirSync(
    path.join(workspaceRoot, ".strict-spec-driven", "changes", "archive", `${formatLocalDateStamp()}-split-archived`),
    { recursive: true },
  );

  return {
    workspaceRoot,
    cleanup: workspace.cleanup,
    milestonePath,
    splitActivePath: path.join(strictRoadmapRoot, "planned-changes", "0001-core-todo-workflows-split-active.yaml"),
    splitArchivedPath: path.join(strictRoadmapRoot, "planned-changes", "0001-core-todo-workflows-split-archived.yaml"),
    inlineMaterializedPath: path.join(strictRoadmapRoot, "planned-changes", "0001-core-todo-workflows-add-tag-filtering.yaml"),
    handoffChangeName: "copied-project-handoff",
  };
}

function runCopiedSplitRoadmapCliScenario(): {
  statusStdout: string;
  syncStdout: string;
  materializeStdout: string;
  invalidStatusStdout: string;
  syncedIndexText: string;
  materializedIndexText: string;
} {
  const workspace = createCopiedSplitRoadmapWorkspace();
  const {
    workspaceRoot,
    cleanup,
    milestonePath,
    splitActivePath,
    splitArchivedPath,
    inlineMaterializedPath,
  } = workspace;
  try {
    const splitStatus = projectWorkspaceCli(workspaceRoot, ["roadmap-status"]);
    const splitStatusStdout = splitStatus.stdout.trim();
    context.assert(
      splitStatus.status !== 0,
      "copied project split roadmap-status rejects legacy inline milestone data until explicit materialization",
      `stdout: ${splitStatusStdout} stderr: ${splitStatus.stderr.trim()}`,
    );
    const splitStatusJson = JSON.parse(splitStatusStdout);
    context.assert(
      splitStatusJson.valid === false
        && splitStatusJson.diagnostics.some(
          (diagnostic: { fieldPath: string; message: string }) =>
            diagnostic.fieldPath === "$.planned_changes"
            && diagnostic.message.includes("roadmap-sync --materialize-planned-changes"),
        ),
      "copied project split roadmap-status reports the explicit materialization command for inline roadmap data",
    );

    const splitSync = projectWorkspaceCli(workspaceRoot, ["roadmap-sync"]);
    const splitSyncStdout = splitSync.stdout.trim();
    context.assert(
      splitSync.status !== 0,
      "copied project split roadmap-sync rejects inline milestone data without explicit materialization",
      `stdout: ${splitSyncStdout} stderr: ${splitSync.stderr.trim()}`,
    );
    const splitSyncJson = JSON.parse(splitSyncStdout);
    context.assert(
      splitSyncJson.valid === false
        && splitSyncJson.updatedFiles.length === 0
        && splitSyncJson.diagnostics.some(
          (diagnostic: { fieldPath: string; message: string }) =>
            diagnostic.fieldPath === "$.planned_changes"
            && diagnostic.message.includes("roadmap-sync --materialize-planned-changes"),
        ),
      "copied project split roadmap-sync blocks rewrites and surfaces the materialization command",
      `updatedFiles: ${JSON.stringify(splitSyncJson.updatedFiles)}`,
    );

    const syncedIndexPath = path.join(workspaceRoot, ".strict-spec-driven", "roadmap", "INDEX.yaml");
    const syncedIndexText = readFileSync(syncedIndexPath, "utf8");
    const syncedIndex = yamlModule.parseYamlFile<{
      milestones: Record<string, { title: string; path: string; status: string }>;
    }>(syncedIndexPath);
    context.assert(
      Object.keys(syncedIndex.milestones).join(",") === "0001-core-todo-workflows"
        && syncedIndex.milestones["0001-core-todo-workflows"]?.path === "roadmap/milestones/0001-core-todo-workflows.yaml"
        && syncedIndex.milestones["0001-core-todo-workflows"]?.status === "proposed",
      "copied project split roadmap-sync keeps the shared index as a milestone-only index",
    );

    const syncedMilestone = yamlModule.parseYamlFile<{
      status: string;
      planned_changes: Record<string, { status: string }>;
    }>(milestonePath);
    context.assert(
      syncedMilestone.status === "proposed"
        && Object.keys(syncedMilestone.planned_changes).join(",") === "add-due-dates,add-tag-filtering",
      "copied project split roadmap-sync leaves the milestone file unchanged while inline legacy data blocks reconciliation",
    );

    const syncedArchived = yamlModule.parseYamlFile<{
      status: string;
      planned_change: { id: string; milestone: string };
    }>(splitArchivedPath);
    context.assert(
      syncedArchived.status === "planned"
        && syncedArchived.planned_change.id === "split-archived"
        && syncedArchived.planned_change.milestone === "0001-core-todo-workflows",
      "copied project split roadmap-sync leaves standalone planned-change status unchanged while inline legacy data blocks reconciliation",
    );

    const syncedTeam = yamlModule.parseYamlFile<{
      team: {
        owner: string;
        reviewers: string[];
        blocked: { status: boolean };
        labels: string[];
        external_refs: Array<{ label: string; target: string }>;
      };
    }>(splitActivePath);
    context.assert(
      syncedTeam.team.owner === "todo-owner"
        && syncedTeam.team.reviewers.join(",") === "todo-reviewer"
        && syncedTeam.team.blocked.status === false
        && syncedTeam.team.labels.join(",") === "copied-project,roadmap"
        && syncedTeam.team.external_refs[0]?.target === "https://example.com/todo/split-active",
      "copied project split roadmap-sync preserves standalone team metadata",
    );

    const materialize = projectWorkspaceCli(workspaceRoot, ["roadmap-sync", "--materialize-planned-changes"]);
    const materializeStdout = materialize.stdout.trim();
    context.assert(
      materialize.status === 0,
      "copied project split roadmap-sync materializes inline planned changes with explicit flag",
      `stdout: ${materializeStdout} stderr: ${materialize.stderr.trim()}`,
    );
    const materializeJson = JSON.parse(materializeStdout);
    context.assert(
      materializeJson.updatedFiles.includes(".strict-spec-driven/roadmap/planned-changes/0001-core-todo-workflows-add-due-dates.yaml")
        && materializeJson.updatedFiles.includes(".strict-spec-driven/roadmap/planned-changes/0001-core-todo-workflows-add-tag-filtering.yaml")
        && materializeJson.updatedFiles.includes(".strict-spec-driven/roadmap/milestones/0001-core-todo-workflows.yaml"),
      "copied project split roadmap-sync reports materialized planned-change files and rewritten milestone",
      `updatedFiles: ${JSON.stringify(materializeJson.updatedFiles)}`,
    );

    const materializedMilestone = yamlModule.parseYamlFile<{
      status: string;
      planned_changes: Record<string, unknown>;
    }>(milestonePath);
    context.assert(
      materializedMilestone.status === "active" && Object.keys(materializedMilestone.planned_changes).length === 0,
      "copied project split roadmap materialization removes converted inline planned changes from the milestone and reconciles milestone status",
    );
    const materializedInline = yamlModule.parseYamlFile<{
      status: string;
      summary: string;
      details: string;
      depends_on: string[];
      planned_change: { id: string; milestone: string };
    }>(inlineMaterializedPath);
    context.assert(
      materializedInline.planned_change.id === "add-tag-filtering"
        && materializedInline.planned_change.milestone === "0001-core-todo-workflows"
        && materializedInline.status === "planned"
        && materializedInline.summary.includes("filtered by one or more tags")
        && materializedInline.details.length > 0
        && materializedInline.depends_on.length === 0,
      "copied project split roadmap materialization preserves inline planned-change metadata",
    );

    const materializedIndexText = readFileSync(syncedIndexPath, "utf8");
    const materializedIndex = yamlModule.parseYamlFile<{
      milestones: Record<string, { title: string; path: string; status: string }>;
    }>(syncedIndexPath);
    context.assert(
      Object.keys(materializedIndex.milestones).join(",") === "0001-core-todo-workflows"
        && !("planned_changes" in materializedIndex),
      "copied project split roadmap materialization keeps planned-change files out of the shared index",
    );

    const materializedStatus = projectWorkspaceCli(workspaceRoot, ["roadmap-status"]);
    const materializedStatusStdout = materializedStatus.stdout.trim();
    context.assert(
      materializedStatus.status === 0,
      "copied project split roadmap-status accepts the roadmap after explicit materialization",
      `stdout: ${materializedStatusStdout} stderr: ${materializedStatus.stderr.trim()}`,
    );
    const materializedStatusJson = JSON.parse(materializedStatusStdout);
    const splitIds = materializedStatusJson.milestones[0].plannedChanges.map((entry: { id: string }) => entry.id);
    context.assert(
      splitIds.join(",") === "add-due-dates,add-tag-filtering,split-active,split-archived",
      "copied project split roadmap-status preserves deterministic ordering after explicit materialization",
      `got ${splitIds.join(",")}`,
    );
    context.assert(
      materializedStatusJson.milestones[0].plannedChanges[0]?.state === "active"
        && materializedStatusJson.milestones[0].plannedChanges[1]?.state === "missing"
        && materializedStatusJson.milestones[0].plannedChanges[2]?.state === "active"
        && materializedStatusJson.milestones[0].plannedChanges[3]?.state === "archived",
      "copied project split roadmap-status derives materialized and standalone planned-change states after conversion",
    );
    context.assert(
      materializedStatusJson.milestones[0].plannedChanges[0]?.path === "roadmap/planned-changes/0001-core-todo-workflows-add-due-dates.yaml"
        && materializedStatusJson.milestones[0].plannedChanges[2]?.path === "roadmap/planned-changes/0001-core-todo-workflows-split-active.yaml",
      "copied project split roadmap-status reports planned-change paths after conversion",
    );

    writeStandalonePlannedChangeArtifact(workspaceRoot, "planned-changes/9999-duplicate-split-active.yaml", {
      id: "split-active",
      milestone: "0001-core-todo-workflows",
      status: "planned",
      summary: "Duplicate copied-project planned change.",
      details: "Duplicate copied-project split active details.",
      depends_on: [],
    });
    const invalidStatus = projectWorkspaceCli(workspaceRoot, ["roadmap-status"]);
    const invalidStatusStdout = invalidStatus.stdout.trim();
    context.assert(
      invalidStatus.status !== 0,
      "copied project split roadmap-status rejects duplicate standalone active planned-change conflict",
      `stdout: ${invalidStatusStdout} stderr: ${invalidStatus.stderr.trim()}`,
    );
    const invalidStatusJson = JSON.parse(invalidStatusStdout);
    const invalidMessages = invalidStatusJson.diagnostics.map((diagnostic: { message: string }) => diagnostic.message);
    context.assert(
      invalidMessages.some((message: string) => message.includes("duplicate planned change id across roadmap planned-change sources"))
        && invalidMessages.some((message: string) => message.includes("conflicts with active strict change state")),
      "copied project split roadmap-status reports duplicate identity and active conflict diagnostics",
    );

    return {
      statusStdout: materializedStatusStdout,
      syncStdout: splitSyncStdout,
      materializeStdout,
      invalidStatusStdout,
      syncedIndexText,
      materializedIndexText,
    };
  } finally {
    cleanup();
    context.assert(!existsSync(workspaceRoot), "copied project split roadmap cleanup removes temp workspace");
  }
}

const copiedSplitRoadmapFirstRun = runCopiedSplitRoadmapCliScenario();
const copiedSplitRoadmapSecondRun = runCopiedSplitRoadmapCliScenario();
context.assert(
  copiedSplitRoadmapFirstRun.statusStdout === copiedSplitRoadmapSecondRun.statusStdout,
  "copied project split roadmap-status output stays deterministic across repeated copied-fixture runs",
);
context.assert(
  copiedSplitRoadmapFirstRun.syncStdout === copiedSplitRoadmapSecondRun.syncStdout,
  "copied project split roadmap-sync output stays deterministic across repeated copied-fixture runs",
);
context.assert(
  copiedSplitRoadmapFirstRun.materializeStdout === copiedSplitRoadmapSecondRun.materializeStdout,
  "copied project split roadmap materialization output stays deterministic across repeated copied-fixture runs",
);
context.assert(
  copiedSplitRoadmapFirstRun.invalidStatusStdout === copiedSplitRoadmapSecondRun.invalidStatusStdout,
  "copied project split roadmap conflict diagnostics stay deterministic across repeated copied-fixture runs",
);
context.assert(
  copiedSplitRoadmapFirstRun.syncedIndexText === copiedSplitRoadmapSecondRun.syncedIndexText
    && copiedSplitRoadmapFirstRun.materializedIndexText === copiedSplitRoadmapSecondRun.materializedIndexText,
  "copied project split roadmap shared index output stays deterministic across repeated copied-fixture runs",
);

function runCopiedSplitRoadmapHandoffScenario(): {
  statusBeforeHandoffStdout: string;
  generatedProposalText: string;
  statusAfterHandoffStdout: string;
} {
  const workspace = createCopiedSplitRoadmapWorkspace();
  const { workspaceRoot, cleanup, handoffChangeName } = workspace;
  try {
    const materialize = projectWorkspaceCli(workspaceRoot, ["roadmap-sync", "--materialize-planned-changes"]);
    context.assert(
      materialize.status === 0,
      "copied project handoff materializes legacy inline roadmap data before standalone handoff coverage",
      `stdout: ${materialize.stdout.trim()} stderr: ${materialize.stderr.trim()}`,
    );
    for (const preexistingActiveChange of ["add-due-dates", "split-active"]) {
      const cancelPreexisting = projectWorkspaceCli(workspaceRoot, ["cancel", preexistingActiveChange]);
      context.assert(
        cancelPreexisting.status === 0,
        `copied project handoff cancels pre-existing active change '${preexistingActiveChange}' so the single-active rule allows handoff propose`,
        `stderr: ${cancelPreexisting.stderr.trim()}`,
      );
    }
    writeStandalonePlannedChangeArtifact(workspaceRoot, "planned-changes/0001-core-todo-workflows-copied-project-handoff.yaml", {
      id: handoffChangeName,
      milestone: "0001-core-todo-workflows",
      status: "planned",
      summary: "Exercise copied-project roadmap proposal handoff.",
      details: "Use standalone copied-project planned-change details as targeted handoff context.",
      depends_on: ["split-archived"],
      team: {
        owner: "handoff-owner",
        reviewers: ["handoff-reviewer"],
        blocked: {
          status: false,
        },
        labels: ["handoff"],
      },
    });

    const statusBeforeHandoff = projectWorkspaceCli(workspaceRoot, ["roadmap-status"]);
    const statusBeforeHandoffStdout = statusBeforeHandoff.stdout.trim();
    context.assert(
      statusBeforeHandoff.status === 0,
      "copied project handoff roadmap-status accepts eligible standalone planned change before scaffolding",
      `stdout: ${statusBeforeHandoffStdout} stderr: ${statusBeforeHandoff.stderr.trim()}`,
    );
    const statusBeforeHandoffJson = JSON.parse(statusBeforeHandoffStdout);
    const beforePlannedChanges = statusBeforeHandoffJson.milestones[0].plannedChanges as Array<{
      id: string;
      state: string;
      derivedStatus: string;
    }>;
    const handoffBefore = beforePlannedChanges.find((entry) => entry.id === handoffChangeName);
    const archivedDependencyBefore = beforePlannedChanges.find((entry) => entry.id === "split-archived");
    context.assert(
      handoffBefore?.state === "missing"
        && handoffBefore.derivedStatus === "planned"
        && archivedDependencyBefore?.state === "archived"
        && archivedDependencyBefore.derivedStatus === "complete",
      "copied project handoff candidate is missing while its standalone dependency is archived",
    );

    const proposeHandoff = projectWorkspaceCli(workspaceRoot, ["propose", handoffChangeName]);
    context.assert(
      proposeHandoff.status === 0,
      "copied project handoff scaffolds a normal strict change with the planned-change identity",
      `stdout: ${proposeHandoff.stdout.trim()} stderr: ${proposeHandoff.stderr.trim()}`,
    );
    const generateHandoffProposal = projectWorkspaceCli(workspaceRoot, [
      "generate",
      handoffChangeName,
      "proposal",
      "--what",
      "Exercise copied-project roadmap proposal handoff.",
      "--why",
      "The split-file roadmap workflow needs regression coverage that standalone planned-change context can enter the normal strict change lifecycle.",
      "--in",
      "Generate a normal strict proposal from one eligible standalone planned change.",
      "--out",
      "No extra roadmap source-of-truth behavior.",
      "--unchanged",
      "The roadmap planned-change artifact remains the canonical home for planned-change details and team metadata.",
      "--milestone",
      "0001-core-todo-workflows",
      "--planned-change",
      handoffChangeName,
    ]);
    context.assert(
      generateHandoffProposal.status === 0,
      "copied project handoff populates proposal with roadmap milestone and planned-change references",
      `stdout: ${generateHandoffProposal.stdout.trim()} stderr: ${generateHandoffProposal.stderr.trim()}`,
    );

    const generatedProposalPath = path.join(workspaceRoot, ".strict-spec-driven", "changes", handoffChangeName, "proposal.yaml");
    const generatedProposalText = readFileSync(generatedProposalPath, "utf8");
    const generatedProposal = yamlModule.parseYamlFile<{
      change: { id: string };
      roadmap: { milestone: string; planned_change: string };
      unchanged_behavior: string[];
    }>(generatedProposalPath);
    context.assert(
      generatedProposal.change.id === handoffChangeName
        && generatedProposal.roadmap.milestone === "0001-core-todo-workflows"
        && generatedProposal.roadmap.planned_change === handoffChangeName
        && generatedProposal.unchanged_behavior[0]?.includes("canonical home"),
      "copied project handoff proposal preserves planned-change identity and roadmap reference without copying full roadmap metadata",
    );

    const statusAfterHandoff = projectWorkspaceCli(workspaceRoot, ["roadmap-status"]);
    const statusAfterHandoffStdout = statusAfterHandoff.stdout.trim();
    context.assert(
      statusAfterHandoff.status === 0,
      "copied project handoff roadmap-status remains valid after scaffolded active strict change",
      `stdout: ${statusAfterHandoffStdout} stderr: ${statusAfterHandoff.stderr.trim()}`,
    );
    const statusAfterHandoffJson = JSON.parse(statusAfterHandoffStdout);
    const handoffAfter = statusAfterHandoffJson.milestones[0].plannedChanges.find(
      (entry: { id: string }) => entry.id === handoffChangeName,
    );
    context.assert(
      handoffAfter?.state === "active" && handoffAfter.derivedStatus === "planned",
      "copied project handoff roadmap-status exposes the active strict change claim after scaffolding",
    );

    return {
      statusBeforeHandoffStdout,
      generatedProposalText,
      statusAfterHandoffStdout,
    };
  } finally {
    cleanup();
    context.assert(!existsSync(workspaceRoot), "copied project handoff cleanup removes temp workspace");
  }
}

const copiedSplitHandoffFirstRun = runCopiedSplitRoadmapHandoffScenario();
const copiedSplitHandoffSecondRun = runCopiedSplitRoadmapHandoffScenario();
context.assert(
  copiedSplitHandoffFirstRun.statusBeforeHandoffStdout === copiedSplitHandoffSecondRun.statusBeforeHandoffStdout,
  "copied project handoff roadmap-status before scaffolding stays deterministic across repeated copied-fixture runs",
);
context.assert(
  copiedSplitHandoffFirstRun.generatedProposalText === copiedSplitHandoffSecondRun.generatedProposalText,
  "copied project handoff generated proposal stays deterministic across repeated copied-fixture runs",
);
context.assert(
  copiedSplitHandoffFirstRun.statusAfterHandoffStdout === copiedSplitHandoffSecondRun.statusAfterHandoffStdout,
  "copied project handoff roadmap-status after scaffolding stays deterministic across repeated copied-fixture runs",
);

context.section("[18] migrate command");

function writeLegacyMigrationFixture(rootDir: string, configContent?: string): void {
  mkdirSync(path.join(rootDir, ".spec-driven", "specs", "cli"), { recursive: true });
  mkdirSync(path.join(rootDir, ".spec-driven", "roadmap", "milestones"), { recursive: true });
  mkdirSync(path.join(rootDir, ".spec-driven", "changes"), { recursive: true });

  writeFileSync(
    path.join(rootDir, ".spec-driven", "config.yaml"),
    configContent
      ?? [
        "schema: spec-driven",
        "context: |",
        "  Demo project context for migrate tests.",
        "rules:",
        "  specs:",
        "    - Describe observable behavior only",
        "  change:",
        "    - Implement only what is in scope in proposal.md — if scope needs to expand, use /spec-driven-modify first, never expand silently",
        "    - Mark tasks [x] immediately upon completion — never batch at the end",
        "    - Every change must include test tasks (lint + unit tests at minimum)",
        "  code:",
        "    - Reuse existing helpers",
        "  test:",
        "    - Tests remain independent",
      ].join("\n") + "\n",
    "utf8",
  );
  writeFileSync(
    path.join(rootDir, ".spec-driven", "specs", "INDEX.md"),
    [
      "# Specs Index",
      "",
      "- [cli/foundation.md](cli/foundation.md) - CLI Foundation",
    ].join("\n") + "\n",
    "utf8",
  );
  writeFileSync(
    path.join(rootDir, ".spec-driven", "specs", "cli", "foundation.md"),
    [
      "---",
      "mapping:",
      "  implementation:",
      "    - src/example.ts",
      "  tests:",
      "    - test/example.test.ts",
      "---",
      "",
      "# CLI Foundation",
      "",
      "### Requirement: cli-example",
      "The system MUST preserve one migrated observable behavior.",
      "",
      "#### Scenario: first scenario",
      "- GIVEN one legacy precondition",
      "- WHEN one legacy action happens",
      "- THEN one observable result is available",
      "- AND the result remains reviewable",
      "",
      "#### Scenario: second scenario",
      "- GIVEN another legacy precondition",
      "- WHEN another legacy action happens",
      "- THEN another observable result is visible",
      "",
      "### Requirement: legacy-removed",
      "The system MUST expose one requirement that a delta later removes.",
      "",
      "#### Scenario: removable requirement",
      "- GIVEN the removable behavior exists",
      "- WHEN the behavior is inspected",
      "- THEN the requirement can later be removed by a delta",
    ].join("\n") + "\n",
    "utf8",
  );
  writeFileSync(
    path.join(rootDir, ".spec-driven", "roadmap", "INDEX.md"),
    [
      "# Roadmap Index",
      "",
      "## Milestones",
      "- [01-demo.md](milestones/01-demo.md) - 01 Demo Milestone - active",
    ].join("\n") + "\n",
    "utf8",
  );
  writeFileSync(
    path.join(rootDir, ".spec-driven", "roadmap", "milestones", "01-demo.md"),
    [
      "# 01 Demo Milestone",
      "",
      "## Goal",
      "Demonstrate roadmap migration for testing.",
      "",
      "## In Scope",
      "- Convert roadmap artifacts.",
      "",
      "## Out of Scope",
      "- Production readiness.",
      "",
      "## Done Criteria",
      "- Migration produces valid YAML.",
      "",
      "## Planned Changes",
      "- `demo-change` - Declared: complete - implement the demo migration change.",
      "",
      "## Dependencies",
      "- No dependencies.",
      "",
      "## Risks",
      "- None identified.",
      "",
      "## Status",
      "- Declared: active",
      "",
      "## Notes",
      "- Test fixture milestone.",
    ].join("\n") + "\n",
    "utf8",
  );

  function writeLegacyChangeFixture(
    relativeChangeDir: string,
    changeName: string,
    options: { archived: boolean },
  ): void {
    const changeDir = path.join(rootDir, relativeChangeDir);
    mkdirSync(path.join(changeDir, "specs", "cli"), { recursive: true });

    writeFileSync(
      path.join(changeDir, "proposal.md"),
      [
        `# ${changeName}`,
        "",
        "## What",
        "",
        `- ${options.archived ? "Archive" : "Continue"} one converted workflow behavior.`,
        "",
        "## Why",
        "",
        "- The migrated change artifacts must preserve planning context.",
        "",
        "## Scope",
        "",
        "In scope:",
        "",
        "- Preserve proposal summary fields.",
        "- Preserve scope and unchanged-behavior bullets.",
        "",
        "Out of scope:",
        "",
        "- Invent unrelated workflow behavior.",
        "",
        "## Unchanged Behavior",
        "",
        "Behaviors that must not change as a result of this change (leave blank if nothing is at risk):",
        "",
        "- Existing migrate preflight behavior remains unchanged.",
      ].join("\n") + "\n",
      "utf8",
    );

    writeFileSync(
      path.join(changeDir, "design.md"),
      [
        `# Design: ${changeName}`,
        "",
        "## Approach",
        "",
        "1. Parse the legacy artifact.",
        "- Preserve the canonical Markdown meaning.",
        "2. Write the strict YAML output.",
        "- Keep the output deterministic.",
        "",
        "## Key Decisions",
        "",
        "- Keep migration deterministic. Stable output makes migration reviewable.",
        "",
        "## Alternatives Considered",
        "",
        "- Rebuild the artifact manually. Rejected because migration should preserve the recorded workflow state automatically.",
      ].join("\n") + "\n",
      "utf8",
    );

    writeFileSync(
      path.join(changeDir, "tasks.md"),
      [
        `# Tasks: ${changeName}`,
        "",
        "## Implementation",
        options.archived
          ? "- [x] Preserve the archived workflow state."
          : "- [ ] Preserve the active workflow state.",
        "",
        "## Testing",
        "",
        "- [x] Run `bun run build` — build validation for migrated change behavior",
        options.archived
          ? "- [x] Run `bun test/run.ts` — unit tests for archived migration behavior"
          : "- [ ] Run `bun test/run.ts` — unit tests for active migration behavior",
        "",
        "## Verification",
        "",
        options.archived
          ? "- [x] Verify implementation matches proposal scope"
          : "- [ ] Verify implementation matches proposal scope",
      ].join("\n") + "\n",
      "utf8",
    );

    writeFileSync(
      path.join(changeDir, "questions.md"),
      options.archived
        ? [
            `# Questions: ${changeName}`,
            "",
            "## Open",
            "",
            "<!-- No open questions -->",
            "",
            "## Resolved",
            "",
            "- [x] Q: Should the archived migration preserve completed workflow state?",
            "  Context: Archived changes should remain distinguishable from active changes after migration.",
            "  A: Yes. Archived migrated changes keep completed tasks and resolved questions.",
          ].join("\n") + "\n"
        : [
            `# Questions: ${changeName}`,
            "",
            "## Open",
            "",
            "- [ ] Q: Should the active migration preserve open workflow questions?",
            "  Context: Active migrated changes may still carry unresolved planning state.",
            "",
            "## Resolved",
            "",
            "- [x] Q: Should the migrated active change preserve the chosen build command?",
            "  Context: Testing tasks need explicit commands after migration.",
            "  A: Yes. Preserve `bun run build` exactly.",
          ].join("\n") + "\n",
      "utf8",
    );

    writeFileSync(
      path.join(changeDir, "specs", "cli", "foundation.md"),
      [
        "---",
        "mapping:",
        "  implementation:",
        "    - src/migrate.ts",
        "  tests:",
        "    - test/run.ts",
        "---",
        "",
        "## ADDED Requirements",
        "",
        "### Requirement: delta-added",
        "The system MUST expose one converted delta addition.",
        "",
        "#### Scenario: added requirement migrates",
        "- GIVEN the delta converter runs",
        "- WHEN the added requirement is inspected",
        "- THEN the added requirement remains reviewable",
        "",
        "## MODIFIED Requirements",
        "",
        "### Requirement: cli-example",
        "Previously: The system MUST preserve one migrated observable behavior.",
        "The system MUST preserve one updated migrated observable behavior.",
        "",
        "#### Scenario: modified requirement migrates",
        "- GIVEN the delta converter runs",
        "- WHEN the modified requirement is inspected",
        "- THEN the replacement statement remains reviewable",
        "",
        "## REMOVED Requirements",
        "",
        "### Requirement: legacy-removed",
        "Reason: The legacy requirement was retired.",
      ].join("\n") + "\n",
      "utf8",
    );
  }

  writeLegacyChangeFixture(path.join(".spec-driven", "changes", "demo-change"), "demo-change", { archived: false });
  writeLegacyChangeFixture(
    path.join(".spec-driven", "changes", "archive", "2026-04-01-done-change"),
    "done-change",
    { archived: true },
  );
  writeLegacyChangeFixture(
    path.join(".spec-driven", "changes", "archive", "2026-04-02-empty-mapping-change"),
    "empty-mapping-change",
    { archived: true },
  );
  writeFileSync(
    path.join(
      rootDir,
      ".spec-driven",
      "changes",
      "archive",
      "2026-04-02-empty-mapping-change",
      "specs",
      "cli",
      "foundation.md",
    ),
    [
      "---",
      "mapping:",
      "  implementation:",
      "  tests:",
      "---",
      "",
      "## ADDED Requirements",
      "",
      "### Requirement: archived-empty-mapping-delta",
      "The system MUST preserve archived deltas that omit legacy mapping entries.",
      "",
      "#### Scenario: archived empty mapping migrates",
      "- GIVEN an archived legacy delta leaves implementation and test mappings blank",
      "- WHEN the delta is migrated to strict YAML",
      "- THEN the migrated mapping remains an empty structured collection",
    ].join("\n") + "\n",
    "utf8",
  );
}

function assertMigrationReportArrays(report: Record<string, unknown>, labelPrefix: string): void {
  context.assert(Array.isArray(report.converted), `${labelPrefix} report includes converted array`);
  context.assert(Array.isArray(report.skipped), `${labelPrefix} report includes skipped array`);
  context.assert(Array.isArray(report.warnings), `${labelPrefix} report includes warnings array`);
  context.assert(Array.isArray(report.errors), `${labelPrefix} report includes errors array`);
  context.assert(Array.isArray(report.manualFollowUp), `${labelPrefix} report includes manualFollowUp array`);
}

context.section("[18a] copied real project migrate flow");

const todoProjectConfigPath = path.join(todoProjectRoot, ".spec-driven", "config.yaml");
function runCopiedWorkspaceMigrateFlowScenario(): {
  migrateStatus: number;
  migrateStdout: string;
  strictConfigText: string;
  strictSpecText: string;
  strictProposalText: string;
  strictRoadmapIndexText: string;
  strictRoadmapMilestoneText: string;
} {
  const copiedWorkspaceMigrateFlow = createCopiedProjectWorkspace("todo-app");
  const { workspaceRoot } = copiedWorkspaceMigrateFlow;
  try {
    const copiedLegacyConfigBefore = readFileSync(
      path.join(workspaceRoot, ".spec-driven", "config.yaml"),
      "utf8",
    );
    const copiedLegacyRoadmapIndexBefore = readFileSync(
      path.join(workspaceRoot, ".spec-driven", "roadmap", "INDEX.md"),
      "utf8",
    );
    const baselineConfig = readFileSync(todoProjectConfigPath, "utf8");
    const baselineRoadmapIndex = readFileSync(todoProjectRoadmapIndexPath, "utf8");

    const copiedWorkspaceMigrate = projectWorkspaceCli(workspaceRoot, ["migrate"]);
    const copiedWorkspaceMigrateStdout = copiedWorkspaceMigrate.stdout.trim();
    context.assert(
      copiedWorkspaceMigrate.status === 0,
      "copied workspace migrate exits zero for the committed todo-project fixture",
      `stdout: ${copiedWorkspaceMigrateStdout} stderr: ${copiedWorkspaceMigrate.stderr.trim()}`,
    );
    const copiedWorkspaceMigrateJson = JSON.parse(copiedWorkspaceMigrateStdout);
    context.assert(copiedWorkspaceMigrateJson.valid === true, "copied workspace migrate reports valid=true");
    assertMigrationReportArrays(copiedWorkspaceMigrateJson, "copied fixture migrate");
    context.assert(
      copiedWorkspaceMigrateJson.skipped.length === 0
        && copiedWorkspaceMigrateJson.warnings.length === 0
        && copiedWorkspaceMigrateJson.errors.length === 0
        && copiedWorkspaceMigrateJson.manualFollowUp.length === 0,
      "copied workspace migrate completes without deferred artifacts for the todo-project fixture",
    );
    context.assert(
      copiedWorkspaceMigrateJson.converted.some(
        (artifact: { sourcePath?: string; targetPath: string; kind: string }) =>
          artifact.kind === "workflow_config"
          && artifact.sourcePath === ".spec-driven/config.yaml"
          && artifact.targetPath === ".strict-spec-driven/config.yaml",
      ),
      "copied workspace migrate reports converted workflow config output",
    );
    context.assert(
      copiedWorkspaceMigrateJson.converted.some(
        (artifact: { sourcePath?: string; targetPath: string; kind: string }) =>
          artifact.kind === "roadmap_index"
          && artifact.sourcePath === ".spec-driven/roadmap/INDEX.md"
          && artifact.targetPath === ".strict-spec-driven/roadmap/INDEX.yaml",
      ),
      "copied workspace migrate reports converted roadmap index output",
    );
    context.assert(
      copiedWorkspaceMigrateJson.converted.some(
        (artifact: { sourcePath?: string; targetPath: string; kind: string }) =>
          artifact.kind === "roadmap_milestone"
          && artifact.sourcePath === ".spec-driven/roadmap/milestones/01-core-todo-workflows.md"
          && artifact.targetPath === ".strict-spec-driven/roadmap/milestones/0001-core-todo-workflows.yaml",
      ),
      "copied workspace migrate reports converted roadmap milestone output",
    );
    context.assert(
      copiedWorkspaceMigrateJson.converted.some(
        (artifact: { sourcePath?: string; targetPath: string; kind: string }) =>
          artifact.kind === "main_spec"
          && artifact.sourcePath === ".spec-driven/specs/todo-management.md"
          && artifact.targetPath === ".strict-spec-driven/specs/todo-management.yaml",
      ),
      "copied workspace migrate reports converted main spec output",
    );
    context.assert(
      copiedWorkspaceMigrateJson.converted.some(
        (artifact: { sourcePath?: string; targetPath: string; kind: string }) =>
          artifact.kind === "change_proposal"
          && artifact.sourcePath === ".spec-driven/changes/add-due-dates/proposal.md"
          && artifact.targetPath === ".strict-spec-driven/changes/add-due-dates/proposal.yaml",
      ),
      "copied workspace migrate reports converted active change proposal output",
    );

    const copiedStrictConfigPath = path.join(workspaceRoot, ".strict-spec-driven", "config.yaml");
    const copiedStrictSpecPath = path.join(workspaceRoot, ".strict-spec-driven", "specs", "todo-management.yaml");
    const copiedStrictProposalPath = path.join(workspaceRoot, ".strict-spec-driven", "changes", "add-due-dates", "proposal.yaml");
    const copiedStrictRoadmapIndexPath = path.join(workspaceRoot, ".strict-spec-driven", "roadmap", "INDEX.yaml");
    const copiedStrictRoadmapMilestonePath = path.join(
      workspaceRoot,
      ".strict-spec-driven",
      "roadmap",
      "milestones",
      "0001-core-todo-workflows.yaml",
    );
    context.assert(
      existsSync(copiedStrictConfigPath)
        && existsSync(copiedStrictSpecPath)
        && existsSync(copiedStrictProposalPath)
        && existsSync(copiedStrictRoadmapMilestonePath),
      "copied workspace migrate writes strict config, spec, change, and roadmap artifacts into the temp workspace",
    );

    const copiedMigratedRoadmapMilestone = yamlModule.parseYamlFile<{
      milestone: Record<string, { title: string }>;
      planned_changes: Record<string, { status: string; summary: string; details: string; depends_on: string[] }>;
      status: string;
    }>(copiedStrictRoadmapMilestonePath);
    const migratedMilestoneKeys = Object.keys(copiedMigratedRoadmapMilestone.milestone);
    context.assert(
      migratedMilestoneKeys.length === 1
        && migratedMilestoneKeys[0] === "0001-core-todo-workflows"
        && copiedMigratedRoadmapMilestone.milestone["0001-core-todo-workflows"]?.title === "01 Core Todo Workflows",
      "copied workspace migrate preserves roadmap milestone identity in strict output",
    );
    const migratedChangeKeys = Object.keys(copiedMigratedRoadmapMilestone.planned_changes);
    context.assert(
      migratedChangeKeys.length === 2
        && copiedMigratedRoadmapMilestone.planned_changes["add-due-dates"]?.status === "planned",
      "copied workspace migrate preserves planned change entries from the todo-project roadmap",
    );
    context.assert(
      copiedMigratedRoadmapMilestone.status === "proposed",
      "copied workspace migrate preserves the legacy declared milestone status before roadmap-sync reconciliation",
    );

    context.assert(
      readFileSync(path.join(workspaceRoot, ".spec-driven", "config.yaml"), "utf8") === copiedLegacyConfigBefore
        && readFileSync(path.join(workspaceRoot, ".spec-driven", "roadmap", "INDEX.md"), "utf8")
          === copiedLegacyRoadmapIndexBefore,
      "copied workspace migrate leaves bootstrap config and roadmap inputs unchanged",
    );
    context.assert(
      readFileSync(todoProjectConfigPath, "utf8") === baselineConfig
        && readFileSync(todoProjectRoadmapIndexPath, "utf8") === baselineRoadmapIndex
        && !existsSync(path.join(todoProjectRoot, ".strict-spec-driven")),
      "committed todo-project fixture baseline stays unchanged after copied workspace migrate",
    );

    return {
      migrateStatus: copiedWorkspaceMigrate.status,
      migrateStdout: copiedWorkspaceMigrateStdout,
      strictConfigText: readFileSync(copiedStrictConfigPath, "utf8"),
      strictSpecText: readFileSync(copiedStrictSpecPath, "utf8"),
      strictProposalText: readFileSync(copiedStrictProposalPath, "utf8"),
      strictRoadmapIndexText: readFileSync(copiedStrictRoadmapIndexPath, "utf8"),
      strictRoadmapMilestoneText: readFileSync(copiedStrictRoadmapMilestonePath, "utf8"),
    };
  } finally {
    copiedWorkspaceMigrateFlow.cleanup();
    context.assert(
      !existsSync(workspaceRoot),
      "copied workspace cleanup removes migrate flow temp workspace",
    );
  }
}

const copiedWorkspaceMigrateFirstRun = runCopiedWorkspaceMigrateFlowScenario();
const copiedWorkspaceMigrateSecondRun = runCopiedWorkspaceMigrateFlowScenario();
context.assert(
  copiedWorkspaceMigrateFirstRun.migrateStatus === copiedWorkspaceMigrateSecondRun.migrateStatus
    && copiedWorkspaceMigrateFirstRun.migrateStdout === copiedWorkspaceMigrateSecondRun.migrateStdout,
  "copied workspace migrate output stays stable across repeated copied-fixture runs",
);
context.assert(
  copiedWorkspaceMigrateFirstRun.strictConfigText === copiedWorkspaceMigrateSecondRun.strictConfigText,
  "copied workspace migrate writes the same strict config across repeated copied-fixture runs",
);
context.assert(
  copiedWorkspaceMigrateFirstRun.strictSpecText === copiedWorkspaceMigrateSecondRun.strictSpecText,
  "copied workspace migrate writes the same strict main spec across repeated copied-fixture runs",
);
context.assert(
  copiedWorkspaceMigrateFirstRun.strictProposalText === copiedWorkspaceMigrateSecondRun.strictProposalText,
  "copied workspace migrate writes the same strict change proposal across repeated copied-fixture runs",
);
context.assert(
  copiedWorkspaceMigrateFirstRun.strictRoadmapIndexText === copiedWorkspaceMigrateSecondRun.strictRoadmapIndexText,
  "copied workspace migrate writes the same strict roadmap index across repeated copied-fixture runs",
);
context.assert(
  copiedWorkspaceMigrateFirstRun.strictRoadmapMilestoneText === copiedWorkspaceMigrateSecondRun.strictRoadmapMilestoneText,
  "copied workspace migrate writes the same strict roadmap milestone across repeated copied-fixture runs",
);

const migrateHappyDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-migrate-happy-"));
try {
  writeLegacyMigrationFixture(migrateHappyDir);
  const legacyConfigBefore = readFileSync(path.join(migrateHappyDir, ".spec-driven", "config.yaml"), "utf8");

  const migrateHappy = cli(["migrate"], { cwd: migrateHappyDir });
  context.assert(migrateHappy.status === 0, "migrate exits zero for valid bootstrap state");
  const migrateHappyJson = JSON.parse(migrateHappy.stdout.trim());
  context.assert(migrateHappyJson.valid === true, "migrate reports valid=true on successful migration");
  assertMigrationReportArrays(migrateHappyJson, "successful migrate");
  context.assert(
    migrateHappyJson.converted.some(
      (artifact: { sourcePath?: string; targetPath: string }) =>
        artifact.sourcePath === ".spec-driven/config.yaml" && artifact.targetPath === ".strict-spec-driven/config.yaml",
    ),
    "migrate reports converted strict config output",
  );
  context.assert(
    migrateHappyJson.converted.some(
      (artifact: { sourcePath?: string; targetPath: string; kind: string }) =>
        artifact.kind === "main_spec"
        && artifact.sourcePath === ".spec-driven/specs/cli/foundation.md"
        && artifact.targetPath === ".strict-spec-driven/specs/cli/foundation.yaml",
    ),
    "migrate reports converted main spec output",
  );
  context.assert(
    migrateHappyJson.converted.some(
      (artifact: { sourcePath?: string; targetPath: string; kind: string }) =>
        artifact.kind === "change_proposal"
        && artifact.sourcePath === ".spec-driven/changes/demo-change/proposal.md"
        && artifact.targetPath === ".strict-spec-driven/changes/demo-change/proposal.yaml",
    ),
    "migrate reports converted active change proposal output",
  );
  context.assert(
    migrateHappyJson.converted.some(
      (artifact: { sourcePath?: string; targetPath: string; kind: string }) =>
        artifact.kind === "delta_spec"
        && artifact.sourcePath === ".spec-driven/changes/demo-change/specs/cli/foundation.md"
        && artifact.targetPath === ".strict-spec-driven/changes/demo-change/specs/cli/foundation.yaml",
    ),
    "migrate reports converted active change delta output",
  );
  context.assert(
    migrateHappyJson.converted.some(
      (artifact: { sourcePath?: string; targetPath: string; kind: string }) =>
        artifact.kind === "change_proposal"
        && artifact.sourcePath === ".spec-driven/changes/archive/2026-04-01-done-change/proposal.md"
        && artifact.targetPath === ".strict-spec-driven/changes/archive/2026-04-01-done-change/proposal.yaml",
    ),
    "migrate reports converted archived change proposal output",
  );
  context.assert(
    migrateHappyJson.converted.some(
      (artifact: { targetPath: string }) => artifact.targetPath === ".strict-spec-driven/specs/INDEX.yaml",
    ),
    "migrate still reports initialized strict scaffold assets",
  );
  context.assert(
    migrateHappyJson.converted.some(
      (artifact: { sourcePath?: string; kind: string }) =>
        artifact.kind === "spec_index" && artifact.sourcePath === ".spec-driven/specs/INDEX.md",
    ),
    "migrate converts legacy specs index into strict spec_index artifact",
  );
  context.assert(
    migrateHappyJson.converted.some(
      (artifact: { sourcePath?: string; kind: string }) =>
        artifact.kind === "roadmap_index" && artifact.sourcePath === ".spec-driven/roadmap/INDEX.md",
    ),
    "migrate converts legacy roadmap index into strict roadmap_index artifact",
  );
  context.assert(
    migrateHappyJson.converted.some(
      (artifact: { sourcePath?: string; kind: string }) =>
        artifact.kind === "roadmap_milestone"
        && artifact.sourcePath === ".spec-driven/roadmap/milestones/01-demo.md",
    ),
    "migrate converts legacy roadmap milestone into strict roadmap_milestone artifact",
  );
  context.assert(
    !migrateHappyJson.warnings.some((diagnostic: { code: string }) => diagnostic.code === "multiple_active_changes")
      && !migrateHappyJson.manualFollowUp.some(
        (entry: { reason: string }) => entry.reason.includes("only one active change"),
      ),
    "migrate emits no multiple-active-change warning when conversion yields a single active change",
  );

  const migratedConfig = yamlModule.parseYamlFile<{
    schema: string;
    artifact_type: string;
    context: string;
    rules: Record<string, unknown>;
  }>(path.join(migrateHappyDir, ".strict-spec-driven", "config.yaml"));
  context.assert(
    migratedConfig.schema === "strict-spec-driven/config/v1"
      && migratedConfig.artifact_type === "workflow_config",
    "migrate writes strict workflow config metadata",
  );
  context.assert(
    migratedConfig.context.includes("Demo project context for migrate tests."),
    "migrate preserves legacy config context in strict output",
  );
  const migratedChangeRules = Array.isArray(migratedConfig.rules.change)
    ? migratedConfig.rules.change.filter((entry): entry is string => typeof entry === "string")
    : [];
  context.assert(
    migratedChangeRules.some((rule) => rule.includes("proposal.yaml") && rule.includes("strict-spec-modify")),
    "migrate normalizes legacy Markdown proposal and modify references in strict config rules",
  );
  context.assert(
    migratedChangeRules.some((rule) => rule.includes("Mark tasks done immediately upon completion")),
    "migrate normalizes legacy checkbox wording in strict config rules",
  );
  context.assert(
    migratedChangeRules.some((rule) => rule.includes("validation + unit tests")),
    "migrate normalizes legacy lint wording in strict config rules",
  );
  const migratedMainSpec = yamlModule.parseYamlFile<{
    schema: string;
    artifact_type: string;
    spec: { id: string; title: string };
    mapping: { implementation: string[]; tests: string[] };
    requirements: Array<{
      id: string;
      statement: string;
      scenarios: Array<{ id: string; steps: Array<{ kind: string; text: string }> }>;
    }>;
  }>(path.join(migrateHappyDir, ".strict-spec-driven", "specs", "cli", "foundation.yaml"));
  context.assert(
    migratedMainSpec.schema === "strict-spec-driven/main-spec/v1"
      && migratedMainSpec.artifact_type === "main_spec",
    "migrate writes strict YAML main spec output",
  );
  context.assert(
    migratedMainSpec.spec.id === "cli-foundation" && migratedMainSpec.spec.title === "CLI Foundation",
    "migrate derives strict main spec identity from legacy spec path and heading",
  );
  context.assert(
    JSON.stringify(migratedMainSpec.mapping) === JSON.stringify({
      implementation: ["src/example.ts"],
      tests: ["test/example.test.ts"],
    }),
    "migrate preserves legacy main spec mappings",
    `got ${JSON.stringify(migratedMainSpec.mapping)}`,
  );
  context.assert(
    JSON.stringify(Object.keys(migratedMainSpec.requirements["cli-example"]?.scenarios ?? {}))
      === JSON.stringify(["first-scenario", "second-scenario"]),
    "migrate derives deterministic scenario identifiers for migrated main specs",
  );
  context.assert(
    "GIVEN" in (Object.values(migratedMainSpec.requirements["cli-example"]?.scenarios ?? {})[0]?.[0] ?? {}),
    "migrate preserves scenario step ordering for migrated main specs",
  );

  const migratedSpecIndex = yamlModule.parseYamlFile<{
    specs: Array<{ id: string; path: string }>;
  }>(path.join(migrateHappyDir, ".strict-spec-driven", "specs", "INDEX.yaml"));
  context.assert(
    migratedSpecIndex.specs.some(
      (entry) =>
        entry.id === "cli-foundation"
        && entry.path === ".strict-spec-driven/specs/cli/foundation.yaml",
    ),
    "migrate regenerates strict spec index entries from converted main specs",
  );

  const migratedActiveProposal = yamlModule.parseYamlFile<{
    change: { id: string; status: string };
    summary: { what: string[]; why: string[] };
  }>(path.join(migrateHappyDir, ".strict-spec-driven", "changes", "demo-change", "proposal.yaml"));
  context.assert(
    migratedActiveProposal.change.id === "demo-change" && migratedActiveProposal.change.status === "active",
    "migrate converts active proposal status and change identity",
  );
  context.assert(
    migratedActiveProposal.summary.what.length === 1 && migratedActiveProposal.summary.why.length === 1,
    "migrate preserves proposal summary lists",
  );

  const migratedActiveTasks = yamlModule.parseYamlFile<{
    sections: Record<string, Record<string, { status: string; command?: string }>>;
    testing_gates: { validation_task: string; unit_test_task: string };
  }>(path.join(migrateHappyDir, ".strict-spec-driven", "changes", "demo-change", "tasks.yaml"));
  context.assert(
    migratedActiveTasks.sections["Implementation"]?.["implementation-1"]?.status === "pending",
    "migrate preserves pending active implementation task state",
  );
  context.assert(
    migratedActiveTasks.sections["Testing"]?.["testing-1"]?.command === "bun run build",
    "migrate preserves explicit build command in migrated testing tasks",
  );
  context.assert(
    migratedActiveTasks.sections["Testing"]?.["testing-2"]?.command === "bun test/run.ts",
    "migrate preserves explicit unit test command in migrated testing tasks",
  );
  context.assert(
    migratedActiveTasks.testing_gates.validation_task === "testing-1"
      && migratedActiveTasks.testing_gates.unit_test_task === "testing-2",
    "migrate derives deterministic testing gate task references",
  );

  const migratedActiveQuestions = yamlModule.parseYamlFile<{
    open: Array<{ question: string; status: string }>;
    resolved: Array<{ question: string; answer: string; status: string }>;
  }>(path.join(migrateHappyDir, ".strict-spec-driven", "changes", "demo-change", "questions.yaml"));
  context.assert(
    migratedActiveQuestions.open.length === 1
      && migratedActiveQuestions.open[0]?.status === "open"
      && migratedActiveQuestions.resolved.length === 1
      && migratedActiveQuestions.resolved[0]?.status === "resolved",
    "migrate preserves open and resolved question state for active changes",
  );

  const migratedActiveDelta = yamlModule.parseYamlFile<{
    target_spec: string;
    mapping: { implementation: string[]; tests: string[] };
    operations: {
      ADDED: Record<string, { strength: string; statement: string; scenarios: Record<string, unknown[]> }>;
      MODIFIED: Record<string, { strength: string; statement: string; scenarios: Record<string, unknown[]> }>;
      REMOVED: Record<string, { reason: string }>;
    };
  }>(path.join(migrateHappyDir, ".strict-spec-driven", "changes", "demo-change", "specs", "cli", "foundation.yaml"));
  context.assert(
    migratedActiveDelta.target_spec === "cli-foundation",
    "migrate derives migrated delta target_spec from legacy delta path",
  );
  context.assert(
    JSON.stringify(migratedActiveDelta.mapping) === JSON.stringify({
      implementation: ["src/migrate.ts"],
      tests: ["test/run.ts"],
    }),
    "migrate preserves legacy delta spec mappings",
  );
  context.assert(
    "delta-added" in migratedActiveDelta.operations.ADDED,
    "migrate preserves ADDED delta requirement identity as keyed-map entry",
  );
  context.assert(
    "cli-example" in migratedActiveDelta.operations.MODIFIED,
    "migrate preserves MODIFIED delta target requirement identity as keyed-map key",
  );
  context.assert(
    migratedActiveDelta.operations.REMOVED["legacy-removed"]?.reason === "The legacy requirement was retired.",
    "migrate preserves REMOVED delta reason text as keyed-map value",
  );

  const migratedArchivedProposal = yamlModule.parseYamlFile<{
    change: { id: string; status: string };
  }>(path.join(
    migrateHappyDir,
    ".strict-spec-driven",
    "changes",
    "archive",
    "2026-04-01-done-change",
    "proposal.yaml",
  ));
  context.assert(
    migratedArchivedProposal.change.id === "done-change"
      && migratedArchivedProposal.change.status === "complete",
    "migrate preserves archived change identity while marking archived proposals complete",
  );

  const migratedArchivedTasks = yamlModule.parseYamlFile<{
    sections: Record<string, Record<string, { status: string }>>;
  }>(path.join(
    migrateHappyDir,
    ".strict-spec-driven",
    "changes",
    "archive",
    "2026-04-01-done-change",
    "tasks.yaml",
  ));
  context.assert(
    Object.values(migratedArchivedTasks.sections["Implementation"] ?? {})[0]?.status === "complete",
    "migrate preserves completed archived task state",
  );

  const migratedArchivedQuestions = yamlModule.parseYamlFile<{
    open: unknown[];
    resolved: Array<{ answer: string; status: string }>;
  }>(path.join(
    migrateHappyDir,
    ".strict-spec-driven",
    "changes",
    "archive",
    "2026-04-01-done-change",
    "questions.yaml",
  ));
  context.assert(
    migratedArchivedQuestions.open.length === 0
      && migratedArchivedQuestions.resolved.length === 1
      && migratedArchivedQuestions.resolved[0]?.status === "resolved",
    "migrate preserves archived resolved-question state without inventing open questions",
  );

  const migratedArchivedDelta = yamlModule.parseYamlFile<{
    target_spec: string;
  }>(path.join(
    migrateHappyDir,
    ".strict-spec-driven",
    "changes",
    "archive",
    "2026-04-01-done-change",
    "specs",
    "cli",
    "foundation.yaml",
  ));
  context.assert(
    migratedArchivedDelta.target_spec === "cli-foundation",
    "migrate preserves archive-date directories while converting archived delta specs",
  );
  const migratedArchivedEmptyMappingDelta = yamlModule.parseYamlFile<{
    target_spec: string;
    mapping: { implementation: string[]; tests: string[] };
  }>(path.join(
    migrateHappyDir,
    ".strict-spec-driven",
    "changes",
    "archive",
    "2026-04-02-empty-mapping-change",
    "specs",
    "cli",
    "foundation.yaml",
  ));
  context.assert(
    migratedArchivedEmptyMappingDelta.target_spec === "cli-foundation",
    "migrate preserves archived delta target spec when legacy mapping fields are blank",
  );
  context.assert(
    JSON.stringify(migratedArchivedEmptyMappingDelta.mapping) === JSON.stringify({
      implementation: [],
      tests: [],
    }),
    "migrate normalizes blank legacy mapping fields to empty arrays",
    `got ${JSON.stringify(migratedArchivedEmptyMappingDelta.mapping)}`,
  );
  context.assert(
    readFileSync(path.join(migrateHappyDir, ".spec-driven", "config.yaml"), "utf8") === legacyConfigBefore,
    "migrate leaves legacy bootstrap config unchanged",
  );

  const migratedRoadmapIndex = yamlModule.parseYamlFile<{
    schema: string;
    artifact_type: string;
    milestones: Record<string, { title: string; path: string; status: string }>;
  }>(path.join(migrateHappyDir, ".strict-spec-driven", "roadmap", "INDEX.yaml"));
  context.assert(
    migratedRoadmapIndex.schema === "strict-spec-driven/roadmap-index/v2"
      && migratedRoadmapIndex.artifact_type === "roadmap_index",
    "migrate writes strict YAML roadmap index output",
  );
  const migratedIndexEntries = Object.entries(migratedRoadmapIndex.milestones);
  context.assert(
    migratedIndexEntries.length === 1
      && migratedIndexEntries[0]?.[0] === "0001-demo"
      && migratedIndexEntries[0]?.[1].status === "active"
      && migratedIndexEntries[0]?.[1].path === "roadmap/milestones/0001-demo.yaml",
    "migrate preserves roadmap index milestone identity and status",
  );

  const migratedRoadmapMilestone = yamlModule.parseYamlFile<{
    schema: string;
    artifact_type: string;
    milestone: Record<string, { title: string }>;
    goal: string;
    scope: { in: string[]; out: string[] };
    done_criteria: string[];
    planned_changes: Record<string, { status: string; summary: string; details: string; depends_on: string[] }>;
    status: string;
    notes: string[];
  }>(path.join(migrateHappyDir, ".strict-spec-driven", "roadmap", "milestones", "0001-demo.yaml"));
  context.assert(
    migratedRoadmapMilestone.schema === "strict-spec-driven/roadmap-milestone/v2"
      && migratedRoadmapMilestone.artifact_type === "roadmap_milestone",
    "migrate writes strict YAML roadmap milestone output",
  );
  const migratedMilestoneKeys = Object.keys(migratedRoadmapMilestone.milestone);
  context.assert(
    migratedMilestoneKeys.length === 1
      && migratedMilestoneKeys[0] === "0001-demo"
      && migratedRoadmapMilestone.milestone["0001-demo"]?.title === "01 Demo Milestone",
    "migrate derives roadmap milestone identity from filename and heading",
  );
  context.assert(
    migratedRoadmapMilestone.goal.includes("roadmap migration"),
    "migrate preserves roadmap milestone goal text",
  );
  context.assert(
    migratedRoadmapMilestone.scope.in.length === 1 && migratedRoadmapMilestone.scope.out.length === 1,
    "migrate preserves roadmap milestone scope sections",
  );
  context.assert(
    Object.keys(migratedRoadmapMilestone.planned_changes).length === 1
      && migratedRoadmapMilestone.planned_changes["demo-change"]?.status === "complete",
    "migrate preserves planned change entry fields including status",
  );
  context.assert(migratedRoadmapMilestone.status === "active", "migrate preserves roadmap milestone declared status");
  context.assert(migratedRoadmapMilestone.notes.length === 1, "migrate preserves roadmap milestone notes");
  const migratedRoadmapStatus = cli(["roadmap-status"], { cwd: migrateHappyDir });
  context.assert(migratedRoadmapStatus.status !== 0, "roadmap-status rejects migrated inline roadmap state until explicit materialization");
  const migratedRoadmapStatusJson = JSON.parse(migratedRoadmapStatus.stdout.trim());
  context.assert(
    migratedRoadmapStatusJson.valid === false
      && migratedRoadmapStatusJson.diagnostics.some(
        (diagnostic: { fieldPath: string; message: string }) =>
          diagnostic.fieldPath === "$.planned_changes"
          && diagnostic.message.includes("roadmap-sync --materialize-planned-changes"),
      ),
    "roadmap-status reports the explicit materialization command for migrated inline roadmap state",
  );
  const materializedMigratedRoadmap = cli(["roadmap-sync", "--materialize-planned-changes"], { cwd: migrateHappyDir });
  context.assert(materializedMigratedRoadmap.status === 0, "roadmap-sync materializes migrated roadmap inline planned changes");
} finally {
  rmSync(migrateHappyDir, { recursive: true, force: true });
}

const migrateMultiActiveDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-migrate-multi-active-"));
try {
  writeLegacyMigrationFixture(migrateMultiActiveDir);
  cpSync(
    path.join(migrateMultiActiveDir, ".spec-driven", "changes", "demo-change"),
    path.join(migrateMultiActiveDir, ".spec-driven", "changes", "second-demo-change"),
    { recursive: true },
  );

  const migrateMultiActive = cli(["migrate"], { cwd: migrateMultiActiveDir });
  context.assert(
    migrateMultiActive.status === 0,
    "migrate exits zero when legacy state contains multiple active changes",
    `stderr: ${migrateMultiActive.stderr.trim()}`,
  );
  const migrateMultiActiveJson = JSON.parse(migrateMultiActive.stdout.trim());
  context.assert(migrateMultiActiveJson.valid === true, "multi-active migrate reports valid=true");
  for (const convertedActiveChange of ["demo-change", "second-demo-change"]) {
    context.assert(
      migrateMultiActiveJson.converted.some(
        (artifact: { targetPath: string; kind: string }) =>
          artifact.kind === "change_proposal"
          && artifact.targetPath === `.strict-spec-driven/changes/${convertedActiveChange}/proposal.yaml`,
      ),
      `multi-active migrate still converts active change '${convertedActiveChange}'`,
    );
  }
  const multiActiveWarning = migrateMultiActiveJson.warnings.find(
    (diagnostic: { code: string }) => diagnostic.code === "multiple_active_changes",
  ) as { message: string; sourcePath?: string; targetPath?: string } | undefined;
  context.assert(
    multiActiveWarning !== undefined
      && multiActiveWarning.message.includes("'demo-change'")
      && multiActiveWarning.message.includes("'second-demo-change'")
      && multiActiveWarning.message.includes("only one active change")
      && multiActiveWarning.sourcePath === ".spec-driven/changes"
      && multiActiveWarning.targetPath === ".strict-spec-driven/changes",
    "multi-active migrate emits a multiple_active_changes warning naming the converted active changes",
    `warnings: ${JSON.stringify(migrateMultiActiveJson.warnings)}`,
  );
  const multiActiveFollowUp = migrateMultiActiveJson.manualFollowUp.find(
    (entry: { reason: string }) => entry.reason.includes("only one active change"),
  ) as { sourcePath: string; recommendation: string } | undefined;
  context.assert(
    multiActiveFollowUp !== undefined
      && multiActiveFollowUp.sourcePath === ".spec-driven/changes"
      && multiActiveFollowUp.recommendation.includes("Archive or cancel"),
    "multi-active migrate records a manual follow-up entry directing cleanup to a single active change",
    `manualFollowUp: ${JSON.stringify(migrateMultiActiveJson.manualFollowUp)}`,
  );
} finally {
  rmSync(migrateMultiActiveDir, { recursive: true, force: true });
}

const migratePartialDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-migrate-partial-"));
try {
  writeLegacyMigrationFixture(migratePartialDir);
  writeFileSync(
    path.join(migratePartialDir, ".spec-driven", "specs", "cli", "no-requirements.md"),
    [
      "# No Requirements",
      "",
      "This legacy spec has a heading but no requirement blocks.",
    ].join("\n") + "\n",
    "utf8",
  );
  writeFileSync(
    path.join(migratePartialDir, ".spec-driven", "specs", "cli", "non-standard-heading.md"),
    [
      "# Non Standard Heading",
      "",
      "## Requirement: legacy-heading",
      "The system MUST keep this legacy heading shape reviewable.",
    ].join("\n") + "\n",
    "utf8",
  );
  writeFileSync(
    path.join(migratePartialDir, ".spec-driven", "specs", "cli", "broken-frontmatter.md"),
    [
      "---",
      "mapping: [unterminated",
      "---",
      "# Broken Frontmatter",
      "",
      "### Requirement: broken-frontmatter",
      "The system MUST reject malformed frontmatter deterministically.",
    ].join("\n") + "\n",
    "utf8",
  );

  const partial = cli(["migrate"], { cwd: migratePartialDir });
  context.assert(partial.status === 0, "migrate exits zero when unsupported spec files are deferred");
  const partialJson = JSON.parse(partial.stdout.trim());
  context.assert(partialJson.valid === true, "migrate keeps valid=true when partial migration defers unsupported spec files");
  assertMigrationReportArrays(partialJson, "partial migrate");
  context.assert(
    partialJson.converted.some(
      (artifact: { kind: string; sourcePath?: string }) =>
        artifact.kind === "main_spec" && artifact.sourcePath === ".spec-driven/specs/cli/foundation.md",
    ),
    "partial migrate still converts supported legacy spec files",
  );

  const deferredSpecPaths = [
    ".spec-driven/specs/cli/no-requirements.md",
    ".spec-driven/specs/cli/non-standard-heading.md",
    ".spec-driven/specs/cli/broken-frontmatter.md",
  ];
  context.assert(
    deferredSpecPaths.every((sourcePath) =>
      partialJson.skipped.some((artifact: { sourcePath: string }) => artifact.sourcePath === sourcePath),
    ),
    "partial migrate records skipped entries for ambiguous and malformed spec files",
  );
  context.assert(
    deferredSpecPaths.every((sourcePath) =>
      partialJson.warnings.some((diagnostic: { sourcePath?: string }) => diagnostic.sourcePath === sourcePath),
    ),
    "partial migrate records warnings for ambiguous and malformed spec files",
  );
  context.assert(
    deferredSpecPaths.every((sourcePath) =>
      partialJson.manualFollowUp.some((entry: { sourcePath: string }) => entry.sourcePath === sourcePath),
    ),
    "partial migrate records manual follow-up entries for ambiguous and malformed spec files",
  );
  context.assert(
    !existsSync(path.join(migratePartialDir, ".strict-spec-driven", "specs", "cli", "no-requirements.yaml"))
      && !existsSync(path.join(migratePartialDir, ".strict-spec-driven", "specs", "cli", "non-standard-heading.yaml"))
      && !existsSync(path.join(migratePartialDir, ".strict-spec-driven", "specs", "cli", "broken-frontmatter.yaml")),
    "partial migrate does not invent strict YAML output for deferred legacy spec files",
  );

} finally {
  rmSync(migratePartialDir, { recursive: true, force: true });
}

const migrateMissingSourceDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-migrate-missing-"));
try {
  const missingSource = cli(["migrate"], { cwd: migrateMissingSourceDir });
  context.assert(missingSource.status !== 0, "migrate exits non-zero when .spec-driven is missing");
  const missingSourceJson = JSON.parse(missingSource.stdout.trim());
  context.assert(missingSourceJson.valid === false, "migrate reports valid=false when bootstrap source is missing");
  assertMigrationReportArrays(missingSourceJson, "missing-source migrate");
  context.assert(
    missingSourceJson.errors.some(
      (diagnostic: { code: string; sourcePath?: string }) =>
        diagnostic.code === "legacy_source_missing" && diagnostic.sourcePath === ".spec-driven",
    ),
    "migrate identifies missing bootstrap source state in errors output",
  );
} finally {
  rmSync(migrateMissingSourceDir, { recursive: true, force: true });
}

const migrateConflictDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-migrate-conflict-"));
try {
  writeLegacyMigrationFixture(migrateConflictDir);
  mkdirSync(path.join(migrateConflictDir, ".strict-spec-driven"), { recursive: true });
  writeFileSync(path.join(migrateConflictDir, ".strict-spec-driven", "existing.txt"), "keep me\n", "utf8");

  const conflict = cli(["migrate"], { cwd: migrateConflictDir });
  context.assert(conflict.status !== 0, "migrate exits non-zero for non-empty strict target conflicts");
  const conflictJson = JSON.parse(conflict.stdout.trim());
  context.assert(conflictJson.valid === false, "migrate reports valid=false for strict target conflicts");
  assertMigrationReportArrays(conflictJson, "conflict migrate");
  context.assert(
    conflictJson.errors.some((diagnostic: { code: string }) => diagnostic.code === "strict_target_conflict"),
    "migrate reports overwrite-protection conflict details",
  );
  context.assert(
    readFileSync(path.join(migrateConflictDir, ".strict-spec-driven", "existing.txt"), "utf8") === "keep me\n",
    "migrate leaves existing strict target files unchanged on conflict",
  );
} finally {
  rmSync(migrateConflictDir, { recursive: true, force: true });
}

const migrateInvalidConfigDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-migrate-invalid-config-"));
try {
  writeLegacyMigrationFixture(migrateInvalidConfigDir, "schema: spec-driven\nrules: [unterminated\n");
  const invalidConfig = cli(["migrate"], { cwd: migrateInvalidConfigDir });
  context.assert(invalidConfig.status !== 0, "migrate exits non-zero for malformed legacy config YAML");
  const invalidConfigJson = JSON.parse(invalidConfig.stdout.trim());
  context.assert(invalidConfigJson.valid === false, "migrate reports valid=false for malformed legacy config");
  assertMigrationReportArrays(invalidConfigJson, "invalid-config migrate");
  context.assert(
    invalidConfigJson.errors.some(
      (diagnostic: { code: string; sourcePath?: string }) =>
        diagnostic.code === "legacy_config_invalid" && diagnostic.sourcePath === ".spec-driven/config.yaml",
    ),
    "migrate reports malformed legacy config against the source artifact path",
  );
} finally {
  rmSync(migrateInvalidConfigDir, { recursive: true, force: true });
}

const migrateDeterministicDirA = mkdtempSync(path.join(os.tmpdir(), "strict-spec-migrate-deterministic-a-"));
const migrateDeterministicDirB = mkdtempSync(path.join(os.tmpdir(), "strict-spec-migrate-deterministic-b-"));
try {
  writeLegacyMigrationFixture(migrateDeterministicDirA);
  writeLegacyMigrationFixture(migrateDeterministicDirB);

  const first = cli(["migrate"], { cwd: migrateDeterministicDirA });
  const second = cli(["migrate"], { cwd: migrateDeterministicDirB });
  context.assert(first.status === second.status, "migrate deterministic run has stable exit status");
  context.assert(first.stdout.trim() === second.stdout.trim(), "migrate deterministic run has stable JSON output");
} finally {
  rmSync(migrateDeterministicDirA, { recursive: true, force: true });
  rmSync(migrateDeterministicDirB, { recursive: true, force: true });
}

const migrateForceDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-migrate-force-"));
try {
  writeLegacyMigrationFixture(migrateForceDir);

  const first = cli(["migrate"], { cwd: migrateForceDir });
  context.assert(first.status === 0, "migrate initial run exits zero before rerun checks");
  const firstJson = JSON.parse(first.stdout.trim());
  assertMigrationReportArrays(firstJson, "first migrate rerun check");

  const blockedRerun = cli(["migrate"], { cwd: migrateForceDir });
  context.assert(blockedRerun.status !== 0, "migrate rerun exits non-zero after initial migration");
  const blockedRerunJson = JSON.parse(blockedRerun.stdout.trim());
  assertMigrationReportArrays(blockedRerunJson, "blocked rerun");
  context.assert(
    blockedRerunJson.errors.some((diagnostic: { code: string }) => diagnostic.code === "strict_target_conflict"),
    "migrate rerun preserves overwrite protection",
  );
} finally {
  rmSync(migrateForceDir, { recursive: true, force: true });
}

context.section("[19] roadmap converter");

const ROADMAP_FIXTURE_ROOT = path.join(ROOT, "test", "fixtures", "roadmap");

const roadmapConverterModule = await loadDistModule<RoadmapConverterModule>("converters/roadmap.js");

const validIndexContent = readFileSync(path.join(ROADMAP_FIXTURE_ROOT, "valid-index.md"), "utf8");
const validIndexResult = roadmapConverterModule.convertRoadmapIndex(validIndexContent);
context.assert(validIndexResult.ok === true, "convertRoadmapIndex succeeds for valid index with milestones");
if (validIndexResult.ok) {
  context.assert(
    validIndexResult.artifact.schema === "strict-spec-driven/roadmap-index/v2"
      && validIndexResult.artifact.artifact_type === "roadmap_index",
    "convertRoadmapIndex output has correct schema and artifact_type",
  );
  const indexKeys = Object.keys(validIndexResult.artifact.milestones);
  context.assert(
    indexKeys.length === 2,
    "convertRoadmapIndex parses two milestone entries from valid index",
    `got ${indexKeys.length}`,
  );
  context.assert(
    validIndexResult.artifact.milestones["0001-first-milestone"]?.status === "complete",
    "convertRoadmapIndex preserves milestone id and status from link and text",
  );
  context.assert(
    validIndexResult.artifact.milestones["0001-first-milestone"]?.path === "roadmap/milestones/0001-first-milestone.yaml",
    "convertRoadmapIndex derives strict YAML milestone path from href",
    `got ${validIndexResult.artifact.milestones["0001-first-milestone"]?.path}`,
  );
  context.assert(
    validIndexResult.artifact.milestones["0002-second-milestone"]?.status === "proposed",
    "convertRoadmapIndex maps proposed status for second milestone",
  );
}

const emptyIndexContent = readFileSync(path.join(ROADMAP_FIXTURE_ROOT, "empty-index.md"), "utf8");
const emptyIndexResult = roadmapConverterModule.convertRoadmapIndex(emptyIndexContent);
context.assert(emptyIndexResult.ok === true, "convertRoadmapIndex succeeds for index with no milestones section");
if (emptyIndexResult.ok) {
  context.assert(
    Object.keys(emptyIndexResult.artifact.milestones).length === 0,
    "convertRoadmapIndex returns empty milestones array for index with no ## Milestones section",
  );
}

const validMilestoneContent = readFileSync(
  path.join(ROADMAP_FIXTURE_ROOT, "milestones", "valid-milestone.md"),
  "utf8",
);
const validMilestoneResult = roadmapConverterModule.convertRoadmapMilestone(
  validMilestoneContent,
  "valid-milestone.md",
);
context.assert(validMilestoneResult.ok === true, "convertRoadmapMilestone succeeds for valid milestone with all sections");
if (validMilestoneResult.ok) {
  context.assert(
    validMilestoneResult.artifact.schema === "strict-spec-driven/roadmap-milestone/v2"
      && validMilestoneResult.artifact.artifact_type === "roadmap_milestone",
    "convertRoadmapMilestone output has correct schema and artifact_type",
  );
  const validMilestoneKeys = Object.keys(validMilestoneResult.artifact.milestone);
  context.assert(
    validMilestoneKeys.length === 1
      && validMilestoneKeys[0] === "valid-milestone"
      && validMilestoneResult.artifact.milestone["valid-milestone"]?.title === "01 First Milestone",
    "convertRoadmapMilestone derives milestone id from filename and title from heading",
  );
  context.assert(
    validMilestoneResult.artifact.goal.length > 0,
    "convertRoadmapMilestone captures goal text",
  );
  context.assert(
    validMilestoneResult.artifact.scope.in.length > 0 && validMilestoneResult.artifact.scope.out.length > 0,
    "convertRoadmapMilestone captures in-scope and out-of-scope entries",
  );
  context.assert(
    validMilestoneResult.artifact.done_criteria.length > 0,
    "convertRoadmapMilestone captures done criteria",
  );
  const validMilestoneChangeKeys = Object.keys(validMilestoneResult.artifact.planned_changes);
  context.assert(
    validMilestoneChangeKeys.length === 2,
    "convertRoadmapMilestone parses all planned change entries",
    `got ${validMilestoneChangeKeys.length}`,
  );
  context.assert(
    validMilestoneResult.artifact.planned_changes["define-schemas"]?.status === "complete",
    "convertRoadmapMilestone maps planned change id and complete status",
  );
  context.assert(
    validMilestoneResult.artifact.planned_changes["implement-cli"]?.status === "planned",
    "convertRoadmapMilestone maps planned change id and planned status for non-complete entry",
  );
  context.assert(
    validMilestoneResult.artifact.planned_changes["define-schemas"]?.depends_on.length === 0,
    "convertRoadmapMilestone defaults planned change depends_on to empty array",
  );
  context.assert(
    validMilestoneResult.artifact.status === "complete",
    "convertRoadmapMilestone parses declared status from ## Status section",
  );
  context.assert(
    validMilestoneResult.artifact.notes.length > 0,
    "convertRoadmapMilestone captures notes entries",
  );
  context.assert(
    !("details" in validMilestoneResult.artifact),
    "convertRoadmapMilestone omits details field when milestone has no Details section",
  );
}

const detailsMilestoneContent = readFileSync(
  path.join(ROADMAP_FIXTURE_ROOT, "milestones", "valid-milestone-with-details.md"),
  "utf8",
);
const detailsMilestoneResult = roadmapConverterModule.convertRoadmapMilestone(
  detailsMilestoneContent,
  "valid-milestone-with-details.md",
);
context.assert(detailsMilestoneResult.ok === true, "convertRoadmapMilestone succeeds for milestone with Details section");
if (detailsMilestoneResult.ok) {
  context.assert(
    typeof detailsMilestoneResult.artifact.details === "string"
      && detailsMilestoneResult.artifact.details!.length > 0,
    "convertRoadmapMilestone preserves details text from Details section",
  );
  context.assert(
    detailsMilestoneResult.artifact.details!.includes("long-form planning guidance"),
    "convertRoadmapMilestone details content matches source section text",
  );
  context.assert(
    detailsMilestoneResult.artifact.notes.length > 0,
    "convertRoadmapMilestone still captures notes when Details is present",
  );
}

const malformedMilestoneContent = readFileSync(
  path.join(ROADMAP_FIXTURE_ROOT, "milestones", "malformed-milestone.md"),
  "utf8",
);
const malformedMilestoneResult = roadmapConverterModule.convertRoadmapMilestone(
  malformedMilestoneContent,
  "malformed-milestone.md",
);
context.assert(
  malformedMilestoneResult.ok === false,
  "convertRoadmapMilestone fails for milestone missing ## Status section",
);
if (!malformedMilestoneResult.ok) {
  context.assert(
    malformedMilestoneResult.reason.includes("Status"),
    "convertRoadmapMilestone failure reason mentions missing Status section",
    `got reason: ${malformedMilestoneResult.reason}`,
  );
  context.assert(
    malformedMilestoneResult.recommendation.length > 0,
    "convertRoadmapMilestone failure includes a recommendation",
  );
}

const unsupportedShapeContent = readFileSync(
  path.join(ROADMAP_FIXTURE_ROOT, "milestones", "unsupported-shape.md"),
  "utf8",
);
const unsupportedShapeResult = roadmapConverterModule.convertRoadmapMilestone(
  unsupportedShapeContent,
  "unsupported-shape.md",
);
context.assert(
  unsupportedShapeResult.ok === false,
  "convertRoadmapMilestone fails for unsupported Markdown shape with no headings",
);

const validSpecsIndexContent = readFileSync(path.join(ROADMAP_FIXTURE_ROOT, "valid-specs-index.md"), "utf8");
const validSpecsIndexResult = roadmapConverterModule.convertSpecsIndex(validSpecsIndexContent);
context.assert(validSpecsIndexResult.ok === true, "convertSpecsIndex succeeds for valid specs index");
if (validSpecsIndexResult.ok) {
  context.assert(
    validSpecsIndexResult.artifact.schema === "strict-spec-driven/spec-index/v1"
      && validSpecsIndexResult.artifact.artifact_type === "spec_index",
    "convertSpecsIndex output has correct schema and artifact_type",
  );
  context.assert(
    validSpecsIndexResult.artifact.specs.length === 2,
    "convertSpecsIndex parses two spec entries from valid index",
    `got ${validSpecsIndexResult.artifact.specs.length}`,
  );
  context.assert(
    validSpecsIndexResult.artifact.specs[0]?.id === "contracts-yaml-artifacts"
      && validSpecsIndexResult.artifact.specs[0]?.title === "Strict YAML artifact schema contract",
    "convertSpecsIndex derives spec id from path and preserves title",
  );
  context.assert(
    validSpecsIndexResult.artifact.specs[0]?.path === ".strict-spec-driven/specs/contracts/yaml-artifacts.yaml",
    "convertSpecsIndex derives strict YAML spec path from href",
    `got ${validSpecsIndexResult.artifact.specs[0]?.path}`,
  );
  context.assert(
    validSpecsIndexResult.artifact.specs[1]?.id === "cli-foundation",
    "convertSpecsIndex derives spec id matching migrate.ts buildSpecIdFromRelativePath convention",
  );
}

const idempotentMigrateDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-idempotent-"));
try {
  writeLegacyMigrationFixture(idempotentMigrateDir);
  const migrateResult = cli(["migrate"], { cwd: idempotentMigrateDir });
  context.assert(migrateResult.status === 0, "roadmap migration exits zero on first run");
  context.assert(
    existsSync(path.join(idempotentMigrateDir, ".strict-spec-driven", "roadmap", "INDEX.yaml")),
    "roadmap migration writes strict roadmap index YAML",
  );
  context.assert(
    existsSync(path.join(idempotentMigrateDir, ".strict-spec-driven", "roadmap", "milestones", "0001-demo.yaml")),
    "roadmap migration writes strict roadmap milestone YAML",
  );
} finally {
  rmSync(idempotentMigrateDir, { recursive: true, force: true });
}

context.section("[20] core workflow converters");

const migrateConverterModule = await loadDistModule<MigrateConverterModule>("migrate.js");

const proposalArtifact = migrateConverterModule.parseLegacyProposal(
  ".spec-driven/changes/example-change/proposal.md",
  [
    "# Example Change",
    "",
    "## What",
    "",
    "- Add `--force` rerun support.",
    "",
    "## Why",
    "",
    "- Migration reruns need deterministic overwrite behavior.",
    "",
    "## Scope",
    "",
    "In scope:",
    "",
    "- Preserve supported conversion behavior.",
    "",
    "Out of scope:",
    "",
    "- Destructive cleanup of strict workflow state.",
    "",
    "## Unchanged Behavior",
    "",
    "- `migrate` without `--force` still refuses unsafe overwrites.",
  ].join("\n") + "\n",
  "fallback-change",
  false,
);
context.assert(
  proposalArtifact.change.id === "example-change" && proposalArtifact.change.status === "active",
  "parseLegacyProposal derives active change id from proposal heading",
);
context.assert(
  proposalArtifact.scope.in.length === 1 && proposalArtifact.scope.out.length === 1,
  "parseLegacyProposal preserves in-scope and out-of-scope entries",
);
context.assert(
  proposalArtifact.unchanged_behavior[0] === "`migrate` without `--force` still refuses unsafe overwrites.",
  "parseLegacyProposal preserves unchanged behavior bullets",
);

const archivedProposalArtifact = migrateConverterModule.parseLegacyProposal(
  ".spec-driven/changes/archive/2026-04-01-example-change/proposal.md",
  "# Archived Example\n\n## What\n\n- Preserve archived state.\n\n## Why\n\n- Archive output must stay reviewable.\n",
  "fallback-change",
  true,
);
context.assert(
  archivedProposalArtifact.change.status === "complete",
  "parseLegacyProposal marks archived proposals complete",
);

const designArtifact = migrateConverterModule.parseLegacyDesign(
  ".spec-driven/changes/example-change/design.md",
  [
    "# Design: example-change",
    "",
    "## Approach",
    "",
    "1. Parse the legacy artifact.",
    "- Preserve the canonical Markdown meaning.",
    "2. Write the strict YAML output.",
    "- Keep the output deterministic.",
    "",
    "## Key Decisions",
    "",
    "- **Keep reruns deterministic**: Stable output makes migration reviewable.",
    "",
    "## Alternatives Considered",
    "",
    "- **Delete the target directory**: Rejected because force-based reruns should not require destructive cleanup.",
  ].join("\n") + "\n",
  "example-change",
);
context.assert(
  designArtifact.change === "example-change" && designArtifact.approach.length === 2,
  "parseLegacyDesign preserves change id and ordered approach items",
);
context.assert(
  "keep-reruns-deterministic" in designArtifact.decisions,
  "parseLegacyDesign derives deterministic decision identifiers from bold labels",
);
context.assert(
  designArtifact.alternatives[0]?.option === "Delete the target directory",
  "parseLegacyDesign preserves alternative option labels",
);

const tasksArtifact = migrateConverterModule.parseLegacyTasks(
  ".spec-driven/changes/example-change/tasks.md",
  [
    "# Tasks: example-change",
    "",
    "## Implementation",
    "",
    "- [ ] Add `--force` support to the CLI.",
    "",
    "## Testing",
    "",
    "- [x] Run `bun run build` — build validation for migrate changes",
    "- [ ] Run `bun test/run.ts` — unit tests for migrate changes",
    "",
    "## Verification",
    "",
    "- [ ] Verify implementation matches proposal scope",
  ].join("\n") + "\n",
  "example-change",
);
context.assert(
  tasksArtifact.change === "example-change"
    && Object.values(tasksArtifact.sections["Implementation"] ?? {})[0]?.status === "pending",
  "parseLegacyTasks preserves change id and implementation task status",
);
context.assert(
  tasksArtifact.sections["Testing"]?.["testing-1"]?.command === "bun run build"
    && tasksArtifact.sections["Testing"]?.["testing-2"]?.command === "bun test/run.ts",
  "parseLegacyTasks extracts backticked testing commands",
);
context.assert(
  tasksArtifact.testing_gates.validation_task === "testing-1"
    && tasksArtifact.testing_gates.unit_test_task === "testing-2",
  "parseLegacyTasks derives deterministic testing gate task identifiers",
);

const questionsArtifact = migrateConverterModule.parseLegacyQuestions(
  ".spec-driven/changes/example-change/questions.md",
  [
    "# Questions: example-change",
    "",
    "## Open",
    "",
    "- [ ] Q: Should reruns preserve identical JSON output?",
    "  Context: Force-based reruns need deterministic report output.",
    "",
    "## Resolved",
    "",
    "- [x] Q: Should warnings remain non-blocking?",
    "  Context: Ambiguous legacy artifacts should not halt partial migration.",
    "  A: Yes. They should stay warnings with manual follow-up entries.",
  ].join("\n") + "\n",
  "example-change",
);
context.assert(
  questionsArtifact.change === "example-change"
    && questionsArtifact.open[0]?.status === "open"
    && questionsArtifact.resolved[0]?.status === "resolved",
  "parseLegacyQuestions preserves open and resolved question status",
);
context.assert(
  questionsArtifact.resolved[0]?.answer === "Yes. They should stay warnings with manual follow-up entries.",
  "parseLegacyQuestions preserves resolved answers",
);

context.section("[21] copied real project validate-skills regression");

function runCopiedWorkspaceValidateSkillsScenario(): {
  validateSkillsStatus: number;
  validateSkillsStdout: string;
  validateSkillsAfterMigrateStatus: number;
  validateSkillsAfterMigrateStdout: string;
} {
  const workspace = createCopiedProjectWorkspace("todo-app");
  const { workspaceRoot } = workspace;
  try {
    const validateSkillsBefore = projectWorkspaceCli(workspaceRoot, ["validate-skills"]);
    const validateSkillsBeforeStdout = validateSkillsBefore.stdout.trim();
    context.assert(
      validateSkillsBefore.status !== 0,
      "copied workspace validate-skills exits non-zero when no skills directory exists",
      `stdout: ${validateSkillsBeforeStdout} stderr: ${validateSkillsBefore.stderr.trim()}`,
    );
    const validateSkillsBeforeJson = JSON.parse(validateSkillsBeforeStdout);
    context.assert(
      validateSkillsBeforeJson.valid === false
        && validateSkillsBeforeJson.diagnostics.some(
          (d: { code: string }) => d.code === "skills.directory.missing",
        ),
      "copied workspace validate-skills reports missing skills directory before migrate",
    );

    const migrateResult = projectWorkspaceCli(workspaceRoot, ["migrate"]);
    context.assert(
      migrateResult.status === 0,
      "copied workspace validate-skills regression: migrate succeeds",
      `stdout: ${migrateResult.stdout.trim()} stderr: ${migrateResult.stderr.trim()}`,
    );

    const validateSkillsAfter = projectWorkspaceCli(workspaceRoot, ["validate-skills"]);
    const validateSkillsAfterStdout = validateSkillsAfter.stdout.trim();
    context.assert(
      validateSkillsAfter.status !== 0,
      "copied workspace validate-skills exits non-zero after migrate (still no skills directory)",
    );
    const validateSkillsAfterJson = JSON.parse(validateSkillsAfterStdout);
    context.assert(
      validateSkillsAfterJson.valid === false
        && validateSkillsAfterJson.summary.skillCount === 0,
      "copied workspace validate-skills reports zero skills after migrate",
    );
    context.assert(
      readFileSync(path.join(todoProjectRoot, ".spec-driven", "config.yaml"), "utf8")
        === readFileSync(path.join(projectFixturePath("todo-app"), ".spec-driven", "config.yaml"), "utf8"),
      "committed todo-project fixture stays unchanged during validate-skills regression",
    );

    return {
      validateSkillsStatus: validateSkillsBefore.status,
      validateSkillsStdout: validateSkillsBeforeStdout,
      validateSkillsAfterMigrateStatus: validateSkillsAfter.status,
      validateSkillsAfterMigrateStdout: validateSkillsAfterStdout,
    };
  } finally {
    workspace.cleanup();
    context.assert(
      !existsSync(workspaceRoot),
      "copied workspace cleanup removes validate-skills regression temp workspace",
    );
  }
}

const validateSkillsFirstRun = runCopiedWorkspaceValidateSkillsScenario();
const validateSkillsSecondRun = runCopiedWorkspaceValidateSkillsScenario();
context.assert(
  validateSkillsFirstRun.validateSkillsStdout === validateSkillsSecondRun.validateSkillsStdout,
  "copied workspace validate-skills output stays stable across repeated runs",
);
context.assert(
  validateSkillsFirstRun.validateSkillsAfterMigrateStdout === validateSkillsSecondRun.validateSkillsAfterMigrateStdout,
  "copied workspace validate-skills-after-migrate output stays stable across repeated runs",
);

context.section("[22] copied real project post-migration change lifecycle regression");

function runCopiedWorkspaceLifecycleScenario(): {
  verifyBeforeApplyStatus: number;
  verifyBeforeApplyStdout: string;
  listBeforeArchiveStdout: string;
  archiveStatus: number;
  archiveStdout: string;
  listAfterArchiveStdout: string;
} {
  const workspace = createCopiedProjectWorkspace("todo-app");
  const { workspaceRoot } = workspace;
  try {
    const baselineConfig = readFileSync(
      path.join(todoProjectRoot, ".spec-driven", "config.yaml"),
      "utf8",
    );

    const migrateResult = projectWorkspaceCli(workspaceRoot, ["migrate"]);
    context.assert(
      migrateResult.status === 0,
      "copied workspace lifecycle regression: migrate succeeds",
      `stdout: ${migrateResult.stdout.trim()} stderr: ${migrateResult.stderr.trim()}`,
    );

    const verifyBeforeApply = projectWorkspaceCli(workspaceRoot, ["verify", "add-due-dates"]);
    const verifyBeforeApplyStdout = verifyBeforeApply.stdout.trim();
    context.assert(
      verifyBeforeApply.status !== 0,
      "copied workspace verify exits non-zero before tasks are completed",
      `stdout: ${verifyBeforeApplyStdout} stderr: ${verifyBeforeApply.stderr.trim()}`,
    );
    const verifyBeforeApplyJson = JSON.parse(verifyBeforeApplyStdout);
    context.assert(
      verifyBeforeApplyJson.valid === false
        && verifyBeforeApplyJson.remainingPending > 0
        && verifyBeforeApplyJson.completeTasks === 0,
      "copied workspace verify reports pending tasks before any apply",
      `remainingPending: ${verifyBeforeApplyJson.remainingPending} completeTasks: ${verifyBeforeApplyJson.completeTasks}`,
    );

    let applyResult = projectWorkspaceCli(workspaceRoot, ["apply", "add-due-dates"]);
    while (applyResult.status === 0) {
      applyResult = projectWorkspaceCli(workspaceRoot, ["apply", "add-due-dates"]);
    }
    context.assert(
      applyResult.status !== 0,
      "copied workspace apply exits non-zero after completing all tasks",
    );

    const verifyAfterApply = projectWorkspaceCli(workspaceRoot, ["verify", "add-due-dates"]);
    const verifyAfterApplyStdout = verifyAfterApply.stdout.trim();
    context.assert(
      verifyAfterApply.status === 0,
      "copied workspace verify exits zero after all tasks completed",
      `stdout: ${verifyAfterApplyStdout} stderr: ${verifyAfterApply.stderr.trim()}`,
    );
    const verifyAfterApplyJson = JSON.parse(verifyAfterApplyStdout);
    context.assert(
      verifyAfterApplyJson.valid === true
        && verifyAfterApplyJson.remainingPending === 0
        && verifyAfterApplyJson.completeTasks > 0,
      "copied workspace verify reports valid with no pending tasks after all apply invocations",
    );

    const listBeforeArchive = projectWorkspaceCli(workspaceRoot, ["list"]);
    const listBeforeArchiveStdout = listBeforeArchive.stdout.trim();
    context.assert(
      listBeforeArchive.status === 0,
      "copied workspace list exits zero before archive",
    );
    context.assert(
      listBeforeArchiveStdout.includes("Active:")
        && listBeforeArchiveStdout.includes("add-due-dates"),
      "copied workspace list shows add-due-dates as active before archive",
    );

    const archiveResult = projectWorkspaceCli(workspaceRoot, ["archive", "add-due-dates"]);
    const archiveStdout = archiveResult.stdout.trim();
    context.assert(
      archiveResult.status === 0,
      "copied workspace archive exits zero after tasks completed",
      `stdout: ${archiveStdout} stderr: ${archiveResult.stderr.trim()}`,
    );
    const archiveJson = JSON.parse(archiveStdout);
    context.assert(
      archiveJson.valid === true
        && archiveJson.archiveDestination.includes("add-due-dates"),
      "copied workspace archive reports valid and includes archive destination path",
    );

    const listAfterArchive = projectWorkspaceCli(workspaceRoot, ["list"]);
    const listAfterArchiveStdout = listAfterArchive.stdout.trim();
    context.assert(
      listAfterArchive.status === 0,
      "copied workspace list exits zero after archive",
    );
    context.assert(
      listAfterArchiveStdout.includes("Archived:")
        && !listAfterArchiveStdout.includes("Active:"),
      "copied workspace list shows archived change and no active changes after archive",
    );

    context.assert(
      readFileSync(path.join(todoProjectRoot, ".spec-driven", "config.yaml"), "utf8") === baselineConfig
        && !existsSync(path.join(todoProjectRoot, ".strict-spec-driven")),
      "committed todo-project fixture stays unchanged during lifecycle regression",
    );

    return {
      verifyBeforeApplyStatus: verifyBeforeApply.status,
      verifyBeforeApplyStdout: verifyBeforeApplyStdout,
      listBeforeArchiveStdout: listBeforeArchiveStdout,
      archiveStatus: archiveResult.status,
      archiveStdout: archiveStdout,
      listAfterArchiveStdout: listAfterArchiveStdout,
    };
  } finally {
    workspace.cleanup();
    context.assert(
      !existsSync(workspaceRoot),
      "copied workspace cleanup removes lifecycle regression temp workspace",
    );
  }
}

const lifecycleFirstRun = runCopiedWorkspaceLifecycleScenario();
const lifecycleSecondRun = runCopiedWorkspaceLifecycleScenario();
context.assert(
  lifecycleFirstRun.verifyBeforeApplyStdout === lifecycleSecondRun.verifyBeforeApplyStdout,
  "copied workspace verify-before-apply output stays stable across repeated lifecycle runs",
);
context.assert(
  lifecycleFirstRun.listBeforeArchiveStdout === lifecycleSecondRun.listBeforeArchiveStdout,
  "copied workspace list-before-archive output stays stable across repeated lifecycle runs",
);
context.assert(
  lifecycleFirstRun.archiveStdout === lifecycleSecondRun.archiveStdout,
  "copied workspace archive output stays stable across repeated lifecycle runs",
);
context.assert(
  lifecycleFirstRun.listAfterArchiveStdout === lifecycleSecondRun.listAfterArchiveStdout,
  "copied workspace list-after-archive output stays stable across repeated lifecycle runs",
);

context.section("[roadmap] ticket-promoted milestone provenance");

const provenanceRoot = mkdtempSync(path.join(os.tmpdir(), "strict-ticket-provenance-"));
try {
  mkdirSync(path.join(provenanceRoot, ".strict-spec-driven", "tickets"), { recursive: true });
  mkdirSync(path.join(provenanceRoot, ".strict-spec-driven", "roadmap", "milestones"), { recursive: true });
  writeFileSync(
    path.join(provenanceRoot, ".strict-spec-driven", "roadmap", "INDEX.yaml"),
    [
      "schema: strict-spec-driven/roadmap-index/v2",
      "schema_version: 2",
      "artifact_type: roadmap_index",
      "schema_file: ../schemas/roadmap-index.yaml",
      "milestones: {}",
      "",
    ].join("\n"),
    "utf8",
  );

  const createdTicket = JSON.parse(
    cli(
      ["ticket-create", "--title", "Bulk archive changes", "--problem", "no bulk archive", "--desired-outcome", "archive many changes at once"],
      { cwd: provenanceRoot },
    ).stdout,
  ) as { ticketId: string };
  const promotion = JSON.parse(
    cli(
      ["ticket-resolve", createdTicket.ticketId, "--outcome", "not_implemented", "--rationale", "not present in specs or code"],
      { cwd: provenanceRoot },
    ).stdout,
  ) as { milestoneId: string };

  const statusAfterPromote = JSON.parse(cli(["roadmap-status"], { cwd: provenanceRoot }).stdout) as {
    valid: boolean;
    milestones: Array<{ id: string; sourceTicket?: string; needsScopeRefinement?: boolean }>;
  };
  const promotedMilestone = statusAfterPromote.milestones.find((entry) => entry.id === promotion.milestoneId);
  context.assert(statusAfterPromote.valid === true, "roadmap-status is valid after a ticket promotion");
  context.assert(
    promotedMilestone?.sourceTicket === createdTicket.ticketId,
    "roadmap-status surfaces the originating ticket for a promoted milestone",
  );
  context.assert(
    promotedMilestone?.needsScopeRefinement === true,
    "roadmap-status flags a freshly promoted milestone as needing scope refinement",
  );

  const milestoneFilePath = path.join(
    provenanceRoot,
    ".strict-spec-driven",
    "roadmap",
    "milestones",
    `${promotion.milestoneId}.yaml`,
  );
  const syncResult = cli(["roadmap-sync"], { cwd: provenanceRoot });
  context.assert(syncResult.status === 0, "roadmap-sync succeeds with a ticket-promoted milestone");
  const milestoneAfterSync = yamlModule.parseYamlFile<{ source_ticket?: string }>(milestoneFilePath);
  context.assert(
    milestoneAfterSync.source_ticket === createdTicket.ticketId,
    "roadmap-sync preserves the milestone source-ticket back-reference",
  );

  const statusAfterSync = JSON.parse(cli(["roadmap-status"], { cwd: provenanceRoot }).stdout) as {
    milestones: Array<{ id: string; sourceTicket?: string }>;
  };
  context.assert(
    statusAfterSync.milestones.find((entry) => entry.id === promotion.milestoneId)?.sourceTicket === createdTicket.ticketId,
    "roadmap-status still surfaces the source ticket after sync",
  );
} finally {
  rmSync(provenanceRoot, { recursive: true, force: true });
}

context.section("[roadmap] ticket flow against the real-project fixture");

{
  const ticketFixture = createCopiedProjectWorkspace("todo-app");
  const fixtureRoot = ticketFixture.workspaceRoot;
  try {
    const migrateForTickets = projectWorkspaceCli(fixtureRoot, ["migrate"]);
    context.assert(migrateForTickets.status === 0, "ticket fixture migrate produces strict workflow state");
    const materializeForTickets = projectWorkspaceCli(fixtureRoot, ["roadmap-sync", "--materialize-planned-changes"]);
    context.assert(materializeForTickets.status === 0, "ticket fixture materializes legacy inline planned changes");

    const fixtureTicket = JSON.parse(
      projectWorkspaceCli(fixtureRoot, [
        "ticket-create",
        "--title",
        "Recurring todos",
        "--problem",
        "todos cannot repeat on a schedule",
        "--desired-outcome",
        "a user can mark a todo as recurring",
      ]).stdout,
    ) as { ticketId: string; created: boolean };
    context.assert(fixtureTicket.created === true, "ticket-create works in the migrated real-project fixture");

    const fixtureValidate = projectWorkspaceCli(fixtureRoot, ["ticket-validate"]);
    context.assert(fixtureValidate.status === 0, "ticket-validate passes in the migrated fixture");

    const fixturePromotion = JSON.parse(
      projectWorkspaceCli(fixtureRoot, [
        "ticket-resolve",
        fixtureTicket.ticketId,
        "--outcome",
        "not_implemented",
        "--rationale",
        "no recurring-todo behavior exists in the project specs or code",
      ]).stdout,
    ) as { status: string; milestoneId: string; milestoneCreated: boolean };
    context.assert(fixturePromotion.status === "promoted", "ticket promotes in the real-project fixture");
    context.assert(fixturePromotion.milestoneCreated === true, "promotion materializes a milestone in the fixture roadmap");

    const fixtureStatus = JSON.parse(projectWorkspaceCli(fixtureRoot, ["roadmap-status"]).stdout) as {
      valid: boolean;
      milestones: Array<{ id: string; sourceTicket?: string; needsScopeRefinement?: boolean }>;
    };
    const fixtureMilestone = fixtureStatus.milestones.find((entry) => entry.id === fixturePromotion.milestoneId);
    context.assert(fixtureStatus.valid === true, "fixture roadmap stays valid after promotion");
    context.assert(
      fixtureMilestone?.sourceTicket === fixtureTicket.ticketId
        && fixtureMilestone?.needsScopeRefinement === true,
      "fixture roadmap-status surfaces the source ticket and refinement flag for the promoted milestone",
    );

    const fixtureMilestoneFile = path.join(
      fixtureRoot,
      ".strict-spec-driven",
      "roadmap",
      "milestones",
      `${fixturePromotion.milestoneId}.yaml`,
    );
    projectWorkspaceCli(fixtureRoot, ["roadmap-sync"]);
    const fixtureMilestoneAfterSync = yamlModule.parseYamlFile<{ source_ticket?: string }>(fixtureMilestoneFile);
    context.assert(
      fixtureMilestoneAfterSync.source_ticket === fixtureTicket.ticketId,
      "fixture roadmap-sync preserves the milestone source-ticket back-reference",
    );

    // Overwrite safety: a second promotion never clobbers the first milestone.
    const secondFixtureTicket = JSON.parse(
      projectWorkspaceCli(fixtureRoot, [
        "ticket-create",
        "--title",
        "Todo tags",
        "--problem",
        "todos cannot be tagged",
        "--desired-outcome",
        "a user can tag a todo",
      ]).stdout,
    ) as { ticketId: string };
    const secondFixturePromotion = JSON.parse(
      projectWorkspaceCli(fixtureRoot, [
        "ticket-resolve",
        secondFixtureTicket.ticketId,
        "--outcome",
        "not_implemented",
        "--rationale",
        "no tagging behavior exists yet",
      ]).stdout,
    ) as { milestoneId: string };
    context.assert(
      secondFixturePromotion.milestoneId !== fixturePromotion.milestoneId,
      "a second fixture promotion allocates a distinct milestone without overwriting the first",
    );
    const firstMilestoneStillIntact = yamlModule.parseYamlFile<{ source_ticket?: string }>(fixtureMilestoneFile);
    context.assert(
      firstMilestoneStillIntact.source_ticket === fixtureTicket.ticketId,
      "the first promoted milestone is left intact after a second promotion",
    );
  } finally {
    ticketFixture.cleanup();
  }
}

}
