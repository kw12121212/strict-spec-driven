import { existsSync } from "fs";
import path from "path";
import { loadArchivedPlannedChangeIds, loadRoadmap } from "./load.js";
import {
  ROADMAP_ARCHIVE_MILESTONES_DIR,
  ROADMAP_INDEX_PATH,
  ROADMAP_MILESTONE_SCHEMA_ID,
  type LoadedMilestone,
  type RoadmapDiagnostic,
  type RoadmapSyncResult,
} from "./model.js";
import { makeDiagnostic, readYamlFile, sortDiagnostics } from "./shared.js";
import {
  appendRoadmapCrossFileDiagnostics,
  sortMilestonesByRoadmapOrder,
} from "./status.js";
import {
  ROADMAP_ORDER_GAP,
  buildCanonicalMilestoneArtifact,
  type RoadmapMutation,
} from "./sync.js";
import { getRoadmapStatus, syncRoadmap } from "../roadmap.js";
import { getChangeStateIndex, getMergedPlannedChangesForMilestone, getStandalonePlannedChangesForMilestone, buildMilestoneStatus } from "./status.js";
import { listYamlFiles } from "./shared.js";
import { validateMilestoneArtifact } from "./validate.js";

export type RoadmapReorderInput =
  | { milestoneId: string; mode: "before"; neighborId: string }
  | { milestoneId: string; mode: "after"; neighborId: string }
  | { milestoneId: string; mode: "order"; order: number };

export type RoadmapOrderResult = RoadmapSyncResult & {
  target?: {
    id: string;
    order: number;
    path: string;
  };
};

function archivedMilestoneExists(rootDir: string, milestoneId: string): boolean {
  const diagnostics: RoadmapDiagnostic[] = [];
  const archiveDir = path.join(rootDir, ROADMAP_ARCHIVE_MILESTONES_DIR);
  for (const filePath of listYamlFiles(archiveDir)) {
    const artifact = validateMilestoneArtifact(readYamlFile(filePath), filePath, diagnostics);
    if (artifact?.milestone.id === milestoneId) return true;
  }
  return false;
}

function referenceDiagnostic(message: string, expected: string, actual: string): RoadmapDiagnostic {
  return makeDiagnostic("reference", ROADMAP_INDEX_PATH, "$.milestones", message, expected, actual);
}

function findActiveMilestone(
  milestones: LoadedMilestone[],
  rootDir: string,
  milestoneId: string,
  role: "target" | "neighbor",
): { milestone?: LoadedMilestone; diagnostic?: RoadmapDiagnostic } {
  const milestone = milestones.find((candidate) => candidate.artifact.milestone.id === milestoneId);
  if (milestone) return { milestone };
  if (archivedMilestoneExists(rootDir, milestoneId)) {
    return {
      diagnostic: referenceDiagnostic(`roadmap-reorder ${role} milestone is archived and cannot be reordered`, "active roadmap milestone id", milestoneId),
    };
  }
  return {
    diagnostic: referenceDiagnostic(`roadmap-reorder ${role} milestone was not found in the active roadmap`, "active roadmap milestone id", milestoneId),
  };
}

function getMilestoneOrder(milestone: LoadedMilestone | undefined): number | null {
  if (!milestone) return null;
  return typeof milestone.artifact.order === "number" ? milestone.artifact.order : null;
}

function midpointOrder(
  sortedMilestones: LoadedMilestone[],
  mode: "before" | "after",
  neighbor: LoadedMilestone,
): { order?: number; diagnostic?: RoadmapDiagnostic } {
  const neighborIndex = sortedMilestones.findIndex((milestone) => milestone.artifact.milestone.id === neighbor.artifact.milestone.id);
  const neighborOrder = getMilestoneOrder(neighbor);
  if (neighborIndex < 0 || neighborOrder === null) {
    return {
      diagnostic: referenceDiagnostic("roadmap-reorder neighbor milestone must have an order value", "milestone with order", neighbor.artifact.milestone.id),
    };
  }

  const low = mode === "before" ? getMilestoneOrder(sortedMilestones[neighborIndex - 1]) : neighborOrder;
  const high = mode === "before" ? neighborOrder : getMilestoneOrder(sortedMilestones[neighborIndex + 1]);
  if (low === null || low === undefined) return { order: neighborOrder - ROADMAP_ORDER_GAP };
  if (high === null || high === undefined) return { order: low + ROADMAP_ORDER_GAP };
  const candidate = Math.floor((low + high) / 2);
  if (candidate <= low || candidate >= high) {
    return {
      diagnostic: makeDiagnostic(
        "semantic",
        ROADMAP_INDEX_PATH,
        "$.milestones",
        "no integer order gap is available between requested neighbors; run roadmap-renumber first",
        "available integer midpoint",
        `${low}..${high}`,
      ),
    };
  }
  return { order: candidate };
}

