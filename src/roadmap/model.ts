import type { YamlDiagnosticDetails } from "../yaml.js";

export const STRICT_WORKFLOW_DIR = ".strict-spec-driven";
export const ROADMAP_DIR = `${STRICT_WORKFLOW_DIR}/roadmap`;
export const ROADMAP_INDEX_PATH = `${ROADMAP_DIR}/INDEX.yaml`;
export const ROADMAP_MILESTONES_DIR = `${ROADMAP_DIR}/milestones`;
export const ROADMAP_ARCHIVE_DIR = `${ROADMAP_DIR}/archive`;
export const ROADMAP_ARCHIVE_MILESTONES_DIR = `${ROADMAP_ARCHIVE_DIR}/milestones`;
export const ROADMAP_ARCHIVE_PLANNED_CHANGES_DIR = `${ROADMAP_ARCHIVE_DIR}/planned-changes`;

export const DECLARED_ROADMAP_STATUSES = ["proposed", "planned", "active", "blocked", "complete"] as const;
export const DECLARED_PLANNED_CHANGE_STATUSES = ["planned", "complete"] as const;
export const ROADMAP_INDEX_SCHEMA_ID = "strict-spec-driven/roadmap-index/v2";
export const ROADMAP_MILESTONE_SCHEMA_ID = "strict-spec-driven/roadmap-milestone/v2";
export const PLANNED_CHANGE_SCHEMA_ID = "strict-spec-driven/planned-change/v1";

/**
 * Message of the cross-file diagnostic raised when a `depends_on` entry names a
 * planned change that no roadmap source declares. It is a named constant
 * because roadmap mutation commands must recognize this specific diagnostic to
 * tolerate it as pre-existing state; see `isRepairableRoadmapDiagnostic`.
 */
export const MISSING_PLANNED_CHANGE_DEPENDENCY_MESSAGE =
  "planned change dependency is missing from roadmap planned-change sources";

export type DeclaredRoadmapStatus = (typeof DECLARED_ROADMAP_STATUSES)[number];
export type DeclaredPlannedChangeStatus = (typeof DECLARED_PLANNED_CHANGE_STATUSES)[number];

/**
 * Canonical basename for a standalone planned-change file. The milestone id
 * prefixes the planned-change id so filename sort order tracks roadmap order;
 * when the planned-change id already starts with the milestone id, the prefix
 * is not duplicated.
 */
export function canonicalPlannedChangeFileName(milestoneId: string, plannedChangeId: string): string {
  if (plannedChangeId === milestoneId || plannedChangeId.startsWith(`${milestoneId}-`)) {
    return `${plannedChangeId}.yaml`;
  }
  return `${milestoneId}-${plannedChangeId}.yaml`;
}

export type PlannedChangeState = "missing" | "active" | "archived" | "ambiguous";

export type RoadmapIndexEntry = {
  id: string;
  title: string;
  path: string;
  status: DeclaredRoadmapStatus;
};

export type PlannedChangeEntry = {
  status: DeclaredPlannedChangeStatus;
  summary: string;
  details: string;
  depends_on: string[];
};

export type MilestoneIdentity = {
  id: string;
  title: string;
};

export type MilestoneScope = {
  in: string[];
  out: string[];
};

export type MilestoneIntakeQuestion = {
  id: string;
  question: string;
  context: string;
  impact: string;
  recommendation: string;
};

