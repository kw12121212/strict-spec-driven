import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "fs";
import path from "path";
import { createHash } from "crypto";
import { parseYamlFile, stringifyYamlDocument } from "./yaml.js";
import { loadBundledSchemaBySchemaId, validateArtifact, type ValidationDiagnostic } from "./validation.js";

const STRICT_WORKFLOW_DIR = ".strict-spec-driven";
const LESSONS_DIR = `${STRICT_WORKFLOW_DIR}/lessons`;
const LESSONS_INDEX_PATH = `${LESSONS_DIR}/INDEX.yaml`;
const LESSON_SCHEMA_ID = "strict-spec-driven/lesson/v1";
const LESSONS_INDEX_SCHEMA_ID = "strict-spec-driven/lessons-index/v1";

export type LessonStatus = "active" | "promoted" | "obsolete";

export type LessonOccurrence = { origin: string; date: string; evidence: string };
export type LessonPromotion = { standard: string; rule: string };

export type LessonArtifact = {
  schema: string;
  schema_version: number;
  artifact_type: string;
  schema_file: string;
  lesson: { id: string; title: string };
  category: string;
  status: LessonStatus;
  created_at: string;
  updated_at: string;
  context: string;
  observation: string;
  takeaway: string;
  applies_when: string;
  occurrences: LessonOccurrence[];
  promoted_to?: LessonPromotion;
  obsoleted_reason?: string;
  obsoleted_at?: string;
};

export type CreateLessonInput = {
  title: string;
  category: string;
  context: string;
  observation: string;
  takeaway: string;
  appliesWhen: string;
  occurrence: LessonOccurrence;
};

export type CreateLessonResult = {
  valid: boolean;
  created: boolean;
  lessonId: string | null;
  path: string | null;
  diagnostics: ValidationDiagnostic[];
};

export type LessonListEntry = {
  id: string;
  title: string;
  category: string;
  status: LessonStatus;
  occurrences: number;
  path: string;
};

export type ListLessonsResult = { valid: boolean; lessons: LessonListEntry[]; diagnostics: ValidationDiagnostic[] };
export type ShowLessonResult = {
  valid: boolean;
  lessonId: string;
  path: string | null;
  lesson: LessonArtifact | null;
  diagnostics: ValidationDiagnostic[];
};
export type ValidateLessonsResult = { valid: boolean; checkedCount: number; diagnostics: ValidationDiagnostic[] };

export type EditLessonInput = {
  lessonId: string;
  title?: string;
  context?: string;
  observation?: string;
  takeaway?: string;
  appliesWhen?: string;
  /** Appended to the existing occurrences; recording a recurrence never creates a second lesson. */
  occurrence?: LessonOccurrence;
  /** Promotes the lesson; the reference is mandatory because a promoted lesson must name its rule. */
  promotedTo?: LessonPromotion;
};

export type EditLessonResult = {
  valid: boolean;
  edited: boolean;
  lessonId: string;
  path: string | null;
  lesson: LessonArtifact | null;
  diagnostics: ValidationDiagnostic[];
};

export type ObsoleteLessonResult = {
  valid: boolean;
  obsoleted: boolean;
  lessonId: string;
  path: string | null;
  lesson: LessonArtifact | null;
  diagnostics: ValidationDiagnostic[];
};

export type LessonStatusResult = {
  valid: boolean;
  lessonCount: number;
  statusCounts: Record<LessonStatus, number>;
  categoryCounts: Record<string, number>;
  lessons: LessonListEntry[];
  diagnostics: ValidationDiagnostic[];
};

function lessonsDir(rootDir: string): string {
  return path.join(rootDir, LESSONS_DIR);
}

function lessonsIndexPath(rootDir: string): string {
  return path.join(rootDir, LESSONS_INDEX_PATH);
}

function lessonFilePath(rootDir: string, lessonId: string): string {
  return path.join(lessonsDir(rootDir), `${lessonId}.yaml`);
}

function repoRelative(rootDir: string, absolutePath: string): string {
  return path.relative(rootDir, absolutePath).split(path.sep).join("/");
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "lesson";
}

function contentHash(input: CreateLessonInput): string {
  return createHash("sha256")
    .update([input.title, input.category, input.appliesWhen].join(" "))
    .digest("hex")
    .slice(0, 6);
}

/**
 * Conflict-resistant, content-derived lesson id: a slug of the title plus a short hash of the
 * title, category, and applies_when condition. Hashing applies_when rather than the narrative
 * fields means the same recurring condition always resolves to the same id, which is what makes
 * lesson-create idempotent and keeps a recurrence from silently becoming a second lesson.
 */
