import { existsSync, mkdirSync } from "fs";
import path from "path";
import { stringifyYamlDocument } from "../yaml.js";
import {
  canonicalPlannedChangeFileName,
  PLANNED_CHANGE_SCHEMA_ID,
  ROADMAP_INDEX_PATH,
  type DeclaredRoadmapStatus,
  type LoadedMilestone,
  type RoadmapDiagnostic,
  type StandalonePlannedChangeArtifact,
} from "./model.js";
import { makeDiagnostic, normalizeMilestoneStatus, sortDiagnostics, toPosix } from "./shared.js";
import { loadRoadmap } from "./load.js";
import {
  appendRoadmapCrossFileDiagnostics,
  buildMilestoneStatus,
  getChangeStateIndex,
  getMergedPlannedChangesForMilestone,
  getStandalonePlannedChangesForMilestone,
} from "./status.js";
import { buildCanonicalMilestoneArtifact, buildRoadmapIndexArtifact, writeFileIfChanged } from "./sync.js";
import { getRoadmapStatus } from "../roadmap.js";

export type RoadmapReopenOptions = {
  reason?: string;
};

export type RoadmapReopenFrozenPlannedChange = {
  id: string;
  path: string;
  state: "archived";
};

export type RoadmapReopenSeededFollowUp = {
  id: string;
  path: string;
};

export type RoadmapReopenResult = {
  valid: boolean;
  reopened: {
    id: string;
    title: string;
    path: string;
    previousStatus: DeclaredRoadmapStatus;
    newStatus: DeclaredRoadmapStatus;
    frozenPlannedChanges: RoadmapReopenFrozenPlannedChange[];
    seededFollowUp: RoadmapReopenSeededFollowUp | null;
  };
  updatedFiles: string[];
  diagnostics: RoadmapDiagnostic[];
};

const DEFAULT_REOPEN_REASON = "gaps discovered after completion";
const PLANNED_CHANGES_DIRNAME = "planned-changes";
const FOLLOWUP_SCHEMA_FILE = "../../templates/strict-spec-driven/schemas/planned-change.yaml";

function buildReopenNote(reason: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `Reopened on ${date}: ${reason}`;
}

function loadReopenContext(rootDir: string) {
  const roadmap = loadRoadmap(rootDir);
  const changeStates = getChangeStateIndex(rootDir);
  appendRoadmapCrossFileDiagnostics(roadmap, changeStates);
  return { roadmap, changeStates };
}

function findMilestoneById(roadmap: ReturnType<typeof loadRoadmap>, milestoneId: string): LoadedMilestone | undefined {
  return roadmap.milestones.find((milestone) => milestone.artifact.milestone.id === milestoneId);
}

/**
 * Seed a pending follow-up standalone planned change for a reopened milestone so
 * the milestone has genuine non-archived work and re-derives off `complete`
 * instead of relying on any sticky status. The seeded file uses a deterministic,
 * non-colliding id and filename, depends on the most recent archived planned
 * change when one exists, and is a normal editable planned change the operator
 * refines next. Existing (archived) planned-change files are never modified.
 */
