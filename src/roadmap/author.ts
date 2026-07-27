import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { stringifyYamlDocument } from "../yaml.js";
import {
  canonicalPlannedChangeFileName,
  PLANNED_CHANGE_SCHEMA_ID,
  ROADMAP_DIR,
  ROADMAP_MILESTONES_DIR,
  ROADMAP_MILESTONE_SCHEMA_ID,
  ROADMAP_INDEX_PATH,
  type DeclaredPlannedChangeStatus,
  type LoadedMilestone,
  type LoadedPlannedChange,
  type MilestoneIntakeQuestion,
  type RoadmapDiagnostic,
  type RoadmapMilestoneStatus,
} from "./model.js";
import { loadRoadmap } from "./load.js";
import {
  ensureTrailingNewline,
  isDeclaredPlannedChangeStatus,
  makeDiagnostic,
  normalizeRepoRelativePath,
  sortDiagnostics,
} from "./shared.js";
import { buildCanonicalPlannedChangeArtifact, nextAppendedMilestoneOrder, writeFileIfChanged } from "./sync.js";
import { validateMilestoneArtifact, validateStandalonePlannedChangeArtifact } from "./validate.js";
import { getRoadmapStatus, syncRoadmap } from "../roadmap.js";
import {
  buildMilestoneStatus,
  getChangeStateIndex,
  getMergedPlannedChangesForMilestone,
  getStandalonePlannedChangesForMilestone,
} from "./status.js";

const MILESTONE_ID_PATTERN = /^(\d{4}-)?([a-z0-9][a-z0-9-]*[a-z0-9]|[a-z0-9])$/;

export type RoadmapMilestoneAuthorInput = {
  id: string;
  title?: string;
  goal?: string;
  scopeIn: string[];
  scopeOut: string[];
  doneCriteria: string[];
  intakeQuestions: MilestoneIntakeQuestion[];
  dependencies: string[];
  risks: string[];
  notes: string[];
  details?: string;
  reset: boolean;
  resetIntakeQuestions: boolean;
};

export type RoadmapMilestoneAuthorResult = {
  valid: boolean;
  warnings: string[];
  diagnostics: RoadmapDiagnostic[];
  updatedFiles: string[];
  milestone?: {
    id: string;
    title: string;
    path: string;
  };
  milestones: RoadmapMilestoneStatus[];
};

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function hasAnyField(input: RoadmapMilestoneAuthorInput): boolean {
  return Boolean(input.title)
    || Boolean(input.goal)
    || input.scopeIn.length > 0
    || input.scopeOut.length > 0
    || input.doneCriteria.length > 0
    || input.intakeQuestions.length > 0
    || input.dependencies.length > 0
    || input.risks.length > 0
    || input.notes.length > 0
    || input.details !== undefined;
}

function conflictDiagnostic(
  artifactPath: string,
  fieldPath: string,
  expected: string,
  actual: string,
): RoadmapDiagnostic {
  return makeDiagnostic(
    "semantic",
    artifactPath,
    fieldPath,
    "existing milestone field has conflicting content; rerun with --reset to replace it",
    expected,
    actual,
  );
}

function appendUnique(existing: string[], additions: string[]): string[] {
  return uniqueStrings([...existing, ...additions]);
}

function sameIntakeQuestion(left: MilestoneIntakeQuestion, right: MilestoneIntakeQuestion): boolean {
  return left.id === right.id
    && left.question === right.question
    && left.context === right.context
    && left.impact === right.impact
    && left.recommendation === right.recommendation;
}

