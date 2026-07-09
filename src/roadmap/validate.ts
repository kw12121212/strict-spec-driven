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
  type MilestoneIntakeQuestion,
  type MilestoneScope,
  type PlannedChangeTeamMetadata,
  type StandalonePlannedChangeArtifact,
} from "./model.js";
import {
  isDeclaredPlannedChangeStatus,
  isDeclaredRoadmapStatus,
  isRecord,
  isRepoRelativePath,
  makeDiagnostic,
} from "./shared.js";

const MILESTONE_ID_PATTERN = /^(\d{4}-)?([a-z0-9][a-z0-9-]*[a-z0-9]|[a-z0-9])$/;
const QUESTION_ID_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

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

function validateOptionalString(
  parent: Record<string, unknown>,
  key: string,
  artifactPath: string,
  fieldPath: string,
  diagnostics: RoadmapDiagnostic[],
): string | null | undefined {
  if (!(key in parent) || parent[key] === undefined) return undefined;
  return validateString(parent, key, artifactPath, fieldPath, diagnostics);
}

function validateOptionalStringArray(
  parent: Record<string, unknown>,
  key: string,
  artifactPath: string,
  fieldPath: string,
  diagnostics: RoadmapDiagnostic[],
): string[] | null | undefined {
  if (!(key in parent) || parent[key] === undefined) return undefined;
  return validateStringArray(parent, key, artifactPath, fieldPath, diagnostics);
}

function extractKeyedMapKey(obj: Record<string, unknown>): string | null {
  const keys = Object.keys(obj);
  return keys.length === 1 ? keys[0] : null;
}

function validateMilestoneIntakeQuestions(
  artifact: Record<string, unknown>,
  artifactPath: string,
  diagnostics: RoadmapDiagnostic[],
): MilestoneIntakeQuestion[] | null {
  const value = artifact.intake_questions;
  if (!Array.isArray(value)) {
    diagnostics.push(
      makeDiagnostic("schema", artifactPath, "$.intake_questions", "intake_questions must be a non-empty sequence", "non-empty sequence", String(value)),
    );
    return null;
  }
  if (value.length === 0) {
    diagnostics.push(
      makeDiagnostic("schema", artifactPath, "$.intake_questions", "intake_questions must contain at least one question", "one or more intake question entries", "empty sequence"),
    );
    return null;
  }

  const result: MilestoneIntakeQuestion[] = [];
  const seenIds = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const fieldPath = `$.intake_questions[${index}]`;
    if (!isRecord(entry)) {
      diagnostics.push(makeDiagnostic("schema", artifactPath, fieldPath, "intake question must be a mapping", "mapping", typeof entry));
      continue;
    }

    const id = validateString(entry, "id", artifactPath, `${fieldPath}.id`, diagnostics);
    const question = validateString(entry, "question", artifactPath, `${fieldPath}.question`, diagnostics);
    const context = validateString(entry, "context", artifactPath, `${fieldPath}.context`, diagnostics);
    const impact = validateString(entry, "impact", artifactPath, `${fieldPath}.impact`, diagnostics);
    const recommendation = validateString(entry, "recommendation", artifactPath, `${fieldPath}.recommendation`, diagnostics);

    if (id) {
      if (!QUESTION_ID_PATTERN.test(id)) {
        diagnostics.push(
          makeDiagnostic("schema", artifactPath, `${fieldPath}.id`, "intake question id must be kebab-case", "kebab-case id", id),
        );
      } else if (seenIds.has(id)) {
        diagnostics.push(
          makeDiagnostic("schema", artifactPath, `${fieldPath}.id`, "duplicate intake question id", "unique intake question id", id),
        );
      }
      seenIds.add(id);
    }

    if (id && question && context && impact && recommendation && QUESTION_ID_PATTERN.test(id)) {
      result.push({ id, question, context, impact, recommendation });
    }
  }

  return result.length > 0 ? result : null;
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
        makeDiagnostic("schema", artifactPath, `$.milestones.${key}`, "milestone key must be kebab-case with optional NNNN- legacy prefix", "kebab-case or NNNN-kebab-case", key),
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
          "proposed, planned, active, blocked, complete",
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

function validateBlockedMetadata(
  value: unknown,
  artifactPath: string,
  fieldPath: string,
  diagnostics: RoadmapDiagnostic[],
): PlannedChangeTeamMetadata["blocked"] | null {
  if (!isRecord(value)) {
    diagnostics.push(makeDiagnostic("schema", artifactPath, fieldPath, "blocked must be a mapping", "mapping", typeof value));
    return null;
  }

  let valid = true;
  for (const key of Object.keys(value)) {
    if (key !== "status" && key !== "reason") {
      diagnostics.push(
        makeDiagnostic("schema", artifactPath, `${fieldPath}.${key}`, "unsupported blocked metadata field", "status or reason", key),
      );
      valid = false;
    }
  }

  if (typeof value.status !== "boolean") {
    diagnostics.push(
      makeDiagnostic("schema", artifactPath, `${fieldPath}.status`, "blocked status must be a boolean", "boolean", String(value.status)),
    );
    valid = false;
  }

  const reason = validateOptionalString(value, "reason", artifactPath, `${fieldPath}.reason`, diagnostics);
  if (reason === null) valid = false;

  if (!valid) return null;
  return {
    status: value.status as boolean,
    ...(typeof reason === "string" ? { reason } : {}),
  };
}

