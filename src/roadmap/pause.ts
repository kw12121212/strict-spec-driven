import path from "path";
import {
  ROADMAP_INDEX_PATH,
  ROADMAP_MILESTONE_SCHEMA_ID,
  type DeclaredRoadmapStatus,
  type LoadedMilestone,
  type MilestonePausedState,
  type RoadmapDiagnostic,
} from "./model.js";
import { makeDiagnostic, sortDiagnostics, toPosix } from "./shared.js";
import { loadArchivedPlannedChangeIds, loadRoadmap } from "./load.js";
import {
  appendRoadmapCrossFileDiagnostics,
  buildMilestoneStatus,
  getChangeStateIndex,
  getMergedPlannedChangesForMilestone,
  getStandalonePlannedChangesForMilestone,
} from "./status.js";
import { buildCanonicalMilestoneArtifact } from "./sync.js";
import { getRoadmapStatus, syncRoadmap } from "../roadmap.js";

export type RoadmapPauseOptions = {
  reason?: string;
};

export type RoadmapResumeOptions = {
  reason?: string;
};

export type RoadmapPauseResult = {
  valid: boolean;
  paused: {
    id: string;
    title: string;
    path: string;
    previousStatus: DeclaredRoadmapStatus;
    newStatus: DeclaredRoadmapStatus;
    paused: MilestonePausedState;
  };
  updatedFiles: string[];
  diagnostics: RoadmapDiagnostic[];
};

export type RoadmapResumeResult = {
  valid: boolean;
  resumed: {
    id: string;
    title: string;
    path: string;
    previousStatus: DeclaredRoadmapStatus;
    newStatus: DeclaredRoadmapStatus;
    previousPaused: MilestonePausedState | null;
  };
  updatedFiles: string[];
  diagnostics: RoadmapDiagnostic[];
};

const DEFAULT_PAUSE_REASON = "operator applied a deliberate hold";
const DEFAULT_RESUME_REASON = "operator cleared a deliberate hold";
const PAUSED_NOT_SET = "milestone is not paused";

function buildPauseDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildPauseNote(reason: string, pausedOn: string): string {
  return `Paused on ${pausedOn}: ${reason}`;
}

function buildResumeNote(reason: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `Resumed on ${date}: ${reason}`;
}

function loadPauseContext(rootDir: string) {
  const roadmap = loadRoadmap(rootDir);
  const changeStates = getChangeStateIndex(rootDir);
  const archivedPlannedChangeIds = loadArchivedPlannedChangeIds(rootDir);
  appendRoadmapCrossFileDiagnostics(roadmap, changeStates, archivedPlannedChangeIds);
  return { roadmap, changeStates, archivedPlannedChangeIds };
}

function findMilestoneById(roadmap: ReturnType<typeof loadRoadmap>, milestoneId: string): LoadedMilestone | undefined {
  return roadmap.milestones.find((milestone) => milestone.artifact.milestone.id === milestoneId);
}

function emptyPauseResult(milestoneId: string): RoadmapPauseResult {
  return {
    valid: false,
    paused: {
      id: milestoneId,
      title: "",
      path: "",
      previousStatus: "proposed",
      newStatus: "blocked",
      paused: { status: true },
    },
    updatedFiles: [],
    diagnostics: [],
  };
}

function emptyResumeResult(milestoneId: string): RoadmapResumeResult {
  return {
    valid: false,
    resumed: {
      id: milestoneId,
      title: "",
      path: "",
      previousStatus: "blocked",
      newStatus: "proposed",
      previousPaused: null,
    },
    updatedFiles: [],
    diagnostics: [],
  };
}

/**
 * Pause a non-archived roadmap milestone by setting the structured top-level
 * `paused` field on the milestone artifact and forcing the milestone's
 * effective status to `blocked`. The pause is sticky: roadmap-sync canonical
 * rewrite preserves the `paused` field, so the milestone stays blocked until
 * roadmap-resume clears it. The function never modifies any standalone
 * planned-change file or any archived artifact; it only rewrites the milestone
 * artifact (with the new paused field plus a dated pause note) and re-syncs the
 * roadmap index.
 */