export const DEFAULT_MILESTONE_INTAKE_QUESTIONS: MilestoneIntakeQuestion[] = [
  {
    id: "objective",
    question: "What observable outcome should this milestone deliver?",
    context: "Milestone goal text can be broad; this question keeps the outcome testable before work is decomposed.",
    impact: "Unclear objective affects milestone scope, planned-change summaries, and proposal scope for every child change.",
    recommendation: "Answer with one user- or operator-observable outcome that can be checked after the milestone is complete.",
  },
  {
    id: "scope-boundary",
    question: "What is included in this milestone, and what is explicitly out of scope?",
    context: "The roadmap already has scope.in and scope.out fields, but the boundary decision must be called out as a required clarification.",
    impact: "Unclear scope affects planned-change ownership, milestone splitting, and whether later changes silently expand scope.",
    recommendation: "Use the milestone scope fields as evidence and keep unrelated work out of this milestone.",
  },
  {
    id: "done-criteria",
    question: "What concrete evidence proves this milestone is done?",
    context: "Done criteria need to be verifiable rather than aspirational.",
    impact: "Weak done criteria affect roadmap review, archive readiness, and follow-up change prioritization.",
    recommendation: "Name the observable behavior, validation command, documentation, or archived planned changes that prove completion.",
  },
  {
    id: "work-decomposition",
    question: "What standalone planned changes are needed to deliver this milestone?",
    context: "Roadmap recommendation works from planned-change artifacts, not from hidden prose inside the milestone.",
    impact: "Missing decomposition affects proposal generation and can block roadmap-backed automatic implementation.",
    recommendation: "Create focused standalone planned-change files with actionable summary, details, dependencies, and status.",
  },
  {
    id: "dependencies-and-blockers",
    question: "What dependencies or blockers must be resolved before this milestone can progress?",
    context: "Dependencies may come from other milestones, active changes, services, credentials, or external decisions.",
    impact: "Unknown blockers affect ordering, roadmap recommendation eligibility, and implementation handoff.",
    recommendation: "Record known dependencies in dependencies and preserve unresolved blockers in milestone notes or planned-change detail.",
  },
  {
    id: "risks",
    question: "What compatibility, data, security, privacy, performance, release, or rollback risks could change the plan?",
    context: "Roadmap milestones often establish the risk surface before individual strict changes are proposed.",
    impact: "Unidentified risks affect scope, technical standards, tests, release sequencing, and rollback planning.",
    recommendation: "Record concrete risks in risks and keep mitigations small enough to map into planned changes.",
  },
  {
    id: "verification-evidence",
    question: "How will milestone work be verified across implementation, tests, docs, and workflow artifacts?",
    context: "The change-intake gate requires a proof plan before implementation begins.",
    impact: "Missing verification affects planned-change testing tasks and archive confidence.",
    recommendation: "Identify the relevant test suite, validation command, documentation check, or manual evidence expected for child changes.",
  },
  {
    id: "technical-standards",
    question: "Which existing technical standards apply, or does this milestone require a new standard?",
    context: "Technical rules live under .strict-spec-driven/tech/ and must be known before changes are implemented.",
    impact: "Unclear standards affect implementation files, tests, and whether a child change needs a delta-tech artifact.",
    recommendation: "List applicable standards or record a follow-up to add or update a technical standard when the milestone needs one.",
  },
];

export function cloneDefaultMilestoneIntakeQuestions(): MilestoneIntakeQuestion[] {
  return DEFAULT_MILESTONE_INTAKE_QUESTIONS.map((question) => ({ ...question }));
}

export type RoadmapMilestoneArtifact = {
  schema: string;
  schema_version: 2;
  artifact_type: "roadmap_milestone";
  schema_file: string;
  milestone: MilestoneIdentity;
  order?: number;
  goal: string;
  scope: MilestoneScope;
  done_criteria: string[];
  intake_questions: MilestoneIntakeQuestion[];
  planned_changes: Record<string, PlannedChangeEntry>;
  dependencies: string[];
  risks: string[];
  status: DeclaredRoadmapStatus;
  paused?: MilestonePausedState;
  awaiting_refinement?: MilestoneAwaitingRefinementState;
  notes: string[];
  details?: string;
};

export type PlannedChangeTeamMetadata = {
  owner?: string;
  reviewers?: string[];
  blocked?: {
    status: boolean;
    reason?: string;
  };
  labels?: string[];
  external_refs?: Array<{
    label: string;
    target: string;
  }>;
};