function validateExternalRefsMetadata(
  value: unknown,
  artifactPath: string,
  fieldPath: string,
  diagnostics: RoadmapDiagnostic[],
): NonNullable<PlannedChangeTeamMetadata["external_refs"]> | null {
  if (!Array.isArray(value)) {
    diagnostics.push(
      makeDiagnostic("schema", artifactPath, fieldPath, "external_refs must be a sequence", "external reference[]", String(value)),
    );
    return null;
  }

  const result: NonNullable<PlannedChangeTeamMetadata["external_refs"]> = [];
  let valid = true;
  for (const [index, entry] of value.entries()) {
    const entryPath = `${fieldPath}[${index}]`;
    if (!isRecord(entry)) {
      diagnostics.push(makeDiagnostic("schema", artifactPath, entryPath, "external reference must be a mapping", "mapping", typeof entry));
      valid = false;
      continue;
    }
    for (const key of Object.keys(entry)) {
      if (key !== "label" && key !== "target") {
        diagnostics.push(
          makeDiagnostic("schema", artifactPath, `${entryPath}.${key}`, "unsupported external reference field", "label or target", key),
        );
        valid = false;
      }
    }
    const label = validateString(entry, "label", artifactPath, `${entryPath}.label`, diagnostics);
    const target = validateString(entry, "target", artifactPath, `${entryPath}.target`, diagnostics);
    if (!label || !target) {
      valid = false;
      continue;
    }
    result.push({ label, target });
  }

  return valid ? result : null;
}

function validateTeamMetadata(
  value: unknown,
  artifactPath: string,
  diagnostics: RoadmapDiagnostic[],
): PlannedChangeTeamMetadata | null {
  if (!isRecord(value)) {
    diagnostics.push(makeDiagnostic("schema", artifactPath, "$.team", "team must be a mapping", "mapping", typeof value));
    return null;
  }

  let valid = true;
  for (const key of Object.keys(value)) {
    if (!["owner", "reviewers", "blocked", "labels", "external_refs"].includes(key)) {
      diagnostics.push(
        makeDiagnostic(
          "schema",
          artifactPath,
          `$.team.${key}`,
          "unsupported team metadata field",
          "owner, reviewers, blocked, labels, or external_refs",
          key,
        ),
      );
      valid = false;
    }
  }

  const owner = validateOptionalString(value, "owner", artifactPath, "$.team.owner", diagnostics);
  const reviewers = validateOptionalStringArray(value, "reviewers", artifactPath, "$.team.reviewers", diagnostics);
  const labels = validateOptionalStringArray(value, "labels", artifactPath, "$.team.labels", diagnostics);
  const blocked = "blocked" in value && value.blocked !== undefined
    ? validateBlockedMetadata(value.blocked, artifactPath, "$.team.blocked", diagnostics)
    : undefined;
  const externalRefs = "external_refs" in value && value.external_refs !== undefined
    ? validateExternalRefsMetadata(value.external_refs, artifactPath, "$.team.external_refs", diagnostics)
    : undefined;

  if (owner === null || reviewers === null || labels === null || blocked === null || externalRefs === null) {
    valid = false;
  }
  if (!valid) return null;

  return {
    ...(typeof owner === "string" ? { owner } : {}),
    ...(Array.isArray(reviewers) ? { reviewers } : {}),
    ...(blocked && typeof blocked.status === "boolean" ? { blocked } : {}),
    ...(Array.isArray(labels) ? { labels } : {}),
    ...(Array.isArray(externalRefs) ? { external_refs: externalRefs } : {}),
  };
}

