import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import path from "path";
import { parseYamlDocument, stringifyYamlDocument } from "./yaml.js";

const STRICT_WORKFLOW_DIR = ".strict-spec-driven";
const ROADMAP_DIR = path.join(STRICT_WORKFLOW_DIR, "roadmap");
const ROADMAP_INDEX_PATH = path.join(ROADMAP_DIR, "INDEX.yaml");
const ROADMAP_MILESTONES_DIR = path.join(ROADMAP_DIR, "milestones");

const DECLARED_ROADMAP_STATUSES = ["proposed", "active", "blocked", "complete"] as const;
const DECLARED_PLANNED_CHANGE_STATUSES = ["planned", "complete"] as const;
const ROADMAP_INDEX_SCHEMA_ID = "strict-spec-driven/roadmap-index/v1";
const ROADMAP_MILESTONE_SCHEMA_ID = "strict-spec-driven/roadmap-milestone/v1";
const PLANNED_CHANGE_SCHEMA_ID = "strict-spec-driven/planned-change-entry/v1";

type DeclaredRoadmapStatus = (typeof DECLARED_ROADMAP_STATUSES)[number];
type DeclaredPlannedChangeStatus = (typeof DECLARED_PLANNED_CHANGE_STATUSES)[number];

type PlannedChangeState = "missing" | "active" | "archived" | "ambiguous";

type RoadmapIndexEntry = {
  id: string;
  title: string;
  path: string;
  status: DeclaredRoadmapStatus;
};

type PlannedChangeEntry = {
  schema: string;
  schema_version: 1;
  artifact_type: "planned_change_entry";
  schema_file: string;
  id: string;
  status: DeclaredPlannedChangeStatus;
  summary: string;
  depends_on: string[];
};

type MilestoneIdentity = {
  id: string;
  title: string;
};

type MilestoneScope = {
  in: string[];
  out: string[];
};

type RoadmapMilestoneArtifact = {
  schema: string;
  schema_version: 1;
  artifact_type: "roadmap_milestone";
  schema_file: string;
  milestone: MilestoneIdentity;
  goal: string;
  scope: MilestoneScope;
  done_criteria: string[];
  planned_changes: PlannedChangeEntry[];
  dependencies: string[];
  risks: string[];
  status: DeclaredRoadmapStatus;
  notes: string[];
};

type RoadmapIndexArtifact = {
  schema: string;
  schema_version: 1;
  artifact_type: "roadmap_index";
  schema_file: string;
  milestones: RoadmapIndexEntry[];
};

type LoadedMilestone = {
  absolutePath: string;
  artifactPath: string;
  file: string;
  relativeMilestonePath: string;
  repoRelativePath: string;
  raw: string;
  artifact: RoadmapMilestoneArtifact;
};

type LoadedRoadmap = {
  warnings: string[];
  diagnostics: RoadmapDiagnostic[];
  indexArtifact: RoadmapIndexArtifact | null;
  milestones: LoadedMilestone[];
};

export type RoadmapDiagnostic = {
  source: "schema" | "reference" | "semantic";
  artifactPath: string;
  fieldPath: string;
  message: string;
  expected?: string;
  actual?: string;
};

export type RoadmapPlannedChangeStatus = {
  id: string;
  summary: string;
  declaredStatus: DeclaredPlannedChangeStatus;
  derivedStatus: DeclaredPlannedChangeStatus;
  state: PlannedChangeState;
  mismatches: string[];
};

export type RoadmapMilestoneStatus = {
  file: string;
  path: string;
  id: string;
  title: string;
  goal: string;
  declaredStatus: DeclaredRoadmapStatus;
  derivedStatus: Exclude<DeclaredRoadmapStatus, "blocked">;
  plannedChanges: RoadmapPlannedChangeStatus[];
  mismatches: string[];
};

export type RoadmapStatusResult = {
  valid: boolean;
  warnings: string[];
  diagnostics: RoadmapDiagnostic[];
  milestones: RoadmapMilestoneStatus[];
};

