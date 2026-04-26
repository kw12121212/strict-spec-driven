import { existsSync, readdirSync, statSync } from "fs";
import path from "path";
import {
  STRICT_WORKFLOW_DIR,
  type ChangeStateIndex,
  type DeclaredPlannedChangeStatus,
  type LoadedMilestone,
  type LoadedRoadmap,
  type PlannedChangeState,
  type RoadmapMilestoneStatus,
} from "./model.js";
import { makeDiagnostic, resolveStrictWorkflowPath, toPosix } from "./shared.js";

export function getChangeStateIndex(rootDir: string): ChangeStateIndex {
  const changesDir = path.join(rootDir, STRICT_WORKFLOW_DIR, "changes");
  const active = new Set<string>();
  const archived = new Set<string>();

  if (!existsSync(changesDir) || !statSync(changesDir).isDirectory()) {
    return { active, archived };
  }

  for (const entry of readdirSync(changesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "archive") continue;
    active.add(entry.name);
  }

  const archiveDir = path.join(changesDir, "archive");
  if (existsSync(archiveDir) && statSync(archiveDir).isDirectory()) {
    for (const entry of readdirSync(archiveDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const match = entry.name.match(/^\d{4}-\d{2}-\d{2}-(.+)$/);
      archived.add(match ? match[1] : entry.name);
    }
  }

  return { active, archived };
}

function derivePlannedChangeState(changeStates: ChangeStateIndex, id: string): PlannedChangeState {
  const isActive = changeStates.active.has(id);
  const isArchived = changeStates.archived.has(id);
  if (isActive && isArchived) return "ambiguous";
  if (isArchived) return "archived";
  if (isActive) return "active";
  return "missing";
}

function derivePlannedChangeDeclaredStatus(state: PlannedChangeState): DeclaredPlannedChangeStatus {
  return state === "archived" ? "complete" : "planned";
}

function deriveMilestoneStatus(states: PlannedChangeState[]): "proposed" | "active" | "complete" {
  if (states.length === 0) return "proposed";
  if (states.every((state) => state === "archived")) return "complete";
  if (states.some((state) => state === "active" || state === "ambiguous")) return "active";
  return "proposed";
}

export function buildMilestoneStatus(
  milestone: LoadedMilestone,
  changeStates: ChangeStateIndex,
): RoadmapMilestoneStatus {
  const plannedChanges = milestone.artifact.planned_changes.map((entry) => {
    const state = derivePlannedChangeState(changeStates, entry.id);
    const derivedStatus = derivePlannedChangeDeclaredStatus(state);
    const mismatches: string[] = [];
    if (state === "ambiguous") {
      mismatches.push("planned change exists in both active and archived strict change state; resolve the duplicate history");
    }
    if (entry.status !== derivedStatus) {
      mismatches.push(`declared planned change status '${entry.status}' does not match derived planned change status '${derivedStatus}'`);
    }

    return {
      id: entry.id,
      summary: entry.summary,
      declaredStatus: entry.status,
      derivedStatus,
      state,
      mismatches,
    };
  });

  const derivedStatus = deriveMilestoneStatus(plannedChanges.map((entry) => entry.state));
  const mismatches: string[] = [];
  if (milestone.artifact.status !== derivedStatus) {
    mismatches.push(`declared status '${milestone.artifact.status}' does not match derived status '${derivedStatus}'`);
  }

  return {
    file: milestone.file,
    path: toPosix(path.join("roadmap", "milestones", milestone.relativeMilestonePath)),
    id: milestone.artifact.milestone.id,
    title: milestone.artifact.milestone.title,
    goal: milestone.artifact.goal,
    declaredStatus: milestone.artifact.status,
    derivedStatus,
    plannedChanges,
    mismatches,
  };
}

export function orderMilestoneStatuses(
  rootDir: string,
  roadmap: LoadedRoadmap,
  statuses: Map<string, RoadmapMilestoneStatus>,
  roadmapIndexPath: string,
): RoadmapMilestoneStatus[] {
  const ordered: RoadmapMilestoneStatus[] = [];
  const seenPaths = new Set<string>();
  const diagnostics = roadmap.diagnostics;

  if (roadmap.indexArtifact) {
    for (const [index, entry] of roadmap.indexArtifact.milestones.entries()) {
      const normalizedPath = toPosix(entry.path);
      const status = statuses.get(normalizedPath);
      const absolutePath = resolveStrictWorkflowPath(rootDir, normalizedPath);
      if (!existsSync(absolutePath)) {
        diagnostics.push(
          makeDiagnostic(
            "reference",
            roadmapIndexPath,
            `$.milestones[${index}].path`,
            "roadmap index entry references a missing milestone file",
            "existing roadmap milestone file",
            normalizedPath,
          ),
        );
        continue;
      }
      if (!status) continue;
      seenPaths.add(normalizedPath);
      if (entry.id !== status.id) {
        diagnostics.push(
          makeDiagnostic(
            "semantic",
            roadmapIndexPath,
            `$.milestones[${index}].id`,
            "roadmap index milestone id must match the milestone artifact",
            status.id,
            entry.id,
          ),
        );
      }
      if (entry.title !== status.title) {
        diagnostics.push(
          makeDiagnostic(
            "semantic",
            roadmapIndexPath,
            `$.milestones[${index}].title`,
            "roadmap index milestone title must match the milestone artifact",
            status.title,
            entry.title,
          ),
        );
      }
      if (entry.status !== status.declaredStatus) {
        diagnostics.push(
          makeDiagnostic(
            "semantic",
            roadmapIndexPath,
            `$.milestones[${index}].status`,
            "roadmap index milestone status must match the milestone declared status",
            status.declaredStatus,
            entry.status,
          ),
        );
      }
      ordered.push(status);
    }
  }

  for (const milestone of roadmap.milestones) {
    const milestonePath = toPosix(path.join("roadmap", "milestones", milestone.relativeMilestonePath));
    if (seenPaths.has(milestonePath)) continue;
    if (roadmap.indexArtifact) {
      diagnostics.push(
        makeDiagnostic(
          "reference",
          roadmapIndexPath,
          "$.milestones",
          "roadmap index is missing a milestone file present under roadmap/milestones/",
          milestonePath,
        ),
      );
    }
    const status = statuses.get(milestonePath);
    if (status) ordered.push(status);
  }

  return ordered;
}
