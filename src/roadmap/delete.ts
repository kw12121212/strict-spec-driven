import { getRoadmapStatus, syncRoadmap } from "../roadmap.js";
import { loadArchivedPlannedChangeIds, loadRoadmap } from "./load.js";
import {
  PLANNED_CHANGE_SCHEMA_ID,
  ROADMAP_DIR,
  ROADMAP_INDEX_PATH,
  type LoadedPlannedChange,
  type RoadmapDiagnostic,
  type RoadmapSyncResult,
} from "./model.js";
import {
  makeDiagnostic,
  normalizeRepoRelativePath,
  partitionRepairableDiagnostics,
  sortDiagnostics,
} from "./shared.js";
import {
  appendRoadmapCrossFileDiagnostics,
  buildMilestoneStatus,
  derivePlannedChangeState,
  getChangeStateIndex,
  getMergedPlannedChangesForMilestone,
  getStandalonePlannedChangesForMilestone,
} from "./status.js";
import { buildCanonicalPlannedChangeArtifact, type RoadmapMutation } from "./sync.js";

export type RoadmapDeleteInput = {
  plannedChangeId: string;
  allowComplete: boolean;
  detachDependents: boolean;
};

export type RoadmapDeletedPlannedChange = {
  id: string;
  milestone: string;
  path: string;
  detachedDependents: string[];
};

export type RoadmapDeleteResult = RoadmapSyncResult & {
  deleted?: RoadmapDeletedPlannedChange;
};

function invalidDeleteResult(warnings: string[], diagnostics: RoadmapDiagnostic[]): RoadmapDeleteResult {
  return {
    valid: false,
    warnings,
    diagnostics: sortDiagnostics(diagnostics),
    updatedFiles: [],
    milestones: [],
  };
}

function findDependents(plannedChanges: LoadedPlannedChange[], plannedChangeId: string): LoadedPlannedChange[] {
  return plannedChanges
    .filter((candidate) => candidate.artifact.planned_change.id !== plannedChangeId)
    .filter((candidate) => candidate.artifact.depends_on.includes(plannedChangeId))
    .sort((left, right) =>
      left.artifact.planned_change.id.localeCompare(right.artifact.planned_change.id)
    );
}

/**
 * Delete one active standalone planned change.
 *
 * Deletion exists because roadmap restructuring — consolidating several planned
 * changes into fewer, larger units, or dropping work that is no longer planned —
 * has no other CLI path. `roadmap-archive` only relocates *completed* planned
 * changes, and `roadmap-move-planned-change` only reassigns ownership, so
 * without this command an AI workflow bound by the CLI-only YAML authoring
 * protocol has to stop and report a missing capability.
 *
 * Two states are refused rather than silently accepted:
 *
 * - A planned change whose strict change is already archived is completed work.
 *   Deleting it rewrites history: the owning milestone can flip from complete
 *   back to proposed, and the archived change directory is left describing work
 *   the roadmap no longer records. `allowComplete` makes that deliberate.
 * - A planned change other planned changes depend on cannot simply vanish,
 *   because every dependent would be left with a dangling `depends_on` edge.
 *   `detachDependents` removes those edges in the same atomic mutation set, so
 *   the roadmap is never written through an intermediate invalid state.
 *
 * Archived planned changes and archived milestones are frozen history and are
 * never touched. An *active* strict change for the deleted planned change is
 * reported as a warning rather than refused, matching
 * `roadmap-move-planned-change`: this command never writes under the changes
 * directory, so resolving that change directory stays an explicit operator step.
 */