function seedFollowUpPlannedChange(
  roadmap: ReturnType<typeof loadRoadmap>,
  rootDir: string,
  milestone: LoadedMilestone,
  frozenPlannedChanges: RoadmapReopenFrozenPlannedChange[],
  reason: string,
  updatedFiles: string[],
): RoadmapReopenSeededFollowUp {
  const plannedChangesDir = path.join(rootDir, ".strict-spec-driven", "roadmap", PLANNED_CHANGES_DIRNAME);
  mkdirSync(plannedChangesDir, { recursive: true });

  const milestoneId = milestone.artifact.milestone.id;
  const existingIds = new Set(roadmap.plannedChanges.map((plannedChange) => plannedChange.artifact.planned_change.id));

  // Deterministic id derived from the milestone, disambiguated on collision
  // against both known planned-change ids and existing canonical file names.
  const baseId = `${milestoneId}-followup`;
  let id = baseId;
  let suffix = 2;
  let fileName = canonicalPlannedChangeFileName(milestoneId, id);
  while (existingIds.has(id) || existsSync(path.join(plannedChangesDir, fileName))) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
    fileName = canonicalPlannedChangeFileName(milestoneId, id);
  }

  const latestArchived = frozenPlannedChanges[frozenPlannedChanges.length - 1];
  const artifact: StandalonePlannedChangeArtifact = {
    schema: PLANNED_CHANGE_SCHEMA_ID,
    schema_version: 1,
    artifact_type: "planned_change",
    schema_file: FOLLOWUP_SCHEMA_FILE,
    planned_change: {
      id,
      milestone: milestoneId,
    },
    status: "planned",
    summary: `Follow-up work for reopened milestone ${milestoneId}: ${reason}`,
    details: `Scope and plan the follow-up work discovered when reopening milestone ${milestoneId}. Reason: ${reason}. Refine this placeholder into concrete planned-change detail.`,
    depends_on: latestArchived ? [latestArchived.id] : [],
  };

  const absolutePath = path.join(plannedChangesDir, fileName);
  writeFileIfChanged(absolutePath, stringifyYamlDocument(artifact), updatedFiles, rootDir);
  return { id, path: toPosix(path.join("roadmap", PLANNED_CHANGES_DIRNAME, fileName)) };
}

/**
 * Reopen a previously completed milestone by appending a dated reopen note and
 * seeding a pending follow-up planned change, then rewriting the milestone and
 * index to the status derived from structured planned-change state. A reopened
 * milestone with only not-yet-started follow-up work derives `proposed`; it
 * becomes `active` once a strict change starts and `complete` once all planned
 * changes are archived again. Completed (archived) planned changes are
 * immutable: this function never modifies an existing planned-change file or an
 * inline planned_changes entry.
 */
