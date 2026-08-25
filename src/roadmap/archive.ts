import { existsSync } from "fs";
import path from "path";
import { loadArchivedPlannedChangeIds, loadRoadmap } from "./load.js";
import {
  ROADMAP_ARCHIVE_MILESTONES_DIR,
  ROADMAP_ARCHIVE_PLANNED_CHANGES_DIR,
  PLANNED_CHANGE_SCHEMA_ID,
  ROADMAP_INDEX_SCHEMA_ID,
  ROADMAP_INDEX_PATH,
  ROADMAP_MILESTONE_SCHEMA_ID,
  type LoadedMilestone,
  type LoadedPlannedChange,
  type RoadmapArchivedMilestone,
  type RoadmapArchiveResult,
  type RoadmapArchiveSkippedMilestone,
  type RoadmapDiagnostic,
  type RoadmapMilestoneStatus,
} from "./model.js";
import { makeDiagnostic, normalizeRepoRelativePath, sortDiagnostics, toPosix } from "./shared.js";
import {
  appendRoadmapCrossFileDiagnostics,
  buildMilestoneStatus,
  getChangeStateIndex,
  getMergedPlannedChangesForMilestone,
  getStandalonePlannedChangesForMilestone,
  orderMilestoneStatuses,
} from "./status.js";
import {
  commitRoadmapMutations,
  buildCanonicalMilestoneArtifact,
  buildCanonicalPlannedChangeArtifact,
  buildRoadmapIndexArtifact,
  roadmapMutationDiagnostics,
  roadmapUpdatedFiles,
  type RoadmapMutation,
} from "./sync.js";

type ArchiveTarget = {
  milestone: LoadedMilestone;
  status: RoadmapMilestoneStatus;
  milestoneArchivePath: string;
  plannedChanges: Array<{
    plannedChange: LoadedPlannedChange;
    archivePath: string;
  }>;
};

function archivePlannedChangePath(rootDir: string, plannedChange: LoadedPlannedChange): string {
  const relative = plannedChange.relativeRoadmapPath.startsWith("planned-changes/")
    ? plannedChange.relativeRoadmapPath.slice("planned-changes/".length)
    : plannedChange.relativeRoadmapPath;
  return path.join(rootDir, ROADMAP_ARCHIVE_PLANNED_CHANGES_DIR, relative);
}

function archiveMilestonePath(rootDir: string, milestone: LoadedMilestone): string {
  return path.join(rootDir, ROADMAP_ARCHIVE_MILESTONES_DIR, milestone.relativeMilestonePath);
}

function buildSkippedMilestone(status: RoadmapMilestoneStatus): RoadmapArchiveSkippedMilestone {
  return {
    id: status.id,
    path: status.path,
    reason: `derived status is ${status.derivedStatus}, not complete`,
    declaredStatus: status.declaredStatus,
    derivedStatus: status.derivedStatus,
    plannedChangeStates: status.plannedChanges.map((plannedChange) => ({
      id: plannedChange.id,
      state: plannedChange.state,
      declaredStatus: plannedChange.declaredStatus,
      derivedStatus: plannedChange.derivedStatus,
    })),
  };
}

function appendCollisionDiagnostics(targets: ArchiveTarget[], diagnostics: RoadmapDiagnostic[], rootDir: string): void {
  for (const target of targets) {
    if (existsSync(target.milestoneArchivePath)) {
      diagnostics.push(
        makeDiagnostic(
          "semantic",
          target.milestone.repoRelativePath,
          "$",
          "roadmap milestone archive destination already exists",
          "available archive destination",
          normalizeRepoRelativePath(rootDir, target.milestoneArchivePath),
        ),
      );
    }
    for (const plannedChange of target.plannedChanges) {
      if (!existsSync(plannedChange.archivePath)) continue;
      diagnostics.push(
        makeDiagnostic(
          "semantic",
          plannedChange.plannedChange.repoRelativePath,
          "$",
          "roadmap planned-change archive destination already exists",
          "available archive destination",
          normalizeRepoRelativePath(rootDir, plannedChange.archivePath),
        ),
      );
    }
  }
}