function mergeIntakeQuestions(
  existing: MilestoneIntakeQuestion[],
  additions: MilestoneIntakeQuestion[],
  resetIntakeQuestions: boolean,
  artifactPath: string,
  diagnostics: RoadmapDiagnostic[],
): MilestoneIntakeQuestion[] {
  // The global --reset flag never removes or replaces existing intake
  // questions; only the dedicated --reset-intake-questions flag does.
  const source = resetIntakeQuestions && additions.length > 0 ? additions : [...existing, ...additions];
  const result: MilestoneIntakeQuestion[] = [];
  const byId = new Map<string, MilestoneIntakeQuestion>();
  for (const question of source) {
    const current = byId.get(question.id);
    if (!current) {
      byId.set(question.id, question);
      result.push(question);
      continue;
    }
    if (sameIntakeQuestion(current, question)) continue;
    diagnostics.push(
      makeDiagnostic(
        "semantic",
        artifactPath,
        `$.intake_questions.${question.id}`,
        "existing intake question has conflicting content; rerun with --reset-intake-questions to replace the intake question list",
        `${current.question} | ${current.context} | ${current.impact} | ${current.recommendation}`,
        `${question.question} | ${question.context} | ${question.impact} | ${question.recommendation}`,
      ),
    );
  }
  return result;
}

function nextScalar(
  existing: string | undefined,
  incoming: string | undefined,
  reset: boolean,
  artifactPath: string,
  fieldPath: string,
  diagnostics: RoadmapDiagnostic[],
): string | undefined {
  if (incoming === undefined) return existing;
  if (existing === undefined || reset || existing === incoming) return incoming;
  diagnostics.push(conflictDiagnostic(artifactPath, fieldPath, existing, incoming));
  return existing;
}

function buildMilestoneMap(id: string, title: string): Record<string, { title: string }> {
  return { [id]: { title } };
}

function buildArtifact(
  input: RoadmapMilestoneAuthorInput,
  existing: LoadedMilestone | undefined,
  initialOrder: number,
  artifactPath: string,
  diagnostics: RoadmapDiagnostic[],
): Record<string, unknown> | null {
  if (!existing && (!input.title || !input.goal)) {
    diagnostics.push(
      makeDiagnostic(
        "schema",
        artifactPath,
        "$",
        "new roadmap milestones require --title and --goal",
        "--title and --goal",
        "missing",
      ),
    );
    return null;
  }
  if (!existing && input.intakeQuestions.length === 0) {
    diagnostics.push(
      makeDiagnostic(
        "schema",
        artifactPath,
        "$.intake_questions",
        "new roadmap milestones require at least one --intake-question",
        "--intake-question id|question|context|impact|recommendation",
        "missing",
      ),
    );
    return null;
  }

  const title = nextScalar(
    existing?.artifact.milestone.title,
    input.title,
    input.reset,
    artifactPath,
    "$.milestone.<id>.title",
    diagnostics,
  );
  const goal = nextScalar(existing?.artifact.goal, input.goal, input.reset, artifactPath, "$.goal", diagnostics);
  const details = nextScalar(existing?.artifact.details, input.details, input.reset, artifactPath, "$.details", diagnostics);
  const intakeQuestions = mergeIntakeQuestions(
    existing?.artifact.intake_questions ?? [],
    input.intakeQuestions,
    input.resetIntakeQuestions,
    artifactPath,
    diagnostics,
  );

  if (!title || !goal) return null;

  return {
    schema: ROADMAP_MILESTONE_SCHEMA_ID,
    schema_version: 2,
    artifact_type: "roadmap_milestone",
    schema_file: existing?.artifact.schema_file ?? "../schemas/roadmap-milestone.yaml",
    milestone: buildMilestoneMap(input.id, title),
    ...(!existing ? { order: initialOrder } : typeof existing.artifact.order === "number" ? { order: existing.artifact.order } : {}),
    goal,
    scope: {
      in: input.reset && input.scopeIn.length > 0
        ? uniqueStrings(input.scopeIn)
        : appendUnique(existing?.artifact.scope.in ?? [], input.scopeIn),
      out: input.reset && input.scopeOut.length > 0
        ? uniqueStrings(input.scopeOut)
        : appendUnique(existing?.artifact.scope.out ?? [], input.scopeOut),
    },
    done_criteria: input.reset && input.doneCriteria.length > 0
      ? uniqueStrings(input.doneCriteria)
      : appendUnique(existing?.artifact.done_criteria ?? [], input.doneCriteria),
    intake_questions: intakeQuestions,
    planned_changes: existing?.artifact.planned_changes ?? {},
    dependencies: input.reset && input.dependencies.length > 0
      ? uniqueStrings(input.dependencies)
      : appendUnique(existing?.artifact.dependencies ?? [], input.dependencies),
    risks: input.reset && input.risks.length > 0
      ? uniqueStrings(input.risks)
      : appendUnique(existing?.artifact.risks ?? [], input.risks),
    status: existing?.artifact.status ?? "proposed",
    notes: input.reset && input.notes.length > 0
      ? uniqueStrings(input.notes)
      : appendUnique(existing?.artifact.notes ?? [], input.notes),
    ...(details !== undefined ? { details } : {}),
  };
}

