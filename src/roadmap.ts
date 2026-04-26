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
import { buildMilestoneStatus, getChangeStateIndex, orderMilestoneStatuses } from "./roadmap/status.js";
import { buildCanonicalMilestoneArtifact, buildRoadmapIndexArtifact, writeFileIfChanged } from "./roadmap/sync.js";

export type {
  RoadmapDiagnostic,
  RoadmapMilestoneStatus,
  RoadmapPlannedChangeStatus,
  RoadmapStatusResult,
  RoadmapSyncResult,
} from "./roadmap/model.js";

export function getRoadmapStatus(rootDir: string): RoadmapStatusResult {
  const roadmap = loadRoadmap(rootDir);
  const changeStates = getChangeStateIndex(rootDir);
  const statusMap = new Map<string, RoadmapMilestoneStatus>();
  for (const milestone of roadmap.milestones) {
    const milestonePath = `roadmap/milestones/${milestone.relativeMilestonePath}`;
    statusMap.set(milestonePath, buildMilestoneStatus(milestone, changeStates));
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

export function syncRoadmap(rootDir: string): RoadmapSyncResult {
  const roadmap = loadRoadmap(rootDir);
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

  const changeStates = getChangeStateIndex(rootDir);
  const updatedFiles: string[] = [];

  for (const milestone of roadmap.milestones) {
    const status = buildMilestoneStatus(milestone, changeStates);
    const nextArtifact = buildCanonicalMilestoneArtifact(milestone, status);
    writeFileIfChanged(milestone.absolutePath, stringifyYamlDocument(nextArtifact), updatedFiles, rootDir);
    milestone.artifact = nextArtifact;
    milestone.raw = ensureTrailingNewline(stringifyYamlDocument(nextArtifact));
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