export function deriveLessonId(input: CreateLessonInput): string {
  return `${slugify(input.title)}-${contentHash(input)}`;
}

/** Allowed categories come from the bundled schema so the vocabulary has a single source. */
export function getLessonCategories(): string[] {
  const schema = loadBundledSchemaBySchemaId(LESSON_SCHEMA_ID) as {
    properties?: { category?: { enum?: unknown } };
  };
  const values = schema.properties?.category?.enum;
  return Array.isArray(values) ? values.map((value) => String(value)) : [];
}

function makeDiagnostic(rootDir: string, message: string, fieldPath = "$", absolutePath?: string): ValidationDiagnostic {
  return {
    source: "schema",
    artifactPath: absolutePath ? repoRelative(rootDir, absolutePath) : LESSONS_DIR,
    fieldPath,
    message,
  };
}

function listLessonFiles(rootDir: string): string[] {
  const dir = lessonsDir(rootDir);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".yaml") && name !== "INDEX.yaml")
    .map((name) => path.join(dir, name))
    .sort();
}

function compareLessons(left: { id: string; createdAt: string }, right: { id: string; createdAt: string }): number {
  const order = left.createdAt.localeCompare(right.createdAt);
  return order !== 0 ? order : left.id.localeCompare(right.id);
}

function buildLessonArtifact(input: CreateLessonInput, lessonId: string): LessonArtifact {
  const now = new Date().toISOString();
  return {
    schema: LESSON_SCHEMA_ID,
    schema_version: 1,
    artifact_type: "lesson",
    schema_file: "templates/strict-spec-driven/schemas/lesson.yaml",
    lesson: { id: lessonId, title: input.title },
    category: input.category,
    status: "active",
    created_at: now,
    updated_at: now,
    context: input.context,
    observation: input.observation,
    takeaway: input.takeaway,
    applies_when: input.appliesWhen,
    occurrences: [{ ...input.occurrence }],
  };
}

/** Rebuilds .strict-spec-driven/lessons/INDEX.yaml deterministically from the lessons on disk. */
export function rebuildLessonsIndex(rootDir: string): void {
  const entries: Array<{
    id: string;
    createdAt: string;
    indexEntry: { title: string; category: string; status: LessonStatus; occurrences: number; path: string };
  }> = [];

  for (const filePath of listLessonFiles(rootDir)) {
    const artifact = parseYamlFile<LessonArtifact>(filePath);
    const lessonId = artifact?.lesson?.id;
    if (typeof lessonId !== "string" || lessonId.length === 0) {
      continue;
    }
    entries.push({
      id: lessonId,
      createdAt: String(artifact.created_at ?? ""),
      indexEntry: {
        title: artifact.lesson.title,
        category: artifact.category,
        status: artifact.status,
        occurrences: Array.isArray(artifact.occurrences) ? artifact.occurrences.length : 0,
        path: repoRelative(rootDir, filePath),
      },
    });
  }

  const sorted: Record<string, { title: string; category: string; status: LessonStatus; occurrences: number; path: string }> = {};
  for (const entry of entries.sort(compareLessons)) {
    sorted[entry.id] = entry.indexEntry;
  }

  const indexArtifact = {
    schema: LESSONS_INDEX_SCHEMA_ID,
    schema_version: 1,
    artifact_type: "lessons_index",
    schema_file: "templates/strict-spec-driven/schemas/lessons-index.yaml",
    lessons: sorted,
  };

  mkdirSync(lessonsDir(rootDir), { recursive: true });
  writeFileSync(lessonsIndexPath(rootDir), stringifyYamlDocument(indexArtifact), "utf8");
}

/**
 * Validates a lesson: the base schema, then the conditional rules the schema cannot express on its
 * own. A promoted lesson must name the rule it became, or the binding rule loses the only record of
 * the failure that motivated it; an obsolete lesson must record why it was retired, because a
 * disproven conclusion is itself reusable knowledge.
 */
