import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import {
  canonicalPlannedChangeFileName,
  PLANNED_CHANGE_SCHEMA_ID,
  ROADMAP_DIR,
  ROADMAP_INDEX_SCHEMA_ID,
  ROADMAP_MILESTONE_SCHEMA_ID,
  type LoadedMilestone,
  type LoadedPlannedChange,
  type PlannedChangeEntry,
  type RoadmapMilestoneArtifact,
  type RoadmapMilestoneStatus,
  type StandalonePlannedChangeArtifact,
} from "./model.js";
import { ensureTrailingNewline, normalizeMilestoneStatus, normalizeRepoRelativePath, toPosix } from "./shared.js";
import { sortMilestonesByRoadmapOrder } from "./status.js";

export function writeFileIfChanged(filePath: string, nextContent: string, updatedFiles: string[], rootDir: string): void {
  const normalized = ensureTrailingNewline(nextContent);
  const current = existsSync(filePath) ? ensureTrailingNewline(readFileSync(filePath, "utf8")) : null;
  if (current === normalized) return;
  writeFileSync(filePath, normalized, "utf8");
  updatedFiles.push(normalizeRepoRelativePath(rootDir, filePath));
}

/**
 * Resolve the milestone status to persist during canonical rewrite.
 *
 * - `planned` and `proposed` are interchangeable aliases: when the declared
 *   status normalizes to the derived status, preserve the user's declared
 *   spelling instead of rewriting it.
 * - Otherwise fall back to the derived status when the declared value drifted.
 *
 * Milestone status is otherwise a function of structured planned-change state:
 * a milestone is `active` when it has an in-progress strict change, `proposed`
 * when it only has not-yet-started planned work, and `complete` once all its
 * planned changes are archived. A reopened milestone re-enters this derivation
 * (typically as `proposed`) because `roadmap-reopen` seeds a pending follow-up
 * planned change, not because any declared status is held sticky here.
 */
function resolveCanonicalMilestoneStatus(
  declared: RoadmapMilestoneArtifact["status"],
  derived: RoadmapMilestoneStatus["derivedStatus"],
): RoadmapMilestoneArtifact["status"] {
  if (normalizeMilestoneStatus(declared) === derived) return declared;
  return derived;
}

export function buildCanonicalMilestoneArtifact(
  milestone: LoadedMilestone,
  status: RoadmapMilestoneStatus,
  options: { omitInlinePlannedChangeIds?: Set<string> } = {},
): RoadmapMilestoneArtifact {
  const plannedChanges: RoadmapMilestoneArtifact["planned_changes"] = {};
  for (const [id, entry] of Object.entries(milestone.artifact.planned_changes)) {
    if (options.omitInlinePlannedChangeIds?.has(id)) continue;
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
    ...(typeof milestone.artifact.order === "number" ? { order: milestone.artifact.order } : {}),
    goal: milestone.artifact.goal,
    scope: {
      in: [...milestone.artifact.scope.in],
      out: [...milestone.artifact.scope.out],
    },
    done_criteria: [...milestone.artifact.done_criteria],
    intake_questions: milestone.artifact.intake_questions.map((question) => ({ ...question })),
    planned_changes: plannedChanges,
    dependencies: [...milestone.artifact.dependencies],
    risks: [...milestone.artifact.risks],
    status: resolveCanonicalMilestoneStatus(milestone.artifact.status, status.derivedStatus),
    ...(milestone.artifact.paused ? { paused: { ...milestone.artifact.paused } } : {}),
    notes: [...milestone.artifact.notes],
    ...(milestone.artifact.details != null ? { details: milestone.artifact.details } : {}),
  };
}

export function buildMaterializedPlannedChangeArtifact(
  milestone: LoadedMilestone,
  id: string,
  entry: PlannedChangeEntry,
  status: RoadmapMilestoneStatus,
): StandalonePlannedChangeArtifact {
  const plannedStatus = status.plannedChanges.find((candidate) => candidate.id === id);

  return {
    schema: PLANNED_CHANGE_SCHEMA_ID,
    schema_version: 1,
    artifact_type: "planned_change",
    schema_file: "../../templates/strict-spec-driven/schemas/planned-change.yaml",
    planned_change: {
      id,
      milestone: milestone.artifact.milestone.id,
    },
    status: plannedStatus?.derivedStatus ?? entry.status,
    summary: entry.summary,
    details: entry.details,
    depends_on: [...entry.depends_on],
  };
}

