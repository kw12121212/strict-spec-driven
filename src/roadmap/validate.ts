import {
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

const MILESTONE_ID_PATTERN = /^\d{4}-/;

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

function extractKeyedMapKey(obj: Record<string, unknown>): string | null {
  const keys = Object.keys(obj);
  return keys.length === 1 ? keys[0] : null;
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
  if (artifact.schema_version !== 2) {
    diagnostics.push(makeDiagnostic("schema", artifactPath, "$.schema_version", "schema_version mismatch", "2", String(artifact.schema_version)));
  }
  if (artifact.artifact_type !== "roadmap_index") {
    diagnostics.push(
      makeDiagnostic("schema", artifactPath, "$.artifact_type", "artifact_type mismatch", "roadmap_index", String(artifact.artifact_type)),
    );
  }

  const schemaFile = validateString(artifact, "schema_file", artifactPath, "$.schema_file", diagnostics);
  const rawMilestones = artifact.milestones;
  if (!isRecord(rawMilestones)) {
    diagnostics.push(makeDiagnostic("schema", artifactPath, "$.milestones", "milestones must be a keyed mapping", "keyed mapping", String(rawMilestones)));
    return null;
  }

  const milestones: RoadmapIndexEntry[] = [];
  const seenIds = new Set<string>();
  for (const [key, value] of Object.entries(rawMilestones)) {
    if (!MILESTONE_ID_PATTERN.test(key)) {
      diagnostics.push(
        makeDiagnostic("schema", artifactPath, `$.milestones.${key}`, "milestone key must start with 4 digits followed by a hyphen", "NNNN- prefix", key),
      );
      continue;
    }
    if (!isRecord(value)) {
      diagnostics.push(
        makeDiagnostic("schema", artifactPath, `$.milestones.${key}`, "milestone entry must be a mapping", "mapping", typeof value),
      );
      continue;
    }
    if (seenIds.has(key)) {
      diagnostics.push(
        makeDiagnostic("schema", artifactPath, `$.milestones.${key}`, "duplicate milestone id", "unique milestone id", key),
      );
      continue;
    }
    seenIds.add(key);

    const title = validateString(value, "title", artifactPath, `$.milestones.${key}.title`, diagnostics);
    const milestonePath = validateString(value, "path", artifactPath, `$.milestones.${key}.path`, diagnostics);
    const statusValue = value.status;
    if (!isDeclaredRoadmapStatus(statusValue)) {
      diagnostics.push(
        makeDiagnostic(
          "schema",
          artifactPath,
          `$.milestones.${key}.status`,
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
          `$.milestones.${key}.path`,
          "milestone path must be repo-relative",
          "repo-relative path",
          milestonePath,
        ),
      );
    }
    if (!title || !milestonePath || !isDeclaredRoadmapStatus(statusValue)) {
      continue;
    }
    milestones.push({
      id: key,
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
    schema_version: 2,
    artifact_type: "roadmap_index",
    schema_file: schemaFile,
    milestones,
  };
}

function validatePlannedChangeEntry(
  value: unknown,
  changeKey: string,
  artifactPath: string,
  fieldPath: string,
  diagnostics: RoadmapDiagnostic[],
): PlannedChangeEntry | null {
  if (!isRecord(value)) {
    diagnostics.push(makeDiagnostic("schema", artifactPath, fieldPath, "planned change entry must be a mapping", "mapping", typeof value));
    return null;
  }

  const summary = validateString(value, "summary", artifactPath, `${fieldPath}.summary`, diagnostics);
  const details = validateString(value, "details", artifactPath, `${fieldPath}.details`, diagnostics);
  const dependsOn = validateStringArray(value, "depends_on", artifactPath, `${fieldPath}.depends_on`, diagnostics);
  const statusValue = value.status;
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

  if (!summary || !details || !dependsOn || !isDeclaredPlannedChangeStatus(statusValue)) {
    return null;
  }

  return {
    status: statusValue,
    summary,
    details,
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
  if (artifact.schema_version !== 2) {
    diagnostics.push(makeDiagnostic("schema", artifactPath, "$.schema_version", "schema_version mismatch", "2", String(artifact.schema_version)));
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

  const details = "details" in artifact && artifact.details !== undefined
    ? (() => {
        if (typeof artifact.details !== "string") {
          diagnostics.push(makeDiagnostic("schema", artifactPath, "$.details", "value must be a string", "string", typeof artifact.details));
          return null;
        }
        return artifact.details;
      })()
    : undefined;

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
    diagnostics.push(makeDiagnostic("schema", artifactPath, "$.milestone", "milestone must be a keyed mapping", "keyed mapping", typeof rawMilestone));
  } else {
    const milestoneKey = extractKeyedMapKey(rawMilestone);
    if (!milestoneKey) {
      diagnostics.push(makeDiagnostic("schema", artifactPath, "$.milestone", "milestone must contain exactly one keyed entry", "single keyed entry", `${Object.keys(rawMilestone).length} keys`));
    } else if (!MILESTONE_ID_PATTERN.test(milestoneKey)) {
      diagnostics.push(makeDiagnostic("schema", artifactPath, `$.milestone.${milestoneKey}`, "milestone key must start with 4 digits followed by a hyphen", "NNNN- prefix", milestoneKey));
    } else {
      const milestoneValue = rawMilestone[milestoneKey];
      if (!isRecord(milestoneValue)) {
        diagnostics.push(makeDiagnostic("schema", artifactPath, `$.milestone.${milestoneKey}`, "milestone value must be a mapping", "mapping", typeof milestoneValue));
      } else {
        const milestoneTitle = validateString(milestoneValue, "title", artifactPath, `$.milestone.${milestoneKey}.title`, diagnostics);
        if (milestoneTitle) {
          milestone = {
            id: milestoneKey,
            title: milestoneTitle,
          };
        }
      }
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
  if (!isRecord(rawPlannedChanges)) {
    diagnostics.push(
      makeDiagnostic("schema", artifactPath, "$.planned_changes", "planned_changes must be a keyed mapping", "keyed mapping", String(rawPlannedChanges)),
    );
    return null;
  }

  const plannedChanges: Record<string, PlannedChangeEntry> = {};
  const seenIds = new Set<string>();
  for (const [changeKey, changeValue] of Object.entries(rawPlannedChanges)) {
    if (seenIds.has(changeKey)) {
      diagnostics.push(
        makeDiagnostic(
          "schema",
          artifactPath,
          `$.planned_changes.${changeKey}`,
          "duplicate planned change id",
          "unique planned change id",
          changeKey,
        ),
      );
      continue;
    }
    seenIds.add(changeKey);

    const parsed = validatePlannedChangeEntry(changeValue, changeKey, artifactPath, `$.planned_changes.${changeKey}`, diagnostics);
    if (parsed) {
      plannedChanges[changeKey] = parsed;
    }
  }

  const plannedChangeIds = new Set(Object.keys(plannedChanges));
  const plannedChangeKeys = Object.keys(plannedChanges);
  for (const [changeKey, entry] of Object.entries(plannedChanges)) {
    for (const [dependsOnIndex, dependsOn] of entry.depends_on.entries()) {
      if (dependsOn === changeKey) {
        diagnostics.push(
          makeDiagnostic(
            "semantic",
            artifactPath,
            `$.planned_changes.${changeKey}.depends_on[${dependsOnIndex}]`,
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
            `$.planned_changes.${changeKey}.depends_on[${dependsOnIndex}]`,
            "planned change dependency is missing from this milestone",
            "$.planned_changes keys",
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
      diagnostics.push(
        makeDiagnostic(
          "semantic",
          artifactPath,
          `$.planned_changes.${id}.depends_on`,
          "planned change dependencies must be acyclic",
          "acyclic dependency graph",
          cycle.join(" -> "),
        ),
      );
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const entry = plannedChanges[id];
    for (const dependsOn of entry?.depends_on ?? []) {
      if (plannedChangeIds.has(dependsOn) && dependsOn !== id) {
        visit(dependsOn, [...trail, id]);
      }
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const changeKey of plannedChangeKeys) {
    visit(changeKey, []);
  }

  if (!schemaFile || !milestone || !goal || !scope || !doneCriteria || !dependencies || !risks || !notes || !isDeclaredRoadmapStatus(statusValue)) {
    return null;
  }

  return {
    schema: ROADMAP_MILESTONE_SCHEMA_ID,
    schema_version: 2,
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
    details: details ?? undefined,
  };
}