function findExistingMilestone(milestones: LoadedMilestone[], id: string): LoadedMilestone | undefined {
  return milestones.find((milestone) => milestone.artifact.milestone.id === id);
}

function findStandalonePlannedChangeRewriteDiagnostics(
  rootDir: string,
  milestones: LoadedMilestone[],
  commandLabel: string,
  excludePlannedChangeIds: Set<string> = new Set(),
): RoadmapDiagnostic[] {
  const diagnostics: RoadmapDiagnostic[] = [];
  const changeStates = getChangeStateIndex(rootDir);
  const roadmap = loadRoadmap(rootDir);
  for (const milestone of milestones) {
    const standalonePlannedChanges = getStandalonePlannedChangesForMilestone(roadmap, milestone);
    const plannedChangeEntries = getMergedPlannedChangesForMilestone(milestone, standalonePlannedChanges);
    const status = buildMilestoneStatus(milestone, changeStates, plannedChangeEntries);
    for (const plannedChange of standalonePlannedChanges) {
      if (excludePlannedChangeIds.has(plannedChange.artifact.planned_change.id)) continue;
      const nextContent = ensureTrailingNewline(stringifyYamlDocument(buildCanonicalPlannedChangeArtifact(plannedChange, status)));
      if (nextContent === ensureTrailingNewline(plannedChange.raw)) continue;
      diagnostics.push(
        makeDiagnostic(
          "semantic",
          plannedChange.repoRelativePath,
          "$",
          `${commandLabel} would rewrite a standalone planned-change artifact during roadmap synchronization; run roadmap-sync first or edit the planned-change file through the existing roadmap workflow`,
          "standalone planned-change artifact already canonical",
          "standalone planned-change rewrite required",
        ),
      );
    }
  }
  return diagnostics;
}