export function validateLessonArtifact(
  rootDir: string,
  artifact: unknown,
  absolutePath: string,
): ValidationDiagnostic[] {
  const artifactPath = repoRelative(rootDir, absolutePath);
  const schema = loadBundledSchemaBySchemaId(LESSON_SCHEMA_ID);
  const base = validateArtifact(schema, artifact, artifactPath);
  if (!base.valid) {
    return base.diagnostics;
  }

  const lesson = artifact as LessonArtifact;
  const diagnostics: ValidationDiagnostic[] = [];
  const push = (message: string, fieldPath: string): void => {
    diagnostics.push({ source: "schema", artifactPath, fieldPath, message });
  };

  if (lesson.status === "promoted" && !lesson.promoted_to) {
    push("a promoted lesson must record promoted_to naming the technical standard and rule it became", "$.promoted_to");
  }
  if (lesson.status !== "promoted" && lesson.promoted_to) {
    push(`promoted_to is only valid on a promoted lesson, but status is '${lesson.status}'`, "$.promoted_to");
  }

  if (lesson.status === "obsolete") {
    if (!lesson.obsoleted_reason) {
      push("an obsolete lesson must record obsoleted_reason explaining why it no longer holds", "$.obsoleted_reason");
    }
    if (!lesson.obsoleted_at) {
      push("an obsolete lesson must record obsoleted_at", "$.obsoleted_at");
    }
  } else {
    if (lesson.obsoleted_reason) {
      push(`obsoleted_reason is only valid on an obsolete lesson, but status is '${lesson.status}'`, "$.obsoleted_reason");
    }
    if (lesson.obsoleted_at) {
      push(`obsoleted_at is only valid on an obsolete lesson, but status is '${lesson.status}'`, "$.obsoleted_at");
    }
  }

  return diagnostics;
}

/**
 * Creates a lesson with a conflict-resistant generated id and active status, maintaining the
 * lessons index. Idempotent: if the derived id already exists, existing lesson state is left
 * untouched so re-recording the same experience never clobbers accumulated occurrences.
 */
export function createLesson(rootDir: string, input: CreateLessonInput): CreateLessonResult {
  const diagnostics: ValidationDiagnostic[] = [];
  if (!input.title || input.title.trim().length === 0) {
    diagnostics.push(makeDiagnostic(rootDir, "lesson title is required", "$.lesson.title"));
  }
  if (!input.category || input.category.trim().length === 0) {
    diagnostics.push(makeDiagnostic(rootDir, "lesson category is required", "$.category"));
  }
  if (diagnostics.length > 0) {
    return { valid: false, created: false, lessonId: null, path: null, diagnostics };
  }

  const categories = getLessonCategories();
  if (!categories.includes(input.category)) {
    return {
      valid: false,
      created: false,
      lessonId: null,
      path: null,
      diagnostics: [
        makeDiagnostic(rootDir, `unknown lesson category '${input.category}'; expected one of [${categories.join(", ")}]`, "$.category"),
      ],
    };
  }

  const lessonId = deriveLessonId(input);
  const filePath = lessonFilePath(rootDir, lessonId);
  if (existsSync(filePath)) {
    return { valid: true, created: false, lessonId, path: repoRelative(rootDir, filePath), diagnostics: [] };
  }

  const artifact = buildLessonArtifact(input, lessonId);
  const validationDiagnostics = validateLessonArtifact(rootDir, artifact, filePath);
  if (validationDiagnostics.length > 0) {
    return { valid: false, created: false, lessonId, path: null, diagnostics: validationDiagnostics };
  }

  mkdirSync(lessonsDir(rootDir), { recursive: true });
  writeFileSync(filePath, stringifyYamlDocument(artifact), "utf8");
  rebuildLessonsIndex(rootDir);

  return { valid: true, created: true, lessonId, path: repoRelative(rootDir, filePath), diagnostics: [] };
}

function readLessonEntries(rootDir: string): Array<LessonListEntry & { createdAt: string }> {
  const entries: Array<LessonListEntry & { createdAt: string }> = [];
  for (const filePath of listLessonFiles(rootDir)) {
    const artifact = parseYamlFile<LessonArtifact>(filePath);
    const lessonId = artifact?.lesson?.id;
    if (typeof lessonId !== "string" || lessonId.length === 0) {
      continue;
    }
    entries.push({
      id: lessonId,
      title: artifact.lesson.title,
      category: artifact.category,
      status: artifact.status,
      occurrences: Array.isArray(artifact.occurrences) ? artifact.occurrences.length : 0,
      path: repoRelative(rootDir, filePath),
      createdAt: String(artifact.created_at ?? ""),
    });
  }
  return entries;
}

function stripCreatedAt(entry: LessonListEntry & { createdAt: string }): LessonListEntry {
  return {
    id: entry.id,
    title: entry.title,
    category: entry.category,
    status: entry.status,
    occurrences: entry.occurrences,
    path: entry.path,
  };
}

