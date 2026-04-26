import {
  PLANNED_CHANGE_SCHEMA_ID,
  ROADMAP_INDEX_SCHEMA_ID,
  ROADMAP_MILESTONE_SCHEMA_ID,
  type PlannedChangeEntry,
  type RoadmapDiagnostic,
  type RoadmapIndexArtifact,
  type RoadmapIndexEntry,
  type RoadmapMilestoneArtifact,
  type MilestoneIdentity,
  type MilestoneScope,
} from "./model.js";
import {
  isDeclaredPlannedChangeStatus,
  isDeclaredRoadmapStatus,
  isRecord,
  isRepoRelativePath,
  makeDiagnostic,
} from "./shared.js";

function validateString(
  parent: Record<string, unknown>,
  key: string,
  artifactPath: string,
  fieldPath: string,
  diagnostics: RoadmapDiagnostic[],
): string | null {
  const value = parent[key];
  if (typeof value !== "string" || value.length === 0) {
    diagnostics.push(
      makeDiagnostic("schema", artifactPath, fieldPath, "value must be a non-empty string", "non-empty string", String(value)),
    );
    return null;
  }
  return value;
}

function validateStringArray(
  parent: Record<string, unknown>,
  key: string,
  artifactPath: string,
  fieldPath: string,
  diagnostics: RoadmapDiagnostic[],
): string[] | null {
  const value = parent[key];
  if (!Array.isArray(value)) {
    diagnostics.push(
      makeDiagnostic("schema", artifactPath, fieldPath, "value must be a string sequence", "string[]", String(value)),
    );
    return null;
  }

  const result: string[] = [];
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== "string" || entry.length === 0) {
      diagnostics.push(
        makeDiagnostic(
          "schema",
          artifactPath,
          `${fieldPath}[${index}]`,
          "sequence item must be a non-empty string",
          "non-empty string",
          String(entry),
        ),
      );
      continue;
    }
    result.push(entry);
  }

  return result;
}

export function validateRoadmapIndexArtifact(
  artifact: unknown,
  artifactPath: string,
  diagnostics: RoadmapDiagnostic[],
): RoadmapIndexArtifact | null {
  if (!isRecord(artifact)) {
    diagnostics.push(makeDiagnostic("schema", artifactPath, "$", "artifact must be a YAML mapping", "mapping", typeof artifact));
    return null;
  }

  if (artifact.schema !== ROADMAP_INDEX_SCHEMA_ID) {
    diagnostics.push(
      makeDiagnostic("schema", artifactPath, "$.schema", "schema mismatch", ROADMAP_INDEX_SCHEMA_ID, String(artifact.schema)),
    );
  }
  if (artifact.schema_version !== 1) {
    diagnostics.push(makeDiagnostic("schema", artifactPath, "$.schema_version", "schema_version mismatch", "1", String(artifact.schema_version)));
  }
  if (artifact.artifact_type !== "roadmap_index") {
    diagnostics.push(
      makeDiagnostic("schema", artifactPath, "$.artifact_type", "artifact_type mismatch", "roadmap_index", String(artifact.artifact_type)),
    );
  }

  const schemaFile = validateString(artifact, "schema_file", artifactPath, "$.schema_file", diagnostics);
  const rawMilestones = artifact.milestones;
  if (!Array.isArray(rawMilestones)) {
    diagnostics.push(makeDiagnostic("schema", artifactPath, "$.milestones", "milestones must be a sequence", "sequence", String(rawMilestones)));
    return null;
  }

  const milestones: RoadmapIndexEntry[] = [];
  const seenIds = new Set<string>();
  for (const [index, entry] of rawMilestones.entries()) {
    if (!isRecord(entry)) {
      diagnostics.push(
        makeDiagnostic("schema", artifactPath, `$.milestones[${index}]`, "milestone entry must be a mapping", "mapping", typeof entry),
      );
      continue;
    }
    const id = validateString(entry, "id", artifactPath, `$.milestones[${index}].id`, diagnostics);
    const title = validateString(entry, "title", artifactPath, `$.milestones[${index}].title`, diagnostics);
    const milestonePath = validateString(entry, "path", artifactPath, `$.milestones[${index}].path`, diagnostics);
    const statusValue = entry.status;
    if (!isDeclaredRoadmapStatus(statusValue)) {
      diagnostics.push(
        makeDiagnostic(
          "schema",
          artifactPath,
          `$.milestones[${index}].status`,
          "unsupported milestone status",
          "proposed, active, blocked, complete",
          String(statusValue),
        ),
      );
    }
    if (milestonePath && !isRepoRelativePath(milestonePath)) {
      diagnostics.push(
        makeDiagnostic(
          "schema",
          artifactPath,
          `$.milestones[${index}].path`,
          "milestone path must be repo-relative",
          "repo-relative path",
          milestonePath,
        ),
      );
    }
    if (!id || !title || !milestonePath || !isDeclaredRoadmapStatus(statusValue)) {
      continue;
    }
    if (seenIds.has(id)) {
      diagnostics.push(
        makeDiagnostic("schema", artifactPath, `$.milestones[${index}].id`, "duplicate milestone id", "unique milestone id", id),
      );
      continue;
    }
    seenIds.add(id);
    milestones.push({
      id,
      title,
      path: milestonePath,
      status: statusValue,
    });
  }

  if (!schemaFile) {
    return null;
  }

  return {
    schema: ROADMAP_INDEX_SCHEMA_ID,
    schema_version: 1,
    artifact_type: "roadmap_index",
    schema_file: schemaFile,
    milestones,
  };
}