export function pauseMilestone(
  rootDir: string,
  milestoneId: string,
  options: RoadmapPauseOptions = {},
): RoadmapPauseResult {
  const reason = (options.reason ?? "").trim() || DEFAULT_PAUSE_REASON;
  const { roadmap, changeStates, archivedPlannedChangeIds } = loadPauseContext(rootDir);

  if (roadmap.diagnostics.length > 0) {
    return {
      ...emptyPauseResult(milestoneId),
      diagnostics: sortDiagnostics(roadmap.diagnostics),
    };
  }

  const milestone = findMilestoneById(roadmap, milestoneId);
  if (!milestone) {
    return {
      ...emptyPauseResult(milestoneId),
      diagnostics: [
        makeDiagnostic(
          "reference",
          ROADMAP_INDEX_PATH,
          "$.milestones",
          "roadmap-pause milestone id was not found in the roadmap",
          "existing roadmap milestone id",
          milestoneId,
        ),
      ],
    };
  }

  const standalonePlannedChanges = getStandalonePlannedChangesForMilestone(roadmap, milestone);
  const plannedChangeEntries = getMergedPlannedChangesForMilestone(milestone, standalonePlannedChanges);
  const status = buildMilestoneStatus(milestone, changeStates, archivedPlannedChangeIds, plannedChangeEntries);

  const milestoneIdResolved = status.id;
  const milestoneTitleResolved = status.title;
  const milestonePathResolved = toPosix(path.join("roadmap", "milestones", milestone.relativeMilestonePath));
  const previousStatus = milestone.artifact.status;

  const pausedOn = buildPauseDate();
  const nextPaused: MilestonePausedState = {
    status: true,
    paused_on: pausedOn,
    reason,
  };

  const pauseNote = buildPauseNote(reason, pausedOn);
  const nextNotes = [...milestone.artifact.notes];
  if (nextNotes[nextNotes.length - 1] !== pauseNote) {
    nextNotes.push(pauseNote);
  }

  const draftArtifact: LoadedMilestone["artifact"] = {
    ...milestone.artifact,
    paused: nextPaused,
    notes: nextNotes,
  };

  // Recompute status against the draft so the canonical artifact records the
  // blocked derived status alongside the new paused field.
  const draftMilestone: LoadedMilestone = {
    ...milestone,
    artifact: draftArtifact,
  };
  const nextStatus = buildMilestoneStatus(
    draftMilestone,
    changeStates,
    archivedPlannedChangeIds,
    plannedChangeEntries,
  );
  const nextArtifact = buildCanonicalMilestoneArtifact(draftMilestone, nextStatus);
  const syncResult = syncRoadmap(rootDir, { stagedMutations: [{
    absolutePath: milestone.absolutePath,
    artifactId: milestoneIdResolved,
    schemaId: ROADMAP_MILESTONE_SCHEMA_ID,
    operation: "update",
    candidate: nextArtifact,
  }] });
  if (!syncResult.valid) {
    return {
      ...emptyPauseResult(milestoneId),
      diagnostics: syncResult.diagnostics,
    };
  }

  const pausedSummary = {
    id: milestoneIdResolved,
    title: milestoneTitleResolved,
    path: milestonePathResolved,
    previousStatus,
    newStatus: nextArtifact.status,
    paused: nextArtifact.paused ?? nextPaused,
  };

  const postStatus = getRoadmapStatus(rootDir);
  if (!postStatus.valid) {
    return {
      valid: false,
      paused: pausedSummary,
      updatedFiles: syncResult.updatedFiles,
      diagnostics: sortDiagnostics(postStatus.diagnostics),
    };
  }

  return {
    valid: true,
    paused: pausedSummary,
    updatedFiles: syncResult.updatedFiles,
    diagnostics: [],
  };
}

/**
 * Resume a paused roadmap milestone by deleting the structured top-level
 * `paused` field so roadmap-sync re-derives the milestone status from
 * planned-change state. Optionally appends a dated resume note. The function
 * never modifies any standalone planned-change file or any archived artifact;
 * it only rewrites the milestone artifact and re-syncs the roadmap index.
 */