export function deletePlannedChange(rootDir: string, input: RoadmapDeleteInput): RoadmapDeleteResult {
  const roadmap = loadRoadmap(rootDir);
  const changeStates = getChangeStateIndex(rootDir);
  appendRoadmapCrossFileDiagnostics(roadmap, changeStates, loadArchivedPlannedChangeIds(rootDir));
  const { blocking: blockingDiagnostics, repairable: toleratedDiagnostics } = partitionRepairableDiagnostics(
    roadmap.diagnostics.filter((diagnostic) => diagnostic.artifactPath !== ROADMAP_INDEX_PATH),
  );
  if (blockingDiagnostics.length > 0) return invalidDeleteResult(roadmap.warnings, blockingDiagnostics);

  const plannedChange = roadmap.plannedChanges.find(
    (candidate) => candidate.artifact.planned_change.id === input.plannedChangeId,
  );
  if (!plannedChange) {
    const archived = loadArchivedPlannedChangeIds(rootDir).has(input.plannedChangeId);
    return invalidDeleteResult(roadmap.warnings, [
      makeDiagnostic(
        "reference",
        `${ROADMAP_DIR}/planned-changes`,
        "$.planned_change.id",
        archived
          ? "roadmap-delete-planned-change planned change is archived and cannot be deleted"
          : "roadmap-delete-planned-change planned change was not found in the active roadmap",
        "active standalone planned change id",
        input.plannedChangeId,
      ),
    ]);
  }

  const milestoneId = plannedChange.artifact.planned_change.milestone;
  const deletedPath = normalizeRepoRelativePath(rootDir, plannedChange.absolutePath);

  const plannedChangeState = derivePlannedChangeState(changeStates, input.plannedChangeId);
  if (plannedChangeState === "archived" && !input.allowComplete) {
    return invalidDeleteResult(roadmap.warnings, [
      makeDiagnostic(
        "semantic",
        plannedChange.repoRelativePath,
        "$.planned_change.id",
        "roadmap-delete-planned-change refuses to delete a completed planned change because it can flip the owning milestone from complete back to proposed and leaves the archived strict change describing work the roadmap no longer records; rerun with --allow-complete to delete it deliberately",
        "planned change with unstarted or in-progress strict change state",
        "archived strict change state",
      ),
    ]);
  }

  const dependents = findDependents(roadmap.plannedChanges, input.plannedChangeId);
  if (dependents.length > 0 && !input.detachDependents) {
    return invalidDeleteResult(
      roadmap.warnings,
      dependents.map((dependent) =>
        makeDiagnostic(
          "reference",
          dependent.repoRelativePath,
          "$.depends_on",
          "roadmap-delete-planned-change refuses to leave a dangling dependency; rerun with --detach-dependents to drop this edge in the same operation",
          "planned change with no dependency on the deleted planned change",
          input.plannedChangeId,
        )
      ),
    );
  }

  const milestone = roadmap.milestones.find((candidate) => candidate.artifact.milestone.id === milestoneId);
  const mutations: RoadmapMutation[] = [{
    absolutePath: plannedChange.absolutePath,
    artifactId: input.plannedChangeId,
    schemaId: PLANNED_CHANGE_SCHEMA_ID,
    operation: "delete",
  }];

  const detachedDependents: string[] = [];
  for (const dependent of dependents) {
    const dependentMilestone = roadmap.milestones.find(
      (candidate) => candidate.artifact.milestone.id === dependent.artifact.planned_change.milestone,
    );
    if (!dependentMilestone) continue;
    const detached: LoadedPlannedChange = {
      ...dependent,
      artifact: {
        ...dependent.artifact,
        depends_on: dependent.artifact.depends_on.filter((id) => id !== input.plannedChangeId),
      },
    };
    const dependentStatus = buildMilestoneStatus(
      dependentMilestone,
      changeStates,
      getMergedPlannedChangesForMilestone(
        dependentMilestone,
        getStandalonePlannedChangesForMilestone(roadmap, dependentMilestone),
      ),
    );
    mutations.push({
      absolutePath: dependent.absolutePath,
      artifactId: dependent.artifact.planned_change.id,
      schemaId: PLANNED_CHANGE_SCHEMA_ID,
      candidate: buildCanonicalPlannedChangeArtifact(detached, dependentStatus),
    });
    detachedDependents.push(dependent.artifact.planned_change.id);
  }

  const syncResult = syncRoadmap(rootDir, { toleratedDiagnostics, stagedMutations: mutations });
  if (!syncResult.valid && syncResult.updatedFiles.length === 0) {
    return {
      valid: false,
      warnings: syncResult.warnings,
      diagnostics: syncResult.diagnostics,
      updatedFiles: [],
      milestones: [],
    };
  }

  const warnings = [...syncResult.warnings];
  if (changeStates.active.has(input.plannedChangeId)) {
    warnings.push(
      `active strict change '${input.plannedChangeId}' still exists and its proposal roadmap linkage now names a deleted planned change; `
      + `resolve it with strict-spec-cli cancel ${input.plannedChangeId} or relink it to a recorded planned change`,
    );
  }
  if (milestone === undefined) {
    warnings.push(`deleted planned change '${input.plannedChangeId}' named milestone '${milestoneId}', which is not an active roadmap milestone`);
  }

  return {
    ...syncResult,
    warnings,
    milestones: syncResult.milestones.length > 0 ? syncResult.milestones : getRoadmapStatus(rootDir).milestones,
    deleted: {
      id: input.plannedChangeId,
      milestone: milestoneId,
      path: deletedPath,
      detachedDependents,
    },
  };
}
