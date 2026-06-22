import path from "path";
import { stringifyYamlDocument } from "../yaml.js";
import {
  ROADMAP_INDEX_PATH,
  type DeclaredRoadmapStatus,
  type LoadedMilestone,
  type RoadmapDiagnostic,
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

export type RoadmapReopenResult = {
  valid: boolean;
  reopened: {
    id: string;
    title: string;
    path: string;
    previousStatus: DeclaredRoadmapStatus;
    newStatus: DeclaredRoadmapStatus;
    frozenPlannedChanges: RoadmapReopenFrozenPlannedChange[];
  };
  updatedFiles: string[];
  diagnostics: RoadmapDiagnostic[];
};

const DEFAULT_REOPEN_REASON = "gaps discovered after completion";
const REOPEN_TARGET_STATUS: DeclaredRoadmapStatus = "active";

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
 * Reopen a previously completed milestone by flipping its status to `active`
 * and appending a dated reopen note. Completed (archived) planned changes are
 * immutable: this function never modifies a planned-change file or an inline
 * planned_changes entry — only the milestone's top-level `status` and `notes`
 * fields change. New follow-up planned changes are added separately via the
 * normal roadmap planning workflow after reopen.
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
  const reopenNotes = [...milestone.artifact.notes];
  const lastNote = reopenNotes[reopenNotes.length - 1];
  if (lastNote !== reopenNote) {
    reopenNotes.push(reopenNote);
  }

  const nextMilestoneArtifact = buildCanonicalMilestoneArtifact(milestone, status);
  nextMilestoneArtifact.status = REOPEN_TARGET_STATUS;
  nextMilestoneArtifact.notes = reopenNotes;

  const updatedFiles: string[] = [];
  const nextContent = stringifyYamlDocument(nextMilestoneArtifact);
  writeFileIfChanged(milestone.absolutePath, nextContent, updatedFiles, rootDir);

  // Reflect the rewritten artifact on the loaded milestone so the canonical
  // index rebuild below picks up the new `active` status and the reopen note.
  milestone.artifact = nextMilestoneArtifact;
  milestone.raw = nextContent;

  // Rebuild the roadmap index from the reopened milestone state. We deliberately
  // do NOT call `syncRoadmap` here: full sync re-derives the milestone status
  // from planned-change completion state, which would flip a reopened milestone
  // (whose planned changes are all archived) back to `complete`. Reopen is an
  // explicit user override of that derivation; the index must reflect it.
  const indexPath = path.join(rootDir, ".strict-spec-driven", "roadmap", "INDEX.yaml");
  const nextIndex = buildRoadmapIndexArtifact(roadmap.milestones);
  writeFileIfChanged(indexPath, stringifyYamlDocument(nextIndex), updatedFiles, rootDir);

  const reopenedSummary = {
    id: milestoneIdResolved,
    title: milestoneTitleResolved,
    path: milestonePathResolved,
    previousStatus,
    newStatus: REOPEN_TARGET_STATUS,
    frozenPlannedChanges,
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
    newStatus: REOPEN_TARGET_STATUS,
    frozenPlannedChanges: [],
  };
}