export type RoadmapSyncResult = {
  valid: boolean;
  warnings: string[];
  diagnostics: RoadmapDiagnostic[];
  updatedFiles: string[];
  milestones: RoadmapMilestoneStatus[];
};

type ChangeStateIndex = {
  active: Set<string>;
  archived: Set<string>;
};

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function normalizeRepoRelativePath(rootDir: string, absolutePath: string): string {
  return toPosix(path.relative(rootDir, absolutePath));
}

function resolveStrictWorkflowPath(rootDir: string, workflowRelativePath: string): string {
  const normalized = toPosix(workflowRelativePath);
  if (normalized.startsWith(`${STRICT_WORKFLOW_DIR}/`)) {
    return path.join(rootDir, normalized);
  }
  return path.join(rootDir, STRICT_WORKFLOW_DIR, normalized);
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function makeDiagnostic(
  source: RoadmapDiagnostic["source"],
  artifactPath: string,
  fieldPath: string,
  message: string,
  expected?: string,
  actual?: string,
): RoadmapDiagnostic {
  return { source, artifactPath, fieldPath, message, expected, actual };
}

function sortDiagnostics(diagnostics: RoadmapDiagnostic[]): RoadmapDiagnostic[] {
  return diagnostics.sort((left, right) => {
    const leftKey = [left.source, left.artifactPath, left.fieldPath, left.message, left.expected ?? "", left.actual ?? ""].join("|");
    const rightKey = [right.source, right.artifactPath, right.fieldPath, right.message, right.expected ?? "", right.actual ?? ""].join("|");
    return leftKey.localeCompare(rightKey);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function listYamlFiles(directoryPath: string): string[] {
  if (!existsSync(directoryPath) || !statSync(directoryPath).isDirectory()) {
    return [];
  }

  const files: string[] = [];

  function walk(currentPath: string): void {
    const entries = readdirSync(currentPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.isFile() && (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml"))) {
        files.push(fullPath);
      }
    }
  }

  walk(directoryPath);
  return files;
}

function isRepoRelativePath(value: string): boolean {
  if (path.isAbsolute(value)) return false;
  const normalized = path.posix.normalize(toPosix(value));
  return normalized !== ".." && !normalized.startsWith("../");
}

function isDeclaredRoadmapStatus(value: unknown): value is DeclaredRoadmapStatus {
  return typeof value === "string" && DECLARED_ROADMAP_STATUSES.includes(value as DeclaredRoadmapStatus);
}

function isDeclaredPlannedChangeStatus(value: unknown): value is DeclaredPlannedChangeStatus {
  return typeof value === "string" && DECLARED_PLANNED_CHANGE_STATUSES.includes(value as DeclaredPlannedChangeStatus);
}

function readYamlFile(filePath: string): unknown {
  return parseYamlDocument<unknown>(readFileSync(filePath, "utf8"));
}

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

function validateRoadmapIndexArtifact(
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
          DECLARED_ROADMAP_STATUSES.join(", "),
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
        DECLARED_PLANNED_CHANGE_STATUSES.join(", "),
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

function validateMilestoneArtifact(
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
        DECLARED_ROADMAP_STATUSES.join(", "),
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

function getChangeStateIndex(rootDir: string): ChangeStateIndex {
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

function deriveMilestoneStatus(states: PlannedChangeState[]): Exclude<DeclaredRoadmapStatus, "blocked"> {
  if (states.length === 0) return "proposed";
  if (states.every((state) => state === "archived")) return "complete";
  if (states.some((state) => state === "active" || state === "ambiguous")) return "active";
  return "proposed";
}

function loadRoadmap(rootDir: string): LoadedRoadmap {
  const warnings: string[] = [];
  const diagnostics: RoadmapDiagnostic[] = [];
  const roadmapDir = path.join(rootDir, ROADMAP_DIR);
  const indexPath = path.join(rootDir, ROADMAP_INDEX_PATH);
  const milestonesDir = path.join(rootDir, ROADMAP_MILESTONES_DIR);

  if (!existsSync(roadmapDir) || !statSync(roadmapDir).isDirectory()) {
    diagnostics.push(
      makeDiagnostic("schema", ROADMAP_DIR, "$", "strict roadmap directory not found", ROADMAP_DIR, "missing"),
    );
    return { warnings, diagnostics, indexArtifact: null, milestones: [] };
  }

  let indexArtifact: RoadmapIndexArtifact | null = null;
  if (existsSync(indexPath)) {
    try {
      indexArtifact = validateRoadmapIndexArtifact(readYamlFile(indexPath), ROADMAP_INDEX_PATH, diagnostics);
    } catch (error) {
      diagnostics.push(
        makeDiagnostic(
          "schema",
          ROADMAP_INDEX_PATH,
          "$",
          "failed to parse roadmap index YAML",
          "parseable YAML mapping",
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  } else {
    diagnostics.push(
      makeDiagnostic("schema", ROADMAP_INDEX_PATH, "$", "roadmap index is missing", ROADMAP_INDEX_PATH, "missing"),
    );
  }

  const milestoneFiles = listYamlFiles(milestonesDir);
  if (milestoneFiles.length === 0) {
    warnings.push("roadmap/milestones/ is empty");
  }

  const milestones: LoadedMilestone[] = [];
  for (const absolutePath of milestoneFiles) {
    const artifactPath = normalizeRepoRelativePath(rootDir, absolutePath);
    try {
      const raw = readFileSync(absolutePath, "utf8");
      const artifact = validateMilestoneArtifact(readYamlFile(absolutePath), artifactPath, diagnostics);
      if (!artifact) continue;
      const relativeMilestonePath = toPosix(path.relative(milestonesDir, absolutePath));
      milestones.push({
        absolutePath,
        artifactPath,
        file: path.basename(relativeMilestonePath),
        relativeMilestonePath,
        repoRelativePath: normalizeRepoRelativePath(rootDir, absolutePath),
        raw,
        artifact,
      });
    } catch (error) {
      diagnostics.push(
        makeDiagnostic(
          "schema",
          artifactPath,
          "$",
          "failed to parse roadmap milestone YAML",
          "parseable YAML mapping",
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  return {
    warnings,
    diagnostics: sortDiagnostics(diagnostics),
    indexArtifact,
    milestones,
  };
}

function buildMilestoneStatus(
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

function orderMilestoneStatuses(
  rootDir: string,
  roadmap: LoadedRoadmap,
  statuses: Map<string, RoadmapMilestoneStatus>,
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
            ROADMAP_INDEX_PATH,
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
            ROADMAP_INDEX_PATH,
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
            ROADMAP_INDEX_PATH,
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
            ROADMAP_INDEX_PATH,
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
          ROADMAP_INDEX_PATH,
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

function writeFileIfChanged(filePath: string, nextContent: string, updatedFiles: string[], rootDir: string): void {
  const normalized = ensureTrailingNewline(nextContent);
  const current = existsSync(filePath) ? ensureTrailingNewline(readFileSync(filePath, "utf8")) : null;
  if (current === normalized) return;
  writeFileSync(filePath, normalized, "utf8");
  updatedFiles.push(normalizeRepoRelativePath(rootDir, filePath));
}

function buildCanonicalMilestoneArtifact(
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

function buildRoadmapIndexArtifact(milestones: LoadedMilestone[]): RoadmapIndexArtifact {
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

export function getRoadmapStatus(rootDir: string): RoadmapStatusResult {
  const roadmap = loadRoadmap(rootDir);
  const changeStates = getChangeStateIndex(rootDir);
  const statusMap = new Map<string, RoadmapMilestoneStatus>();
  for (const milestone of roadmap.milestones) {
    const milestonePath = toPosix(path.join("roadmap", "milestones", milestone.relativeMilestonePath));
    statusMap.set(milestonePath, buildMilestoneStatus(milestone, changeStates));
  }

  const milestones = orderMilestoneStatuses(rootDir, roadmap, statusMap);
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