export function reopenMilestone(
  rootDir: string,
  milestoneId: string,
  options: RoadmapReopenOptions = {},
): RoadmapReopenResult {
  const reason = (options.reason ?? "").trim() || DEFAULT_REOPEN_REASON;
  const { roadmap, changeStates } = loadReopenContext(rootDir);

  if (roadmap.diagnostics.length > 0) {
    return {
      valid: false,
      reopened: emptyReopened(milestoneId),
      updatedFiles: [],
      diagnostics: sortDiagnostics(roadmap.diagnostics),
    };
  }

  const milestone = findMilestoneById(roadmap, milestoneId);
  if (!milestone) {
    return {
      valid: false,
      reopened: emptyReopened(milestoneId),
      updatedFiles: [],
      diagnostics: [
        makeDiagnostic(
          "reference",
          ROADMAP_INDEX_PATH,
          "$.milestones",
          "roadmap-reopen milestone id was not found in the roadmap",
          "existing roadmap milestone id",
          milestoneId,
        ),
      ],
    };
  }

  const standalonePlannedChanges = getStandalonePlannedChangesForMilestone(roadmap, milestone);
  const plannedChangeEntries = getMergedPlannedChangesForMilestone(milestone, standalonePlannedChanges);
  const status = buildMilestoneStatus(milestone, changeStates, plannedChangeEntries);

  const milestoneIdResolved = status.id;
  const milestoneTitleResolved = status.title;
  const milestonePathResolved = toPosix(path.join("roadmap", "milestones", milestone.relativeMilestonePath));

  const previousStatus = milestone.artifact.status;
  const priorCanonical = normalizeMilestoneStatus(previousStatus);

  const diagnostics: RoadmapDiagnostic[] = [];
  if (priorCanonical !== "complete" && priorCanonical !== "proposed") {
    // Reopening from `active` or `blocked` is a no-op for status but still
    // allowed so the user can record a reopen note; surface a soft warning.
    diagnostics.push(
      makeDiagnostic(
        "semantic",
        milestone.artifactPath,
        "$.status",
        "milestone is not complete; reopening records a note without changing in-flight status",
        "complete",
        previousStatus,
      ),
    );
  }

  // Capture frozen (archived/complete) planned changes for the result. These
  // are never modified by this operation.
  const frozenPlannedChanges: RoadmapReopenFrozenPlannedChange[] = status.plannedChanges
    .filter((plannedChange) => plannedChange.state === "archived")
    .map((plannedChange) => ({
      id: plannedChange.id,
      path: plannedChange.path,
      state: "archived",
    }));

  const reopenNote = buildReopenNote(reason);
  const updatedFiles: string[] = [];

  // Seed a pending follow-up so the milestone has real non-archived work. The
  // reopened milestone then derives its status from structured planned-change
  // state rather than from a sticky declared status.
  const seededFollowUp = seedFollowUpPlannedChange(roadmap, rootDir, milestone, frozenPlannedChanges, reason, updatedFiles);

  // Reload so the freshly seeded follow-up participates in status derivation,
  // then rewrite the milestone with its derived status plus the reopen note.
  const reloaded = loadReopenContext(rootDir);
  const reloadedMilestone = findMilestoneById(reloaded.roadmap, milestoneId);
  if (reloaded.roadmap.diagnostics.length > 0 || !reloadedMilestone) {
    return {
      valid: false,
      reopened: { ...emptyReopened(milestoneId), id: milestoneIdResolved, title: milestoneTitleResolved, path: milestonePathResolved, previousStatus, frozenPlannedChanges, seededFollowUp },
      updatedFiles,
      diagnostics: sortDiagnostics([...diagnostics, ...reloaded.roadmap.diagnostics]),
    };
  }

  const reloadedStandalone = getStandalonePlannedChangesForMilestone(reloaded.roadmap, reloadedMilestone);
  const reloadedEntries = getMergedPlannedChangesForMilestone(reloadedMilestone, reloadedStandalone);
  const reloadedStatus = buildMilestoneStatus(reloadedMilestone, reloaded.changeStates, reloadedEntries);

  const reopenNotes = [...reloadedMilestone.artifact.notes];
  if (reopenNotes[reopenNotes.length - 1] !== reopenNote) {
    reopenNotes.push(reopenNote);
  }

  const nextMilestoneArtifact = buildCanonicalMilestoneArtifact(reloadedMilestone, reloadedStatus);
  nextMilestoneArtifact.notes = reopenNotes;

  const nextContent = stringifyYamlDocument(nextMilestoneArtifact);
  writeFileIfChanged(reloadedMilestone.absolutePath, nextContent, updatedFiles, rootDir);

  // Reflect the rewritten artifact on the loaded milestone so the index rebuild
  // below picks up the derived status and the reopen note.
  reloadedMilestone.artifact = nextMilestoneArtifact;
  reloadedMilestone.raw = nextContent;

  const indexPath = path.join(rootDir, ".strict-spec-driven", "roadmap", "INDEX.yaml");
  const nextIndex = buildRoadmapIndexArtifact(reloaded.roadmap.milestones);
  writeFileIfChanged(indexPath, stringifyYamlDocument(nextIndex), updatedFiles, rootDir);

  const reopenedSummary = {
    id: milestoneIdResolved,
    title: milestoneTitleResolved,
    path: milestonePathResolved,
    previousStatus,
    newStatus: nextMilestoneArtifact.status,
    frozenPlannedChanges,
    seededFollowUp,
  };

  // Validate the reopened roadmap state without re-deriving statuses.
  const postStatus = getRoadmapStatus(rootDir);
  const reopenedDiagnostics = [...diagnostics, ...postStatus.diagnostics];
  if (!postStatus.valid) {
    return {
      valid: false,
      reopened: reopenedSummary,
      updatedFiles,
      diagnostics: sortDiagnostics(reopenedDiagnostics),
    };
  }

  return {
    valid: true,
    reopened: reopenedSummary,
    updatedFiles,
    diagnostics: sortDiagnostics(diagnostics),
  };
}

function emptyReopened(milestoneId: string): RoadmapReopenResult["reopened"] {
  return {
    id: milestoneId,
    title: "",
    path: "",
    previousStatus: "complete",
    newStatus: "proposed",
    frozenPlannedChanges: [],
    seededFollowUp: null,
  };
}