/**
 * Lists lessons, hiding promoted and obsolete entries unless includeAll is set. A promoted lesson
 * is already surfaced as a technical-standard rule, so showing it here too would duplicate the same
 * guidance at every consumption point and train readers to skim.
 */
export function listLessons(rootDir: string, options: { includeAll?: boolean } = {}): ListLessonsResult {
  const entries = readLessonEntries(rootDir)
    .filter((entry) => options.includeAll === true || entry.status === "active")
    .sort(compareLessons)
    .map(stripCreatedAt);
  return { valid: true, lessons: entries, diagnostics: [] };
}

export function showLesson(rootDir: string, lessonId: string): ShowLessonResult {
  const filePath = lessonFilePath(rootDir, lessonId);
  if (!existsSync(filePath)) {
    return {
      valid: false,
      lessonId,
      path: null,
      lesson: null,
      diagnostics: [makeDiagnostic(rootDir, `lesson '${lessonId}' not found`, "$.lesson.id")],
    };
  }
  const lesson = parseYamlFile<LessonArtifact>(filePath);
  return { valid: true, lessonId, path: repoRelative(rootDir, filePath), lesson, diagnostics: [] };
}

/**
 * Reports the lesson store for consumption points, ranking the highest-recurrence lessons first.
 * Occurrence count is the objective evidence that a lesson has earned promotion into a binding
 * rule, so ordering by it puts the promotion candidates where they will actually be read.
 */
export function getLessonStatus(rootDir: string, options: { includeAll?: boolean } = {}): LessonStatusResult {
  const all = readLessonEntries(rootDir);
  const visible = all.filter((entry) => options.includeAll === true || entry.status === "active");

  const statusCounts: Record<LessonStatus, number> = { active: 0, promoted: 0, obsolete: 0 };
  const categoryCounts: Record<string, number> = {};
  for (const entry of all) {
    if (entry.status in statusCounts) {
      statusCounts[entry.status] += 1;
    }
    categoryCounts[entry.category] = (categoryCounts[entry.category] ?? 0) + 1;
  }

  const lessons = visible
    .sort((left, right) => {
      const byRecurrence = right.occurrences - left.occurrences;
      return byRecurrence !== 0 ? byRecurrence : compareLessons(left, right);
    })
    .map(stripCreatedAt);

  const sortedCategoryCounts: Record<string, number> = {};
  for (const key of Object.keys(categoryCounts).sort()) {
    sortedCategoryCounts[key] = categoryCounts[key]!;
  }

  return {
    valid: true,
    lessonCount: all.length,
    statusCounts,
    categoryCounts: sortedCategoryCounts,
    lessons,
    diagnostics: [],
  };
}

/** Validates one lesson (when lessonId is provided) or every lesson plus the lessons index. */
export function validateLessons(rootDir: string, lessonId?: string): ValidateLessonsResult {
  const diagnostics: ValidationDiagnostic[] = [];
  let checkedCount = 0;

  const targetFiles = lessonId ? [lessonFilePath(rootDir, lessonId)] : listLessonFiles(rootDir);
  for (const filePath of targetFiles) {
    if (!existsSync(filePath)) {
      diagnostics.push(makeDiagnostic(rootDir, `lesson '${lessonId}' not found`, "$.lesson.id"));
      continue;
    }
    const artifact = parseYamlFile<unknown>(filePath);
    diagnostics.push(...validateLessonArtifact(rootDir, artifact, filePath));
    checkedCount += 1;
  }

  if (!lessonId) {
    const indexPath = lessonsIndexPath(rootDir);
    if (existsSync(indexPath)) {
      const indexSchema = loadBundledSchemaBySchemaId(LESSONS_INDEX_SCHEMA_ID);
      const indexArtifact = parseYamlFile<unknown>(indexPath);
      diagnostics.push(...validateArtifact(indexSchema, indexArtifact, repoRelative(rootDir, indexPath)).diagnostics);
    }
  }

  return { valid: diagnostics.length === 0, checkedCount, diagnostics };
}

/**
 * Edits a lesson's narrative fields, appends a recurrence, or promotes it. The lesson id, category,
 * created_at, and recorded occurrences are never rewritten — a recurrence appends so the occurrence
 * count stays an honest record of how often the condition was actually hit.
 */