export function archiveRoadmapMilestones(rootDir: string, milestoneId?: string): RoadmapArchiveResult {
  const roadmap = loadRoadmap(rootDir);
  const changeStates = getChangeStateIndex(rootDir);
  const archivedPlannedChangeIds = loadArchivedPlannedChangeIds(rootDir);
  appendRoadmapCrossFileDiagnostics(roadmap, changeStates, archivedPlannedChangeIds);

  const statusMap = new Map<string, RoadmapMilestoneStatus>();
  for (const milestone of roadmap.milestones) {
    const milestonePath = `roadmap/milestones/${milestone.relativeMilestonePath}`;
    const standalonePlannedChanges = getStandalonePlannedChangesForMilestone(roadmap, milestone);
    const plannedChangeEntries = getMergedPlannedChangesForMilestone(milestone, standalonePlannedChanges);
    statusMap.set(milestonePath, buildMilestoneStatus(milestone, changeStates, archivedPlannedChangeIds, plannedChangeEntries));
  }

  const milestones = orderMilestoneStatuses(rootDir, roadmap, statusMap, ROADMAP_INDEX_PATH);
  let diagnostics = sortDiagnostics(roadmap.diagnostics);
  if (diagnostics.length > 0) {
    return {
      valid: false,
      warnings: roadmap.warnings,
      diagnostics,
      updatedFiles: [],
      archivedMilestones: [],
      skippedMilestones: [],
    };
  }

  const selectedStatuses = milestoneId === undefined
    ? milestones
    : milestones.filter((milestone) => milestone.id === milestoneId);
  if (milestoneId !== undefined && selectedStatuses.length === 0) {
    diagnostics = [
      makeDiagnostic(
        "reference",
        ROADMAP_INDEX_PATH,
        "$.milestones",
        "roadmap-archive milestone id was not found in the active roadmap",
        "active roadmap milestone id",
        milestoneId,
      ),
    ];
    return {
      valid: false,
      warnings: roadmap.warnings,
      diagnostics,
      updatedFiles: [],
      archivedMilestones: [],
      skippedMilestones: [],
    };
  }

  const milestonesByStatusPath = new Map(
    roadmap.milestones.map((milestone) => [`roadmap/milestones/${milestone.relativeMilestonePath}`, milestone]),
  );
  const targets: ArchiveTarget[] = [];
  const skippedMilestones: RoadmapArchiveSkippedMilestone[] = [];

  for (const status of selectedStatuses) {
    const milestone = milestonesByStatusPath.get(status.path);
    if (!milestone) continue;
    if (status.derivedStatus !== "complete") {
      skippedMilestones.push(buildSkippedMilestone(status));
      continue;
    }

    const completedStandalonePlannedChanges = getStandalonePlannedChangesForMilestone(roadmap, milestone)
      .filter((plannedChange) =>
        status.plannedChanges.some(
          (candidate) =>
            candidate.id === plannedChange.artifact.planned_change.id
            && candidate.source === "standalone"
            && candidate.derivedStatus === "complete",
        )
      );

    targets.push({
      milestone,
      status,
      milestoneArchivePath: archiveMilestonePath(rootDir, milestone),
      plannedChanges: completedStandalonePlannedChanges.map((plannedChange) => ({
        plannedChange,
        archivePath: archivePlannedChangePath(rootDir, plannedChange),
      })),
    });
  }

  const collisionDiagnostics: RoadmapDiagnostic[] = [];
  appendCollisionDiagnostics(targets, collisionDiagnostics, rootDir);
  if (collisionDiagnostics.length > 0) {
    return {
      valid: false,
      warnings: roadmap.warnings,
      diagnostics: sortDiagnostics(collisionDiagnostics),
      updatedFiles: [],
      archivedMilestones: [],
      skippedMilestones,
    };
  }

  const mutations: RoadmapMutation[] = [];
  const archivedMilestones: RoadmapArchivedMilestone[] = [];
  for (const target of targets) {
    mutations.push({
      absolutePath: target.milestoneArchivePath,
      artifactId: target.status.id,
      schemaId: ROADMAP_MILESTONE_SCHEMA_ID,
      operation: "create",
      candidate: buildCanonicalMilestoneArtifact(target.milestone, target.status),
    });
    mutations.push({
      absolutePath: target.milestone.absolutePath,
      artifactId: target.status.id,
      schemaId: ROADMAP_MILESTONE_SCHEMA_ID,
      operation: "delete",
    });

    const archivedPlannedChanges = [];
    for (const plannedChangeTarget of target.plannedChanges) {
      mutations.push({
        absolutePath: plannedChangeTarget.archivePath,
        artifactId: plannedChangeTarget.plannedChange.artifact.planned_change.id,
        schemaId: PLANNED_CHANGE_SCHEMA_ID,
        operation: "create",
        candidate: buildCanonicalPlannedChangeArtifact(plannedChangeTarget.plannedChange, target.status),
      });
      mutations.push({
        absolutePath: plannedChangeTarget.plannedChange.absolutePath,
        artifactId: plannedChangeTarget.plannedChange.artifact.planned_change.id,
        schemaId: PLANNED_CHANGE_SCHEMA_ID,
        operation: "delete",
      });
      archivedPlannedChanges.push({
        id: plannedChangeTarget.plannedChange.artifact.planned_change.id,
        sourcePath: toPosix(path.join("roadmap", plannedChangeTarget.plannedChange.relativeRoadmapPath)),
        archivePath: normalizeRepoRelativePath(rootDir, plannedChangeTarget.archivePath).replace(/^\.strict-spec-driven\//, ""),
      });
    }

    archivedMilestones.push({
      id: target.status.id,
      title: target.status.title,
      sourcePath: target.status.path,
      archivePath: normalizeRepoRelativePath(rootDir, target.milestoneArchivePath).replace(/^\.strict-spec-driven\//, ""),
      plannedChanges: archivedPlannedChanges.sort((left, right) => left.id.localeCompare(right.id)),
    });
  }

  if (targets.length > 0) {
    const archivedMilestonePaths = new Set(targets.map((target) => target.milestone.absolutePath));
    const remainingMilestones = roadmap.milestones.filter((milestone) => !archivedMilestonePaths.has(milestone.absolutePath));
    mutations.push({
      absolutePath: path.join(rootDir, ROADMAP_INDEX_PATH),
      artifactId: "roadmap-index",
      schemaId: ROADMAP_INDEX_SCHEMA_ID,
      role: "reference",
      candidate: buildRoadmapIndexArtifact(remainingMilestones),
    });
  }

  let updatedFiles: string[] = [];
  if (mutations.length > 0) {
    const mutation = commitRoadmapMutations(rootDir, mutations);
    if (!mutation.valid) {
      return {
        valid: false,
        warnings: roadmap.warnings,
        diagnostics: sortDiagnostics(roadmapMutationDiagnostics(mutation)),
        updatedFiles: [],
        archivedMilestones: [],
        skippedMilestones,
      };
    }
    updatedFiles = roadmapUpdatedFiles(rootDir, mutation);
  }

  return {
    valid: true,
    warnings: roadmap.warnings,
    diagnostics: [],
    updatedFiles: Array.from(new Set(updatedFiles)).sort((left, right) => left.localeCompare(right)),
    archivedMilestones: archivedMilestones.sort((left, right) => left.id.localeCompare(right.id)),
    skippedMilestones: skippedMilestones.sort((left, right) => left.id.localeCompare(right.id)),
  };
}
