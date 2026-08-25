import path from "path";
import {
  ROADMAP_INDEX_PATH,
  ROADMAP_MILESTONE_SCHEMA_ID,
  type DeclaredRoadmapStatus,
  type LoadedMilestone,
  type MilestoneAwaitingRefinementState,
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

export type RoadmapDeferOptions = {
  reason?: string;
};

export type RoadmapRefineOptions = {
  reason?: string;
};

export type RoadmapDeferResult = {
  valid: boolean;
  deferred: {
    id: string;
    title: string;
    path: string;
    status: DeclaredRoadmapStatus;
    awaitingRefinement: MilestoneAwaitingRefinementState;
  };
  updatedFiles: string[];
  diagnostics: RoadmapDiagnostic[];
};

export type RoadmapRefineResult = {
  valid: boolean;
  refined: {
    id: string;
    title: string;
    path: string;
    status: DeclaredRoadmapStatus;
    previousAwaitingRefinement: MilestoneAwaitingRefinementState | null;
  };
  updatedFiles: string[];
  diagnostics: RoadmapDiagnostic[];
};

const DEFAULT_DEFER_REASON = "a precondition has not matured yet";
const DEFAULT_REFINE_REASON = "operator declared the milestone refined";
const NOT_AWAITING_REFINEMENT = "milestone is not awaiting refinement";

function buildDeferDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildDeferNote(reason: string, deferredOn: string): string {
  return `Deferred refinement on ${deferredOn}: ${reason}`;
}

function buildRefineNote(reason: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `Refined on ${date}: ${reason}`;
}

function loadRefinementContext(rootDir: string) {
  const roadmap = loadRoadmap(rootDir);
  const changeStates = getChangeStateIndex(rootDir);
  const archivedPlannedChangeIds = loadArchivedPlannedChangeIds(rootDir);
  appendRoadmapCrossFileDiagnostics(roadmap, changeStates, archivedPlannedChangeIds);
  return { roadmap, changeStates, archivedPlannedChangeIds };
}

function findMilestoneById(roadmap: ReturnType<typeof loadRoadmap>, milestoneId: string): LoadedMilestone | undefined {
  return roadmap.milestones.find((milestone) => milestone.artifact.milestone.id === milestoneId);
}

function emptyDeferResult(milestoneId: string): RoadmapDeferResult {
  return {
    valid: false,
    deferred: {
      id: milestoneId,
      title: "",
      path: "",
      status: "proposed",
      awaitingRefinement: { status: true },
    },
    updatedFiles: [],
    diagnostics: [],
  };
}

function emptyRefineResult(milestoneId: string): RoadmapRefineResult {
  return {
    valid: false,
    refined: {
      id: milestoneId,
      title: "",
      path: "",
      status: "proposed",
      previousAwaitingRefinement: null,
    },
    updatedFiles: [],
    diagnostics: [],
  };
}

/**
 * Declare a non-archived roadmap milestone as deliberately not yet elaborated
 * by setting the structured top-level `awaiting_refinement` field. Unlike
 * roadmap-pause this does not force the milestone status to `blocked`: the
 * milestone keeps the status derived from its planned-change state, because it
 * is planned work whose detail is deferred rather than work that is blocked.
 * The declaration is sticky — roadmap-sync canonical rewrite preserves it — and
 * only roadmap-refine clears it, because whether the precondition has matured
 * is a human judgement that no derived state can reconstruct. The function
 * never modifies any standalone planned-change file or any archived artifact.
 */
export function deferMilestoneRefinement(
  rootDir: string,
  milestoneId: string,
  options: RoadmapDeferOptions = {},
): RoadmapDeferResult {
  const reason = (options.reason ?? "").trim() || DEFAULT_DEFER_REASON;
  const { roadmap, changeStates, archivedPlannedChangeIds } = loadRefinementContext(rootDir);

  if (roadmap.diagnostics.length > 0) {
    return {
      ...emptyDeferResult(milestoneId),
      diagnostics: sortDiagnostics(roadmap.diagnostics),
    };
  }

  const milestone = findMilestoneById(roadmap, milestoneId);
  if (!milestone) {
    return {
      ...emptyDeferResult(milestoneId),
      diagnostics: [
        makeDiagnostic(
          "reference",
          ROADMAP_INDEX_PATH,
          "$.milestones",
          "roadmap-defer milestone id was not found in the active roadmap",
          "existing active roadmap milestone id",
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

  // Deferring refinement of finished work is meaningless: there is nothing left
  // to elaborate, and the declaration would survive into the archive.
  if (status.derivedStatus === "complete") {
    return {
      ...emptyDeferResult(milestoneId),
      diagnostics: [
        makeDiagnostic(
          "semantic",
          milestone.artifactPath,
          "$.status",
          "roadmap-defer cannot defer refinement of a milestone whose derived status is complete",
          "an incomplete milestone",
          status.derivedStatus,
        ),
      ],
    };
  }

  const deferredOn = buildDeferDate();
  const nextAwaitingRefinement: MilestoneAwaitingRefinementState = {
    status: true,
    deferred_on: deferredOn,
    reason,
  };

  const deferNote = buildDeferNote(reason, deferredOn);
  const nextNotes = [...milestone.artifact.notes];
  if (nextNotes[nextNotes.length - 1] !== deferNote) {
    nextNotes.push(deferNote);
  }

  const draftArtifact: LoadedMilestone["artifact"] = {
    ...milestone.artifact,
    awaiting_refinement: nextAwaitingRefinement,
    notes: nextNotes,
  };
  const draftMilestone: LoadedMilestone = {
    ...milestone,
    artifact: draftArtifact,
  };
  const nextStatus = buildMilestoneStatus(draftMilestone, changeStates, archivedPlannedChangeIds, plannedChangeEntries);
  const nextArtifact = buildCanonicalMilestoneArtifact(draftMilestone, nextStatus);
  const syncResult = syncRoadmap(rootDir, {
    stagedMutations: [{
      absolutePath: milestone.absolutePath,
      artifactId: milestoneIdResolved,
      schemaId: ROADMAP_MILESTONE_SCHEMA_ID,
      operation: "update",
      candidate: nextArtifact,
    }],
  });
  if (!syncResult.valid) {
    return {
      ...emptyDeferResult(milestoneId),
      diagnostics: syncResult.diagnostics,
    };
  }

  const deferredSummary = {
    id: milestoneIdResolved,
    title: milestoneTitleResolved,
    path: milestonePathResolved,
    status: nextArtifact.status,
    awaitingRefinement: nextArtifact.awaiting_refinement ?? nextAwaitingRefinement,
  };

  const postStatus = getRoadmapStatus(rootDir);
  if (!postStatus.valid) {
    return {
      valid: false,
      deferred: deferredSummary,
      updatedFiles: syncResult.updatedFiles,
      diagnostics: sortDiagnostics(postStatus.diagnostics),
    };
  }

  return {
    valid: true,
    deferred: deferredSummary,
    updatedFiles: syncResult.updatedFiles,
    diagnostics: [],
  };
}

/**
 * Clear the `awaiting_refinement` declaration from a roadmap milestone,
 * returning it to the ordinary recommendation pipeline. This command does not
 * itself elaborate anything: refinement is ordinary in-place editing through
 * roadmap-generate milestone and roadmap-generate planned-change, and this only
 * records the operator's judgement that the precondition has matured. The
 * function never modifies any standalone planned-change file or any archived
 * artifact.
 */
export function refineMilestone(
  rootDir: string,
  milestoneId: string,
  options: RoadmapRefineOptions = {},
): RoadmapRefineResult {
  const reason = (options.reason ?? "").trim() || DEFAULT_REFINE_REASON;
  const { roadmap, changeStates, archivedPlannedChangeIds } = loadRefinementContext(rootDir);

  if (roadmap.diagnostics.length > 0) {
    return {
      ...emptyRefineResult(milestoneId),
      diagnostics: sortDiagnostics(roadmap.diagnostics),
    };
  }

  const milestone = findMilestoneById(roadmap, milestoneId);
  if (!milestone) {
    return {
      ...emptyRefineResult(milestoneId),
      diagnostics: [
        makeDiagnostic(
          "reference",
          ROADMAP_INDEX_PATH,
          "$.milestones",
          "roadmap-refine milestone id was not found in the active roadmap",
          "existing active roadmap milestone id",
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
  const previousAwaitingRefinement = milestone.artifact.awaiting_refinement ?? null;

  if (!previousAwaitingRefinement) {
    return {
      valid: false,
      refined: {
        id: milestoneIdResolved,
        title: milestoneTitleResolved,
        path: milestonePathResolved,
        status: milestone.artifact.status,
        previousAwaitingRefinement,
      },
      updatedFiles: [],
      diagnostics: [
        makeDiagnostic(
          "semantic",
          milestone.artifactPath,
          "$.awaiting_refinement",
          NOT_AWAITING_REFINEMENT,
          "milestone with awaiting_refinement.status === true",
          "absent",
        ),
      ],
    };
  }

  const refineNote = buildRefineNote(reason);
  // buildCanonicalMilestoneArtifact only re-adds `awaiting_refinement` when the
  // loaded milestone artifact carries one, so feeding it a draft without the
  // field produces a canonical artifact without it.
  const nextNotes = [...milestone.artifact.notes];
  if (nextNotes[nextNotes.length - 1] !== refineNote) {
    nextNotes.push(refineNote);
  }
  const draftArtifact: LoadedMilestone["artifact"] = {
    ...milestone.artifact,
    awaiting_refinement: undefined,
    notes: nextNotes,
  };
  const draftMilestone: LoadedMilestone = {
    ...milestone,
    artifact: draftArtifact,
  };
  const nextStatus = buildMilestoneStatus(draftMilestone, changeStates, archivedPlannedChangeIds, plannedChangeEntries);
  const nextArtifact = buildCanonicalMilestoneArtifact(draftMilestone, nextStatus);
  const syncResult = syncRoadmap(rootDir, {
    stagedMutations: [{
      absolutePath: milestone.absolutePath,
      artifactId: milestoneIdResolved,
      schemaId: ROADMAP_MILESTONE_SCHEMA_ID,
      operation: "update",
      candidate: nextArtifact,
    }],
  });
  if (!syncResult.valid) {
    return {
      ...emptyRefineResult(milestoneId),
      diagnostics: syncResult.diagnostics,
    };
  }

  const refinedSummary = {
    id: milestoneIdResolved,
    title: milestoneTitleResolved,
    path: milestonePathResolved,
    status: nextArtifact.status,
    previousAwaitingRefinement,
  };

  const postStatus = getRoadmapStatus(rootDir);
  if (!postStatus.valid) {
    return {
      valid: false,
      refined: refinedSummary,
      updatedFiles: syncResult.updatedFiles,
      diagnostics: sortDiagnostics(postStatus.diagnostics),
    };
  }

  return {
    valid: true,
    refined: refinedSummary,
    updatedFiles: syncResult.updatedFiles,
    diagnostics: [],
  };
}
