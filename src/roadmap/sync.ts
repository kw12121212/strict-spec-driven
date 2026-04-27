import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import {
  ROADMAP_INDEX_SCHEMA_ID,
  ROADMAP_MILESTONE_SCHEMA_ID,
  type LoadedMilestone,
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
  const plannedChanges: RoadmapMilestoneArtifact["planned_changes"] = {};
  for (const [id, entry] of Object.entries(milestone.artifact.planned_changes)) {
    const plannedStatus = status.plannedChanges.find((candidate) => candidate.id === id);
    plannedChanges[id] = {
      status: plannedStatus?.derivedStatus ?? entry.status,
      summary: entry.summary,
      details: entry.details,
      depends_on: [...entry.depends_on],
    };
  }

  const milestoneKeyed: Record<string, { title: string }> = {};
  milestoneKeyed[milestone.artifact.milestone.id] = { title: milestone.artifact.milestone.title };

  return {
    schema: ROADMAP_MILESTONE_SCHEMA_ID,
    schema_version: 2,
    artifact_type: "roadmap_milestone",
    schema_file: milestone.artifact.schema_file,
    milestone: milestoneKeyed as unknown as RoadmapMilestoneArtifact["milestone"],
    goal: milestone.artifact.goal,
    scope: {
      in: [...milestone.artifact.scope.in],
      out: [...milestone.artifact.scope.out],
    },
    done_criteria: [...milestone.artifact.done_criteria],
    planned_changes: plannedChanges,
    dependencies: [...milestone.artifact.dependencies],
    risks: [...milestone.artifact.risks],
    status: status.derivedStatus,
    notes: [...milestone.artifact.notes],
    ...(milestone.artifact.details != null ? { details: milestone.artifact.details } : {}),
  };
}

function extractMilestoneId(artifact: RoadmapMilestoneArtifact): string {
  const milestoneField = artifact.milestone as unknown as Record<string, unknown>;
  const key = Object.keys(milestoneField)[0];
  return typeof key === "string" ? key : (artifact.milestone as { id: string }).id;
}

function extractMilestoneTitle(artifact: RoadmapMilestoneArtifact): string {
  const milestoneField = artifact.milestone as unknown as Record<string, unknown>;
  const key = Object.keys(milestoneField)[0];
  if (key) {
    const value = milestoneField[key] as Record<string, unknown>;
    if (value && typeof value.title === "string") return value.title;
  }
  return (artifact.milestone as { title: string }).title;
}

export function buildRoadmapIndexArtifact(milestones: LoadedMilestone[]): Record<string, unknown> {
  const milestoneEntries = milestones
    .slice()
    .sort((left, right) => left.relativeMilestonePath.localeCompare(right.relativeMilestonePath));

  const milestonesMap: Record<string, { title: string; path: string; status: string }> = {};
  for (const milestone of milestoneEntries) {
    milestonesMap[extractMilestoneId(milestone.artifact)] = {
      title: extractMilestoneTitle(milestone.artifact),
      path: toPosix(path.join("roadmap", "milestones", milestone.relativeMilestonePath)),
      status: milestone.artifact.status,
    };
  }

  return {
    schema: ROADMAP_INDEX_SCHEMA_ID,
    schema_version: 2,
    artifact_type: "roadmap_index",
    schema_file: "../schemas/roadmap-index.yaml",
    milestones: milestonesMap,
  };
}
