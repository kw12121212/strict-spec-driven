import { existsSync, readdirSync, statSync } from "fs";
import path from "path";
import {
  STRICT_WORKFLOW_DIR,
  type ChangeStateIndex,
  type DeclaredPlannedChangeStatus,
  type LoadedMilestone,
  type LoadedPlannedChange,
  type LoadedRoadmap,
  type PlannedChangeEntry,
  type PlannedChangeState,
  type RoadmapDiagnostic,
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

export type MergedPlannedChangeEntry = {
  id: string;
  entry: PlannedChangeEntry;
  source: "inline" | "standalone";
  path: string;
  loadedPlannedChange?: LoadedPlannedChange;
};

type PlannedChangeReference = {
  id: string;
  entry: PlannedChangeEntry;
  artifactPath: string;
  fieldPath: string;
  dependsOnFieldPath: string;
  milestoneId: string;
  source: "inline" | "standalone";
  loadedPlannedChange?: LoadedPlannedChange;
};

function buildPlannedChangeReferences(roadmap: LoadedRoadmap): PlannedChangeReference[] {
  const references: PlannedChangeReference[] = [];

  for (const milestone of roadmap.milestones) {
    for (const [id, entry] of Object.entries(milestone.artifact.planned_changes)) {
      references.push({
        id,
        entry,
        artifactPath: milestone.artifactPath,
        fieldPath: `$.planned_changes.${id}`,
        dependsOnFieldPath: `$.planned_changes.${id}.depends_on`,
        milestoneId: milestone.artifact.milestone.id,
        source: "inline",
      });
    }
  }

  for (const plannedChange of roadmap.plannedChanges) {
    references.push({
      id: plannedChange.artifact.planned_change.id,
      entry: {
        status: plannedChange.artifact.status,
        summary: plannedChange.artifact.summary,
        details: plannedChange.artifact.details,
        depends_on: [...plannedChange.artifact.depends_on],
      },
      artifactPath: plannedChange.artifactPath,
      fieldPath: "$.planned_change.id",
      dependsOnFieldPath: "$.depends_on",
      milestoneId: plannedChange.artifact.planned_change.milestone,
      source: "standalone",
      loadedPlannedChange: plannedChange,
    });
  }

  return references.sort((left, right) => {
    const byId = left.id.localeCompare(right.id);
    if (byId !== 0) return byId;
    const byArtifact = left.artifactPath.localeCompare(right.artifactPath);
    if (byArtifact !== 0) return byArtifact;
    return left.fieldPath.localeCompare(right.fieldPath);
  });
}

function reportDuplicatePlannedChangeIds(
  references: PlannedChangeReference[],
  changeStates: ChangeStateIndex,
  diagnostics: RoadmapDiagnostic[],
): void {
  const referencesById = new Map<string, PlannedChangeReference[]>();
  for (const reference of references) {
    const existing = referencesById.get(reference.id) ?? [];
    existing.push(reference);
    referencesById.set(reference.id, existing);
  }

  for (const [id, duplicateReferences] of referencesById) {
    if (duplicateReferences.length < 2) continue;
    const locations = duplicateReferences.map((reference) => reference.artifactPath).join(", ");
    for (const reference of duplicateReferences) {
      diagnostics.push(
        makeDiagnostic(
          "semantic",
          reference.artifactPath,
          reference.fieldPath,
          "duplicate planned change id across roadmap planned-change sources",
          "unique planned change id",
          `${id} in ${locations}`,
        ),
      );
    }
    if (changeStates.active.has(id)) {
      for (const reference of duplicateReferences) {
        diagnostics.push(
          makeDiagnostic(
            "semantic",
            reference.artifactPath,
            reference.fieldPath,
            "duplicate planned change id conflicts with active strict change state",
            "one roadmap entry for the active planned change",
            id,
          ),
        );
      }
    }
  }
}

function reportMissingMilestoneReferences(
  roadmap: LoadedRoadmap,
  references: PlannedChangeReference[],
  diagnostics: RoadmapDiagnostic[],
): void {
  const milestoneIds = new Set(roadmap.milestones.map((milestone) => milestone.artifact.milestone.id));
  for (const reference of references) {
    if (reference.source !== "standalone" || milestoneIds.has(reference.milestoneId)) continue;
    diagnostics.push(
      makeDiagnostic(
        "reference",
        reference.artifactPath,
        "$.planned_change.milestone",
        "standalone planned change references a missing milestone",
        "existing roadmap milestone id",
        reference.milestoneId,
      ),
    );
  }
}

function reportDependencyReferenceErrors(
  references: PlannedChangeReference[],
  diagnostics: RoadmapDiagnostic[],
): void {
  const knownIds = new Set(references.map((reference) => reference.id));
  const graph = new Map<string, Set<string>>();

  for (const reference of references) {
    const dependencies = graph.get(reference.id) ?? new Set<string>();
    for (const [index, dependencyId] of reference.entry.depends_on.entries()) {
      const fieldPath = `${reference.dependsOnFieldPath}[${index}]`;
      if (dependencyId === reference.id) {
        diagnostics.push(
          makeDiagnostic(
            "semantic",
            reference.artifactPath,
            fieldPath,
            "planned change cannot depend on itself",
            "different planned change id",
            dependencyId,
          ),
        );
        continue;
      }
      if (!knownIds.has(dependencyId)) {
        diagnostics.push(
          makeDiagnostic(
            "reference",
            reference.artifactPath,
            fieldPath,
            "planned change dependency is missing from roadmap planned-change sources",
            "planned change id present in roadmap planned-change sources",
            dependencyId,
          ),
        );
        continue;
      }
      dependencies.add(dependencyId);
    }
    graph.set(reference.id, dependencies);
  }

  const byId = new Map<string, PlannedChangeReference>();
  for (const reference of references) {
    if (!byId.has(reference.id)) {
      byId.set(reference.id, reference);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const reportedCycles = new Set<string>();

  function visit(id: string, trail: string[]): void {
    if (visiting.has(id)) {
      const cycleStart = trail.indexOf(id);
      const cycle = [...trail.slice(cycleStart), id];
      const cycleKey = cycle.join("->");
      if (reportedCycles.has(cycleKey)) return;
      reportedCycles.add(cycleKey);
      const reference = byId.get(id);
      diagnostics.push(
        makeDiagnostic(
          "semantic",
          reference?.artifactPath ?? "$",
          reference?.dependsOnFieldPath ?? "$.depends_on",
          "planned change dependencies must be acyclic across roadmap planned-change sources",
          "acyclic dependency graph",
          cycle.join(" -> "),
        ),
      );
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependencyId of graph.get(id) ?? []) {
      visit(dependencyId, [...trail, id]);
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const id of Array.from(graph.keys()).sort((left, right) => left.localeCompare(right))) {
    visit(id, []);
  }
}

function reportAmbiguousOwnershipMetadata(
  references: PlannedChangeReference[],
  diagnostics: RoadmapDiagnostic[],
): void {
  for (const reference of references) {
    const teamOwner = reference.loadedPlannedChange?.artifact.team?.owner;
    const extensions = reference.loadedPlannedChange?.artifact.extensions;
    if (!extensions) continue;

    const hasOwner = Object.prototype.hasOwnProperty.call(extensions, "owner");
    const owners = extensions.owners;
    const hasOwners = Object.prototype.hasOwnProperty.call(extensions, "owners");
    const multipleOwners = Array.isArray(owners) && owners.length > 1;

    if ((teamOwner && (hasOwner || hasOwners)) || (hasOwner && hasOwners) || multipleOwners) {
      const fieldPath = teamOwner && (hasOwner || hasOwners) ? "$.team.owner" : "$.extensions";
      const actual = teamOwner && (hasOwner || hasOwners)
        ? "team owner and extension owner metadata"
        : hasOwner && hasOwners
          ? "owner and owners"
          : "multiple owners";

      diagnostics.push(
        makeDiagnostic(
          "semantic",
          reference.artifactPath,
          fieldPath,
          "planned change ownership metadata is ambiguous",
          "zero or one advisory owner signal",
          actual,
        ),
      );
    }
  }
}

export function appendRoadmapCrossFileDiagnostics(roadmap: LoadedRoadmap, changeStates: ChangeStateIndex): void {
  const references = buildPlannedChangeReferences(roadmap);
  reportDuplicatePlannedChangeIds(references, changeStates, roadmap.diagnostics);
  reportMissingMilestoneReferences(roadmap, references, roadmap.diagnostics);
  reportDependencyReferenceErrors(references, roadmap.diagnostics);
  reportAmbiguousOwnershipMetadata(references, roadmap.diagnostics);
}

export function getStandalonePlannedChangesForMilestone(
  roadmap: LoadedRoadmap,
  milestone: LoadedMilestone,
): LoadedPlannedChange[] {
  return roadmap.plannedChanges
    .filter((plannedChange) => plannedChange.artifact.planned_change.milestone === milestone.artifact.milestone.id)
    .sort((left, right) => left.relativeRoadmapPath.localeCompare(right.relativeRoadmapPath));
}

export function getMergedPlannedChangesForMilestone(
  milestone: LoadedMilestone,
  standalonePlannedChanges: LoadedPlannedChange[],
): MergedPlannedChangeEntry[] {
  const merged = new Map<string, MergedPlannedChangeEntry>();

  for (const [id, entry] of Object.entries(milestone.artifact.planned_changes)) {
    merged.set(id, {
      id,
      entry,
      source: "inline",
      path: toPosix(path.join("roadmap", "milestones", milestone.relativeMilestonePath)),
    });
  }

  for (const plannedChange of standalonePlannedChanges) {
    const id = plannedChange.artifact.planned_change.id;
    merged.set(id, {
      id,
      source: "standalone",
      path: toPosix(path.join("roadmap", plannedChange.relativeRoadmapPath)),
      loadedPlannedChange: plannedChange,
      entry: {
        status: plannedChange.artifact.status,
        summary: plannedChange.artifact.summary,
        details: plannedChange.artifact.details,
        depends_on: [...plannedChange.artifact.depends_on],
      },
    });
  }

  return Array.from(merged.values());
}

export function buildMilestoneStatus(
  milestone: LoadedMilestone,
  changeStates: ChangeStateIndex,
  plannedChangeEntries: MergedPlannedChangeEntry[] = getMergedPlannedChangesForMilestone(milestone, []),
): RoadmapMilestoneStatus {
  const plannedChanges = plannedChangeEntries.map(({ id, entry, source, path: plannedChangePath }) => {
    const state = derivePlannedChangeState(changeStates, id);
    const derivedStatus = derivePlannedChangeDeclaredStatus(state);
    const mismatches: string[] = [];
    if (state === "ambiguous") {
      mismatches.push("planned change exists in both active and archived strict change state; resolve the duplicate history");
    }
    if (entry.status !== derivedStatus) {
      mismatches.push(`declared planned change status '${entry.status}' does not match derived planned change status '${derivedStatus}'`);
    }

    return {
      id,
      source,
      path: plannedChangePath,
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
    for (const entry of roadmap.indexArtifact.milestones) {
      const normalizedPath = toPosix(entry.path);
      const status = statuses.get(normalizedPath);
      const absolutePath = resolveStrictWorkflowPath(rootDir, normalizedPath);
      if (!existsSync(absolutePath)) {
        diagnostics.push(
          makeDiagnostic(
            "reference",
            roadmapIndexPath,
            `$.milestones.${entry.id}.path`,
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
            `$.milestones.${entry.id}.id`,
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
            `$.milestones.${entry.id}.title`,
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
            `$.milestones.${entry.id}.status`,
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