export function generateRoadmapMilestone(
  rootDir: string,
  input: RoadmapMilestoneAuthorInput,
): RoadmapMilestoneAuthorResult {
  const diagnostics: RoadmapDiagnostic[] = [];
  if (!MILESTONE_ID_PATTERN.test(input.id)) {
    diagnostics.push(
      makeDiagnostic(
        "schema",
        ROADMAP_MILESTONES_DIR,
        "$.milestone",
        "milestone id must be kebab-case with optional NNNN- legacy prefix",
        "kebab-case or NNNN-kebab-case",
        input.id,
      ),
    );
  }
  if (!hasAnyField(input)) {
    diagnostics.push(
      makeDiagnostic("schema", ROADMAP_MILESTONES_DIR, "$", "at least one milestone field argument is required", "named milestone fields", "none"),
    );
  }
  if (diagnostics.length > 0) {
    return { valid: false, warnings: [], diagnostics: sortDiagnostics(diagnostics), updatedFiles: [], milestones: [] };
  }

  const roadmap = loadRoadmap(rootDir, { allowInlinePlannedChanges: true });
  const preflight = getRoadmapStatus(rootDir);
  const blockingPreflightDiagnostics = preflight.diagnostics.filter((diagnostic) =>
    diagnostic.artifactPath !== ROADMAP_INDEX_PATH && diagnostic.artifactPath !== ROADMAP_DIR
  );
  if (blockingPreflightDiagnostics.length > 0) {
    return {
      valid: false,
      warnings: preflight.warnings,
      diagnostics: sortDiagnostics(blockingPreflightDiagnostics),
      updatedFiles: [],
      milestones: [],
    };
  }
  const standaloneRewriteDiagnostics = findStandalonePlannedChangeRewriteDiagnostics(rootDir, roadmap.milestones, "roadmap-generate milestone");
  if (standaloneRewriteDiagnostics.length > 0) {
    return {
      valid: false,
      warnings: preflight.warnings,
      diagnostics: sortDiagnostics(standaloneRewriteDiagnostics),
      updatedFiles: [],
      milestones: [],
    };
  }

  const existing = findExistingMilestone(roadmap.milestones, input.id);
  const milestonePath = existing?.absolutePath ?? path.join(rootDir, ROADMAP_MILESTONES_DIR, `${input.id}.yaml`);
  const artifactPath = normalizeRepoRelativePath(rootDir, milestonePath);

  if (!existing && existsSync(milestonePath)) {
    diagnostics.push(
      makeDiagnostic(
        "semantic",
        artifactPath,
        "$.milestone",
        "milestone destination already exists for a different or invalid milestone",
        "unused milestone file path",
        artifactPath,
      ),
    );
  }

  const nextArtifact = buildArtifact(input, existing, nextAppendedMilestoneOrder(roadmap.milestones), artifactPath, diagnostics);
  if (nextArtifact) {
    validateMilestoneArtifact(nextArtifact, artifactPath, diagnostics);
  }
  if (diagnostics.length > 0 || !nextArtifact) {
    return {
      valid: false,
      warnings: roadmap.warnings,
      diagnostics: sortDiagnostics(diagnostics),
      updatedFiles: [],
      milestones: [],
    };
  }

  const updatedFiles: string[] = [];
  const previousMilestoneContent = existsSync(milestonePath) ? readFileSync(milestonePath, "utf8") : null;
  mkdirSync(path.dirname(milestonePath), { recursive: true });
  writeFileIfChanged(milestonePath, stringifyYamlDocument(nextArtifact), updatedFiles, rootDir);

  const syncResult = syncRoadmap(rootDir);
  if (!syncResult.valid) {
    if (previousMilestoneContent === null) {
      rmSync(milestonePath, { force: true });
    } else {
      writeFileSync(milestonePath, previousMilestoneContent, "utf8");
    }
    return {
      valid: false,
      warnings: syncResult.warnings,
      diagnostics: syncResult.diagnostics,
      updatedFiles: [],
      milestones: [],
    };
  }
  return {
    valid: syncResult.valid,
    warnings: syncResult.warnings,
    diagnostics: syncResult.diagnostics,
    updatedFiles: uniqueStrings([...updatedFiles, ...syncResult.updatedFiles]).sort((left, right) => left.localeCompare(right)),
    milestone: {
      id: input.id,
      title: (nextArtifact.milestone as Record<string, { title: string }>)[input.id]?.title ?? input.id,
      path: artifactPath.replace(/^\.strict-spec-driven\//, ""),
    },
    milestones: syncResult.milestones,
  };
}

const PLANNED_CHANGE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
const PLANNED_CHANGES_DIRNAME = "planned-changes";
const PLANNED_CHANGE_SCHEMA_FILE = "../../templates/strict-spec-driven/schemas/planned-change.yaml";

export type RoadmapPlannedChangeAuthorInput = {
  id: string;
  milestone: string;
  summary?: string;
  details?: string;
  dependsOn: string[];
  status?: string;
  reset: boolean;
};

export type RoadmapPlannedChangeAuthorResult = {
  valid: boolean;
  warnings: string[];
  diagnostics: RoadmapDiagnostic[];
  updatedFiles: string[];
  plannedChange?: {
    id: string;
    milestone: string;
    path: string;
  };
  milestones: RoadmapMilestoneStatus[];
};

function findExistingPlannedChange(plannedChanges: LoadedPlannedChange[], id: string): LoadedPlannedChange | undefined {
  return plannedChanges.find((plannedChange) => plannedChange.artifact.planned_change.id === id);
}

function buildPlannedChangeArtifact(
  input: RoadmapPlannedChangeAuthorInput,
  existing: LoadedPlannedChange | undefined,
  artifactPath: string,
  diagnostics: RoadmapDiagnostic[],
): Record<string, unknown> | null {
  if (!existing && (!input.summary || !input.details)) {
    diagnostics.push(
      makeDiagnostic(
        "schema",
        artifactPath,
        "$",
        "new roadmap planned changes require --summary and --details",
        "--summary and --details",
        "missing",
      ),
    );
    return null;
  }

  const summary = nextScalar(existing?.artifact.summary, input.summary, input.reset, artifactPath, "$.summary", diagnostics);
  const details = nextScalar(existing?.artifact.details, input.details, input.reset, artifactPath, "$.details", diagnostics);
  const status = nextScalar(existing?.artifact.status, input.status, input.reset, artifactPath, "$.status", diagnostics);

  if (!summary || !details) return null;

  return {
    schema: PLANNED_CHANGE_SCHEMA_ID,
    schema_version: 1,
    artifact_type: "planned_change",
    schema_file: existing?.artifact.schema_file ?? PLANNED_CHANGE_SCHEMA_FILE,
    planned_change: {
      id: input.id,
      milestone: input.milestone,
    },
    status: (status ?? "planned") as DeclaredPlannedChangeStatus,
    summary,
    details,
    depends_on: input.reset && input.dependsOn.length > 0
      ? uniqueStrings(input.dependsOn)
      : appendUnique(existing?.artifact.depends_on ?? [], input.dependsOn),
    ...(existing?.artifact.team !== undefined ? { team: existing.artifact.team } : {}),
    ...(existing?.artifact.extensions !== undefined ? { extensions: existing.artifact.extensions } : {}),
  };
}

export function generateRoadmapPlannedChange(
  rootDir: string,
  input: RoadmapPlannedChangeAuthorInput,
): RoadmapPlannedChangeAuthorResult {
  const diagnostics: RoadmapDiagnostic[] = [];
  const plannedChangesDir = `${ROADMAP_DIR}/${PLANNED_CHANGES_DIRNAME}`;
  if (!PLANNED_CHANGE_ID_PATTERN.test(input.id)) {
    diagnostics.push(
      makeDiagnostic(
        "schema",
        plannedChangesDir,
        "$.planned_change.id",
        "planned change id must be kebab-case",
        "kebab-case id",
        input.id,
      ),
    );
  }
  if (input.status !== undefined && !isDeclaredPlannedChangeStatus(input.status)) {
    diagnostics.push(
      makeDiagnostic(
        "schema",
        plannedChangesDir,
        "$.status",
        "unsupported planned change status",
        "planned, complete",
        input.status,
      ),
    );
  }
  if (diagnostics.length > 0) {
    return { valid: false, warnings: [], diagnostics: sortDiagnostics(diagnostics), updatedFiles: [], milestones: [] };
  }

  const roadmap = loadRoadmap(rootDir);
  const preflight = getRoadmapStatus(rootDir);
  const blockingPreflightDiagnostics = preflight.diagnostics.filter((diagnostic) =>
    diagnostic.artifactPath !== ROADMAP_INDEX_PATH && diagnostic.artifactPath !== ROADMAP_DIR
  );
  if (blockingPreflightDiagnostics.length > 0) {
    return {
      valid: false,
      warnings: preflight.warnings,
      diagnostics: sortDiagnostics(blockingPreflightDiagnostics),
      updatedFiles: [],
      milestones: [],
    };
  }
  const standaloneRewriteDiagnostics = findStandalonePlannedChangeRewriteDiagnostics(
    rootDir,
    roadmap.milestones,
    "roadmap-generate planned-change",
    new Set([input.id]),
  );
  if (standaloneRewriteDiagnostics.length > 0) {
    return {
      valid: false,
      warnings: preflight.warnings,
      diagnostics: sortDiagnostics(standaloneRewriteDiagnostics),
      updatedFiles: [],
      milestones: [],
    };
  }

  const milestone = findExistingMilestone(roadmap.milestones, input.milestone);
  if (!milestone) {
    return {
      valid: false,
      warnings: roadmap.warnings,
      diagnostics: [
        makeDiagnostic(
          "reference",
          plannedChangesDir,
          "$.planned_change.milestone",
          "planned change references a missing milestone",
          "existing roadmap milestone id",
          input.milestone,
        ),
      ],
      updatedFiles: [],
      milestones: [],
    };
  }

  const existing = findExistingPlannedChange(roadmap.plannedChanges, input.id);
  if (existing && existing.artifact.planned_change.milestone !== input.milestone) {
    return {
      valid: false,
      warnings: roadmap.warnings,
      diagnostics: [
        makeDiagnostic(
          "semantic",
          existing.repoRelativePath,
          "$.planned_change.milestone",
          "planned change already belongs to a different milestone; this command does not reassign milestones, so run roadmap-move-planned-change instead",
          existing.artifact.planned_change.milestone,
          input.milestone,
        ),
      ],
      updatedFiles: [],
      milestones: [],
    };
  }

  const plannedChangePath = existing?.absolutePath
    ?? path.join(rootDir, plannedChangesDir, canonicalPlannedChangeFileName(input.milestone, input.id));
  const artifactPath = normalizeRepoRelativePath(rootDir, plannedChangePath);

  if (!existing && existsSync(plannedChangePath)) {
    diagnostics.push(
      makeDiagnostic(
        "semantic",
        artifactPath,
        "$.planned_change",
        "planned change destination already exists for a different or invalid planned change",
        "unused planned change file path",
        artifactPath,
      ),
    );
  }

  const nextArtifact = buildPlannedChangeArtifact(input, existing, artifactPath, diagnostics);
  if (nextArtifact) {
    validateStandalonePlannedChangeArtifact(nextArtifact, artifactPath, diagnostics);
  }
  if (diagnostics.length > 0 || !nextArtifact) {
    return {
      valid: false,
      warnings: roadmap.warnings,
      diagnostics: sortDiagnostics(diagnostics),
      updatedFiles: [],
      milestones: [],
    };
  }

  const updatedFiles: string[] = [];
  const previousContent = existsSync(plannedChangePath) ? readFileSync(plannedChangePath, "utf8") : null;
  mkdirSync(path.dirname(plannedChangePath), { recursive: true });
  writeFileIfChanged(plannedChangePath, stringifyYamlDocument(nextArtifact), updatedFiles, rootDir);

  const syncResult = syncRoadmap(rootDir);
  if (!syncResult.valid) {
    if (previousContent === null) {
      rmSync(plannedChangePath, { force: true });
    } else {
      writeFileSync(plannedChangePath, previousContent, "utf8");
    }
    return {
      valid: false,
      warnings: syncResult.warnings,
      diagnostics: syncResult.diagnostics,
      updatedFiles: [],
      milestones: [],
    };
  }
  return {
    valid: syncResult.valid,
    warnings: syncResult.warnings,
    diagnostics: syncResult.diagnostics,
    updatedFiles: uniqueStrings([...updatedFiles, ...syncResult.updatedFiles]).sort((left, right) => left.localeCompare(right)),
    plannedChange: {
      id: input.id,
      milestone: input.milestone,
      path: artifactPath.replace(/^\.strict-spec-driven\//, ""),
    },
    milestones: syncResult.milestones,
  };
}