export function resumeMilestone(
  rootDir: string,
  milestoneId: string,
  options: RoadmapResumeOptions = {},
): RoadmapResumeResult {
  const reason = (options.reason ?? "").trim() || DEFAULT_RESUME_REASON;
  const { roadmap, changeStates, archivedPlannedChangeIds } = loadPauseContext(rootDir);

  if (roadmap.diagnostics.length > 0) {
    return {
      ...emptyResumeResult(milestoneId),
      diagnostics: sortDiagnostics(roadmap.diagnostics),
    };
  }

  const milestone = findMilestoneById(roadmap, milestoneId);
  if (!milestone) {
    return {
      ...emptyResumeResult(milestoneId),
      diagnostics: [
        makeDiagnostic(
          "reference",
          ROADMAP_INDEX_PATH,
          "$.milestones",
          "roadmap-resume milestone id was not found in the roadmap",
          "existing roadmap milestone id",
          milestoneId,
        ),
      ],
    };
  }

  const standalonePlannedChanges = getStandalonePlannedChangesForMilestone(roadmap, milestone);
  const plannedChangeEntries = getMergedPlannedChangesForMilestone(milestone, standalonePlannedChanges);
  const status = buildMilestoneStatus(milestone, changeStates, archivedPlannedChangeIds, plannedChangeEntries);

  const milestoneIdResolved = status.id;
  const milestoneTitleResolved = status.title;
  const milestonePathResolved = toPosix(path.join("roadmap", "milestones", milestone.relativeMilestonePath));
  const previousStatus = milestone.artifact.status;
  const previousPaused = milestone.artifact.paused ?? null;

  if (!previousPaused) {
    return {
      valid: false,
      resumed: {
        id: milestoneIdResolved,
        title: milestoneTitleResolved,
        path: milestonePathResolved,
        previousStatus,
        newStatus: previousStatus,
        previousPaused,
      },
      updatedFiles: [],
      diagnostics: [
        makeDiagnostic(
          "semantic",
          milestone.artifactPath,
          "$.paused",
          PAUSED_NOT_SET,
          "milestone with paused.status === true",
          "absent",
        ),
      ],
    };
  }

  const resumeNote = buildResumeNote(reason);
  // Build the next artifact with `paused` removed and the resume note appended.
  // buildCanonicalMilestoneArtifact only re-adds `paused` when the loaded
  // milestone artifact carries one, so feeding it a draft without `paused`
  // produces a canonical artifact without `paused`.
  const nextNotes = [...milestone.artifact.notes];
  if (nextNotes[nextNotes.length - 1] !== resumeNote) {
    nextNotes.push(resumeNote);
  }
  const draftArtifact: LoadedMilestone["artifact"] = {
    ...milestone.artifact,
    paused: undefined,
    notes: nextNotes,
  };
  const draftMilestone: LoadedMilestone = {
    ...milestone,
    artifact: draftArtifact,
  };
  const nextStatus = buildMilestoneStatus(draftMilestone, changeStates, archivedPlannedChangeIds, plannedChangeEntries);
  const nextArtifact = buildCanonicalMilestoneArtifact(draftMilestone, nextStatus);
  const syncResult = syncRoadmap(rootDir, { stagedMutations: [{
    absolutePath: milestone.absolutePath,
    artifactId: milestoneIdResolved,
    schemaId: ROADMAP_MILESTONE_SCHEMA_ID,
    operation: "update",
    candidate: nextArtifact,
  }] });
  if (!syncResult.valid) {
    return {
      ...emptyResumeResult(milestoneId),
      diagnostics: syncResult.diagnostics,
    };
  }

  const resumedSummary = {
    id: milestoneIdResolved,
    title: milestoneTitleResolved,
    path: milestonePathResolved,
    previousStatus,
    newStatus: nextArtifact.status,
    previousPaused,
  };

  const postStatus = getRoadmapStatus(rootDir);
  if (!postStatus.valid) {
    return {
      valid: false,
      resumed: resumedSummary,
      updatedFiles: syncResult.updatedFiles,
      diagnostics: sortDiagnostics(postStatus.diagnostics),
    };
  }

  return {
    valid: true,
    resumed: resumedSummary,
    updatedFiles: syncResult.updatedFiles,
    diagnostics: [],
  };
}