export function editLesson(rootDir: string, input: EditLessonInput): EditLessonResult {
  const filePath = lessonFilePath(rootDir, input.lessonId);
  if (!existsSync(filePath)) {
    return {
      valid: false,
      edited: false,
      lessonId: input.lessonId,
      path: null,
      lesson: null,
      diagnostics: [makeDiagnostic(rootDir, `lesson '${input.lessonId}' not found`, "$.lesson.id")],
    };
  }

  const artifact = parseYamlFile<LessonArtifact>(filePath);
  if (artifact.status === "obsolete") {
    return {
      valid: false,
      edited: false,
      lessonId: input.lessonId,
      path: null,
      lesson: null,
      diagnostics: [
        makeDiagnostic(rootDir, `lesson '${input.lessonId}' is obsolete and cannot be edited`, "$.status", filePath),
      ],
    };
  }

  if (input.title !== undefined) {
    artifact.lesson.title = input.title;
  }
  if (input.context !== undefined) {
    artifact.context = input.context;
  }
  if (input.observation !== undefined) {
    artifact.observation = input.observation;
  }
  if (input.takeaway !== undefined) {
    artifact.takeaway = input.takeaway;
  }
  if (input.appliesWhen !== undefined) {
    artifact.applies_when = input.appliesWhen;
  }
  if (input.occurrence !== undefined) {
    artifact.occurrences = [...(artifact.occurrences ?? []), { ...input.occurrence }];
  }
  if (input.promotedTo !== undefined) {
    artifact.status = "promoted";
    artifact.promoted_to = { ...input.promotedTo };
  }
  artifact.updated_at = new Date().toISOString();

  const validationDiagnostics = validateLessonArtifact(rootDir, artifact, filePath);
  if (validationDiagnostics.length > 0) {
    return { valid: false, edited: false, lessonId: input.lessonId, path: null, lesson: null, diagnostics: validationDiagnostics };
  }

  mkdirSync(lessonsDir(rootDir), { recursive: true });
  writeFileSync(filePath, stringifyYamlDocument(artifact), "utf8");
  rebuildLessonsIndex(rootDir);
  return { valid: true, edited: true, lessonId: input.lessonId, path: repoRelative(rootDir, filePath), lesson: artifact, diagnostics: [] };
}

/**
 * Retires a lesson by recording obsolete status with a mandatory reason. The file is never deleted:
 * a lesson retired because its root cause turned out to be wrong is higher-order experience, and
 * discarding it would hand the same reasoning trap back to the next person.
 */
export function obsoleteLesson(rootDir: string, lessonId: string, reason: string): ObsoleteLessonResult {
  if (!reason || reason.trim().length === 0) {
    return {
      valid: false,
      obsoleted: false,
      lessonId,
      path: null,
      lesson: null,
      diagnostics: [makeDiagnostic(rootDir, "obsoleting a lesson requires a reason explaining why it no longer holds", "$.obsoleted_reason")],
    };
  }

  const filePath = lessonFilePath(rootDir, lessonId);
  if (!existsSync(filePath)) {
    return {
      valid: false,
      obsoleted: false,
      lessonId,
      path: null,
      lesson: null,
      diagnostics: [makeDiagnostic(rootDir, `lesson '${lessonId}' not found`, "$.lesson.id")],
    };
  }

  const artifact = parseYamlFile<LessonArtifact>(filePath);
  if (artifact.status === "obsolete") {
    return { valid: true, obsoleted: false, lessonId, path: repoRelative(rootDir, filePath), lesson: artifact, diagnostics: [] };
  }

  artifact.status = "obsolete";
  artifact.obsoleted_reason = reason;
  artifact.obsoleted_at = new Date().toISOString();
  artifact.updated_at = artifact.obsoleted_at;
  // A promoted lesson that is later disproven drops its rule link, because the promoted_to
  // reference asserts a rule the lesson still stands behind.
  delete artifact.promoted_to;

  const validationDiagnostics = validateLessonArtifact(rootDir, artifact, filePath);
  if (validationDiagnostics.length > 0) {
    return { valid: false, obsoleted: false, lessonId, path: null, lesson: null, diagnostics: validationDiagnostics };
  }

  writeFileSync(filePath, stringifyYamlDocument(artifact), "utf8");
  rebuildLessonsIndex(rootDir);
  return { valid: true, obsoleted: true, lessonId, path: repoRelative(rootDir, filePath), lesson: artifact, diagnostics: [] };
}

export { LESSONS_DIR, LESSONS_INDEX_PATH, LESSON_SCHEMA_ID, LESSONS_INDEX_SCHEMA_ID };
