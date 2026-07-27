import { existsSync, readFileSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { stringifyYamlDocument } from "../yaml.js";
import { getRoadmapStatus, syncRoadmap } from "../roadmap.js";
import { loadArchivedPlannedChangeIds, loadRoadmap } from "./load.js";
import {
  canonicalPlannedChangeFileName,
  ROADMAP_ARCHIVE_MILESTONES_DIR,
  ROADMAP_DIR,
  ROADMAP_INDEX_PATH,
  type LoadedMilestone,
  type LoadedPlannedChange,
  type LoadedRoadmap,
  type RoadmapDiagnostic,
  type RoadmapMilestoneStatus,
  type RoadmapSyncResult,
} from "./model.js";
import {
  listYamlFiles,
  makeDiagnostic,
  normalizeRepoRelativePath,
  readYamlFile,
  sortDiagnostics,
} from "./shared.js";
import {
  appendRoadmapCrossFileDiagnostics,
  buildMilestoneStatus,
  derivePlannedChangeState,
  getChangeStateIndex,
  getMergedPlannedChangesForMilestone,
  getStandalonePlannedChangesForMilestone,
  sortMilestonesByRoadmapOrder,
} from "./status.js";
import { buildCanonicalPlannedChangeArtifact, writeFileIfChanged } from "./sync.js";
import { validateMilestoneArtifact } from "./validate.js";

export type RoadmapMoveInput = {
  plannedChangeId: string;
  targetMilestoneId: string;
  allowComplete: boolean;
};

export type RoadmapMovedPlannedChange = {
  id: string;
  fromMilestone: string;
  toMilestone: string;
  fromPath: string;
  toPath: string;
};

export type RoadmapMoveResult = RoadmapSyncResult & {
  moved?: RoadmapMovedPlannedChange;
};

function invalidMoveResult(warnings: string[], diagnostics: RoadmapDiagnostic[]): RoadmapMoveResult {
  return {
    valid: false,
    warnings,
    diagnostics: sortDiagnostics(diagnostics),
    updatedFiles: [],
    milestones: [],
  };
}

function archivedMilestoneExists(rootDir: string, milestoneId: string): boolean {
  const diagnostics: RoadmapDiagnostic[] = [];
  const archiveDir = path.join(rootDir, ROADMAP_ARCHIVE_MILESTONES_DIR);
  for (const filePath of listYamlFiles(archiveDir)) {
    const artifact = validateMilestoneArtifact(readYamlFile(filePath), filePath, diagnostics);
    if (artifact?.milestone.id === milestoneId) return true;
  }
  return false;
}

/**
 * Roadmap order position of each active milestone, used to describe a
 * dependency edge as pointing forward or backward across the roadmap.
 */
function buildMilestoneOrderIndex(milestones: LoadedMilestone[]): Map<string, number> {
  const index = new Map<string, number>();
  sortMilestonesByRoadmapOrder(milestones).forEach((milestone, position) => {
    index.set(milestone.artifact.milestone.id, position);
  });
  return index;
}

/**
 * Non-blocking observations about a completed move.
 *
 * `depends_on` resolves globally across roadmap planned-change sources, so a
 * move never breaks dependency validation. It can, however, leave an edge
 * pointing from an earlier-ordered milestone to a later-ordered one, which makes
 * the dependent planned change unrecommendable until the later milestone
 * finishes. Those edges are reported rather than rejected because a deliberate
 * reorganization may intend them.
 */
function buildMoveWarnings(
  roadmap: LoadedRoadmap,
  plannedChange: LoadedPlannedChange,
  targetMilestoneId: string,
  hasActiveChange: boolean,
): string[] {
  const warnings: string[] = [];
  const plannedChangeId = plannedChange.artifact.planned_change.id;

  if (hasActiveChange) {
    warnings.push(
      `active strict change '${plannedChangeId}' still records the previous milestone in its proposal roadmap linkage; refresh it with `
      + `strict-spec-cli generate ${plannedChangeId} proposal --milestone ${targetMilestoneId} --planned-change ${plannedChangeId}`,
    );
  }

  const milestoneOrder = buildMilestoneOrderIndex(roadmap.milestones);
  const targetPosition = milestoneOrder.get(targetMilestoneId);
  if (targetPosition === undefined) return warnings;

  const byId = new Map<string, LoadedPlannedChange>();
  for (const candidate of roadmap.plannedChanges) {
    byId.set(candidate.artifact.planned_change.id, candidate);
  }

  for (const dependencyId of plannedChange.artifact.depends_on) {
    const dependency = byId.get(dependencyId);
    if (!dependency) continue;
    const dependencyPosition = milestoneOrder.get(dependency.artifact.planned_change.milestone);
    if (dependencyPosition === undefined || dependencyPosition <= targetPosition) continue;
    warnings.push(
      `planned change '${plannedChangeId}' now depends on '${dependencyId}' owned by later milestone `
      + `'${dependency.artifact.planned_change.milestone}'; the dependent work stays blocked until that milestone completes`,
    );
  }

  for (const dependent of roadmap.plannedChanges) {
    if (dependent.artifact.planned_change.id === plannedChangeId) continue;
    if (!dependent.artifact.depends_on.includes(plannedChangeId)) continue;
    const dependentPosition = milestoneOrder.get(dependent.artifact.planned_change.milestone);
    if (dependentPosition === undefined || dependentPosition >= targetPosition) continue;
    warnings.push(
      `planned change '${dependent.artifact.planned_change.id}' in earlier milestone '${dependent.artifact.planned_change.milestone}' `
      + `depends on '${plannedChangeId}', which now belongs to later milestone '${targetMilestoneId}'`,
    );
  }

  return warnings;
}

/**
 * Reassign one active standalone planned change to a different active
 * milestone. The declared milestone and the canonical milestone-prefixed
 * filename move together in a single operation, because a basename that does
 * not match the declaring milestone is itself a blocking validation
 * diagnostic — rewriting only the field would leave the roadmap invalid until a
 * second command ran.
 *
 * Archived milestones and archived planned changes are frozen history and are
 * never rewritten. A planned change whose strict change is already archived is
 * refused unless `allowComplete` is set, because moving completed work can flip
 * the source milestone from complete back to proposed and makes the target
 * milestone report work it never contained.
 *
 * The function never writes under the changes directory: a stale
 * `proposal.yaml` roadmap linkage is reported as a warning instead.
 */
export function movePlannedChangeToMilestone(rootDir: string, input: RoadmapMoveInput): RoadmapMoveResult {
  const roadmap = loadRoadmap(rootDir);
  const changeStates = getChangeStateIndex(rootDir);
  appendRoadmapCrossFileDiagnostics(roadmap, changeStates, loadArchivedPlannedChangeIds(rootDir));
  const blockingDiagnostics = roadmap.diagnostics.filter((diagnostic) => diagnostic.artifactPath !== ROADMAP_INDEX_PATH);
  if (blockingDiagnostics.length > 0) return invalidMoveResult(roadmap.warnings, blockingDiagnostics);

  const targetMilestone = roadmap.milestones.find(
    (milestone) => milestone.artifact.milestone.id === input.targetMilestoneId,
  );
  if (!targetMilestone) {
    const archived = archivedMilestoneExists(rootDir, input.targetMilestoneId);
    return invalidMoveResult(roadmap.warnings, [
      makeDiagnostic(
        "reference",
        ROADMAP_INDEX_PATH,
        "$.milestones",
        archived
          ? "roadmap-move-planned-change target milestone is archived and cannot receive planned changes"
          : "roadmap-move-planned-change target milestone was not found in the active roadmap",
        "active roadmap milestone id",
        input.targetMilestoneId,
      ),
    ]);
  }

  const plannedChange = roadmap.plannedChanges.find(
    (candidate) => candidate.artifact.planned_change.id === input.plannedChangeId,
  );
  if (!plannedChange) {
    const archived = loadArchivedPlannedChangeIds(rootDir).has(input.plannedChangeId);
    return invalidMoveResult(roadmap.warnings, [
      makeDiagnostic(
        "reference",
        `${ROADMAP_DIR}/planned-changes`,
        "$.planned_change.id",
        archived
          ? "roadmap-move-planned-change planned change is archived and cannot be moved"
          : "roadmap-move-planned-change planned change was not found in the active roadmap",
        "active standalone planned change id",
        input.plannedChangeId,
      ),
    ]);
  }

  const sourceMilestoneId = plannedChange.artifact.planned_change.milestone;
  const sourcePath = normalizeRepoRelativePath(rootDir, plannedChange.absolutePath);

  if (sourceMilestoneId === input.targetMilestoneId) {
    return {
      valid: true,
      warnings: roadmap.warnings,
      diagnostics: [],
      updatedFiles: [],
      milestones: getRoadmapStatus(rootDir).milestones,
      moved: {
        id: input.plannedChangeId,
        fromMilestone: sourceMilestoneId,
        toMilestone: input.targetMilestoneId,
        fromPath: sourcePath,
        toPath: sourcePath,
      },
    };
  }

  const plannedChangeState = derivePlannedChangeState(changeStates, input.plannedChangeId);
  if (plannedChangeState === "archived" && !input.allowComplete) {
    return invalidMoveResult(roadmap.warnings, [
      makeDiagnostic(
        "semantic",
        plannedChange.repoRelativePath,
        "$.planned_change.milestone",
        "roadmap-move-planned-change refuses to move a completed planned change because it can flip the source milestone from complete back to proposed and make the target milestone report work it never contained; rerun with --allow-complete to move it deliberately",
        "planned change with unstarted or in-progress strict change state",
        "archived strict change state",
      ),
    ]);
  }

  const destinationAbsolutePath = path.join(
    path.dirname(plannedChange.absolutePath),
    canonicalPlannedChangeFileName(input.targetMilestoneId, input.plannedChangeId),
  );
  const destinationPath = normalizeRepoRelativePath(rootDir, destinationAbsolutePath);
  const renames = destinationAbsolutePath !== plannedChange.absolutePath;
  if (renames && existsSync(destinationAbsolutePath)) {
    return invalidMoveResult(roadmap.warnings, [
      makeDiagnostic(
        "semantic",
        destinationPath,
        "$.planned_change",
        "roadmap-move-planned-change destination filename is already occupied",
        "unused canonical planned change file path",
        destinationPath,
      ),
    ]);
  }

  const draftPlannedChange: LoadedPlannedChange = {
    ...plannedChange,
    artifact: {
      ...plannedChange.artifact,
      planned_change: {
        id: plannedChange.artifact.planned_change.id,
        milestone: input.targetMilestoneId,
      },
    },
  };
  const targetStandalone = [
    ...getStandalonePlannedChangesForMilestone(roadmap, targetMilestone),
    draftPlannedChange,
  ];
  const targetStatus: RoadmapMilestoneStatus = buildMilestoneStatus(
    targetMilestone,
    changeStates,
    getMergedPlannedChangesForMilestone(targetMilestone, targetStandalone),
  );
  const nextArtifact = buildCanonicalPlannedChangeArtifact(draftPlannedChange, targetStatus);

  const previousContent = readFileSync(plannedChange.absolutePath, "utf8");
  const updatedFiles: string[] = [];
  writeFileIfChanged(destinationAbsolutePath, stringifyYamlDocument(nextArtifact), updatedFiles, rootDir);
  if (renames) {
    rmSync(plannedChange.absolutePath, { force: true });
  }

  const syncResult = syncRoadmap(rootDir);
  if (!syncResult.valid) {
    rmSync(destinationAbsolutePath, { force: true });
    writeFileSync(plannedChange.absolutePath, previousContent, "utf8");
    return {
      valid: false,
      warnings: syncResult.warnings,
      diagnostics: syncResult.diagnostics,
      updatedFiles: [],
      milestones: [],
    };
  }

  const movedRoadmap = loadRoadmap(rootDir);
  const movedPlannedChange = movedRoadmap.plannedChanges.find(
    (candidate) => candidate.artifact.planned_change.id === input.plannedChangeId,
  ) ?? draftPlannedChange;
  const warnings = [
    ...syncResult.warnings,
    ...buildMoveWarnings(movedRoadmap, movedPlannedChange, input.targetMilestoneId, changeStates.active.has(input.plannedChangeId)),
  ];

  return {
    ...syncResult,
    warnings,
    updatedFiles: Array.from(new Set([...updatedFiles, ...syncResult.updatedFiles])).sort((left, right) =>
      left.localeCompare(right)
    ),
    ...(renames ? { renamedFiles: [{ from: sourcePath, to: destinationPath }] } : {}),
    moved: {
      id: input.plannedChangeId,
      fromMilestone: sourceMilestoneId,
      toMilestone: input.targetMilestoneId,
      fromPath: sourcePath,
      toPath: destinationPath,
    },
  };
}