export function validateStandalonePlannedChangeArtifact(
  artifact: unknown,
  artifactPath: string,
  diagnostics: RoadmapDiagnostic[],
): StandalonePlannedChangeArtifact | null {
  if (!isRecord(artifact)) {
    diagnostics.push(makeDiagnostic("schema", artifactPath, "$", "artifact must be a YAML mapping", "mapping", typeof artifact));
    return null;
  }

  if (artifact.schema !== PLANNED_CHANGE_SCHEMA_ID) {
    diagnostics.push(
      makeDiagnostic("schema", artifactPath, "$.schema", "schema mismatch", PLANNED_CHANGE_SCHEMA_ID, String(artifact.schema)),
    );
  }
  if (artifact.schema_version !== 1) {
    diagnostics.push(makeDiagnostic("schema", artifactPath, "$.schema_version", "schema_version mismatch", "1", String(artifact.schema_version)));
  }
  if (artifact.artifact_type !== "planned_change") {
    diagnostics.push(
      makeDiagnostic("schema", artifactPath, "$.artifact_type", "artifact_type mismatch", "planned_change", String(artifact.artifact_type)),
    );
  }

  const schemaFile = validateString(artifact, "schema_file", artifactPath, "$.schema_file", diagnostics);
  const summary = validateString(artifact, "summary", artifactPath, "$.summary", diagnostics);
  const details = validateString(artifact, "details", artifactPath, "$.details", diagnostics);
  const dependsOn = validateStringArray(artifact, "depends_on", artifactPath, "$.depends_on", diagnostics);
  const statusValue = artifact.status;
  if (!isDeclaredPlannedChangeStatus(statusValue)) {
    diagnostics.push(
      makeDiagnostic(
        "schema",
        artifactPath,
        "$.status",
        "unsupported planned change status",
        "planned, complete",
        String(statusValue),
      ),
    );
  }

  const rawPlannedChange = artifact.planned_change;
  let plannedChange: StandalonePlannedChangeArtifact["planned_change"] | null = null;
  if (!isRecord(rawPlannedChange)) {
    diagnostics.push(
      makeDiagnostic("schema", artifactPath, "$.planned_change", "planned_change must be a mapping", "mapping", typeof rawPlannedChange),
    );
  } else {
    const id = validateString(rawPlannedChange, "id", artifactPath, "$.planned_change.id", diagnostics);
    const milestone = validateString(rawPlannedChange, "milestone", artifactPath, "$.planned_change.milestone", diagnostics);
    if (id && milestone) {
      plannedChange = { id, milestone };
    }
  }

  const extensions = artifact.extensions;
  if (extensions !== undefined && !isRecord(extensions)) {
    diagnostics.push(makeDiagnostic("schema", artifactPath, "$.extensions", "extensions must be a mapping", "mapping", typeof extensions));
  }

  const team = "team" in artifact && artifact.team !== undefined
    ? validateTeamMetadata(artifact.team, artifactPath, diagnostics)
    : undefined;

  if (!schemaFile || !summary || !details || !dependsOn || !plannedChange || !isDeclaredPlannedChangeStatus(statusValue) || team === null) {
    return null;
  }

  return {
    schema: PLANNED_CHANGE_SCHEMA_ID,
    schema_version: 1,
    artifact_type: "planned_change",
    schema_file: schemaFile,
    planned_change: plannedChange,
    status: statusValue,
    summary,
    details,
    depends_on: dependsOn,
    ...(team !== undefined ? { team } : {}),
    ...(isRecord(extensions) ? { extensions } : {}),
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
  const order = "order" in artifact && artifact.order !== undefined
    ? (() => {
        if (!Number.isInteger(artifact.order)) {
          diagnostics.push(makeDiagnostic("schema", artifactPath, "$.order", "order must be an integer", "integer", String(artifact.order)));
          return null;
        }
        return artifact.order;
      })()
    : undefined;
  const doneCriteria = validateStringArray(artifact, "done_criteria", artifactPath, "$.done_criteria", diagnostics);
  const intakeQuestions = validateMilestoneIntakeQuestions(artifact, artifactPath, diagnostics);
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

  const sourceTicket = "source_ticket" in artifact && artifact.source_ticket !== undefined
    ? (() => {
        if (typeof artifact.source_ticket !== "string") {
          diagnostics.push(makeDiagnostic("schema", artifactPath, "$.source_ticket", "value must be a string", "string", typeof artifact.source_ticket));
          return null;
        }
        return artifact.source_ticket;
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
        "proposed, planned, active, blocked, complete",
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
      diagnostics.push(makeDiagnostic("schema", artifactPath, `$.milestone.${milestoneKey}`, "milestone key must be kebab-case with optional NNNN- legacy prefix", "kebab-case or NNNN-kebab-case", milestoneKey));
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

  if (!schemaFile || !milestone || !goal || !scope || !doneCriteria || !intakeQuestions || !dependencies || !risks || !notes || !isDeclaredRoadmapStatus(statusValue)) {
    return null;
  }

  return {
    schema: ROADMAP_MILESTONE_SCHEMA_ID,
    schema_version: 2,
    artifact_type: "roadmap_milestone",
    schema_file: schemaFile,
    milestone,
    ...(typeof order === "number" ? { order } : {}),
    goal,
    scope,
    done_criteria: doneCriteria,
    intake_questions: intakeQuestions,
    planned_changes: plannedChanges,
    dependencies,
    risks,
    status: statusValue,
    notes,
    details: details ?? undefined,
    source_ticket: sourceTicket ?? undefined,
  };
}
