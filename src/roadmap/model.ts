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

export type DeclaredRoadmapStatus = (typeof DECLARED_ROADMAP_STATUSES)[number];
export type DeclaredPlannedChangeStatus = (typeof DECLARED_PLANNED_CHANGE_STATUSES)[number];

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

export type RoadmapMilestoneArtifact = {
  schema: string;
  schema_version: 2;
  artifact_type: "roadmap_milestone";
  schema_file: string;
  milestone: MilestoneIdentity;
  goal: string;
  scope: MilestoneScope;
  done_criteria: string[];
  planned_changes: Record<string, PlannedChangeEntry>;
  dependencies: string[];
  risks: string[];
  status: DeclaredRoadmapStatus;
  notes: string[];
  details?: string;
  source_ticket?: string;
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
  declaredStatus: DeclaredPlannedChangeStatus;
  derivedStatus: DeclaredPlannedChangeStatus;
  state: PlannedChangeState;
  mismatches: string[];
};

export type RoadmapMilestoneStatus = {
  path: string;
  id: string;
  title: string;
  declaredStatus: DeclaredRoadmapStatus;
  derivedStatus: Exclude<DeclaredRoadmapStatus, "blocked">;
  plannedChanges: RoadmapPlannedChangeStatus[];
  mismatches: string[];
  sourceTicket?: string;
  needsScopeRefinement?: boolean;
};

export type RoadmapRecommendationSkipCode =
  | "workflow-state-active"
  | "workflow-state-archived"
  | "workflow-state-ambiguous"
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

export type RoadmapRecommendStatus = "recommended" | "no-candidate" | "roadmap-error";

export type RoadmapRecommendResult = {
  valid: boolean;
  status: RoadmapRecommendStatus;
  warnings: string[];
  diagnostics: RoadmapDiagnostic[];
  recommendation: RoadmapRecommendation | null;
  candidates: RoadmapRecommendationCandidate[];
};

export type RoadmapSyncResult = {
  valid: boolean;
  warnings: string[];
  diagnostics: RoadmapDiagnostic[];
  updatedFiles: string[];
  milestones: RoadmapMilestoneStatus[];
};

export type RoadmapArchiveSkippedMilestone = {
  id: string;
  path: string;
  reason: string;
  declaredStatus: DeclaredRoadmapStatus;
  derivedStatus: Exclude<DeclaredRoadmapStatus, "blocked">;
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
