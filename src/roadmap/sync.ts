import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import {
  PLANNED_CHANGE_SCHEMA_ID,
  ROADMAP_INDEX_SCHEMA_ID,
  ROADMAP_MILESTONE_SCHEMA_ID,
  type LoadedMilestone,
  type RoadmapIndexArtifact,
  type RoadmapMilestoneArtifact,
  type RoadmapMilestoneStatus,
} from "./model.js";
import { ensureTrailingNewline, normalizeRepoRelativePath, toPosix } from "./shared.js";

export function writeFileIfChanged(filePath: string, nextContent: string, updatedFiles: string[], rootDir: string): void {
  const normalized = ensureTrailingNewline(nextContent);
  const current = existsSync(filePath) ? ensureTrailingNewline(readFileSync(filePath, "utf8")) : null;
  if (current === normalized) return;
  writeFileSync(filePath, normalized, "utf8");
  updatedFiles.push(normalizeRepoRelativePath(rootDir, filePath));
}

export function buildCanonicalMilestoneArtifact(
  milestone: LoadedMilestone,
  status: RoadmapMilestoneStatus,
): RoadmapMilestoneArtifact {
  return {
    schema: ROADMAP_MILESTONE_SCHEMA_ID,
    schema_version: 1,
    artifact_type: "roadmap_milestone",
    schema_file: milestone.artifact.schema_file,
    milestone: {
      id: milestone.artifact.milestone.id,
      title: milestone.artifact.milestone.title,
    },
    goal: milestone.artifact.goal,
    scope: {
      in: [...milestone.artifact.scope.in],
      out: [...milestone.artifact.scope.out],
    },
    done_criteria: [...milestone.artifact.done_criteria],
    planned_changes: milestone.artifact.planned_changes.map((entry) => {
      const plannedStatus = status.plannedChanges.find((candidate) => candidate.id === entry.id);
      return {
        schema: PLANNED_CHANGE_SCHEMA_ID,
        schema_version: 1,
        artifact_type: "planned_change_entry",
        schema_file: entry.schema_file,
        id: entry.id,
        status: plannedStatus?.derivedStatus ?? entry.status,
        summary: entry.summary,
        depends_on: [...entry.depends_on],
      };
    }),
    dependencies: [...milestone.artifact.dependencies],
    risks: [...milestone.artifact.risks],
    status: status.derivedStatus,
    notes: [...milestone.artifact.notes],
  };
}

export function buildRoadmapIndexArtifact(milestones: LoadedMilestone[]): RoadmapIndexArtifact {
  return {
    schema: ROADMAP_INDEX_SCHEMA_ID,
    schema_version: 1,
    artifact_type: "roadmap_index",
    schema_file: "../schemas/roadmap-index.yaml",
    milestones: milestones
      .slice()
      .sort((left, right) => left.relativeMilestonePath.localeCompare(right.relativeMilestonePath))
      .map((milestone) => ({
        id: milestone.artifact.milestone.id,
        title: milestone.artifact.milestone.title,
        path: toPosix(path.join("roadmap", "milestones", milestone.relativeMilestonePath)),
        status: milestone.artifact.status,
      })),
  };
}
