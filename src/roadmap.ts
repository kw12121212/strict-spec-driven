import { existsSync, statSync } from "fs";
import path from "path";
import { stringifyYamlDocument } from "./yaml.js";
import {
  ROADMAP_DIR,
  ROADMAP_INDEX_PATH,
  type RoadmapMilestoneStatus,
  type RoadmapStatusResult,
  type RoadmapSyncResult,
} from "./roadmap/model.js";
import { ensureTrailingNewline, makeDiagnostic, sortDiagnostics } from "./roadmap/shared.js";
import { loadRoadmap } from "./roadmap/load.js";
import {
  appendRoadmapCrossFileDiagnostics,
  buildMilestoneStatus,
  getChangeStateIndex,
  getMergedPlannedChangesForMilestone,
  getStandalonePlannedChangesForMilestone,
  orderMilestoneStatuses,
} from "./roadmap/status.js";
import {
  buildCanonicalMilestoneArtifact,
  buildCanonicalPlannedChangeArtifact,
  buildMaterializedPlannedChangeArtifact,
  buildRoadmapIndexArtifact,
  ensurePlannedChangeDirectory,
  materializedPlannedChangePath,
  writeFileIfChanged,
} from "./roadmap/sync.js";

export type {
  RoadmapDiagnostic,
  RoadmapMilestoneStatus,
  RoadmapPlannedChangeStatus,
  RoadmapStatusResult,
  RoadmapSyncResult,
} from "./roadmap/model.js";

export type RoadmapSyncOptions = {
  materializePlannedChanges?: boolean;
};

export function getRoadmapStatus(rootDir: string): RoadmapStatusResult {
  const roadmap = loadRoadmap(rootDir);
  const changeStates = getChangeStateIndex(rootDir);
  appendRoadmapCrossFileDiagnostics(roadmap, changeStates);
  const statusMap = new Map<string, RoadmapMilestoneStatus>();
  for (const milestone of roadmap.milestones) {
    const milestonePath = `roadmap/milestones/${milestone.relativeMilestonePath}`;
    const standalonePlannedChanges = getStandalonePlannedChangesForMilestone(roadmap, milestone);
    const plannedChangeEntries = getMergedPlannedChangesForMilestone(milestone, standalonePlannedChanges);
    statusMap.set(milestonePath, buildMilestoneStatus(milestone, changeStates, plannedChangeEntries));
  }

  const milestones = orderMilestoneStatuses(rootDir, roadmap, statusMap, ROADMAP_INDEX_PATH);
  const diagnostics = sortDiagnostics(roadmap.diagnostics);

  return {
    valid: diagnostics.length === 0,
    warnings: roadmap.warnings,
    diagnostics,
    milestones,
  };
}

export function syncRoadmap(rootDir: string, options: RoadmapSyncOptions = {}): RoadmapSyncResult {
  const roadmap = loadRoadmap(rootDir, {
    allowInlinePlannedChanges: options.materializePlannedChanges === true,
  });
  const changeStates = getChangeStateIndex(rootDir);
  appendRoadmapCrossFileDiagnostics(roadmap, changeStates);
  const blockingDiagnostics = roadmap.diagnostics.filter((diagnostic) => diagnostic.artifactPath !== ROADMAP_INDEX_PATH);
  if (blockingDiagnostics.length > 0) {
    return {
      valid: false,
      warnings: roadmap.warnings,
      diagnostics: sortDiagnostics(blockingDiagnostics),
      updatedFiles: [],
      milestones: [],
    };
  }

  const roadmapDir = path.join(rootDir, ROADMAP_DIR);
  if (!existsSync(roadmapDir) || !statSync(roadmapDir).isDirectory()) {
    return {
      valid: false,
      warnings: roadmap.warnings,
      diagnostics: [
        makeDiagnostic("schema", ROADMAP_DIR, "$", "strict roadmap directory not found", ROADMAP_DIR, "missing"),
      ],
      updatedFiles: [],
      milestones: [],
    };
  }

  const updatedFiles: string[] = [];

  for (const milestone of roadmap.milestones) {
    const standalonePlannedChanges = getStandalonePlannedChangesForMilestone(roadmap, milestone);
    const plannedChangeEntries = getMergedPlannedChangesForMilestone(milestone, standalonePlannedChanges);
    const status = buildMilestoneStatus(milestone, changeStates, plannedChangeEntries);
    const materializedInlineIds = options.materializePlannedChanges
      ? new Set(Object.keys(milestone.artifact.planned_changes))
      : undefined;

    if (options.materializePlannedChanges) {
      for (const [id, entry] of Object.entries(milestone.artifact.planned_changes)) {
        const plannedChangePath = materializedPlannedChangePath(rootDir, milestone, id);
        ensurePlannedChangeDirectory(plannedChangePath);
        const plannedChangeArtifact = buildMaterializedPlannedChangeArtifact(milestone, id, entry, status);
        writeFileIfChanged(plannedChangePath, stringifyYamlDocument(plannedChangeArtifact), updatedFiles, rootDir);
      }
    }

    const nextArtifact = buildCanonicalMilestoneArtifact(milestone, status, {
      omitInlinePlannedChangeIds: materializedInlineIds,
    });
    writeFileIfChanged(milestone.absolutePath, stringifyYamlDocument(nextArtifact), updatedFiles, rootDir);
    milestone.artifact = nextArtifact;
    milestone.raw = ensureTrailingNewline(stringifyYamlDocument(nextArtifact));

    for (const plannedChange of standalonePlannedChanges) {
      const nextPlannedChangeArtifact = buildCanonicalPlannedChangeArtifact(plannedChange, status);
      writeFileIfChanged(plannedChange.absolutePath, stringifyYamlDocument(nextPlannedChangeArtifact), updatedFiles, rootDir);
      plannedChange.artifact = nextPlannedChangeArtifact;
      plannedChange.raw = ensureTrailingNewline(stringifyYamlDocument(nextPlannedChangeArtifact));
    }
  }

  const indexPath = path.join(rootDir, ROADMAP_INDEX_PATH);
  const nextIndex = buildRoadmapIndexArtifact(roadmap.milestones);
  writeFileIfChanged(indexPath, stringifyYamlDocument(nextIndex), updatedFiles, rootDir);

  const status = getRoadmapStatus(rootDir);
  return {
    valid: status.valid,
    warnings: status.warnings,
    diagnostics: status.diagnostics,
    updatedFiles,
    milestones: status.milestones,
  };
}