function buildTargetOrderMutation(rootDir: string, milestone: LoadedMilestone, order: number): RoadmapMutation {
  const changeStates = getChangeStateIndex(rootDir);
  const archivedPlannedChangeIds = loadArchivedPlannedChangeIds(rootDir);
  const roadmap = loadRoadmap(rootDir);
  const freshMilestone = roadmap.milestones.find((candidate) => candidate.artifact.milestone.id === milestone.artifact.milestone.id) ?? milestone;
  const standalonePlannedChanges = getStandalonePlannedChangesForMilestone(roadmap, freshMilestone);
  const plannedChangeEntries = getMergedPlannedChangesForMilestone(freshMilestone, standalonePlannedChanges);
  const status = buildMilestoneStatus(freshMilestone, changeStates, archivedPlannedChangeIds, plannedChangeEntries);
  const draftMilestone = { ...freshMilestone, artifact: { ...freshMilestone.artifact, order } };
  return {
    absolutePath: freshMilestone.absolutePath,
    artifactId: freshMilestone.artifact.milestone.id,
    schemaId: ROADMAP_MILESTONE_SCHEMA_ID,
    operation: "update",
    candidate: buildCanonicalMilestoneArtifact(draftMilestone, status),
  };
}

function invalidOrderResult(warnings: string[], diagnostics: RoadmapDiagnostic[]): RoadmapOrderResult {
  return {
    valid: false,
    warnings,
    diagnostics: sortDiagnostics(diagnostics),
    updatedFiles: [],
    milestones: [],
  };
}

export function reorderRoadmapMilestone(rootDir: string, input: RoadmapReorderInput): RoadmapOrderResult {
  const roadmap = loadRoadmap(rootDir);
  const changeStates = getChangeStateIndex(rootDir);
  appendRoadmapCrossFileDiagnostics(roadmap, changeStates, loadArchivedPlannedChangeIds(rootDir));
  const blockingDiagnostics = roadmap.diagnostics.filter((diagnostic) => diagnostic.artifactPath !== ROADMAP_INDEX_PATH);
  if (blockingDiagnostics.length > 0) return invalidOrderResult(roadmap.warnings, blockingDiagnostics);

  const targetLookup = findActiveMilestone(roadmap.milestones, rootDir, input.milestoneId, "target");
  if (targetLookup.diagnostic || !targetLookup.milestone) {
    return invalidOrderResult(roadmap.warnings, [targetLookup.diagnostic].filter((diagnostic): diagnostic is RoadmapDiagnostic => Boolean(diagnostic)));
  }

  let nextOrder = input.mode === "order" ? input.order : undefined;
  if (input.mode !== "order") {
    if (input.neighborId === input.milestoneId) {
      return invalidOrderResult(roadmap.warnings, [
        makeDiagnostic("semantic", ROADMAP_INDEX_PATH, "$.milestones", "roadmap-reorder target cannot be its own neighbor", "different milestone id", input.milestoneId),
      ]);
    }
    const neighborLookup = findActiveMilestone(roadmap.milestones, rootDir, input.neighborId, "neighbor");
    if (neighborLookup.diagnostic || !neighborLookup.milestone) {
      return invalidOrderResult(roadmap.warnings, [neighborLookup.diagnostic].filter((diagnostic): diagnostic is RoadmapDiagnostic => Boolean(diagnostic)));
    }
    const sortedWithoutTarget = sortMilestonesByRoadmapOrder(
      roadmap.milestones.filter((milestone) => milestone.artifact.milestone.id !== input.milestoneId),
    );
    const midpoint = midpointOrder(sortedWithoutTarget, input.mode, neighborLookup.milestone);
    if (midpoint.diagnostic || midpoint.order === undefined) {
      return invalidOrderResult(roadmap.warnings, [midpoint.diagnostic].filter((diagnostic): diagnostic is RoadmapDiagnostic => Boolean(diagnostic)));
    }
    nextOrder = midpoint.order;
  }
  if (nextOrder === undefined) {
    return invalidOrderResult(roadmap.warnings, [
      makeDiagnostic("semantic", ROADMAP_INDEX_PATH, "$.milestones", "roadmap-reorder could not determine a target order", "integer order", "missing"),
    ]);
  }

  const syncResult = syncRoadmap(rootDir, {
    stagedMutations: [buildTargetOrderMutation(rootDir, targetLookup.milestone, nextOrder)],
  });
  return {
    ...syncResult,
    target: {
      id: input.milestoneId,
      order: nextOrder,
      path: targetLookup.milestone.repoRelativePath.replace(/^\.strict-spec-driven\//, ""),
    },
  };
}

export function renumberRoadmapMilestones(rootDir: string): RoadmapOrderResult {
  const status = getRoadmapStatus(rootDir);
  if (!status.valid) return invalidOrderResult(status.warnings, status.diagnostics);
  const roadmap = loadRoadmap(rootDir);
  if (!existsSync(path.join(rootDir, ROADMAP_INDEX_PATH))) {
    return invalidOrderResult(roadmap.warnings, [
      makeDiagnostic("schema", ROADMAP_INDEX_PATH, "$", "roadmap index is missing", ROADMAP_INDEX_PATH, "missing"),
    ]);
  }

  const sortedMilestones = sortMilestonesByRoadmapOrder(roadmap.milestones);
  const stagedMutations = sortedMilestones.map((milestone, index) =>
    buildTargetOrderMutation(rootDir, milestone, (index + 1) * ROADMAP_ORDER_GAP));
  return syncRoadmap(rootDir, { stagedMutations });
}