function validatePlannedChangeEntry(
  entry: unknown,
  artifactPath: string,
  fieldPath: string,
  diagnostics: RoadmapDiagnostic[],
): PlannedChangeEntry | null {
  if (!isRecord(entry)) {
    diagnostics.push(makeDiagnostic("schema", artifactPath, fieldPath, "planned change entry must be a mapping", "mapping", typeof entry));
    return null;
  }

  if (entry.schema !== PLANNED_CHANGE_SCHEMA_ID) {
    diagnostics.push(
      makeDiagnostic("schema", artifactPath, `${fieldPath}.schema`, "schema mismatch", PLANNED_CHANGE_SCHEMA_ID, String(entry.schema)),
    );
  }
  if (entry.schema_version !== 1) {
    diagnostics.push(makeDiagnostic("schema", artifactPath, `${fieldPath}.schema_version`, "schema_version mismatch", "1", String(entry.schema_version)));
  }
  if (entry.artifact_type !== "planned_change_entry") {
    diagnostics.push(
      makeDiagnostic(
        "schema",
        artifactPath,
        `${fieldPath}.artifact_type`,
        "artifact_type mismatch",
        "planned_change_entry",
        String(entry.artifact_type),
      ),
    );
  }

  const schemaFile = validateString(entry, "schema_file", artifactPath, `${fieldPath}.schema_file`, diagnostics);
  const id = validateString(entry, "id", artifactPath, `${fieldPath}.id`, diagnostics);
  const summary = validateString(entry, "summary", artifactPath, `${fieldPath}.summary`, diagnostics);
  const dependsOn = validateStringArray(entry, "depends_on", artifactPath, `${fieldPath}.depends_on`, diagnostics);
  const statusValue = entry.status;
  if (!isDeclaredPlannedChangeStatus(statusValue)) {
    diagnostics.push(
      makeDiagnostic(
        "schema",
        artifactPath,
        `${fieldPath}.status`,
        "unsupported planned change status",
        "planned, complete",
        String(statusValue),
      ),
    );
  }

  if (!schemaFile || !id || !summary || !dependsOn || !isDeclaredPlannedChangeStatus(statusValue)) {
    return null;
  }

  return {
    schema: PLANNED_CHANGE_SCHEMA_ID,
    schema_version: 1,
    artifact_type: "planned_change_entry",
    schema_file: schemaFile,
    id,
    status: statusValue,
    summary,
    depends_on: dependsOn,
  };
}

