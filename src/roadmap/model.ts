export const STRICT_WORKFLOW_DIR = ".strict-spec-driven";
export const ROADMAP_DIR = `${STRICT_WORKFLOW_DIR}/roadmap`;
export const ROADMAP_INDEX_PATH = `${ROADMAP_DIR}/INDEX.yaml`;
export const ROADMAP_MILESTONES_DIR = `${ROADMAP_DIR}/milestones`;

export const DECLARED_ROADMAP_STATUSES = ["proposed", "active", "blocked", "complete"] as const;
export const DECLARED_PLANNED_CHANGE_STATUSES = ["planned", "complete"] as const;
export const ROADMAP_INDEX_SCHEMA_ID = "strict-spec-driven/roadmap-index/v2";
export const ROADMAP_MILESTONE_SCHEMA_ID = "strict-spec-driven/roadmap-milestone/v2";

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

export type LoadedRoadmap = {
  warnings: string[];
  diagnostics: RoadmapDiagnostic[];
  indexArtifact: RoadmapIndexArtifact | null;
  milestones: LoadedMilestone[];
};

export type RoadmapDiagnostic = {
  source: "schema" | "reference" | "semantic";
  artifactPath: string;
  fieldPath: string;
  message: string;
  expected?: string;
  actual?: string;
};

export type RoadmapPlannedChangeStatus = {
  id: string;
  summary: string;
  declaredStatus: DeclaredPlannedChangeStatus;
  derivedStatus: DeclaredPlannedChangeStatus;
  state: PlannedChangeState;
  mismatches: string[];
};

export type RoadmapMilestoneStatus = {
  file: string;
  path: string;
  id: string;
  title: string;
  goal: string;
  declaredStatus: DeclaredRoadmapStatus;
  derivedStatus: Exclude<DeclaredRoadmapStatus, "blocked">;
  plannedChanges: RoadmapPlannedChangeStatus[];
  mismatches: string[];
};

export type RoadmapStatusResult = {
  valid: boolean;
  warnings: string[];
  diagnostics: RoadmapDiagnostic[];
  milestones: RoadmapMilestoneStatus[];
};

export type RoadmapSyncResult = {
  valid: boolean;
  warnings: string[];
  diagnostics: RoadmapDiagnostic[];
  updatedFiles: string[];
  milestones: RoadmapMilestoneStatus[];
};

export type ChangeStateIndex = {
  active: Set<string>;
  archived: Set<string>;
};