export function buildCanonicalPlannedChangeArtifact(
  plannedChange: LoadedPlannedChange,
  status: RoadmapMilestoneStatus,
): StandalonePlannedChangeArtifact {
  const plannedStatus = status.plannedChanges.find((candidate) => candidate.id === plannedChange.artifact.planned_change.id);

  return {
    schema: plannedChange.artifact.schema,
    schema_version: 1,
    artifact_type: "planned_change",
    schema_file: plannedChange.artifact.schema_file,
    planned_change: {
      id: plannedChange.artifact.planned_change.id,
      milestone: plannedChange.artifact.planned_change.milestone,
    },
    status: plannedStatus?.derivedStatus ?? plannedChange.artifact.status,
    summary: plannedChange.artifact.summary,
    details: plannedChange.artifact.details,
    depends_on: [...plannedChange.artifact.depends_on],
    ...(plannedChange.artifact.team != null ? { team: plannedChange.artifact.team } : {}),
    ...(plannedChange.artifact.extensions != null ? { extensions: plannedChange.artifact.extensions } : {}),
  };
}

export function materializedPlannedChangePath(rootDir: string, milestone: LoadedMilestone, plannedChangeId: string): string {
  return path.join(
    rootDir,
    ROADMAP_DIR,
    "planned-changes",
    canonicalPlannedChangeFileName(milestone.artifact.milestone.id, plannedChangeId),
  );
}

export function ensurePlannedChangeDirectory(filePath: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

function extractMilestoneId(artifact: RoadmapMilestoneArtifact): string {
  const milestoneField = artifact.milestone as unknown as Record<string, unknown>;
  if (typeof milestoneField.id === "string") return milestoneField.id;
  const key = Object.keys(milestoneField)[0];
  return typeof key === "string" ? key : (artifact.milestone as { id: string }).id;
}

function extractMilestoneTitle(artifact: RoadmapMilestoneArtifact): string {
  const milestoneField = artifact.milestone as unknown as Record<string, unknown>;
  if (typeof milestoneField.title === "string") return milestoneField.title;
  const key = Object.keys(milestoneField)[0];
  if (key) {
    const value = milestoneField[key] as Record<string, unknown>;
    if (value && typeof value.title === "string") return value.title;
  }
  return (artifact.milestone as { title: string }).title;
}

export function buildRoadmapIndexArtifact(milestones: LoadedMilestone[]): Record<string, unknown> {
  const milestoneEntries = sortMilestonesByRoadmapOrder(milestones);

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

export const ROADMAP_ORDER_GAP = 100;

function nextUnusedOrder(start: number, occupied: Set<number>): number {
  let candidate = start;
  while (occupied.has(candidate)) {
    candidate += 1;
  }
  return candidate;
}

export function nextAppendedMilestoneOrder(milestones: LoadedMilestone[]): number {
  const orderedValues = milestones
    .map((milestone) => milestone.artifact.order)
    .filter((order): order is number => typeof order === "number");
  if (orderedValues.length === 0) return ROADMAP_ORDER_GAP;
  return Math.max(...orderedValues) + ROADMAP_ORDER_GAP;
}

export function resolveMilestoneOrderCollisions(milestones: LoadedMilestone[]): void {
  const occupied = new Set<number>();
  const ordered = milestones
    .filter((milestone) => typeof milestone.artifact.order === "number")
    .sort((left, right) => {
      const byOrder = (left.artifact.order ?? 0) - (right.artifact.order ?? 0);
      if (byOrder !== 0) return byOrder;
      return left.artifact.milestone.id.localeCompare(right.artifact.milestone.id);
    });

  for (const milestone of ordered) {
    const currentOrder = milestone.artifact.order;
    if (typeof currentOrder !== "number") continue;
    const nextOrder = nextUnusedOrder(currentOrder, occupied);
    milestone.artifact.order = nextOrder;
    occupied.add(nextOrder);
  }
}