/**
 * Sticky operator-applied pause on a milestone. When `status` is true the
 * milestone's effective status is forced to `blocked` and roadmap-recommend
 * skips every planned change the milestone owns. The structured mapping (rather
 * than a bare status string) is the source of truth so canonical rewrite can
 * preserve the operator intent alongside an optional reason and the
 * deterministic date the pause was applied.
 */
export type MilestonePausedState = {
  status: true;
  reason?: string;
  paused_on?: string;
};

/**
 * Declared operator intent that a milestone is planned but deliberately not yet
 * elaborated, because a precondition has not matured. Unlike `paused` this does
 * not force the effective status to `blocked`: the milestone keeps the status
 * derived from its planned-change state, because it is not blocked, only
 * undecomposed. roadmap-recommend surfaces such a milestone as a refine action
 * instead of recommending implementation work. Only roadmap-refine clears the
 * field; maturity is never derived from the presence of planned changes,
 * because whether the precondition has matured is a human judgement.
 */
export type MilestoneAwaitingRefinementState = {
  status: true;
  reason?: string;
  deferred_on?: string;
};

export type StandalonePlannedChangeArtifact = {
  schema: string;
  schema_version: 1;
  artifact_type: "planned_change";
  schema_file: string;
  planned_change: {
    id: string;
    milestone: string;
  };
  status: DeclaredPlannedChangeStatus;
  summary: string;
  details: string;
  depends_on: string[];
  team?: PlannedChangeTeamMetadata;
  extensions?: Record<string, unknown>;
};

export type RoadmapIndexArtifact = {
  schema: string;
  schema_version: 2;
  artifact_type: "roadmap_index";
  schema_file: string;
  milestones: RoadmapIndexEntry[];
};

export type LoadedMilestone = {
  absolutePath: string;
  artifactPath: string;
  file: string;
  relativeMilestonePath: string;
  repoRelativePath: string;
  raw: string;
  artifact: RoadmapMilestoneArtifact;
};

export type LoadedPlannedChange = {
  absolutePath: string;
  artifactPath: string;
  file: string;
  relativeRoadmapPath: string;
  repoRelativePath: string;
  raw: string;
  artifact: StandalonePlannedChangeArtifact;
};

export type LoadedRoadmap = {
  warnings: string[];
  diagnostics: RoadmapDiagnostic[];
  indexArtifact: RoadmapIndexArtifact | null;
  milestones: LoadedMilestone[];
  plannedChanges: LoadedPlannedChange[];
};

export type RoadmapDiagnostic = {
  source: "schema" | "reference" | "semantic";
  artifactPath: string;
  fieldPath: string;
  message: string;
  expected?: string;
  actual?: string;
} & YamlDiagnosticDetails;

export type RoadmapPlannedChangeStatus = {
  id: string;
  source: "inline" | "standalone";
  path: string;
  summary: string;
  dependsOn: string[];
  declaredStatus: DeclaredPlannedChangeStatus;
  derivedStatus: DeclaredPlannedChangeStatus;
  state: PlannedChangeState;
  mismatches: string[];
};

export type RoadmapMilestoneStatus = {
  path: string;
  id: string;
  title: string;
  order?: number;
  displayOrdinal: number;
  declaredStatus: DeclaredRoadmapStatus;
  derivedStatus: DeclaredRoadmapStatus;
  /**
   * Present only while the milestone declares `awaiting_refinement`, so a
   * reader can tell a deliberately undecomposed milestone from one that was
   * merely authored incompletely.
   */
  awaitingRefinement?: MilestoneAwaitingRefinementState;
  plannedChanges: RoadmapPlannedChangeStatus[];
  mismatches: string[];
};

