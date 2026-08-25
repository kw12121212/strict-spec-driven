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
      && roadmapStatusBeforeJson.milestones[0].plannedChanges[0].details === undefined
      && roadmapStatusBeforeJson.milestones[0].plannedChanges[0].team === undefined,
    "roadmap-status omits bulky or redundant roadmap fields and planned-change metadata from default output",
  );
  context.assert(
    roadmapStatusBeforeJson.milestones[0].plannedChanges[0].summary === "Active work remains in progress."
      && roadmapStatusBeforeJson.milestones[0].plannedChanges[0].dependsOn.length === 0
      && roadmapStatusBeforeJson.milestones[0].plannedChanges[1].summary === "Archived work should reconcile to complete."
      && roadmapStatusBeforeJson.milestones[0].plannedChanges[1].dependsOn.join(",") === "active-change",
    "roadmap-status reports exact planned-change summaries and dependency ids",
  );
  context.assert(
    roadmapStatusBeforeJson.milestones[0].declaredStatus === "blocked"
      && roadmapStatusBeforeJson.milestones[0].derivedStatus === "proposed",
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
      && roadmapSyncJson.milestones[0].plannedChanges[0].summary === undefined
      && roadmapSyncJson.milestones[0].plannedChanges[0].dependsOn === undefined,
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
  context.assert(syncedMilestone.status === "proposed", "roadmap-sync rewrites milestone status to derived status");
  context.assert(
    Object.keys(syncedMilestone.planned_changes).length === 0,
    "roadmap-sync keeps milestone planned_changes empty for standalone-only roadmaps",
  );

  const syncedIndex = yamlModule.parseYamlFile<{
    milestones: Array<{ id: string; title: string; path: string; status: string }>;
  }>(path.join(roadmapHappyDir, ".strict-spec-driven", "roadmap", "INDEX.yaml"));
  context.assert(
    Object.keys(syncedIndex.milestones).length === 1
      && syncedIndex.milestones["0001-roadmap"]?.status === "proposed"
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
  }>(generatedMilestonePath);
  context.assert(
    appendedMilestone.scope.in.includes("Milestone YAML shape is command-authored.")
      && appendedMilestone.scope.in.includes("Additional milestone scope.")
      && appendedMilestone.intake_questions.map((question) => question.id).join(",") === "objective,scope-boundary,verification-evidence"
      && appendedMilestone.details === "Long-form milestone guidance added by the authoring command.",
    "roadmap-generate milestone preserves existing milestone metadata and appends intake questions while applying safe updates",
  );
  context.assert(
    readFileSync(standalonePath, "utf8") === standaloneBeforeUpdate,
    "roadmap-generate milestone does not rewrite standalone planned-change files",
  );

  const deferBeforeScalarEdit = cli([
    "roadmap-defer",
    "authoring",
    "--reason",
    "The milestone needs another refinement pass.",
  ], { cwd: roadmapGenerateDir });
  context.assert(
    deferBeforeScalarEdit.status === 0,
    "roadmap-defer records awaiting_refinement before a milestone field edit",
    deferBeforeScalarEdit.stdout || deferBeforeScalarEdit.stderr,
  );
  const awaitingRefinementBeforeScalarEdit = yamlModule.parseYamlFile<{
    awaiting_refinement?: { status: true; reason: string; deferred_on: string };
  }>(generatedMilestonePath).awaiting_refinement;

  // A supplied scalar replaces the recorded value with no confirming flag.
  const beforeScalarEdit = yamlModule.parseYamlFile<{
    scope: { in: string[] };
    done_criteria: string[];
    risks: string[];
    notes: string[];
    intake_questions: Array<{ id: string }>;
  }>(generatedMilestonePath);
  const scalarEdit = cli([
    "roadmap-generate",
    "milestone",
    "--id",
    "authoring",
    "--goal",
    "Replace the goal with no extra flag.",
  ], { cwd: roadmapGenerateDir });
  context.assert(
    scalarEdit.status === 0,
    "roadmap-generate milestone replaces a scalar field without any confirming flag",
    scalarEdit.stdout || scalarEdit.stderr,
  );
  const afterScalarEdit = yamlModule.parseYamlFile<{
    awaiting_refinement?: { status: true; reason: string; deferred_on: string };
  }>(generatedMilestonePath);
  context.assert(
    awaitingRefinementBeforeScalarEdit !== undefined
      && JSON.stringify(afterScalarEdit.awaiting_refinement) === JSON.stringify(awaitingRefinementBeforeScalarEdit),
    "roadmap-generate milestone preserves awaiting_refinement when editing an unrelated scalar field",
  );

  // The reported regression: editing one field while supplying one list value must never replace
  // the lists the invocation did not name.
  const blastRadius = cli([
    "roadmap-generate",
    "milestone",
    "--id",
    "authoring",
    "--goal",
    "Goal edited alongside one new risk.",
    "--risk",
    "An additional risk.",
  ], { cwd: roadmapGenerateDir });
  context.assert(blastRadius.status === 0, "roadmap-generate milestone edits a goal while appending a risk", blastRadius.stderr);
  const afterBlastRadius = yamlModule.parseYamlFile<{
    goal: string;
    scope: { in: string[] };
    done_criteria: string[];
    risks: string[];
    notes: string[];
    intake_questions: Array<{ id: string }>;
  }>(generatedMilestonePath);
  context.assert(
    afterBlastRadius.goal === "Goal edited alongside one new risk."
      && beforeScalarEdit.scope.in.every((entry) => afterBlastRadius.scope.in.includes(entry))
      && beforeScalarEdit.done_criteria.every((entry) => afterBlastRadius.done_criteria.includes(entry))
      && beforeScalarEdit.notes.every((entry) => afterBlastRadius.notes.includes(entry))
      && beforeScalarEdit.risks.every((entry) => afterBlastRadius.risks.includes(entry))
      && afterBlastRadius.risks.includes("An additional risk.")
      && beforeScalarEdit.intake_questions.every(
        (question) => afterBlastRadius.intake_questions.some((entry) => entry.id === question.id),
      ),
    "editing a milestone goal while adding one risk preserves every other recorded list entry",
  );

  // Intake questions merge by id, and a restated id replaces only that question.
  const intakeMerge = cli([
    "roadmap-generate",
    "milestone",
    "--id",
    "authoring",
    "--intake-question",
    "risks|What milestone risks could change the plan?|Risk review context.|Missing risk review affects dependencies and timing.|Review risks before committing.",
  ], { cwd: roadmapGenerateDir });
  context.assert(intakeMerge.status === 0, "roadmap-generate milestone appends a new intake question", intakeMerge.stderr);
  const afterIntakeMerge = yamlModule.parseYamlFile<{ intake_questions: Array<{ id: string; question: string }> }>(generatedMilestonePath);
  context.assert(
    afterIntakeMerge.intake_questions.some((entry) => entry.id === "risks")
      && beforeScalarEdit.intake_questions.every(
        (question) => afterIntakeMerge.intake_questions.some((entry) => entry.id === question.id),
      ),
    "a new intake question merges alongside the recorded ones",
  );

  // Removing a recorded entry requires naming it, and an ambiguous substring is refused.
  const removeNamedRisk = cli([
    "roadmap-generate", "milestone", "--id", "authoring", "--remove-risk", "An additional risk.",
  ], { cwd: roadmapGenerateDir });
  const afterRiskRemoval = yamlModule.parseYamlFile<{ risks: string[] }>(generatedMilestonePath);
  context.assert(
    removeNamedRisk.status === 0 && !afterRiskRemoval.risks.includes("An additional risk."),
    "roadmap-generate milestone --remove-risk drops the named risk",
    removeNamedRisk.stderr,
  );
  const missingRemoval = cli([
    "roadmap-generate", "milestone", "--id", "authoring", "--remove-note", "no such note anywhere",
  ], { cwd: roadmapGenerateDir });
  context.assert(
    missingRemoval.status !== 0 && missingRemoval.stderr.includes("matched no entry"),
    "roadmap-generate milestone refuses a removal that matches no entry",
    missingRemoval.stderr,
  );

  context.assert(
    readFileSync(standalonePath, "utf8") === standaloneBeforeUpdate,
    "roadmap-generate milestone edits still do not rewrite standalone planned-change files",
  );

  // Restating an intake question id replaces just that question and leaves its siblings recorded.
  const beforeIntakeRestate = yamlModule.parseYamlFile<{ intake_questions: Array<{ id: string }> }>(generatedMilestonePath);
  const restateIntake = cli([
    "roadmap-generate",
    "milestone",
    "--id",
    "authoring",
    "--intake-question",
    "objective|What different outcome should this milestone deliver?|Restating an id edits just that question.|A silent replacement would lose recorded planning questions.|Restate the question to amend it.",
  ], { cwd: roadmapGenerateDir });
  const afterIntakeRestate = yamlModule.parseYamlFile<{ intake_questions: Array<{ id: string; question: string }> }>(generatedMilestonePath);
  context.assert(
    restateIntake.status === 0
      && afterIntakeRestate.intake_questions.find((entry) => entry.id === "objective")?.question
        === "What different outcome should this milestone deliver?"
      && beforeIntakeRestate.intake_questions.every(
        (question) => afterIntakeRestate.intake_questions.some((entry) => entry.id === question.id),
      ),
    "roadmap-generate milestone restating an intake question id edits only that question",
    restateIntake.stdout,
  );

  // Naming one intake question id twice in a single invocation with different content is a typo.
  const beforeIntakeConflict = readFileSync(generatedMilestonePath, "utf8");
  const sameInvocationIntakeConflict = cli([
    "roadmap-generate",
    "milestone",
    "--id",
    "authoring",
    "--intake-question",
    "objective|First wording in one invocation.|Context one.|Impact one.|Recommendation one.",
    "--intake-question",
    "objective|Second wording in the same invocation.|Context two.|Impact two.|Recommendation two.",
  ], { cwd: roadmapGenerateDir });
  context.assert(
    sameInvocationIntakeConflict.status !== 0
      && sameInvocationIntakeConflict.stdout.includes("supplied twice in one invocation")
      && readFileSync(generatedMilestonePath, "utf8") === beforeIntakeConflict,
    "roadmap-generate milestone reports one intake question id supplied twice in a single invocation",
    sameInvocationIntakeConflict.stdout,
  );

  // Removing an intake question requires naming its id.
  const removeIntake = cli([
    "roadmap-generate", "milestone", "--id", "authoring", "--remove-intake-question", "risks",
  ], { cwd: roadmapGenerateDir });
  const afterIntakeRemoval = yamlModule.parseYamlFile<{ intake_questions: Array<{ id: string }> }>(generatedMilestonePath);
  context.assert(
    removeIntake.status === 0
      && !afterIntakeRemoval.intake_questions.some((entry) => entry.id === "risks")
      && afterIntakeRemoval.intake_questions.some((entry) => entry.id === "objective"),
    "roadmap-generate milestone --remove-intake-question drops only the named question",
    removeIntake.stderr,
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

  // A supplied scalar replaces the recorded value directly, and fields the invocation does not
  // name are preserved.
  const scalarUpdate = cli([
    "roadmap-generate",
    "planned-change",
    "--milestone",
    "0001-naming",
    "--id",
    "add-widget",
    "--summary",
    "Replaced summary with no extra flag.",
  ], { cwd: plannedChangeAuthoringDir });
  context.assert(
    scalarUpdate.status === 0,
    "roadmap-generate planned-change replaces a scalar field without any confirming flag",
    scalarUpdate.stdout || scalarUpdate.stderr,
  );
  const updatedArtifact = yamlModule.parseYamlFile<{ summary: string; details: string }>(
    path.join(plannedChangesDir, "0001-naming-add-widget.yaml"),
  );
  context.assert(
    updatedArtifact.summary === "Replaced summary with no extra flag."
      && updatedArtifact.details === "Concrete planning detail for the widget work.",
    "roadmap-generate planned-change updates the supplied field and preserves the rest",
  );

  const teamUpdate = cli([
    "roadmap-generate",
    "planned-change",
    "--milestone",
    "0001-naming",
    "--id",
    "add-widget",
    "--owner",
    "platform-team",
    "--reviewer",
    "reviewer-a",
    "--reviewer",
    "reviewer-b",
    "--blocked",
    "true",
    "--blocked-reason",
    "Awaiting API contract",
    "--label",
    "cli",
    "--label",
    "yaml",
    "--external-ref",
    "ticket|OPS-42",
  ], { cwd: plannedChangeAuthoringDir });
  context.assert(teamUpdate.status === 0, "roadmap-generate planned-change authors structured team metadata", teamUpdate.stdout || teamUpdate.stderr);
  const teamArtifact = yamlModule.parseYamlFile<{
    team: {
      owner?: string;
      reviewers?: string[];
      blocked?: { status: boolean; reason?: string };
      labels?: string[];
      external_refs?: Array<{ label: string; target: string }>;
    };
  }>(path.join(plannedChangesDir, "0001-naming-add-widget.yaml"));
  context.assert(
    teamArtifact.team.owner === "platform-team"
      && teamArtifact.team.reviewers?.join(",") === "reviewer-a,reviewer-b"
      && teamArtifact.team.blocked?.status === true
      && teamArtifact.team.blocked.reason === "Awaiting API contract"
      && teamArtifact.team.labels?.join(",") === "cli,yaml"
      && teamArtifact.team.external_refs?.[0]?.label === "ticket"
      && teamArtifact.team.external_refs[0]?.target === "OPS-42",
    "roadmap-generate planned-change writes owner, reviewers, blocked state, labels, and external references",
  );

  const teamRemoval = cli([
    "roadmap-generate",
    "planned-change",
    "--milestone",
    "0001-naming",
    "--id",
    "add-widget",
    "--clear-owner",
    "--remove-reviewer",
    "reviewer-a",
    "--clear-blocked",
    "--remove-label",
    "cli",
    "--remove-external-ref",
    "ticket",
  ], { cwd: plannedChangeAuthoringDir });
  context.assert(teamRemoval.status === 0, "roadmap-generate planned-change removes named team metadata", teamRemoval.stdout || teamRemoval.stderr);
  const trimmedTeamArtifact = yamlModule.parseYamlFile<typeof teamArtifact>(path.join(plannedChangesDir, "0001-naming-add-widget.yaml"));
  context.assert(
    trimmedTeamArtifact.team.owner === undefined
      && trimmedTeamArtifact.team.reviewers?.join(",") === "reviewer-b"
      && trimmedTeamArtifact.team.blocked === undefined
      && trimmedTeamArtifact.team.labels?.join(",") === "yaml"
      && trimmedTeamArtifact.team.external_refs === undefined,
    "roadmap-generate planned-change removes only explicitly named team entries",
  );

  const teamBytesBeforeUnmatchedRemoval = readFileSync(path.join(plannedChangesDir, "0001-naming-add-widget.yaml"), "utf8");
  const unmatchedTeamRemoval = cli([
    "roadmap-generate", "planned-change", "--milestone", "0001-naming", "--id", "add-widget",
    "--remove-reviewer", "reviewer-a",
  ], { cwd: plannedChangeAuthoringDir });
  context.assert(unmatchedTeamRemoval.status !== 0, "roadmap-generate rejects an unmatched exact team removal");
  const unmatchedTeamRemovalJson = JSON.parse(unmatchedTeamRemoval.stdout.trim());
  context.assert(
    unmatchedTeamRemovalJson.diagnostics.some((entry: { fieldPath?: string }) => entry.fieldPath === "$.team.reviewers"),
    "an unmatched team removal reports its structured field path",
  );
  context.assert(
    readFileSync(path.join(plannedChangesDir, "0001-naming-add-widget.yaml"), "utf8") === teamBytesBeforeUnmatchedRemoval,
    "an unmatched team removal leaves the planned change byte-identical",
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
    // A milestone owning an in-progress planned change declares `proposed`: the
    // milestone status set no longer distinguishes started from not-yet-started
    // work. The in-progress signal lives on the planned change's own `state`.
    status: "proposed",
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
      status: "proposed",
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

const roadmapArchiveDependencyDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-archive-dependency-"));
try {
  // A complete milestone whose standalone planned change is depended on by an
  // active milestone's standalone planned change. After the complete milestone
  // is archived, the active dependency target lives in roadmap/archive and must
  // still resolve as a satisfied (completed) dependency, not a missing one.
  mkdirSync(
    path.join(roadmapArchiveDependencyDir, ".strict-spec-driven", "changes", "archive", `${formatLocalDateStamp()}-base-work`),
    { recursive: true },
  );
  mkdirSync(path.join(roadmapArchiveDependencyDir, ".strict-spec-driven", "changes", "followup-work"), { recursive: true });

  writeRoadmapMilestoneArtifact(roadmapArchiveDependencyDir, "0001-base.yaml", {
    id: "0001-base",
    title: "Base Milestone",
    goal: "Ship foundational work that later milestones depend on.",
    status: "complete",
    plannedChanges: [],
  });
  writeRoadmapMilestoneArtifact(roadmapArchiveDependencyDir, "0002-followup.yaml", {
    id: "0002-followup",
    title: "Followup Milestone",
    goal: "Depend on completed-and-archived base work.",
    status: "proposed",
    plannedChanges: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapArchiveDependencyDir, "planned-changes/0001-base-base-work.yaml", {
    id: "base-work",
    milestone: "0001-base",
    status: "complete",
    summary: "Foundational work that gets archived.",
    details: "Standalone details for base-work.",
    depends_on: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapArchiveDependencyDir, "planned-changes/0002-followup-followup-work.yaml", {
    id: "followup-work",
    milestone: "0002-followup",
    status: "planned",
    summary: "Followup work depends on archived base work.",
    details: "Standalone details for followup-work.",
    depends_on: ["base-work"],
  });
  writeRoadmapIndexArtifact(roadmapArchiveDependencyDir, [
    {
      id: "0001-base",
      title: "Base Milestone",
      path: "roadmap/milestones/0001-base.yaml",
      status: "complete",
    },
    {
      id: "0002-followup",
      title: "Followup Milestone",
      path: "roadmap/milestones/0002-followup.yaml",
      status: "proposed",
    },
  ]);

  const dependencyArchive = cli(["roadmap-archive", "0001-base"], { cwd: roadmapArchiveDependencyDir });
  context.assert(dependencyArchive.status === 0, "roadmap-archive archives a complete milestone depended on by active work", dependencyArchive.stderr);
  const dependencyArchiveJson = JSON.parse(dependencyArchive.stdout.trim());
  context.assert(
    dependencyArchiveJson.valid === true
      && dependencyArchiveJson.archivedMilestones.length === 1
      && dependencyArchiveJson.archivedMilestones[0].id === "0001-base"
      && !existsSync(path.join(roadmapArchiveDependencyDir, ".strict-spec-driven", "roadmap", "milestones", "0001-base.yaml"))
      && !existsSync(path.join(roadmapArchiveDependencyDir, ".strict-spec-driven", "roadmap", "planned-changes", "0001-base-base-work.yaml"))
      && existsSync(path.join(roadmapArchiveDependencyDir, ".strict-spec-driven", "roadmap", "planned-changes", "0002-followup-followup-work.yaml")),
    "roadmap-archive moves the complete milestone and its completed planned change into the archive while leaving active dependent work in place",
    dependencyArchive.stdout,
  );

  const dependencyStatus = cli(["roadmap-status"], { cwd: roadmapArchiveDependencyDir });
  context.assert(dependencyStatus.status === 0, "roadmap-status stays valid when active work depends on an archived planned change", dependencyStatus.stderr);
  const dependencyStatusJson = JSON.parse(dependencyStatus.stdout.trim());
  context.assert(
    dependencyStatusJson.valid === true
      && dependencyStatusJson.diagnostics.length === 0
      && !JSON.stringify(dependencyStatusJson.diagnostics).includes("dependency is missing"),
    "roadmap-status does not report a missing dependency for an archived planned-change target",
    dependencyStatus.stdout,
  );

  const dependencySync = cli(["roadmap-sync"], { cwd: roadmapArchiveDependencyDir });
  context.assert(dependencySync.status === 0, "roadmap-sync stays valid when active work depends on an archived planned change", dependencySync.stderr);
  const dependencySyncJson = JSON.parse(dependencySync.stdout.trim());
  context.assert(
    dependencySyncJson.valid === true
      && dependencySyncJson.diagnostics.length === 0,
    "roadmap-sync does not report a missing dependency for an archived planned-change target",
    dependencySync.stdout,
  );
} finally {
  rmSync(roadmapArchiveDependencyDir, { recursive: true, force: true });
}

const roadmapRecommendArchivedDependencyDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-recommend-archived-dependency-"));
try {
  // Recommendation resolves dependency targets against the same
  // active-union-archived universe validation uses. Once the milestone owning a
  // dependency target is archived, the target lives in roadmap/archive, and the
  // planned change that depends on it is still the next work to do.
  mkdirSync(
    path.join(
      roadmapRecommendArchivedDependencyDir,
      ".strict-spec-driven",
      "changes",
      "archive",
      `${formatLocalDateStamp()}-base-work`,
    ),
    { recursive: true },
  );

  writeRoadmapMilestoneArtifact(roadmapRecommendArchivedDependencyDir, "0001-base.yaml", {
    id: "0001-base",
    title: "Base Milestone",
    goal: "Ship foundational work that later milestones depend on.",
    status: "complete",
    plannedChanges: [],
  });
  writeRoadmapMilestoneArtifact(roadmapRecommendArchivedDependencyDir, "0002-followup.yaml", {
    id: "0002-followup",
    title: "Followup Milestone",
    goal: "Depend on completed-and-archived base work.",
    status: "proposed",
    plannedChanges: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapRecommendArchivedDependencyDir, "planned-changes/0001-base-base-work.yaml", {
    id: "base-work",
    milestone: "0001-base",
    status: "complete",
    summary: "Foundational work that gets archived.",
    details: "Standalone details for base-work.",
    depends_on: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapRecommendArchivedDependencyDir, "planned-changes/0002-followup-followup-work.yaml", {
    id: "followup-work",
    milestone: "0002-followup",
    status: "planned",
    summary: "Followup work depends on archived base work.",
    details: "Standalone details for followup-work.",
    depends_on: ["base-work"],
  });
  writeStandalonePlannedChangeArtifact(roadmapRecommendArchivedDependencyDir, "planned-changes/0002-followup-later-work.yaml", {
    id: "later-work",
    milestone: "0002-followup",
    status: "planned",
    summary: "Later work depends on active incomplete work.",
    details: "Standalone details for later-work.",
    depends_on: ["followup-work"],
  });
  writeRoadmapIndexArtifact(roadmapRecommendArchivedDependencyDir, [
    {
      id: "0001-base",
      title: "Base Milestone",
      path: "roadmap/milestones/0001-base.yaml",
      status: "complete",
    },
    {
      id: "0002-followup",
      title: "Followup Milestone",
      path: "roadmap/milestones/0002-followup.yaml",
      status: "proposed",
    },
  ]);

  const recommendArchiveBase = cli(["roadmap-archive", "0001-base"], { cwd: roadmapRecommendArchivedDependencyDir });
  context.assert(
    recommendArchiveBase.status === 0,
    "roadmap-archive archives the milestone owning a dependency target of active work",
    recommendArchiveBase.stderr,
  );

  const recommendAfterArchive = cli(["roadmap-recommend", "--details"], { cwd: roadmapRecommendArchivedDependencyDir });
  context.assert(
    recommendAfterArchive.status === 0,
    "roadmap-recommend exits zero when the only dependency target has been moved into the roadmap archive",
    recommendAfterArchive.stdout || recommendAfterArchive.stderr,
  );
  const recommendAfterArchiveJson = JSON.parse(recommendAfterArchive.stdout.trim());
  context.assert(
    recommendAfterArchiveJson.status === "recommended"
      && recommendAfterArchiveJson.recommendation?.id === "followup-work",
    "roadmap-recommend selects the planned change whose dependency target was archived",
    recommendAfterArchive.stdout,
  );
  const archivedDependencyCandidate = recommendAfterArchiveJson.candidates.find(
    (candidate: { id: string }) => candidate.id === "followup-work",
  );
  context.assert(
    archivedDependencyCandidate?.eligible === true
      && archivedDependencyCandidate.skipReasons.length === 0,
    "roadmap-recommend reports no skip reason for a dependency target that resolves to the roadmap archive",
    recommendAfterArchive.stdout,
  );
  const activeDependencyCandidate = recommendAfterArchiveJson.candidates.find(
    (candidate: { id: string }) => candidate.id === "later-work",
  );
  context.assert(
    activeDependencyCandidate?.eligible === false
      && activeDependencyCandidate.skipReasons.some(
        (reason: { code: string }) => reason.code === "dependency-incomplete",
      ),
    "roadmap-recommend still skips a candidate whose active dependency target is incomplete",
    recommendAfterArchive.stdout,
  );

  const recommendStatusAfterArchive = cli(["roadmap-status"], { cwd: roadmapRecommendArchivedDependencyDir });
  context.assert(
    recommendStatusAfterArchive.status === 0,
    "roadmap-status exits zero after the dependency target milestone is archived",
    recommendStatusAfterArchive.stderr,
  );
  const recommendStatusAfterArchiveJson = JSON.parse(recommendStatusAfterArchive.stdout.trim());
  const followupPlannedChanges = recommendStatusAfterArchiveJson.milestones[0].plannedChanges;
  const followupStatusEntry = followupPlannedChanges.find(
    (plannedChange: { id: string }) => plannedChange.id === "followup-work",
  );
  const laterStatusEntry = followupPlannedChanges.find(
    (plannedChange: { id: string }) => plannedChange.id === "later-work",
  );
  context.assert(
    Array.isArray(followupStatusEntry?.archivedDependsOn)
      && followupStatusEntry.archivedDependsOn.length === 1
      && followupStatusEntry.archivedDependsOn[0] === "base-work"
      && followupStatusEntry.dependsOn.length === 1
      && Array.isArray(laterStatusEntry?.archivedDependsOn)
      && laterStatusEntry.archivedDependsOn.length === 0,
    "roadmap-status marks only the dependency ids that resolve to archived planned changes",
    recommendStatusAfterArchive.stdout,
  );

  const recommendOverviewAfterArchive = cli(["roadmap-overview"], { cwd: roadmapRecommendArchivedDependencyDir });
  context.assert(
    recommendOverviewAfterArchive.status === 0,
    "roadmap-overview exits zero after the dependency target milestone is archived",
    recommendOverviewAfterArchive.stderr,
  );
  context.assert(
    recommendOverviewAfterArchive.stdout.split("archived dependencies: base-work").length === 2,
    "roadmap-overview renders the archived dependency target exactly once, on the planned change that declares it",
    recommendOverviewAfterArchive.stdout,
  );
} finally {
  rmSync(roadmapRecommendArchivedDependencyDir, { recursive: true, force: true });
}

const roadmapRecommendUnknownDependencyDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-recommend-unknown-dependency-"));
try {
  // Treating an archived dependency target as satisfied must not extend to a
  // target that exists in neither active roadmap state nor the roadmap archive.
  writeRoadmapMilestoneArtifact(roadmapRecommendUnknownDependencyDir, "0001-unknown.yaml", {
    id: "0001-unknown",
    title: "Unknown Dependency Milestone",
    goal: "Prove an unresolvable dependency target is still reported.",
    status: "proposed",
    plannedChanges: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapRecommendUnknownDependencyDir, "planned-changes/0001-unknown-dangling-work.yaml", {
    id: "dangling-work",
    milestone: "0001-unknown",
    status: "planned",
    summary: "Work whose dependency target exists nowhere.",
    details: "Standalone details for dangling-work.",
    depends_on: ["ghost-work"],
  });
  writeRoadmapIndexArtifact(roadmapRecommendUnknownDependencyDir, [
    {
      id: "0001-unknown",
      title: "Unknown Dependency Milestone",
      path: "roadmap/milestones/0001-unknown.yaml",
      status: "proposed",
    },
  ]);

  const unknownDependencyRecommend = cli(["roadmap-recommend", "--details"], { cwd: roadmapRecommendUnknownDependencyDir });
  context.assert(
    unknownDependencyRecommend.status !== 0,
    "roadmap-recommend exits non-zero when a dependency target exists in neither active roadmap state nor the archive",
    unknownDependencyRecommend.stdout,
  );
  const unknownDependencyRecommendJson = JSON.parse(unknownDependencyRecommend.stdout.trim());
  context.assert(
    unknownDependencyRecommendJson.status === "roadmap-error"
      && unknownDependencyRecommendJson.recommendation === null
      && unknownDependencyRecommendJson.diagnostics.some(
        (diagnostic: { message: string; actual?: string }) =>
          diagnostic.actual === "ghost-work" || diagnostic.message.includes("ghost-work"),
      ),
    "roadmap-recommend reports the unresolvable dependency target instead of treating it as satisfied",
    unknownDependencyRecommend.stdout,
  );
} finally {
  rmSync(roadmapRecommendUnknownDependencyDir, { recursive: true, force: true });
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

const roadmapPauseDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-pause-"));
try {
  // A milestone with a pending standalone planned change derives status proposed
  // and is eligible for roadmap-recommend.
  writeRoadmapMilestoneArtifact(roadmapPauseDir, "0001-pause.yaml", {
    id: "0001-pause",
    title: "Pause Workflow",
    goal: "Pause and resume a milestone without losing state.",
    status: "proposed",
    plannedChanges: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapPauseDir, "planned-changes/0001-pause-pending-change.yaml", {
    id: "pending-change",
    milestone: "0001-pause",
    status: "planned",
    summary: "Pending work the pause should hide from recommendation.",
    details: "Standalone details for pending-change.",
    depends_on: [],
  });
  writeRoadmapIndexArtifact(roadmapPauseDir, [
    {
      id: "0001-pause",
      title: "Pause Workflow",
      path: "roadmap/milestones/0001-pause.yaml",
      status: "proposed",
    },
  ]);

  const pauseStatusBefore = cli(["roadmap-status"], { cwd: roadmapPauseDir });
  context.assert(pauseStatusBefore.status === 0, "roadmap-status exits zero for a proposed milestone before pause");
  const pauseStatusBeforeJson = JSON.parse(pauseStatusBefore.stdout.trim());
  context.assert(
    pauseStatusBeforeJson.milestones[0].declaredStatus === "proposed"
      && pauseStatusBeforeJson.milestones[0].derivedStatus === "proposed",
    "roadmap-status reports a proposed milestone before pause",
  );

  // roadmap-recommend initially selects the pending planned change.
  const recommendBeforePause = cli(["roadmap-recommend"], { cwd: roadmapPauseDir });
  context.assert(recommendBeforePause.status === 0, "roadmap-recommend exits zero before pause");
  context.assert(
    JSON.parse(recommendBeforePause.stdout.trim()).recommendation?.id === "pending-change",
    "roadmap-recommend initially selects the pending planned change",
  );

  // Pause the milestone with a concrete reason.
  const roadmapPause = cli(
    ["roadmap-pause", "0001-pause", "--reason", "waiting on external vendor API contract"],
    { cwd: roadmapPauseDir },
  );
  context.assert(roadmapPause.status === 0, "roadmap-pause exits zero for a proposed milestone", `got ${roadmapPause.status}: ${roadmapPause.stdout}`);
  const roadmapPauseJson = JSON.parse(roadmapPause.stdout.trim());
  context.assert(roadmapPauseJson.valid === true, "roadmap-pause reports valid=true");
  context.assert(
    roadmapPauseJson.paused.id === "0001-pause"
      && roadmapPauseJson.paused.previousStatus === "proposed"
      && roadmapPauseJson.paused.newStatus === "blocked",
    "roadmap-pause reports the milestone moved from proposed to blocked",
  );
  context.assert(
    roadmapPauseJson.paused.paused.status === true
      && roadmapPauseJson.paused.paused.reason === "waiting on external vendor API contract"
      && typeof roadmapPauseJson.paused.paused.paused_on === "string"
      && /^\d{4}-\d{2}-\d{2}$/.test(roadmapPauseJson.paused.paused.paused_on),
    "roadmap-pause records a structured paused mapping with reason and paused_on date",
    `paused: ${JSON.stringify(roadmapPauseJson.paused.paused)}`,
  );
  context.assert(
    roadmapPauseJson.updatedFiles.some((file: string) => file.endsWith("roadmap/milestones/0001-pause.yaml")),
    "roadmap-pause records the milestone file as updated",
  );

  // The milestone file carries the structured paused field plus a dated note.
  const pausedMilestoneArtifact = yamlModule.parseYamlFile<{
    status: string;
    paused?: { status?: boolean; reason?: string; paused_on?: string };
    notes: string[];
  }>(path.join(roadmapPauseDir, ".strict-spec-driven", "roadmap", "milestones", "0001-pause.yaml"));
  context.assert(
    pausedMilestoneArtifact.status === "blocked",
    "roadmap-pause writes status blocked to the milestone file",
  );
  context.assert(
    pausedMilestoneArtifact.paused?.status === true
      && pausedMilestoneArtifact.paused?.reason === "waiting on external vendor API contract"
      && typeof pausedMilestoneArtifact.paused?.paused_on === "string",
    "roadmap-pause writes the structured paused field to the milestone file",
  );
  context.assert(
    pausedMilestoneArtifact.notes.some((note: string) => note.startsWith("Paused on ") && note.includes("waiting on external vendor API contract")),
    "roadmap-pause appends a dated pause note carrying the reason",
  );

  // roadmap-status now reports declared/derived blocked with no mismatch.
  const pauseStatusAfter = cli(["roadmap-status"], { cwd: roadmapPauseDir });
  context.assert(pauseStatusAfter.status === 0, "roadmap-status stays zero after pause");
  const pauseStatusAfterJson = JSON.parse(pauseStatusAfter.stdout.trim());
  context.assert(
    pauseStatusAfterJson.milestones[0].declaredStatus === "blocked"
      && pauseStatusAfterJson.milestones[0].derivedStatus === "blocked"
      && pauseStatusAfterJson.milestones[0].mismatches.length === 0,
    "roadmap-status reports the paused milestone as blocked with no declared/derived mismatch",
  );

  // roadmap-sync must preserve the pause rather than reverting to derived proposed.
  const intermediateSync = cli(["roadmap-sync"], { cwd: roadmapPauseDir });
  context.assert(intermediateSync.status === 0, "roadmap-sync exits zero after pause");
  const intermediateMilestone = yamlModule.parseYamlFile<{ status: string; paused?: { status?: boolean } }>(
    path.join(roadmapPauseDir, ".strict-spec-driven", "roadmap", "milestones", "0001-pause.yaml"),
  );
  context.assert(
    intermediateMilestone.status === "blocked" && intermediateMilestone.paused?.status === true,
    "roadmap-sync keeps the paused milestone blocked rather than reverting to derived proposed",
  );

  // roadmap-recommend skips the paused milestone with a milestone-paused reason.
  const recommendDuringPause = cli(["roadmap-recommend", "--details"], { cwd: roadmapPauseDir });
  context.assert(recommendDuringPause.status !== 0, "roadmap-recommend exits non-zero when no candidate is eligible");
  const recommendDuringPauseJson = JSON.parse(recommendDuringPause.stdout.trim());
  context.assert(
    recommendDuringPauseJson.status === "no-candidate"
      && recommendDuringPauseJson.recommendation === null,
    "roadmap-recommend does not recommend any planned change while the milestone is paused",
  );
  context.assert(
    recommendDuringPauseJson.candidates.some(
      (c: { id: string; skipReasons: { code: string }[] }) =>
        c.id === "pending-change" && c.skipReasons.some((r) => r.code === "milestone-paused"),
    ),
    "roadmap-recommend reports a milestone-paused skip reason on the paused milestone candidate",
  );

  // Standalone planned-change file is unchanged after pause.
  const pausedPlannedChangePath = path.join(
    roadmapPauseDir,
    ".strict-spec-driven",
    "roadmap",
    "planned-changes",
    "0001-pause-pending-change.yaml",
  );
  const pausedPlannedChangeContent = readFileSync(pausedPlannedChangePath, "utf8");
  context.assert(
    pausedPlannedChangeContent.includes("status: planned") && !pausedPlannedChangeContent.includes("paused"),
    "roadmap-pause does not modify standalone planned-change files",
  );

  // Resume the milestone and confirm re-derivation to proposed.
  const roadmapResume = cli(
    ["roadmap-resume", "0001-pause", "--reason", "vendor delivered the API contract"],
    { cwd: roadmapPauseDir },
  );
  context.assert(roadmapResume.status === 0, "roadmap-resume exits zero for a paused milestone", `got ${roadmapResume.status}: ${roadmapResume.stdout}`);
  const roadmapResumeJson = JSON.parse(roadmapResume.stdout.trim());
  context.assert(roadmapResumeJson.valid === true, "roadmap-resume reports valid=true");
  context.assert(
    roadmapResumeJson.resumed.id === "0001-pause"
      && roadmapResumeJson.resumed.previousStatus === "blocked"
      && roadmapResumeJson.resumed.newStatus === "proposed",
    "roadmap-resume moves the milestone back from blocked to its derived proposed status",
  );
  context.assert(
    roadmapResumeJson.resumed.previousPaused?.status === true,
    "roadmap-resume reports the previously cleared paused field",
  );

  // The milestone file no longer carries the paused field and shows the resume note.
  const resumedMilestoneArtifact = yamlModule.parseYamlFile<{
    status: string;
    paused?: { status?: boolean };
    notes: string[];
  }>(path.join(roadmapPauseDir, ".strict-spec-driven", "roadmap", "milestones", "0001-pause.yaml"));
  context.assert(
    resumedMilestoneArtifact.status === "proposed" && resumedMilestoneArtifact.paused === undefined,
    "roadmap-resume deletes the paused field and re-derives status from planned-change state",
  );
  context.assert(
    resumedMilestoneArtifact.notes.some((note: string) => note.startsWith("Resumed on ") && note.includes("vendor delivered the API contract")),
    "roadmap-resume appends a dated resume note carrying the reason",
  );

  // roadmap-recommend now considers the milestone's planned change again.
  const recommendAfterResume = cli(["roadmap-recommend"], { cwd: roadmapPauseDir });
  context.assert(recommendAfterResume.status === 0, "roadmap-recommend exits zero after resume");
  const recommendAfterResumeJson = JSON.parse(recommendAfterResume.stdout.trim());
  context.assert(
    recommendAfterResumeJson.status === "recommended"
      && recommendAfterResumeJson.recommendation?.id === "pending-change",
    "roadmap-recommend selects the previously paused planned change after resume",
  );

  // Resume on a non-paused milestone is rejected.
  const resumeNotPaused = cli(["roadmap-resume", "0001-pause"], { cwd: roadmapPauseDir });
  context.assert(resumeNotPaused.status !== 0, "roadmap-resume exits non-zero when the milestone is not paused");
  const resumeNotPausedJson = JSON.parse(resumeNotPaused.stdout.trim());
  context.assert(
    resumeNotPausedJson.valid === false
      && resumeNotPausedJson.diagnostics.some((d: { message: string }) => d.message.includes("not paused")),
    "roadmap-resume reports a not-paused diagnostic",
  );

  // Pause and resume on an unknown milestone id is rejected.
  const pauseMissing = cli(["roadmap-pause", "does-not-exist"], { cwd: roadmapPauseDir });
  context.assert(pauseMissing.status !== 0, "roadmap-pause exits non-zero for an unknown milestone id");
  const pauseMissingJson = JSON.parse(pauseMissing.stdout.trim());
  context.assert(
    pauseMissingJson.valid === false
      && pauseMissingJson.diagnostics.some((d: { message: string }) => d.message.includes("was not found in the roadmap")),
    "roadmap-pause reports a not-found diagnostic for an unknown milestone id",
  );
  const resumeMissing = cli(["roadmap-resume", "does-not-exist"], { cwd: roadmapPauseDir });
  context.assert(resumeMissing.status !== 0, "roadmap-resume exits non-zero for an unknown milestone id");

  // Missing milestone-id prints usage.
  const pauseNoArg = cli(["roadmap-pause"], { cwd: roadmapPauseDir });
  context.assert(pauseNoArg.status !== 0, "roadmap-pause exits non-zero when no milestone id is supplied");
  const resumeNoArg = cli(["roadmap-resume"], { cwd: roadmapPauseDir });
  context.assert(resumeNoArg.status !== 0, "roadmap-resume exits non-zero when no milestone id is supplied");

  // Pausing a second time updates the reason and keeps status blocked.
  const rePause = cli(["roadmap-pause", "0001-pause", "--reason", "vendor slipped the delivery date"], { cwd: roadmapPauseDir });
  context.assert(rePause.status === 0, "roadmap-pause exits zero when re-pausing an already-resumed milestone");
  const rePauseJson = JSON.parse(rePause.stdout.trim());
  context.assert(
    rePauseJson.paused.previousStatus === "proposed"
      && rePauseJson.paused.newStatus === "blocked"
      && rePauseJson.paused.paused.reason === "vendor slipped the delivery date",
    "roadmap-pause re-pauses a resumed milestone with the new reason",
  );
} finally {
  rmSync(roadmapPauseDir, { recursive: true, force: true });
}

const roadmapMoveDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-move-"));
try {
  const movePlannedChangesDir = path.join(roadmapMoveDir, ".strict-spec-driven", "roadmap", "planned-changes");
  const readMoveFile = (fileName: string): string => readFileSync(path.join(movePlannedChangesDir, fileName), "utf8");

  // `widget` has an in-progress strict change; `done-change` has an archived one.
  mkdirSync(path.join(roadmapMoveDir, ".strict-spec-driven", "changes", "widget"), { recursive: true });
  mkdirSync(
    path.join(roadmapMoveDir, ".strict-spec-driven", "changes", "archive", `${formatLocalDateStamp()}-done-change`),
    { recursive: true },
  );

  writeRoadmapMilestoneArtifact(roadmapMoveDir, "alpha.yaml", {
    id: "alpha",
    title: "Alpha",
    goal: "Own the work that later moves to another milestone.",
    status: "proposed",
    plannedChanges: [],
    order: 100,
  });
  writeRoadmapMilestoneArtifact(roadmapMoveDir, "beta.yaml", {
    id: "beta",
    title: "Beta",
    goal: "Receive planned changes moved from earlier milestones.",
    status: "proposed",
    plannedChanges: [],
    order: 200,
  });
  writeStandalonePlannedChangeArtifact(roadmapMoveDir, "planned-changes/alpha-widget.yaml", {
    id: "widget",
    milestone: "alpha",
    status: "planned",
    summary: "Work that belongs in a different milestone.",
    details: "Standalone details for widget.",
    depends_on: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapMoveDir, "planned-changes/alpha-gadget.yaml", {
    id: "gadget",
    milestone: "alpha",
    status: "planned",
    summary: "Work in the earlier milestone that depends on the moved work.",
    details: "Standalone details for gadget.",
    depends_on: ["widget"],
  });
  writeStandalonePlannedChangeArtifact(roadmapMoveDir, "planned-changes/beta-gadget.yaml", {
    id: "beta-gadget",
    milestone: "beta",
    status: "planned",
    summary: "Existing work occupying the canonical destination basename.",
    details: "Standalone details for beta-gadget.",
    depends_on: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapMoveDir, "planned-changes/alpha-done-change.yaml", {
    id: "done-change",
    milestone: "alpha",
    status: "complete",
    summary: "Completed work whose strict change is archived.",
    details: "Standalone details for done-change.",
    depends_on: [],
  });
  writeRoadmapIndexArtifact(roadmapMoveDir, [
    { id: "alpha", title: "Alpha", path: "roadmap/milestones/alpha.yaml", status: "proposed" },
    { id: "beta", title: "Beta", path: "roadmap/milestones/beta.yaml", status: "proposed" },
  ]);

  const moveStatusBefore = cli(["roadmap-status"], { cwd: roadmapMoveDir });
  context.assert(
    moveStatusBefore.status === 0,
    "roadmap-status is valid before a planned-change move",
    moveStatusBefore.stdout || moveStatusBefore.stderr,
  );

  // Rejections must leave the roadmap byte-identical and create no destination file.
  const widgetBefore = readMoveFile("alpha-widget.yaml");
  const gadgetBefore = readMoveFile("alpha-gadget.yaml");
  const doneChangeBefore = readMoveFile("alpha-done-change.yaml");

  const moveUnknownPlannedChange = cli(["roadmap-move-planned-change", "missing-change", "--milestone", "beta"], {
    cwd: roadmapMoveDir,
  });
  context.assert(moveUnknownPlannedChange.status !== 0, "roadmap-move-planned-change exits non-zero for an unknown planned change");
  const moveUnknownPlannedChangeJson = JSON.parse(moveUnknownPlannedChange.stdout.trim());
  context.assert(
    moveUnknownPlannedChangeJson.valid === false
      && moveUnknownPlannedChangeJson.updatedFiles.length === 0
      && moveUnknownPlannedChangeJson.diagnostics.some((diagnostic: { message: string }) =>
        diagnostic.message === "roadmap-move-planned-change planned change was not found in the active roadmap"
      ),
    "roadmap-move-planned-change reports a not-found diagnostic for an unknown planned change",
    moveUnknownPlannedChange.stdout,
  );

  const moveUnknownMilestone = cli(["roadmap-move-planned-change", "widget", "--milestone", "missing-milestone"], {
    cwd: roadmapMoveDir,
  });
  context.assert(moveUnknownMilestone.status !== 0, "roadmap-move-planned-change exits non-zero for an unknown target milestone");
  const moveUnknownMilestoneJson = JSON.parse(moveUnknownMilestone.stdout.trim());
  context.assert(
    moveUnknownMilestoneJson.valid === false
      && moveUnknownMilestoneJson.updatedFiles.length === 0
      && moveUnknownMilestoneJson.diagnostics.some((diagnostic: { message: string }) =>
        diagnostic.message === "roadmap-move-planned-change target milestone was not found in the active roadmap"
      ),
    "roadmap-move-planned-change reports a not-found diagnostic for an unknown target milestone",
    moveUnknownMilestone.stdout,
  );

  const moveCollision = cli(["roadmap-move-planned-change", "gadget", "--milestone", "beta"], { cwd: roadmapMoveDir });
  context.assert(moveCollision.status !== 0, "roadmap-move-planned-change exits non-zero when the destination filename is occupied");
  const moveCollisionJson = JSON.parse(moveCollision.stdout.trim());
  context.assert(
    moveCollisionJson.valid === false
      && moveCollisionJson.updatedFiles.length === 0
      && moveCollisionJson.diagnostics.some((diagnostic: { message: string }) =>
        diagnostic.message === "roadmap-move-planned-change destination filename is already occupied"
      ),
    "roadmap-move-planned-change reports an occupied canonical destination filename",
    moveCollision.stdout,
  );

  const moveCompletedWithoutFlag = cli(["roadmap-move-planned-change", "done-change", "--milestone", "beta"], {
    cwd: roadmapMoveDir,
  });
  context.assert(
    moveCompletedWithoutFlag.status !== 0,
    "roadmap-move-planned-change exits non-zero for completed work without --allow-complete",
  );
  const moveCompletedWithoutFlagJson = JSON.parse(moveCompletedWithoutFlag.stdout.trim());
  context.assert(
    moveCompletedWithoutFlagJson.valid === false
      && moveCompletedWithoutFlagJson.updatedFiles.length === 0
      && moveCompletedWithoutFlagJson.diagnostics.some((diagnostic: { message: string }) =>
        diagnostic.message.includes("rerun with --allow-complete to move it deliberately")
      ),
    "roadmap-move-planned-change names --allow-complete when refusing to move completed work",
    moveCompletedWithoutFlag.stdout,
  );

  context.assert(
    readMoveFile("alpha-widget.yaml") === widgetBefore
      && readMoveFile("alpha-gadget.yaml") === gadgetBefore
      && readMoveFile("alpha-done-change.yaml") === doneChangeBefore
      && !existsSync(path.join(movePlannedChangesDir, "beta-widget.yaml"))
      && !existsSync(path.join(movePlannedChangesDir, "beta-done-change.yaml")),
    "a rejected roadmap-move-planned-change leaves no partial state",
  );

  // Happy path: the declared milestone and the canonical filename move together.
  const moveWidget = cli(["roadmap-move-planned-change", "widget", "--milestone", "beta"], { cwd: roadmapMoveDir });
  context.assert(moveWidget.status === 0, "roadmap-move-planned-change exits zero for an active planned change", moveWidget.stdout || moveWidget.stderr);
  const moveWidgetJson = JSON.parse(moveWidget.stdout.trim());
  context.assert(
    moveWidgetJson.valid === true
      && moveWidgetJson.moved.id === "widget"
      && moveWidgetJson.moved.fromMilestone === "alpha"
      && moveWidgetJson.moved.toMilestone === "beta"
      && moveWidgetJson.moved.fromPath === ".strict-spec-driven/roadmap/planned-changes/alpha-widget.yaml"
      && moveWidgetJson.moved.toPath === ".strict-spec-driven/roadmap/planned-changes/beta-widget.yaml",
    "roadmap-move-planned-change reports the planned change, both milestones, and both paths",
    moveWidget.stdout,
  );
  context.assert(
    existsSync(path.join(movePlannedChangesDir, "beta-widget.yaml"))
      && !existsSync(path.join(movePlannedChangesDir, "alpha-widget.yaml")),
    "roadmap-move-planned-change renames the artifact to the canonical target-prefixed basename",
  );
  context.assert(
    Array.isArray(moveWidgetJson.renamedFiles)
      && moveWidgetJson.renamedFiles.length === 1
      && moveWidgetJson.renamedFiles[0].from === ".strict-spec-driven/roadmap/planned-changes/alpha-widget.yaml"
      && moveWidgetJson.renamedFiles[0].to === ".strict-spec-driven/roadmap/planned-changes/beta-widget.yaml",
    "roadmap-move-planned-change reports the rename the same way roadmap-sync --fix-names does",
    moveWidget.stdout,
  );
  const movedWidgetArtifact = yamlModule.parseYamlFile<{ planned_change: { id: string; milestone: string }; summary: string }>(
    path.join(movePlannedChangesDir, "beta-widget.yaml"),
  );
  context.assert(
    movedWidgetArtifact.planned_change.milestone === "beta"
      && movedWidgetArtifact.planned_change.id === "widget"
      && movedWidgetArtifact.summary === "Work that belongs in a different milestone.",
    "roadmap-move-planned-change rewrites the declared milestone without editing planned-change content",
  );

  // depends_on resolves globally, so the move is valid but the now-inverted
  // dependency and the stale change linkage are reported as warnings.
  context.assert(
    moveWidgetJson.warnings.some((warning: string) =>
      warning.includes("active strict change 'widget'")
      && warning.includes("strict-spec-cli generate widget proposal --milestone beta --planned-change widget")
    ),
    "roadmap-move-planned-change warns about the stale active-change proposal roadmap linkage",
    moveWidget.stdout,
  );
  context.assert(
    moveWidgetJson.warnings.some((warning: string) =>
      warning.includes("planned change 'gadget' in earlier milestone 'alpha' depends on 'widget'")
      && warning.includes("later milestone 'beta'")
    ),
    "roadmap-move-planned-change warns about a dependency edge that now points against roadmap order",
    moveWidget.stdout,
  );
  context.assert(
    !existsSync(path.join(roadmapMoveDir, ".strict-spec-driven", "changes", "widget", "proposal.yaml")),
    "roadmap-move-planned-change does not write change artifacts when reporting a stale proposal linkage",
  );

  const moveStatusAfter = cli(["roadmap-status"], { cwd: roadmapMoveDir });
  context.assert(moveStatusAfter.status === 0, "roadmap-status stays valid after a planned-change move", moveStatusAfter.stdout);
  const moveStatusAfterJson = JSON.parse(moveStatusAfter.stdout.trim());
  const alphaAfterMove = moveStatusAfterJson.milestones.find((milestone: { id: string }) => milestone.id === "alpha");
  const betaAfterMove = moveStatusAfterJson.milestones.find((milestone: { id: string }) => milestone.id === "beta");
  context.assert(
    !alphaAfterMove.plannedChanges.some((plannedChange: { id: string }) => plannedChange.id === "widget")
      && betaAfterMove.plannedChanges.some((plannedChange: { id: string }) => plannedChange.id === "widget"),
    "roadmap-status reports the moved planned change under its new milestone",
  );

  // Re-running the same move is an idempotent no-op.
  const movedWidgetContent = readMoveFile("beta-widget.yaml");
  const moveWidgetAgain = cli(["roadmap-move-planned-change", "widget", "--milestone", "beta"], { cwd: roadmapMoveDir });
  context.assert(moveWidgetAgain.status === 0, "roadmap-move-planned-change exits zero when the planned change already declares the target milestone");
  const moveWidgetAgainJson = JSON.parse(moveWidgetAgain.stdout.trim());
  context.assert(
    moveWidgetAgainJson.valid === true
      && moveWidgetAgainJson.updatedFiles.length === 0
      && moveWidgetAgainJson.moved.fromMilestone === "beta"
      && moveWidgetAgainJson.moved.toMilestone === "beta"
      && readMoveFile("beta-widget.yaml") === movedWidgetContent,
    "roadmap-move-planned-change is an idempotent no-op for a planned change already in the target milestone",
    moveWidgetAgain.stdout,
  );

  // Completed work moves only with the explicit flag, and both milestones re-derive.
  const moveCompletedWithFlag = cli(
    ["roadmap-move-planned-change", "done-change", "--milestone", "beta", "--allow-complete"],
    { cwd: roadmapMoveDir },
  );
  context.assert(
    moveCompletedWithFlag.status === 0,
    "roadmap-move-planned-change moves completed work with --allow-complete",
    moveCompletedWithFlag.stdout || moveCompletedWithFlag.stderr,
  );
  context.assert(
    existsSync(path.join(movePlannedChangesDir, "beta-done-change.yaml"))
      && !existsSync(path.join(movePlannedChangesDir, "alpha-done-change.yaml")),
    "roadmap-move-planned-change renames completed work to the canonical target basename",
  );
  const completedMoveStatus = JSON.parse(cli(["roadmap-status"], { cwd: roadmapMoveDir }).stdout.trim());
  context.assert(
    completedMoveStatus.valid === true
      && completedMoveStatus.milestones
        .find((milestone: { id: string }) => milestone.id === "beta").plannedChanges
        .find((plannedChange: { id: string }) => plannedChange.id === "done-change").derivedStatus === "complete",
    "the moved completed planned change re-derives as complete under its new milestone",
  );

  // The authoring command still refuses milestone reassignment and names the move command.
  const authorReassign = cli(
    ["roadmap-generate", "planned-change", "--id", "widget", "--milestone", "alpha"],
    { cwd: roadmapMoveDir },
  );
  context.assert(authorReassign.status !== 0, "roadmap-generate planned-change exits non-zero when asked to reassign a milestone");
  const authorReassignJson = JSON.parse(authorReassign.stdout.trim());
  context.assert(
    authorReassignJson.diagnostics.some((diagnostic: { message: string }) =>
      diagnostic.message.includes("run roadmap-move-planned-change instead")
    )
      && readMoveFile("beta-widget.yaml") === movedWidgetContent,
    "roadmap-generate planned-change names roadmap-move-planned-change for milestone reassignment and writes no file",
    authorReassign.stdout,
  );

  const moveMissingMilestoneFlag = cli(["roadmap-move-planned-change", "widget"], { cwd: roadmapMoveDir });
  context.assert(
    moveMissingMilestoneFlag.status !== 0,
    "roadmap-move-planned-change exits non-zero when --milestone is not supplied",
  );
  const moveNoArgs = cli(["roadmap-move-planned-change"], { cwd: roadmapMoveDir });
  context.assert(moveNoArgs.status !== 0, "roadmap-move-planned-change exits non-zero when no planned change id is supplied");
} finally {
  rmSync(roadmapMoveDir, { recursive: true, force: true });
}

const roadmapDeleteDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-delete-"));
try {
  const deletePlannedChangesDir = path.join(roadmapDeleteDir, ".strict-spec-driven", "roadmap", "planned-changes");
  const readDeleteFile = (fileName: string): string => readFileSync(path.join(deletePlannedChangesDir, fileName), "utf8");
  const deleteFileExists = (fileName: string): boolean => existsSync(path.join(deletePlannedChangesDir, fileName));

  // `live` has an in-progress strict change; `done-change` has an archived one.
  mkdirSync(path.join(roadmapDeleteDir, ".strict-spec-driven", "changes", "live"), { recursive: true });
  mkdirSync(
    path.join(roadmapDeleteDir, ".strict-spec-driven", "changes", "archive", `${formatLocalDateStamp()}-done-change`),
    { recursive: true },
  );

  writeRoadmapMilestoneArtifact(roadmapDeleteDir, "alpha.yaml", {
    id: "alpha",
    title: "Alpha",
    goal: "Own planned changes that a restructuring removes.",
    status: "proposed",
    plannedChanges: [],
    order: 100,
  });
  writeStandalonePlannedChangeArtifact(roadmapDeleteDir, "planned-changes/alpha-base.yaml", {
    id: "base",
    milestone: "alpha",
    status: "planned",
    summary: "Work other planned changes depend on.",
    details: "Standalone details for base.",
    depends_on: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapDeleteDir, "planned-changes/alpha-dependent.yaml", {
    id: "dependent",
    milestone: "alpha",
    status: "planned",
    summary: "Work that depends on base.",
    details: "Standalone details for dependent.",
    depends_on: ["base"],
  });
  writeStandalonePlannedChangeArtifact(roadmapDeleteDir, "planned-changes/alpha-leaf.yaml", {
    id: "leaf",
    milestone: "alpha",
    status: "planned",
    summary: "Work nothing depends on.",
    details: "Standalone details for leaf.",
    depends_on: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapDeleteDir, "planned-changes/alpha-live.yaml", {
    id: "live",
    milestone: "alpha",
    status: "planned",
    summary: "Work with an in-progress strict change.",
    details: "Standalone details for live.",
    depends_on: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapDeleteDir, "planned-changes/alpha-done-change.yaml", {
    id: "done-change",
    milestone: "alpha",
    status: "complete",
    summary: "Completed work whose strict change is archived.",
    details: "Standalone details for done-change.",
    depends_on: [],
  });
  writeRoadmapIndexArtifact(roadmapDeleteDir, [
    { id: "alpha", title: "Alpha", path: "roadmap/milestones/alpha.yaml", status: "proposed" },
  ]);

  const deleteStatusBefore = cli(["roadmap-status"], { cwd: roadmapDeleteDir });
  context.assert(
    deleteStatusBefore.status === 0,
    "roadmap-status is valid before a planned-change deletion",
    deleteStatusBefore.stdout || deleteStatusBefore.stderr,
  );

  const baseBefore = readDeleteFile("alpha-base.yaml");
  const dependentBefore = readDeleteFile("alpha-dependent.yaml");
  const doneChangeBefore = readDeleteFile("alpha-done-change.yaml");

  const deleteUnknown = cli(["roadmap-delete-planned-change", "missing-change"], { cwd: roadmapDeleteDir });
  context.assert(deleteUnknown.status !== 0, "roadmap-delete-planned-change exits non-zero for an unknown planned change");
  const deleteUnknownJson = JSON.parse(deleteUnknown.stdout.trim());
  context.assert(
    deleteUnknownJson.diagnostics.some((diagnostic: { message: string }) =>
      diagnostic.message === "roadmap-delete-planned-change planned change was not found in the active roadmap"
    ),
    "roadmap-delete-planned-change reports a not-found diagnostic for an unknown planned change",
    deleteUnknown.stdout,
  );

  // A planned change other work depends on cannot vanish silently: refusing here is
  // what keeps the roadmap from being written through a dangling-reference state.
  const deleteWithDependents = cli(["roadmap-delete-planned-change", "base"], { cwd: roadmapDeleteDir });
  context.assert(
    deleteWithDependents.status !== 0,
    "roadmap-delete-planned-change exits non-zero when other planned changes depend on the target",
  );
  const deleteWithDependentsJson = JSON.parse(deleteWithDependents.stdout.trim());
  context.assert(
    deleteWithDependentsJson.diagnostics.some((diagnostic: { message: string; artifactPath: string }) =>
      diagnostic.message.includes("--detach-dependents")
      && diagnostic.artifactPath === ".strict-spec-driven/roadmap/planned-changes/alpha-dependent.yaml"
    ),
    "roadmap-delete-planned-change names --detach-dependents and the dependent artifact when refusing",
    deleteWithDependents.stdout,
  );

  const deleteCompletedWithoutFlag = cli(["roadmap-delete-planned-change", "done-change"], { cwd: roadmapDeleteDir });
  context.assert(
    deleteCompletedWithoutFlag.status !== 0,
    "roadmap-delete-planned-change exits non-zero for completed work without --allow-complete",
  );
  context.assert(
    JSON.parse(deleteCompletedWithoutFlag.stdout.trim()).diagnostics.some((diagnostic: { message: string }) =>
      diagnostic.message.includes("--allow-complete")
    ),
    "roadmap-delete-planned-change names --allow-complete when refusing to delete completed work",
    deleteCompletedWithoutFlag.stdout,
  );

  context.assert(
    readDeleteFile("alpha-base.yaml") === baseBefore
      && readDeleteFile("alpha-dependent.yaml") === dependentBefore
      && readDeleteFile("alpha-done-change.yaml") === doneChangeBefore,
    "a rejected roadmap-delete-planned-change leaves every planned change byte-identical",
  );

  // Happy path: a leaf planned change is removed and the roadmap stays valid.
  const deleteLeaf = cli(["roadmap-delete-planned-change", "leaf"], { cwd: roadmapDeleteDir });
  context.assert(
    deleteLeaf.status === 0,
    "roadmap-delete-planned-change exits zero for a planned change nothing depends on",
    deleteLeaf.stdout || deleteLeaf.stderr,
  );
  const deleteLeafJson = JSON.parse(deleteLeaf.stdout.trim());
  context.assert(
    deleteLeafJson.valid === true
      && deleteLeafJson.deleted.id === "leaf"
      && deleteLeafJson.deleted.milestone === "alpha"
      && deleteLeafJson.deleted.path === ".strict-spec-driven/roadmap/planned-changes/alpha-leaf.yaml"
      && deleteLeafJson.deleted.detachedDependents.length === 0
      && !deleteFileExists("alpha-leaf.yaml"),
    "roadmap-delete-planned-change removes the artifact and reports the deleted planned change",
    deleteLeaf.stdout,
  );

  // --detach-dependents drops the edges in the same operation, so the roadmap is
  // never left reporting a dependency on work that no longer exists.
  const deleteBase = cli(["roadmap-delete-planned-change", "base", "--detach-dependents"], { cwd: roadmapDeleteDir });
  context.assert(
    deleteBase.status === 0,
    "roadmap-delete-planned-change exits zero with --detach-dependents",
    deleteBase.stdout || deleteBase.stderr,
  );
  const deleteBaseJson = JSON.parse(deleteBase.stdout.trim());
  context.assert(
    deleteBaseJson.valid === true
      && deleteBaseJson.deleted.detachedDependents.join(",") === "dependent"
      && !deleteFileExists("alpha-base.yaml"),
    "roadmap-delete-planned-change --detach-dependents reports every dependent it rewrote",
    deleteBase.stdout,
  );
  const detachedDependent = yamlModule.parseYamlFile<{ depends_on: string[]; summary: string }>(
    path.join(deletePlannedChangesDir, "alpha-dependent.yaml"),
  );
  context.assert(
    detachedDependent.depends_on.length === 0
      && detachedDependent.summary === "Work that depends on base.",
    "roadmap-delete-planned-change --detach-dependents drops only the dependency edge, not dependent content",
  );
  const deleteStatusAfter = JSON.parse(cli(["roadmap-status"], { cwd: roadmapDeleteDir }).stdout.trim());
  context.assert(
    deleteStatusAfter.valid === true && deleteStatusAfter.diagnostics.length === 0,
    "the roadmap is valid after a delete that detached dependents",
    JSON.stringify(deleteStatusAfter.diagnostics),
  );

  // An active strict change is reported, not refused: this command never writes
  // under the changes directory.
  const deleteLive = cli(["roadmap-delete-planned-change", "live"], { cwd: roadmapDeleteDir });
  context.assert(deleteLive.status === 0, "roadmap-delete-planned-change deletes a planned change with an active strict change");
  context.assert(
    JSON.parse(deleteLive.stdout.trim()).warnings.some((warning: string) =>
      warning.includes("active strict change 'live'") && warning.includes("strict-spec-cli cancel live")
    )
      && existsSync(path.join(roadmapDeleteDir, ".strict-spec-driven", "changes", "live")),
    "roadmap-delete-planned-change warns about the orphaned active change instead of writing under changes/",
    deleteLive.stdout,
  );

  const deleteCompletedWithFlag = cli(
    ["roadmap-delete-planned-change", "done-change", "--allow-complete"],
    { cwd: roadmapDeleteDir },
  );
  context.assert(
    deleteCompletedWithFlag.status === 0 && !deleteFileExists("alpha-done-change.yaml"),
    "roadmap-delete-planned-change deletes completed work with --allow-complete",
    deleteCompletedWithFlag.stdout || deleteCompletedWithFlag.stderr,
  );

  // Deleting the last planned change leaves the milestone with none, which
  // re-derives it as proposed rather than leaving a stale declared status.
  const deleteLast = cli(["roadmap-delete-planned-change", "dependent"], { cwd: roadmapDeleteDir });
  context.assert(deleteLast.status === 0, "roadmap-delete-planned-change deletes the last planned change of a milestone", deleteLast.stdout);
  const emptiedStatus = JSON.parse(cli(["roadmap-status"], { cwd: roadmapDeleteDir }).stdout.trim());
  const emptiedMilestone = emptiedStatus.milestones.find((milestone: { id: string }) => milestone.id === "alpha");
  context.assert(
    emptiedStatus.valid === true
      && emptiedMilestone.plannedChanges.length === 0
      && emptiedMilestone.derivedStatus === "proposed",
    "a milestone emptied by deletion stays valid and re-derives as proposed",
    JSON.stringify(emptiedStatus.diagnostics),
  );

  const deleteNoArgs = cli(["roadmap-delete-planned-change"], { cwd: roadmapDeleteDir });
  context.assert(deleteNoArgs.status !== 0, "roadmap-delete-planned-change exits non-zero when no planned change id is supplied");
  const deleteUnknownFlag = cli(["roadmap-delete-planned-change", "dependent", "--force"], { cwd: roadmapDeleteDir });
  context.assert(deleteUnknownFlag.status !== 0, "roadmap-delete-planned-change exits non-zero for an unsupported flag");
} finally {
  rmSync(roadmapDeleteDir, { recursive: true, force: true });
}

// Archived planned changes are frozen history: deletion must refuse them by id and
// leave the archived artifact byte-identical.
const roadmapDeleteArchiveDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-delete-archive-"));
try {
  const archivedPlannedChangesDir = path.join(
    roadmapDeleteArchiveDir, ".strict-spec-driven", "roadmap", "archive", "planned-changes",
  );
  mkdirSync(archivedPlannedChangesDir, { recursive: true });

  writeRoadmapMilestoneArtifact(roadmapDeleteArchiveDir, "alpha.yaml", {
    id: "alpha",
    title: "Alpha",
    goal: "Hold active work alongside archived history.",
    status: "proposed",
    plannedChanges: [],
    order: 100,
  });
  writeStandalonePlannedChangeArtifact(roadmapDeleteArchiveDir, "planned-changes/alpha-active-work.yaml", {
    id: "active-work",
    milestone: "alpha",
    status: "planned",
    summary: "Active work that may be deleted.",
    details: "Standalone details for active-work.",
    depends_on: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapDeleteArchiveDir, "archive/planned-changes/alpha-frozen.yaml", {
    id: "frozen",
    milestone: "alpha",
    status: "complete",
    summary: "Archived history that must never be rewritten.",
    details: "Standalone details for frozen.",
    depends_on: [],
  });
  writeRoadmapIndexArtifact(roadmapDeleteArchiveDir, [
    { id: "alpha", title: "Alpha", path: "roadmap/milestones/alpha.yaml", status: "proposed" },
  ]);

  const frozenPath = path.join(archivedPlannedChangesDir, "alpha-frozen.yaml");
  const frozenBefore = readFileSync(frozenPath, "utf8");
  const deleteArchived = cli(["roadmap-delete-planned-change", "frozen"], { cwd: roadmapDeleteArchiveDir });
  context.assert(
    deleteArchived.status !== 0
      && JSON.parse(deleteArchived.stdout.trim()).diagnostics.some((diagnostic: { message: string }) =>
        diagnostic.message === "roadmap-delete-planned-change planned change is archived and cannot be deleted"
      ),
    "roadmap-delete-planned-change refuses an archived planned change by id",
    deleteArchived.stdout,
  );
  context.assert(
    readFileSync(frozenPath, "utf8") === frozenBefore,
    "roadmap-delete-planned-change leaves archived planned-change files byte-identical (immutable)",
  );

  // Deleting active work must not touch the archive tree either.
  const deleteActive = cli(["roadmap-delete-planned-change", "active-work"], { cwd: roadmapDeleteArchiveDir });
  context.assert(
    deleteActive.status === 0 && readFileSync(frozenPath, "utf8") === frozenBefore,
    "deleting active work leaves the archived planned-change tree untouched",
    deleteActive.stdout || deleteActive.stderr,
  );
} finally {
  rmSync(roadmapDeleteArchiveDir, { recursive: true, force: true });
}

// A dangling depends_on edge used to make every roadmap mutation command refuse to
// write — including the commands that would remove the edge — leaving a hand-deleted
// planned change unrecoverable through the CLI. Pre-existing dangling references are
// now carried forward, while newly introduced ones are still rejected.
const roadmapRepairDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-repair-"));
try {
  const repairPlannedChangesDir = path.join(roadmapRepairDir, ".strict-spec-driven", "roadmap", "planned-changes");

  writeRoadmapMilestoneArtifact(roadmapRepairDir, "alpha.yaml", {
    id: "alpha",
    title: "Alpha",
    goal: "Hold planned changes through a dangling-reference repair.",
    status: "proposed",
    plannedChanges: [],
    order: 100,
  });
  writeStandalonePlannedChangeArtifact(roadmapRepairDir, "planned-changes/alpha-base.yaml", {
    id: "base",
    milestone: "alpha",
    status: "planned",
    summary: "Dependency target that goes missing.",
    details: "Standalone details for base.",
    depends_on: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapRepairDir, "planned-changes/alpha-dependent.yaml", {
    id: "dependent",
    milestone: "alpha",
    status: "planned",
    summary: "Work left holding a dangling dependency.",
    details: "Standalone details for dependent.",
    depends_on: ["base"],
  });
  writeStandalonePlannedChangeArtifact(roadmapRepairDir, "planned-changes/alpha-other.yaml", {
    id: "other",
    milestone: "alpha",
    status: "planned",
    summary: "Unrelated work edited while the roadmap holds a dangling reference.",
    details: "Standalone details for other.",
    depends_on: [],
  });
  writeRoadmapIndexArtifact(roadmapRepairDir, [
    { id: "alpha", title: "Alpha", path: "roadmap/milestones/alpha.yaml", status: "proposed" },
  ]);

  // `depends_on` holds ids, so removal matches exactly. Under substring matching the
  // edge to `base` was unremovable while `base-extra` existed, because every substring
  // of the shorter id also occurs in the longer one.
  writeStandalonePlannedChangeArtifact(roadmapRepairDir, "planned-changes/alpha-base-extra.yaml", {
    id: "base-extra",
    milestone: "alpha",
    status: "planned",
    summary: "Work whose id has another planned change id as a prefix.",
    details: "Standalone details for base-extra.",
    depends_on: [],
  });
  const addPrefixSharingEdges = cli(
    [
      "roadmap-generate", "planned-change", "--milestone", "alpha", "--id", "dependent",
      "--depends-on", "base-extra",
    ],
    { cwd: roadmapRepairDir },
  );
  context.assert(addPrefixSharingEdges.status === 0, "roadmap-generate planned-change appends a second dependency", addPrefixSharingEdges.stdout);
  const removePrefixEdge = cli(
    ["roadmap-generate", "planned-change", "--milestone", "alpha", "--id", "dependent", "--remove-depends-on", "base"],
    { cwd: roadmapRepairDir },
  );
  context.assert(
    removePrefixEdge.status === 0,
    "--remove-depends-on removes an id that is a prefix of another recorded dependency id",
    removePrefixEdge.stdout || removePrefixEdge.stderr,
  );
  context.assert(
    yamlModule.parseYamlFile<{ depends_on: string[] }>(
      path.join(repairPlannedChangesDir, "alpha-dependent.yaml"),
    ).depends_on.join(",") === "base-extra",
    "--remove-depends-on drops only the exactly matching dependency id",
  );
  const removeUnknownEdge = cli(
    ["roadmap-generate", "planned-change", "--milestone", "alpha", "--id", "dependent", "--remove-depends-on", "base-ext"],
    { cwd: roadmapRepairDir },
  );
  context.assert(
    removeUnknownEdge.status !== 0
      && `${removeUnknownEdge.stdout}${removeUnknownEdge.stderr}`.includes("--remove-depends-on matched no entry"),
    "--remove-depends-on rejects a partial id instead of removing a dependency the caller did not name",
    removeUnknownEdge.stdout || removeUnknownEdge.stderr,
  );
  // Restore the dependency the deadlock repair assertions below operate on.
  cli(
    [
      "roadmap-generate", "planned-change", "--milestone", "alpha", "--id", "dependent",
      "--depends-on", "base", "--remove-depends-on", "base-extra",
    ],
    { cwd: roadmapRepairDir },
  );

  // A newly introduced dangling dependency is still refused, and writes nothing.
  const otherBefore = readFileSync(path.join(repairPlannedChangesDir, "alpha-other.yaml"), "utf8");
  const introduceDangling = cli(
    ["roadmap-generate", "planned-change", "--milestone", "alpha", "--id", "other", "--depends-on", "ghost"],
    { cwd: roadmapRepairDir },
  );
  context.assert(
    introduceDangling.status !== 0
      && JSON.parse(introduceDangling.stdout.trim()).updatedFiles.length === 0
      && readFileSync(path.join(repairPlannedChangesDir, "alpha-other.yaml"), "utf8") === otherBefore,
    "roadmap-generate planned-change still refuses a newly introduced dangling dependency and writes nothing",
    introduceDangling.stdout,
  );

  rmSync(path.join(repairPlannedChangesDir, "alpha-base.yaml"));
  const danglingStatus = JSON.parse(cli(["roadmap-status"], { cwd: roadmapRepairDir }).stdout.trim());
  context.assert(
    danglingStatus.valid === false
      && danglingStatus.diagnostics.some((diagnostic: { message: string }) =>
        diagnostic.message === "planned change dependency is missing from roadmap planned-change sources"
      ),
    "roadmap-status reports a dangling depends_on reference",
    JSON.stringify(danglingStatus.diagnostics),
  );

  // Editing an unrelated planned change is not blocked by the pre-existing dangle.
  const editUnrelated = cli(
    ["roadmap-generate", "planned-change", "--milestone", "alpha", "--id", "other", "--summary", "Edited while dangling."],
    { cwd: roadmapRepairDir },
  );
  const editUnrelatedJson = JSON.parse(editUnrelated.stdout.trim());
  context.assert(
    editUnrelatedJson.updatedFiles.includes(".strict-spec-driven/roadmap/planned-changes/alpha-other.yaml"),
    "a pre-existing dangling dependency does not refuse an unrelated roadmap-generate write",
    editUnrelated.stdout,
  );
  // The write landed, so it must be reported; the roadmap is still invalid, so
  // valid must stay false. Reporting empty updatedFiles here would tell the
  // caller nothing changed while the artifact on disk had been rewritten.
  context.assert(
    editUnrelatedJson.valid === false
      && yamlModule.parseYamlFile<{ summary: string }>(
        path.join(repairPlannedChangesDir, "alpha-other.yaml"),
      ).summary === "Edited while dangling.",
    "a write completed under a pre-existing dangling reference reports its files while valid stays false",
    editUnrelated.stdout,
  );

  // roadmap-move-planned-change and roadmap-delete-planned-change take the same
  // preflight, so the tolerance has to hold for them too.
  writeRoadmapMilestoneArtifact(roadmapRepairDir, "beta.yaml", {
    id: "beta",
    title: "Beta",
    goal: "Receive a planned change while the roadmap holds a dangling reference.",
    status: "proposed",
    plannedChanges: [],
    order: 200,
  });
  const moveWhileDangling = cli(["roadmap-move-planned-change", "other", "--milestone", "beta"], { cwd: roadmapRepairDir });
  context.assert(
    JSON.parse(moveWhileDangling.stdout.trim()).updatedFiles.length > 0
      && existsSync(path.join(repairPlannedChangesDir, "beta-other.yaml")),
    "a pre-existing dangling dependency does not refuse roadmap-move-planned-change",
    moveWhileDangling.stdout || moveWhileDangling.stderr,
  );
  const deleteWhileDangling = cli(["roadmap-delete-planned-change", "other"], { cwd: roadmapRepairDir });
  context.assert(
    JSON.parse(deleteWhileDangling.stdout.trim()).deleted?.id === "other"
      && !existsSync(path.join(repairPlannedChangesDir, "beta-other.yaml")),
    "a pre-existing dangling dependency does not refuse roadmap-delete-planned-change",
    deleteWhileDangling.stdout || deleteWhileDangling.stderr,
  );

  // The tolerance is scoped to the dangling-dependency diagnostic. Any other broken
  // state must still refuse every write, because a milestone that fails to load
  // would be dropped from the regenerated index.
  const brokenMilestonePath = path.join(roadmapRepairDir, ".strict-spec-driven", "roadmap", "milestones", "beta.yaml");
  const brokenMilestoneBefore = readFileSync(brokenMilestonePath, "utf8");
  writeFileSync(brokenMilestonePath, brokenMilestoneBefore.replace(/^goal:.*$/m, "goal: []"), "utf8");
  const dependentBeforeSchemaBreak = readFileSync(path.join(repairPlannedChangesDir, "alpha-dependent.yaml"), "utf8");
  const writeUnderSchemaBreak = cli(
    ["roadmap-generate", "planned-change", "--milestone", "alpha", "--id", "dependent", "--summary", "Should not be written."],
    { cwd: roadmapRepairDir },
  );
  context.assert(
    writeUnderSchemaBreak.status !== 0
      && JSON.parse(writeUnderSchemaBreak.stdout.trim()).updatedFiles.length === 0
      && readFileSync(path.join(repairPlannedChangesDir, "alpha-dependent.yaml"), "utf8") === dependentBeforeSchemaBreak,
    "a schema-invalid milestone still refuses every roadmap-generate write",
    writeUnderSchemaBreak.stdout || writeUnderSchemaBreak.stderr,
  );
  writeFileSync(brokenMilestonePath, brokenMilestoneBefore, "utf8");

  // A self-dependency is a semantic diagnostic, not a repairable reference, so it
  // must keep refusing writes rather than riding along as tolerated state.
  writeStandalonePlannedChangeArtifact(roadmapRepairDir, "planned-changes/beta-self.yaml", {
    id: "self",
    milestone: "beta",
    status: "planned",
    summary: "Work that names itself as a dependency.",
    details: "Standalone details for self.",
    depends_on: ["self"],
  });
  const writeUnderSelfDependency = cli(
    ["roadmap-generate", "planned-change", "--milestone", "alpha", "--id", "dependent", "--summary", "Should not be written."],
    { cwd: roadmapRepairDir },
  );
  context.assert(
    writeUnderSelfDependency.status !== 0
      && JSON.parse(writeUnderSelfDependency.stdout.trim()).updatedFiles.length === 0
      && readFileSync(path.join(repairPlannedChangesDir, "alpha-dependent.yaml"), "utf8") === dependentBeforeSchemaBreak,
    "a self-dependency still refuses every roadmap-generate write",
    writeUnderSelfDependency.stdout || writeUnderSelfDependency.stderr,
  );
  rmSync(path.join(repairPlannedChangesDir, "beta-self.yaml"));

  // The repair itself must be able to write, which is the deadlock this fixes.
  const repair = cli(
    ["roadmap-generate", "planned-change", "--milestone", "alpha", "--id", "dependent", "--remove-depends-on", "base"],
    { cwd: roadmapRepairDir },
  );
  context.assert(
    repair.status === 0
      && JSON.parse(repair.stdout.trim()).updatedFiles.includes(
        ".strict-spec-driven/roadmap/planned-changes/alpha-dependent.yaml",
      ),
    "roadmap-generate planned-change --remove-depends-on repairs a dangling reference instead of refusing",
    repair.stdout || repair.stderr,
  );
  const repairedStatus = JSON.parse(cli(["roadmap-status"], { cwd: roadmapRepairDir }).stdout.trim());
  context.assert(
    repairedStatus.valid === true && repairedStatus.diagnostics.length === 0,
    "the roadmap is valid again once the dangling reference is removed",
    JSON.stringify(repairedStatus.diagnostics),
  );
} finally {
  rmSync(roadmapRepairDir, { recursive: true, force: true });
}

const roadmapMoveArchiveDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-move-archive-"));
try {
  const moveArchivePlannedChangesDir = path.join(roadmapMoveArchiveDir, ".strict-spec-driven", "roadmap", "planned-changes");
  mkdirSync(
    path.join(roadmapMoveArchiveDir, ".strict-spec-driven", "changes", "archive", `${formatLocalDateStamp()}-moving`),
    { recursive: true },
  );

  writeRoadmapMilestoneArtifact(roadmapMoveArchiveDir, "keeper.yaml", {
    id: "keeper",
    title: "Keeper",
    goal: "Give up its only planned change to another milestone.",
    status: "complete",
    plannedChanges: [],
    order: 100,
  });
  writeRoadmapMilestoneArtifact(roadmapMoveArchiveDir, "receiver.yaml", {
    id: "receiver",
    title: "Receiver",
    goal: "Receive completed work and then archive with it.",
    status: "proposed",
    plannedChanges: [],
    order: 200,
  });
  writeRoadmapMilestoneArtifact(roadmapMoveArchiveDir, "later.yaml", {
    id: "later",
    title: "Later",
    goal: "Stay active after the receiving milestone archives.",
    status: "proposed",
    plannedChanges: [],
    order: 300,
  });
  writeStandalonePlannedChangeArtifact(roadmapMoveArchiveDir, "planned-changes/keeper-moving.yaml", {
    id: "moving",
    milestone: "keeper",
    status: "complete",
    summary: "Completed work filed under the wrong milestone.",
    details: "Standalone details for moving.",
    depends_on: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapMoveArchiveDir, "planned-changes/later-work.yaml", {
    id: "later-work",
    milestone: "later",
    status: "planned",
    summary: "Work that stays active after the receiving milestone archives.",
    details: "Standalone details for later-work.",
    depends_on: [],
  });
  writeRoadmapIndexArtifact(roadmapMoveArchiveDir, [
    { id: "keeper", title: "Keeper", path: "roadmap/milestones/keeper.yaml", status: "complete" },
    { id: "receiver", title: "Receiver", path: "roadmap/milestones/receiver.yaml", status: "proposed" },
    { id: "later", title: "Later", path: "roadmap/milestones/later.yaml", status: "proposed" },
  ]);

  const moveIntoReceiver = cli(
    ["roadmap-move-planned-change", "moving", "--milestone", "receiver", "--allow-complete"],
    { cwd: roadmapMoveArchiveDir },
  );
  context.assert(
    moveIntoReceiver.status === 0,
    "roadmap-move-planned-change moves completed work into the receiving milestone",
    moveIntoReceiver.stdout || moveIntoReceiver.stderr,
  );
  const moveIntoReceiverJson = JSON.parse(moveIntoReceiver.stdout.trim());
  const keeperAfterMove = moveIntoReceiverJson.milestones.find((milestone: { id: string }) => milestone.id === "keeper");
  const receiverAfterMove = moveIntoReceiverJson.milestones.find((milestone: { id: string }) => milestone.id === "receiver");
  context.assert(
    keeperAfterMove.derivedStatus === "proposed" && receiverAfterMove.derivedStatus === "complete",
    "moving the only completed planned change re-derives both the source and target milestone statuses",
    moveIntoReceiver.stdout,
  );

  // A moved planned change archives with its new owning milestone.
  const moveArchive = cli(["roadmap-archive"], { cwd: roadmapMoveArchiveDir });
  context.assert(moveArchive.status === 0, "roadmap-archive exits zero after a planned-change move", moveArchive.stdout || moveArchive.stderr);
  const moveArchiveJson = JSON.parse(moveArchive.stdout.trim());
  context.assert(
    moveArchiveJson.archivedMilestones.length === 1
      && moveArchiveJson.archivedMilestones[0].id === "receiver"
      && moveArchiveJson.archivedMilestones[0].plannedChanges.some((plannedChange: { id: string }) => plannedChange.id === "moving"),
    "roadmap-archive archives the receiving milestone together with the moved planned change",
    moveArchive.stdout,
  );
  context.assert(
    existsSync(path.join(roadmapMoveArchiveDir, ".strict-spec-driven", "roadmap", "archive", "planned-changes", "receiver-moving.yaml"))
      && !existsSync(path.join(moveArchivePlannedChangesDir, "receiver-moving.yaml")),
    "roadmap-archive moves the renamed planned-change file into the roadmap archive",
  );
  const moveArchiveStatus = cli(["roadmap-status"], { cwd: roadmapMoveArchiveDir });
  context.assert(
    moveArchiveStatus.status === 0,
    "roadmap-status stays valid after archiving a milestone that received a moved planned change",
    moveArchiveStatus.stdout,
  );
  const moveArchiveStatusJson = JSON.parse(moveArchiveStatus.stdout.trim());
  context.assert(
    moveArchiveStatusJson.milestones.every((milestone: { id: string }) => milestone.id !== "receiver")
      && moveArchiveStatusJson.milestones.some((milestone: { id: string }) => milestone.id === "keeper"),
    "the source milestone stays in the active roadmap after the receiving milestone archives",
  );

  const moveIntoArchivedMilestone = cli(["roadmap-move-planned-change", "later-work", "--milestone", "receiver"], {
    cwd: roadmapMoveArchiveDir,
  });
  context.assert(moveIntoArchivedMilestone.status !== 0, "roadmap-move-planned-change exits non-zero for an archived target milestone");
  const moveIntoArchivedMilestoneJson = JSON.parse(moveIntoArchivedMilestone.stdout.trim());
  context.assert(
    moveIntoArchivedMilestoneJson.diagnostics.some((diagnostic: { message: string }) =>
      diagnostic.message === "roadmap-move-planned-change target milestone is archived and cannot receive planned changes"
    ),
    "roadmap-move-planned-change distinguishes an archived target milestone from an unknown one",
    moveIntoArchivedMilestone.stdout,
  );

  const moveArchivedPlannedChange = cli(["roadmap-move-planned-change", "moving", "--milestone", "later"], {
    cwd: roadmapMoveArchiveDir,
  });
  context.assert(moveArchivedPlannedChange.status !== 0, "roadmap-move-planned-change exits non-zero for an archived planned change");
  const moveArchivedPlannedChangeJson = JSON.parse(moveArchivedPlannedChange.stdout.trim());
  context.assert(
    moveArchivedPlannedChangeJson.diagnostics.some((diagnostic: { message: string }) =>
      diagnostic.message === "roadmap-move-planned-change planned change is archived and cannot be moved"
    )
      && existsSync(path.join(roadmapMoveArchiveDir, ".strict-spec-driven", "roadmap", "archive", "planned-changes", "receiver-moving.yaml")),
    "roadmap-move-planned-change distinguishes an archived planned change from an unknown one and leaves the archive untouched",
    moveArchivedPlannedChange.stdout,
  );
} finally {
  rmSync(roadmapMoveArchiveDir, { recursive: true, force: true });
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
    status: "proposed",
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
      status: "proposed",
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
    materializedMilestone.status === "proposed" && Object.keys(materializedMilestone.planned_changes).length === 0,
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
    status: "proposed",
    plannedChanges: [],
    details: "This is long-form planning guidance that must survive sync.",
  });

  writeRoadmapIndexArtifact(roadmapDetailsPresentDir, [
    {
      id: "0001-details",
      title: "Details Preservation",
      path: "roadmap/milestones/0001-details.yaml",
      status: "proposed",
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
    status: "proposed",
    plannedChanges: [],
  });

  writeRoadmapIndexArtifact(roadmapDetailsAbsentDir, [
    {
      id: "0001-no-details",
      title: "No Details",
      path: "roadmap/milestones/0001-no-details.yaml",
      status: "proposed",
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
    ambiguousRoadmapJson.milestones[0].derivedStatus === "proposed",
    "roadmap-status derives milestone status as proposed when a planned change is ambiguous",
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
  context.assert(syncedAmbiguousMilestone.status === "proposed", "roadmap-sync rewrites ambiguous milestone status to proposed");
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
        && diagnostic.expected === "scope, unchanged behavior, design decisions, task coverage, unresolved-question impact, delta spec scenarios, and delta tech use when applicable",
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
        && syncedIndexEntries[0]?.[1].status === "proposed",
      "copied workspace roadmap-sync materialization rewrites migrated roadmap index status to the derived proposed value",
    );
    const copiedSyncedRoadmapMilestone = yamlModule.parseYamlFile<{
      status: string;
      planned_changes: Record<string, { status: string; summary: string; details: string; depends_on: string[] }>;
    }>(copiedSyncedRoadmapMilestonePath);
    context.assert(
      copiedSyncedRoadmapMilestone.status === "proposed",
      "copied workspace roadmap-sync materialization rewrites the migrated milestone declared status to proposed",
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
        && copiedRoadmapStatusMaterializedJson.milestones[0].declaredStatus === "proposed"
        && copiedRoadmapStatusMaterializedJson.milestones[0].derivedStatus === "proposed",
      "copied workspace roadmap-status preserves migrated milestone path and reports proposed state after materialization",
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
      materializedMilestone.status === "proposed" && Object.keys(materializedMilestone.planned_changes).length === 0,
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
        `copied project handoff cancels pre-existing active change '${preexistingActiveChange}' so active-change capacity is available for handoff propose`,
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
        && generatedProposal.unchanged_behavior.some((entry) => entry.includes("canonical home")),
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
        (entry: { reason: string }) => entry.reason.includes("at most two active changes"),
      ),
    "migrate emits no active-change-limit warning when conversion yields a single active change",
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
    migratedMainSpec.mapping === undefined,
    "migrate writes no mapping field when legacy main spec frontmatter declares one",
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
    migratedActiveDelta.mapping === undefined,
    "migrate writes no mapping field when legacy delta spec frontmatter declares one",
    `got ${JSON.stringify(migratedActiveDelta.mapping)}`,
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
    migratedArchivedEmptyMappingDelta.mapping === undefined,
    "migrate writes no mapping field when legacy mapping frontmatter is blank, and does not defer the change",
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
      && migratedIndexEntries[0]?.[1].status === "proposed"
      && migratedIndexEntries[0]?.[1].path === "roadmap/milestones/0001-demo.yaml",
    "migrate preserves roadmap index milestone identity and maps the retired active status to proposed",
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
  context.assert(migratedRoadmapMilestone.status === "proposed", "migrate maps a legacy milestone declaring the retired active status to proposed");
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

const migrateTwoActiveDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-migrate-two-active-"));
try {
  writeLegacyMigrationFixture(migrateTwoActiveDir);
  cpSync(
    path.join(migrateTwoActiveDir, ".spec-driven", "changes", "demo-change"),
    path.join(migrateTwoActiveDir, ".spec-driven", "changes", "second-demo-change"),
    { recursive: true },
  );
  const migrateTwoActive = cli(["migrate"], { cwd: migrateTwoActiveDir });
  context.assert(migrateTwoActive.status === 0, "migrate exits zero when legacy state contains two active changes");
  const migrateTwoActiveJson = JSON.parse(migrateTwoActive.stdout.trim());
  context.assert(
    !migrateTwoActiveJson.warnings.some((diagnostic: { code: string }) => diagnostic.code === "multiple_active_changes")
      && !migrateTwoActiveJson.manualFollowUp.some(
        (entry: { reason: string }) => entry.reason.includes("at most two active changes"),
      ),
    "migrate emits no active-change-limit warning when conversion yields two active changes",
  );
} finally {
  rmSync(migrateTwoActiveDir, { recursive: true, force: true });
}

const migrateMultiActiveDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-migrate-multi-active-"));
try {
  writeLegacyMigrationFixture(migrateMultiActiveDir);
  for (const copiedChangeName of ["second-demo-change", "third-demo-change"]) {
    cpSync(
      path.join(migrateMultiActiveDir, ".spec-driven", "changes", "demo-change"),
      path.join(migrateMultiActiveDir, ".spec-driven", "changes", copiedChangeName),
      { recursive: true },
    );
  }

  const migrateMultiActive = cli(["migrate"], { cwd: migrateMultiActiveDir });
  context.assert(
    migrateMultiActive.status === 0,
    "migrate exits zero when legacy state contains multiple active changes",
    `stderr: ${migrateMultiActive.stderr.trim()}`,
  );
  const migrateMultiActiveJson = JSON.parse(migrateMultiActive.stdout.trim());
  context.assert(migrateMultiActiveJson.valid === true, "multi-active migrate reports valid=true");
  for (const convertedActiveChange of ["demo-change", "second-demo-change", "third-demo-change"]) {
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
      && multiActiveWarning.message.includes("'third-demo-change'")
      && multiActiveWarning.message.includes("at most two active changes")
      && multiActiveWarning.sourcePath === ".spec-driven/changes"
      && multiActiveWarning.targetPath === ".strict-spec-driven/changes",
    "migrate above capacity emits a multiple_active_changes warning naming the converted active changes",
    `warnings: ${JSON.stringify(migrateMultiActiveJson.warnings)}`,
  );
  const multiActiveFollowUp = migrateMultiActiveJson.manualFollowUp.find(
    (entry: { reason: string }) => entry.reason.includes("at most two active changes"),
  ) as { sourcePath: string; recommendation: string } | undefined;
  context.assert(
    multiActiveFollowUp !== undefined
      && multiActiveFollowUp.sourcePath === ".spec-driven/changes"
      && multiActiveFollowUp.recommendation.includes("until only two remain"),
    "migrate above capacity records a manual follow-up directing cleanup to two active changes",
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

context.section("[17f] roadmap milestone awaiting-refinement deferral");

const roadmapDeferDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-defer-"));
try {
  // Two milestones in roadmap order. The first is the one that gets deferred;
  // the second owns eligible work, so it proves whether recommendation falls
  // through past a deferred milestone.
  writeRoadmapMilestoneArtifact(roadmapDeferDir, "0001-defer.yaml", {
    id: "0001-defer",
    title: "Deferred Milestone",
    goal: "Planned work whose detail depends on an unmatured precondition.",
    status: "proposed",
    order: 100,
    plannedChanges: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapDeferDir, "planned-changes/0001-defer-coarse-change.yaml", {
    id: "coarse-change",
    milestone: "0001-defer",
    status: "planned",
    summary: "Coarse placeholder work that must not be built yet.",
    details: "Placeholder details for coarse-change.",
    depends_on: [],
  });
  writeRoadmapMilestoneArtifact(roadmapDeferDir, "0002-later.yaml", {
    id: "0002-later",
    title: "Later Milestone",
    goal: "Fully specified downstream work.",
    status: "proposed",
    order: 200,
    plannedChanges: [],
  });
  writeStandalonePlannedChangeArtifact(roadmapDeferDir, "planned-changes/0002-later-ready-change.yaml", {
    id: "ready-change",
    milestone: "0002-later",
    status: "planned",
    summary: "Downstream work that is ready to implement.",
    details: "Standalone details for ready-change.",
    depends_on: [],
  });
  writeRoadmapIndexArtifact(roadmapDeferDir, [
    { id: "0001-defer", title: "Deferred Milestone", path: "roadmap/milestones/0001-defer.yaml", status: "proposed" },
    { id: "0002-later", title: "Later Milestone", path: "roadmap/milestones/0002-later.yaml", status: "proposed" },
  ]);

  const recommendBeforeDefer = cli(["roadmap-recommend"], { cwd: roadmapDeferDir });
  context.assert(
    recommendBeforeDefer.status === 0
      && JSON.parse(recommendBeforeDefer.stdout.trim()).recommendation?.id === "coarse-change",
    "roadmap-recommend selects the first milestone's planned change before deferral",
  );

  const defer = cli(
    ["roadmap-defer", "0001-defer", "--reason", "the auth interface is still moving"],
    { cwd: roadmapDeferDir },
  );
  context.assert(defer.status === 0, "roadmap-defer exits zero for an incomplete milestone", `got ${defer.status}: ${defer.stdout}`);
  const deferJson = JSON.parse(defer.stdout.trim());
  context.assert(deferJson.valid === true, "roadmap-defer reports valid=true");
  context.assert(
    deferJson.deferred.awaitingRefinement.status === true
      && deferJson.deferred.awaitingRefinement.reason === "the auth interface is still moving"
      && typeof deferJson.deferred.awaitingRefinement.deferred_on === "string"
      && deferJson.deferred.awaitingRefinement.deferred_on.length > 0,
    "roadmap-defer records status true, the reason, and a deferred_on date",
  );
  context.assert(
    deferJson.deferred.status === "proposed",
    "roadmap-defer leaves the milestone at its derived status rather than forcing blocked",
    `got ${deferJson.deferred.status}`,
  );

  const deferredMilestoneFile = path.join(roadmapDeferDir, ".strict-spec-driven", "roadmap", "milestones", "0001-defer.yaml");
  const deferredArtifact = yamlModule.parseYamlDocument(readFileSync(deferredMilestoneFile, "utf8")) as Record<string, any>;
  context.assert(
    deferredArtifact.awaiting_refinement?.status === true,
    "roadmap-defer writes the structured awaiting_refinement field to the milestone file",
  );
  context.assert(
    deferredArtifact.status === "proposed" && deferredArtifact.paused === undefined,
    "roadmap-defer neither forces blocked status nor writes a paused field",
  );
  context.assert(
    deferredArtifact.notes.some((note: string) => note.startsWith("Deferred refinement on ") && note.includes("the auth interface is still moving")),
    "roadmap-defer appends a dated note carrying the reason",
  );

  const deferStatus = cli(["roadmap-status"], { cwd: roadmapDeferDir });
  context.assert(deferStatus.status === 0, "roadmap-status exits zero after deferral");
  const deferStatusJson = JSON.parse(deferStatus.stdout.trim());
  const deferredStatusEntry = deferStatusJson.milestones.find((m: any) => m.id === "0001-defer");
  const laterStatusEntry = deferStatusJson.milestones.find((m: any) => m.id === "0002-later");
  context.assert(
    deferredStatusEntry.awaitingRefinement?.status === true
      && deferredStatusEntry.awaitingRefinement.reason === "the auth interface is still moving",
    "roadmap-status reports awaitingRefinement on the deferred milestone",
  );
  context.assert(
    laterStatusEntry.awaitingRefinement === undefined,
    "roadmap-status omits awaitingRefinement on a milestone that is merely undetailed",
  );
  context.assert(
    deferredStatusEntry.mismatches.length === 0,
    "a deferred milestone reports no declared-versus-derived status mismatch",
  );

  const overviewAfterDefer = cli(["roadmap-overview"], { cwd: roadmapDeferDir });
  context.assert(
    overviewAfterDefer.status === 0 && /awaiting refinement/i.test(overviewAfterDefer.stdout),
    "roadmap-overview surfaces the awaiting-refinement state",
  );

  // Strict roadmap order: the deferred milestone becomes the next action and the
  // later milestone's ready work is not recommended.
  const recommendAfterDefer = cli(["roadmap-recommend"], { cwd: roadmapDeferDir });
  const recommendAfterDeferJson = JSON.parse(recommendAfterDefer.stdout.trim());
  context.assert(
    recommendAfterDefer.status !== 0,
    "roadmap-recommend exits non-zero when the next action is a refinement rather than a change",
  );
  context.assert(
    recommendAfterDeferJson.status === "refine-milestone",
    "roadmap-recommend reports status refine-milestone for a deferred milestone",
    `got ${recommendAfterDeferJson.status}`,
  );
  context.assert(
    recommendAfterDeferJson.refineAction?.milestone?.id === "0001-defer"
      && recommendAfterDeferJson.refineAction.reason === "the auth interface is still moving"
      && recommendAfterDeferJson.refineAction.releaseWith.includes("roadmap-pause 0001-defer"),
    "roadmap-recommend returns a refineAction naming the milestone, its reason, and the pause release valve",
  );
  context.assert(
    recommendAfterDeferJson.recommendation === null,
    "roadmap-recommend does not fall through to the later milestone's ready work",
  );

  const recommendDetailsAfterDefer = cli(["roadmap-recommend", "--details"], { cwd: roadmapDeferDir });
  const detailsJson = JSON.parse(recommendDetailsAfterDefer.stdout.trim());
  context.assert(
    !detailsJson.candidates.some((c: any) => c.id === "ready-change"),
    "the later milestone's candidate is not evaluated while an earlier milestone awaits refinement",
  );
  context.assert(
    detailsJson.candidates.some((c: any) =>
      c.id === "coarse-change"
      && c.eligible === false
      && c.skipReasons.some((r: any) => r.code === "milestone-awaiting-refinement")),
    "the deferred milestone's own candidate is reported with a milestone-awaiting-refinement skip reason",
    recommendDetailsAfterDefer.stdout,
  );

  // Milestone-scoped selection is refused by default and permitted by the override.
  const scopedRefused = cli(["roadmap-recommend", "--milestone", "0001-defer"], { cwd: roadmapDeferDir });
  context.assert(scopedRefused.status !== 0, "roadmap-recommend --milestone refuses a deferred milestone by default");
  const scopedRefusedJson = JSON.parse(scopedRefused.stdout.trim());
  context.assert(
    scopedRefusedJson.valid === false
      && scopedRefusedJson.diagnostics.some((d: any) =>
        d.message.includes("roadmap-refine 0001-defer") && d.message.includes("--allow-unrefined")),
    "the refusal diagnostic names both roadmap-refine and the --allow-unrefined override",
    scopedRefused.stdout,
  );

  const scopedAllowed = cli(["roadmap-recommend", "--milestone", "0001-defer", "--allow-unrefined"], { cwd: roadmapDeferDir });
  context.assert(
    scopedAllowed.status === 0 && JSON.parse(scopedAllowed.stdout.trim()).recommendation?.id === "coarse-change",
    "--allow-unrefined selects the deferred milestone's planned change",
    scopedAllowed.stdout,
  );

  // The declaration survives canonical rewrite.
  const syncAfterDefer = cli(["roadmap-sync"], { cwd: roadmapDeferDir });
  context.assert(syncAfterDefer.status === 0, "roadmap-sync exits zero with a deferred milestone");
  const afterSyncArtifact = yamlModule.parseYamlDocument(readFileSync(deferredMilestoneFile, "utf8")) as Record<string, any>;
  context.assert(
    afterSyncArtifact.awaiting_refinement?.status === true
      && afterSyncArtifact.awaiting_refinement.reason === "the auth interface is still moving",
    "awaiting_refinement survives roadmap-sync canonical rewrite",
  );
  context.assert(
    afterSyncArtifact.status === "proposed",
    "roadmap-sync does not rewrite a deferred milestone to blocked",
  );

  // Gaining a planned change does not clear the declaration.
  writeStandalonePlannedChangeArtifact(roadmapDeferDir, "planned-changes/0001-defer-second-change.yaml", {
    id: "second-change",
    milestone: "0001-defer",
    status: "planned",
    summary: "Detail added while the milestone was still deferred.",
    details: "Standalone details for second-change.",
    depends_on: [],
  });
  const statusAfterNewWork = cli(["roadmap-status"], { cwd: roadmapDeferDir });
  context.assert(
    statusAfterNewWork.status === 0
      && JSON.parse(statusAfterNewWork.stdout.trim())
        .milestones.find((m: any) => m.id === "0001-defer").awaitingRefinement?.status === true,
    "adding a planned change does not clear awaiting_refinement",
  );

  // Pause is the release valve for downstream work.
  const pauseDeferred = cli(["roadmap-pause", "0001-defer", "--reason", "release downstream work"], { cwd: roadmapDeferDir });
  context.assert(pauseDeferred.status === 0, "roadmap-pause exits zero for a deferred milestone", pauseDeferred.stdout);
  const recommendWhilePaused = cli(["roadmap-recommend"], { cwd: roadmapDeferDir });
  const recommendWhilePausedJson = JSON.parse(recommendWhilePaused.stdout.trim());
  context.assert(
    recommendWhilePausedJson.refineAction === null,
    "a deferred milestone that is also paused yields no refine action",
  );
  context.assert(
    recommendWhilePaused.status === 0 && recommendWhilePausedJson.recommendation?.id === "ready-change",
    "pausing a deferred milestone releases the later milestone's ready work",
    recommendWhilePaused.stdout,
  );
  const resumeDeferred = cli(["roadmap-resume", "0001-defer"], { cwd: roadmapDeferDir });
  context.assert(resumeDeferred.status === 0, "roadmap-resume exits zero for a deferred milestone");

  // Refine clears the declaration and restores ordinary recommendation.
  const refine = cli(["roadmap-refine", "0001-defer", "--reason", "the auth interface froze"], { cwd: roadmapDeferDir });
  context.assert(refine.status === 0, "roadmap-refine exits zero for a deferred milestone", refine.stdout);
  const refineJson = JSON.parse(refine.stdout.trim());
  context.assert(
    refineJson.valid === true && refineJson.refined.previousAwaitingRefinement?.status === true,
    "roadmap-refine reports the cleared declaration",
  );
  const refinedArtifact = yamlModule.parseYamlDocument(readFileSync(deferredMilestoneFile, "utf8")) as Record<string, any>;
  context.assert(
    refinedArtifact.awaiting_refinement === undefined,
    "roadmap-refine deletes awaiting_refinement from the milestone file",
  );
  context.assert(
    refinedArtifact.notes.some((note: string) => note.startsWith("Refined on ") && note.includes("the auth interface froze")),
    "roadmap-refine appends a dated refine note",
  );
  const recommendAfterRefine = cli(["roadmap-recommend", "--details"], { cwd: roadmapDeferDir });
  const afterRefineJson = JSON.parse(recommendAfterRefine.stdout.trim());
  context.assert(
    afterRefineJson.refineAction === null
      && !afterRefineJson.candidates.some((c: any) =>
        c.skipReasons.some((r: any) => r.code === "milestone-awaiting-refinement")),
    "roadmap-refine removes the awaiting-refinement skip reason from owned candidates",
  );

  // Refusals.
  const refineAgain = cli(["roadmap-refine", "0001-defer"], { cwd: roadmapDeferDir });
  context.assert(refineAgain.status !== 0, "roadmap-refine exits non-zero for a milestone that is not awaiting refinement");
  context.assert(
    JSON.parse(refineAgain.stdout.trim()).diagnostics.some((d: any) => d.message.includes("not awaiting refinement")),
    "roadmap-refine reports a not-awaiting-refinement diagnostic",
  );
  const deferUnknown = cli(["roadmap-defer", "does-not-exist"], { cwd: roadmapDeferDir });
  context.assert(deferUnknown.status !== 0, "roadmap-defer exits non-zero for an unknown milestone id");
  const refineUnknown = cli(["roadmap-refine", "does-not-exist"], { cwd: roadmapDeferDir });
  context.assert(refineUnknown.status !== 0, "roadmap-refine exits non-zero for an unknown milestone id");
  const deferNoArg = cli(["roadmap-defer"], { cwd: roadmapDeferDir });
  context.assert(deferNoArg.status !== 0, "roadmap-defer exits non-zero when no milestone id is supplied");

  // A milestone whose derived status is complete cannot be deferred.
  const plannedChangeFiles = [
    "planned-changes/0002-later-ready-change.yaml",
  ];
  context.assert(plannedChangeFiles.length === 1, "later milestone owns exactly one planned change");

  // A malformed declaration is a deterministic schema diagnostic.
  const malformedPath = path.join(roadmapDeferDir, ".strict-spec-driven", "roadmap", "milestones", "0002-later.yaml");
  const malformed = yamlModule.parseYamlDocument(readFileSync(malformedPath, "utf8")) as Record<string, any>;
  malformed.awaiting_refinement = { status: false, unsupported_field: "x" };
  writeFileSync(malformedPath, yamlModule.stringifyYamlDocument(malformed), "utf8");
  const malformedStatus = cli(["roadmap-status"], { cwd: roadmapDeferDir });
  context.assert(malformedStatus.status !== 0, "roadmap-status exits non-zero for a malformed awaiting_refinement mapping");
  const malformedJson = JSON.parse(malformedStatus.stdout.trim());
  context.assert(
    malformedJson.diagnostics.some((d: any) => d.fieldPath === "$.awaiting_refinement.status")
      && malformedJson.diagnostics.some((d: any) => d.fieldPath === "$.awaiting_refinement.unsupported_field"),
    "a malformed awaiting_refinement mapping reports both the status and the unsupported-field diagnostic",
    malformedStatus.stdout,
  );
} finally {
  rmSync(roadmapDeferDir, { recursive: true, force: true });
}

const roadmapRetiredStatusDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-retired-status-"));
try {
  const milestoneFile = path.join(
    roadmapRetiredStatusDir, ".strict-spec-driven", "roadmap", "milestones", "0001-retire.yaml",
  );
  const writeRetireFixture = (milestoneStatus: string): void => {
    writeRoadmapMilestoneArtifact(roadmapRetiredStatusDir, "0001-retire.yaml", {
      id: "0001-retire",
      title: "Retire Milestone Status",
      goal: "Own work that is under way while the milestone status stays stable.",
      status: milestoneStatus,
      plannedChanges: [],
    });
    writeRoadmapIndexArtifact(roadmapRetiredStatusDir, [
      { id: "0001-retire", title: "Retire Milestone Status", path: "roadmap/milestones/0001-retire.yaml", status: milestoneStatus },
    ]);
  };

  // The planned change has a strict change directory that is not archived, so
  // this milestone is the exact shape that used to derive `active`.
  mkdirSync(path.join(roadmapRetiredStatusDir, ".strict-spec-driven", "changes", "work-item"), { recursive: true });
  writeStandalonePlannedChangeArtifact(roadmapRetiredStatusDir, "planned-changes/0001-retire-work-item.yaml", {
    id: "work-item",
    milestone: "0001-retire",
    status: "planned",
    summary: "Work that is already under way.",
    details: "A strict change directory exists for this planned change and is not archived.",
    depends_on: [],
  });
  writeRetireFixture("proposed");

  const inProgressStatus = cli(["roadmap-status"], { cwd: roadmapRetiredStatusDir });
  context.assert(inProgressStatus.status === 0, "roadmap-status exits zero for a milestone with in-progress work", inProgressStatus.stdout);
  const inProgressJson = JSON.parse(inProgressStatus.stdout.trim());
  context.assert(
    inProgressJson.milestones[0].derivedStatus === "proposed"
      && inProgressJson.milestones[0].declaredStatus === "proposed",
    "a milestone whose planned change has an unarchived strict change derives proposed",
    inProgressStatus.stdout,
  );
  // The in-progress signal must survive on the planned change, which is what
  // roadmap-recommend reads; only the milestone-level value was retired.
  context.assert(
    inProgressJson.milestones[0].plannedChanges[0].state === "active",
    "the planned change still reports its own active state",
    inProgressStatus.stdout,
  );
  context.assert(
    !inProgressJson.milestones.some((m: { declaredStatus: string; derivedStatus: string }) =>
      m.declaredStatus === "active" || m.derivedStatus === "active"),
    "no milestone reports a declared or derived active status",
    inProgressStatus.stdout,
  );

  // The reported problem: sync used to rewrite the milestone to `active` here.
  const milestoneBeforeSync = readFileSync(milestoneFile, "utf8");
  const inProgressSync = cli(["roadmap-sync"], { cwd: roadmapRetiredStatusDir });
  context.assert(inProgressSync.status === 0, "roadmap-sync exits zero while planned work is under way", inProgressSync.stdout);
  context.assert(
    readFileSync(milestoneFile, "utf8") === milestoneBeforeSync,
    "roadmap-sync leaves the milestone file byte-identical when work starts",
    inProgressSync.stdout,
  );

  // A roadmap written before the retirement still carries the value on disk.
  writeRetireFixture("active");
  const retiredStatus = cli(["roadmap-status"], { cwd: roadmapRetiredStatusDir });
  const retiredJson = JSON.parse(retiredStatus.stdout.trim());
  context.assert(retiredJson.valid === false, "roadmap-status reports a retired milestone status as invalid", retiredStatus.stdout);
  const retiredDiagnostic = retiredJson.diagnostics.find((d: { artifactPath: string; fieldPath: string }) =>
    d.artifactPath.endsWith("0001-retire.yaml") && d.fieldPath === "$.status");
  context.assert(
    retiredDiagnostic !== undefined
      && retiredDiagnostic.actual === "active"
      && retiredDiagnostic.message.includes("roadmap-sync")
      && retiredDiagnostic.expected === "proposed, planned, blocked, complete",
    "the retired-status diagnostic names the field, the retired value, the accepted set, and roadmap-sync as the repair",
    retiredStatus.stdout,
  );

  const retiredSync = cli(["roadmap-sync"], { cwd: roadmapRetiredStatusDir });
  context.assert(
    retiredSync.status === 0,
    "a plain roadmap-sync repairs a retired milestone status without an extra flag",
    retiredSync.stdout,
  );
  const repairedMilestone = yamlModule.parseYamlFile<{ status: string }>(milestoneFile);
  context.assert(repairedMilestone.status === "proposed", "roadmap-sync rewrites the retired status to proposed", retiredSync.stdout);
  const afterRepairStatus = cli(["roadmap-status"], { cwd: roadmapRetiredStatusDir });
  context.assert(
    afterRepairStatus.status === 0 && JSON.parse(afterRepairStatus.stdout.trim()).valid === true,
    "roadmap-status is valid after the retired status is repaired",
    afterRepairStatus.stdout,
  );

  // The tolerance must not generalize: every other schema-invalid milestone
  // still refuses the write, because it would be dropped from the index.
  const stillRefused: Array<{ label: string; write: () => void }> = [
    { label: "an unrecognized status that is not the retired literal", write: () => writeRetireFixture("in-flight") },
    {
      label: "a milestone missing a required field",
      write: () => {
        writeRetireFixture("proposed");
        const parsed = yamlModule.parseYamlFile<Record<string, unknown>>(milestoneFile);
        delete parsed.goal;
        writeFileSync(milestoneFile, yamlModule.stringifyYamlDocument(parsed), "utf8");
      },
    },
    {
      label: "a milestone that fails to parse",
      write: () => {
        writeRetireFixture("proposed");
        writeFileSync(milestoneFile, "status: [unclosed\n  nope: :\n", "utf8");
      },
    },
  ];
  const indexFile = path.join(roadmapRetiredStatusDir, ".strict-spec-driven", "roadmap", "INDEX.yaml");
  // Drop the standalone planned change first. While it exists, a milestone that
  // fails to load also orphans it, and that reference-sourced diagnostic blocks
  // the write on its own — which would make these cases pass no matter how wide
  // the schema tolerance is, testing nothing.
  rmSync(
    path.join(roadmapRetiredStatusDir, ".strict-spec-driven", "roadmap", "planned-changes", "0001-retire-work-item.yaml"),
    { force: true },
  );
  for (const { label, write } of stillRefused) {
    write();
    const milestoneBefore = readFileSync(milestoneFile, "utf8");
    const indexBefore = readFileSync(indexFile, "utf8");
    const refusedSync = cli(["roadmap-sync"], { cwd: roadmapRetiredStatusDir });
    context.assert(
      refusedSync.status !== 0,
      `roadmap-sync still refuses ${label}`,
      refusedSync.stdout,
    );
    // Asserting the milestone file alone is not enough to prove the refusal: a
    // milestone that fails to load is simply dropped, leaving its own file
    // untouched while the regenerated index silently loses the entry. The
    // damage a too-wide tolerance causes is visible only here.
    const refusedJson = JSON.parse(refusedSync.stdout.trim());
    context.assert(
      Array.isArray(refusedJson.updatedFiles) && refusedJson.updatedFiles.length === 0,
      `roadmap-sync writes no file at all for ${label}`,
      refusedSync.stdout,
    );
    context.assert(
      readFileSync(milestoneFile, "utf8") === milestoneBefore
        && readFileSync(indexFile, "utf8") === indexBefore,
      `roadmap-sync leaves the milestone and the roadmap index byte-identical for ${label}`,
      refusedSync.stdout,
    );
  }
} finally {
  rmSync(roadmapRetiredStatusDir, { recursive: true, force: true });
}

}