export function validateMilestoneArtifact(
  artifact: unknown,
  artifactPath: string,
  diagnostics: RoadmapDiagnostic[],
): RoadmapMilestoneArtifact | null {
  if (!isRecord(artifact)) {
    diagnostics.push(makeDiagnostic("schema", artifactPath, "$", "artifact must be a YAML mapping", "mapping", typeof artifact));
    return null;
  }

  if (artifact.schema !== ROADMAP_MILESTONE_SCHEMA_ID) {
    diagnostics.push(
      makeDiagnostic("schema", artifactPath, "$.schema", "schema mismatch", ROADMAP_MILESTONE_SCHEMA_ID, String(artifact.schema)),
    );
  }
  if (artifact.schema_version !== 1) {
    diagnostics.push(makeDiagnostic("schema", artifactPath, "$.schema_version", "schema_version mismatch", "1", String(artifact.schema_version)));
  }
  if (artifact.artifact_type !== "roadmap_milestone") {
    diagnostics.push(
      makeDiagnostic(
        "schema",
        artifactPath,
        "$.artifact_type",
        "artifact_type mismatch",
        "roadmap_milestone",
        String(artifact.artifact_type),
      ),
    );
  }

  const schemaFile = validateString(artifact, "schema_file", artifactPath, "$.schema_file", diagnostics);
  const goal = validateString(artifact, "goal", artifactPath, "$.goal", diagnostics);
  const doneCriteria = validateStringArray(artifact, "done_criteria", artifactPath, "$.done_criteria", diagnostics);
  const dependencies = validateStringArray(artifact, "dependencies", artifactPath, "$.dependencies", diagnostics);
  const risks = validateStringArray(artifact, "risks", artifactPath, "$.risks", diagnostics);
  const notes = validateStringArray(artifact, "notes", artifactPath, "$.notes", diagnostics);

  const statusValue = artifact.status;
  if (!isDeclaredRoadmapStatus(statusValue)) {
    diagnostics.push(
      makeDiagnostic(
        "schema",
        artifactPath,
        "$.status",
        "unsupported milestone status",
        "proposed, active, blocked, complete",
        String(statusValue),
      ),
    );
  }

  const rawMilestone = artifact.milestone;
  let milestone: MilestoneIdentity | null = null;
  if (!isRecord(rawMilestone)) {
    diagnostics.push(makeDiagnostic("schema", artifactPath, "$.milestone", "milestone must be a mapping", "mapping", typeof rawMilestone));
  } else {
    const milestoneId = validateString(rawMilestone, "id", artifactPath, "$.milestone.id", diagnostics);
    const milestoneTitle = validateString(rawMilestone, "title", artifactPath, "$.milestone.title", diagnostics);
    if (milestoneId && milestoneTitle) {
      milestone = {
        id: milestoneId,
        title: milestoneTitle,
      };
    }
  }

  const rawScope = artifact.scope;
  let scope: MilestoneScope | null = null;
  if (!isRecord(rawScope)) {
    diagnostics.push(makeDiagnostic("schema", artifactPath, "$.scope", "scope must be a mapping", "mapping", typeof rawScope));
  } else {
    const scopeIn = validateStringArray(rawScope, "in", artifactPath, "$.scope.in", diagnostics);
    const scopeOut = validateStringArray(rawScope, "out", artifactPath, "$.scope.out", diagnostics);
    if (scopeIn && scopeOut) {
      scope = { in: scopeIn, out: scopeOut };
    }
  }

  const rawPlannedChanges = artifact.planned_changes;
  if (!Array.isArray(rawPlannedChanges)) {
    diagnostics.push(
      makeDiagnostic("schema", artifactPath, "$.planned_changes", "planned_changes must be a sequence", "sequence", String(rawPlannedChanges)),
    );
    return null;
  }
  if (rawPlannedChanges.length > 10) {
    diagnostics.push(
      makeDiagnostic("schema", artifactPath, "$.planned_changes", "planned_changes exceeds max_items", "10 or fewer items", String(rawPlannedChanges.length)),
    );
  }

  const plannedChanges: PlannedChangeEntry[] = [];
  const seenIds = new Set<string>();
  for (const [index, entry] of rawPlannedChanges.entries()) {
    const parsed = validatePlannedChangeEntry(entry, artifactPath, `$.planned_changes[${index}]`, diagnostics);
    if (!parsed) continue;
    if (seenIds.has(parsed.id)) {
      diagnostics.push(
        makeDiagnostic(
          "schema",
          artifactPath,
          `$.planned_changes[${index}].id`,
          "duplicate planned change id",
          "unique planned change id",
          parsed.id,
        ),
      );
      continue;
    }
    seenIds.add(parsed.id);
    plannedChanges.push(parsed);
  }

  const plannedChangeIds = new Set(plannedChanges.map((entry) => entry.id));
  const plannedChangeIndexById = new Map(plannedChanges.map((entry, index) => [entry.id, index]));
  for (const [index, entry] of plannedChanges.entries()) {
    for (const [dependsOnIndex, dependsOn] of entry.depends_on.entries()) {
      if (dependsOn === entry.id) {
        diagnostics.push(
          makeDiagnostic(
            "semantic",
            artifactPath,
            `$.planned_changes[${index}].depends_on[${dependsOnIndex}]`,
            "planned change cannot depend on itself",
            "different planned change id",
            dependsOn,
          ),
        );
        continue;
      }
      if (!plannedChangeIds.has(dependsOn)) {
        diagnostics.push(
          makeDiagnostic(
            "reference",
            artifactPath,
            `$.planned_changes[${index}].depends_on[${dependsOnIndex}]`,
            "planned change dependency is missing from this milestone",
            "$.planned_changes[*].id",
            dependsOn,
          ),
        );
      }
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
      const index = plannedChangeIndexById.get(id);
      diagnostics.push(
        makeDiagnostic(
          "semantic",
          artifactPath,
          typeof index === "number" ? `$.planned_changes[${index}].depends_on` : "$.planned_changes",
          "planned change dependencies must be acyclic",
          "acyclic dependency graph",
          cycle.join(" -> "),
        ),
      );
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const entryIndex = plannedChangeIndexById.get(id);
    const entry = typeof entryIndex === "number" ? plannedChanges[entryIndex] : null;
    for (const dependsOn of entry?.depends_on ?? []) {
      if (plannedChangeIds.has(dependsOn) && dependsOn !== id) {
        visit(dependsOn, [...trail, id]);
      }
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const entry of plannedChanges) {
    visit(entry.id, []);
  }

  if (!schemaFile || !milestone || !goal || !scope || !doneCriteria || !dependencies || !risks || !notes || !isDeclaredRoadmapStatus(statusValue)) {
    return null;
  }

  return {
    schema: ROADMAP_MILESTONE_SCHEMA_ID,
    schema_version: 1,
    artifact_type: "roadmap_milestone",
    schema_file: schemaFile,
    milestone,
    goal,
    scope,
    done_criteria: doneCriteria,
    planned_changes: plannedChanges,
    dependencies,
    risks,
    status: statusValue,
    notes,
  };
}