export type RoadmapRecommendationSkipCode =
  | "workflow-state-active"
  | "workflow-state-archived"
  | "workflow-state-ambiguous"
  | "milestone-paused"
  | "milestone-awaiting-refinement"
  | "planned-change-mismatch"
  | "dependency-incomplete";

export type RoadmapRecommendationSkip = {
  code: RoadmapRecommendationSkipCode;
  message: string;
};

export type RoadmapRecommendationCandidate = {
  id: string;
  changeName: string;
  summary: string;
  path: string;
  milestone: {
    id: string;
    title: string;
    path: string;
  };
  eligible: boolean;
  skipReasons: RoadmapRecommendationSkip[];
};

export type RoadmapRecommendation = {
  id: string;
  changeName: string;
  summary: string;
  path: string;
  milestone: {
    id: string;
    title: string;
    path: string;
  };
  reason: string;
};

export type RoadmapStatusResult = {
  valid: boolean;
  warnings: string[];
  diagnostics: RoadmapDiagnostic[];
  milestones: RoadmapMilestoneStatus[];
};

export type RoadmapSyncPlannedChangeStatus = Omit<RoadmapPlannedChangeStatus, "summary" | "dependsOn">;

export type RoadmapSyncMilestoneStatus = Omit<RoadmapMilestoneStatus, "plannedChanges"> & {
  plannedChanges: RoadmapSyncPlannedChangeStatus[];
};

/**
 * The next action a deferred milestone calls for. It is deliberately not a
 * `RoadmapRecommendation`: the work to do is elaborating the milestone through
 * roadmap-generate, not scaffolding a strict change from a planned change.
 */
export type RoadmapRefineAction = {
  milestone: {
    id: string;
    title: string;
    path: string;
  };
  reason?: string;
  deferredOn?: string;
  releaseWith: string;
};

export type RoadmapRecommendStatus =
  | "recommended"
  | "refine-milestone"
  | "no-candidate"
  | "roadmap-error";

export type RoadmapRecommendResult = {
  valid: boolean;
  status: RoadmapRecommendStatus;
  warnings: string[];
  diagnostics: RoadmapDiagnostic[];
  recommendation: RoadmapRecommendation | null;
  /**
   * Set when the earliest-ordered incomplete milestone is awaiting refinement.
   * Recommendation follows strict roadmap order, so this suppresses candidates
   * owned by later milestones; pausing the deferred milestone releases them.
   */
  refineAction: RoadmapRefineAction | null;
  candidates: RoadmapRecommendationCandidate[];
};

export type RoadmapSyncResult = {
  valid: boolean;
  warnings: string[];
  diagnostics: RoadmapDiagnostic[];
  updatedFiles: string[];
  renamedFiles?: Array<{ from: string; to: string }>;
  milestones: RoadmapSyncMilestoneStatus[];
};

export type RoadmapArchiveSkippedMilestone = {
  id: string;
  path: string;
  reason: string;
  declaredStatus: DeclaredRoadmapStatus;
  derivedStatus: DeclaredRoadmapStatus;
  plannedChangeStates: Array<{
    id: string;
    state: PlannedChangeState;
    declaredStatus: DeclaredPlannedChangeStatus;
    derivedStatus: DeclaredPlannedChangeStatus;
  }>;
};

export type RoadmapArchivedPlannedChange = {
  id: string;
  sourcePath: string;
  archivePath: string;
};

export type RoadmapArchivedMilestone = {
  id: string;
  title: string;
  sourcePath: string;
  archivePath: string;
  plannedChanges: RoadmapArchivedPlannedChange[];
};

export type RoadmapArchiveResult = {
  valid: boolean;
  warnings: string[];
  diagnostics: RoadmapDiagnostic[];
  updatedFiles: string[];
  archivedMilestones: RoadmapArchivedMilestone[];
  skippedMilestones: RoadmapArchiveSkippedMilestone[];
};

export type ChangeStateIndex = {
  active: Set<string>;
  archived: Set<string>;
};
