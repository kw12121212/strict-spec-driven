import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { cli, loadDistModule, TestContext, type YamlModule } from "../support/harness.js";

type LessonsModule = {
  deriveLessonId: (input: { title: string; category: string; appliesWhen: string }) => string;
  getLessonCategories: () => string[];
};

function makeWorkspace(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "strict-lessons-"));
  mkdirSync(path.join(root, ".strict-spec-driven", "lessons"), { recursive: true });
  return root;
}

function parseJson(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>;
}

function createArgs(title: string, extra: string[] = []): string[] {
  return [
    "lesson-create",
    "--title",
    title,
    "--category",
    "testing",
    "--context",
    "running the suite after a source edit",
    "--observation",
    "the suite passed while the edited behavior was absent because dist was stale",
    "--takeaway",
    "a dist-backed suite reports on the last build, not the working tree",
    "--applies-when",
    "interpreting a test run that executes compiled output after editing sources",
    "--origin",
    "some-change",
    "--evidence",
    "bun test/run.ts passed against stale compiled output",
    ...extra,
  ];
}

export async function runLessonsSuite(context: TestContext): Promise<void> {
  const lessonsModule = await loadDistModule<LessonsModule>("lessons.js");
  const yamlModule = await loadDistModule<YamlModule>("yaml.js");
  const yamlParse = (text: string): Record<string, unknown> => yamlModule.parseYamlDocument<Record<string, unknown>>(text);
  const lessonFilePath = (root: string, lessonId: string): string =>
    path.join(root, ".strict-spec-driven", "lessons", `${lessonId}.yaml`);
  const indexPath = (root: string): string => path.join(root, ".strict-spec-driven", "lessons", "INDEX.yaml");

  context.section("[lessons] conflict-resistant content-derived ids");

  const idA = lessonsModule.deriveLessonId({ title: "Rebuild before trusting dist tests", category: "testing", appliesWhen: "after editing sources" });
  const idAgain = lessonsModule.deriveLessonId({ title: "Rebuild before trusting dist tests", category: "testing", appliesWhen: "after editing sources" });
  const idOtherCondition = lessonsModule.deriveLessonId({ title: "Rebuild before trusting dist tests", category: "testing", appliesWhen: "a different condition" });
  context.assert(idA === idAgain, "lesson id is deterministic for identical content");
  context.assert(idA !== idOtherCondition, "lesson id changes when the applies_when condition changes");
  context.assert(/-[0-9a-f]{6}$/.test(idA), "lesson id carries a content-hash suffix rather than a sequential counter");
  context.assert(idA.startsWith("rebuild-before-trusting-dist-tests-"), "lesson id is derived from a slug of the title");

  context.assert(
    lessonsModule.getLessonCategories().includes("testing") && lessonsModule.getLessonCategories().includes("ui"),
    "lesson categories are sourced from the bundled schema enum",
  );

  context.section("[lessons] lesson-create");

  const createRoot = makeWorkspace();
  const created = parseJson(cli(createArgs("Rebuild before trusting dist tests"), { cwd: createRoot }).stdout);
  context.assert(created.valid === true && created.created === true, "lesson-create writes a new lesson");
  const lessonId = String(created.lessonId);
  const lessonDoc = yamlParse(readFileSync(lessonFilePath(createRoot, lessonId), "utf8"));
  context.assert(lessonDoc.status === "active", "a new lesson starts active");
  context.assert(Array.isArray(lessonDoc.occurrences) && (lessonDoc.occurrences as unknown[]).length === 1, "a new lesson records one occurrence");
  context.assert(lessonDoc.promoted_to === undefined, "a new lesson carries no promotion reference");
  context.assert(
    !("strength" in lessonDoc) && !("mapping" in lessonDoc),
    "a lesson carries no RFC 2119 strength and no enforcement mapping, keeping it distinct from a technical standard",
  );

  const indexDoc = yamlParse(readFileSync(indexPath(createRoot), "utf8"));
  const indexed = (indexDoc.lessons as Record<string, Record<string, unknown>>)[lessonId];
  context.assert(indexed !== undefined && indexed.occurrences === 1, "lesson-create maintains the lessons index with the occurrence count");

  const rerun = parseJson(cli(createArgs("Rebuild before trusting dist tests"), { cwd: createRoot }).stdout);
  context.assert(rerun.valid === true && rerun.created === false && rerun.lessonId === lessonId, "lesson-create is idempotent on identical content");

  const badCategory = cli(createArgs("Some other lesson", []).map((arg) => (arg === "testing" ? "not-a-category" : arg)), { cwd: createRoot });
  context.assert(badCategory.status !== 0, "lesson-create rejects an unknown category");
  context.assert(badCategory.stdout.includes("unknown lesson category"), "the unknown-category diagnostic names the offending category");

  const missingField = cli(["lesson-create", "--title", "Incomplete", "--category", "testing"], { cwd: createRoot });
  context.assert(missingField.status !== 0, "lesson-create rejects a missing required field");
  context.assert(missingField.stderr.includes("--context"), "the missing-field error names the absent argument");

  context.section("[lessons] lesson-list and lesson-status hide promoted and obsolete by default");

  const listRoot = makeWorkspace();
  const activeId = String(parseJson(cli(createArgs("Stays active"), { cwd: listRoot }).stdout).lessonId);
  const promotedId = String(parseJson(cli(createArgs("Gets promoted", ["--applies-when", "a promotable condition"]), { cwd: listRoot }).stdout).lessonId);
  const obsoleteId = String(parseJson(cli(createArgs("Gets retired", ["--applies-when", "a condition that disappears"]), { cwd: listRoot }).stdout).lessonId);

  cli(["lesson-edit", promotedId, "--promoted-standard", "typescript-esm-baseline", "--promoted-rule", "rebuild-after-source-edits"], { cwd: listRoot });
  cli(["lesson-obsolete", obsoleteId, "--reason", "the premise disappeared"], { cwd: listRoot });

  const defaultList = parseJson(cli(["lesson-list"], { cwd: listRoot }).stdout);
  const defaultIds = (defaultList.lessons as Array<{ id: string }>).map((entry) => entry.id);
  context.assert(defaultIds.length === 1 && defaultIds[0] === activeId, "lesson-list reports only active lessons by default");

  const allList = parseJson(cli(["lesson-list", "--all"], { cwd: listRoot }).stdout);
  const allIds = (allList.lessons as Array<{ id: string }>).map((entry) => entry.id);
  context.assert(
    allIds.includes(activeId) && allIds.includes(promotedId) && allIds.includes(obsoleteId),
    "lesson-list --all reports lessons in every status",
  );

  const defaultStatus = parseJson(cli(["lesson-status"], { cwd: listRoot }).stdout);
  context.assert(defaultStatus.lessonCount === 3, "lesson-status counts every lesson regardless of the default filter");
  context.assert(
    (defaultStatus.statusCounts as Record<string, number>).promoted === 1 &&
      (defaultStatus.statusCounts as Record<string, number>).obsolete === 1,
    "lesson-status reports counts per status",
  );
  context.assert((defaultStatus.lessons as unknown[]).length === 1, "lesson-status lists only active lessons by default");

  context.section("[lessons] lesson-status ranks by recurrence");

  const rankRoot = makeWorkspace();
  const onceId = String(parseJson(cli(createArgs("Hit once", ["--applies-when", "condition one"]), { cwd: rankRoot }).stdout).lessonId);
  const thriceId = String(parseJson(cli(createArgs("Hit three times", ["--applies-when", "condition two"]), { cwd: rankRoot }).stdout).lessonId);
  cli(["lesson-edit", thriceId, "--origin", "second-change", "--evidence", "hit again"], { cwd: rankRoot });
  cli(["lesson-edit", thriceId, "--origin", "third-change", "--evidence", "hit a third time"], { cwd: rankRoot });

  const ranked = parseJson(cli(["lesson-status"], { cwd: rankRoot }).stdout);
  const rankedEntries = ranked.lessons as Array<{ id: string; occurrences: number }>;
  context.assert(rankedEntries[0]?.id === thriceId && rankedEntries[0]?.occurrences === 3, "lesson-status puts the highest-recurrence lesson first");
  context.assert(rankedEntries[1]?.id === onceId, "lower-recurrence lessons follow");

  context.section("[lessons] lesson-edit appends recurrences without duplicating the lesson");

  const editRoot = makeWorkspace();
  const editId = String(parseJson(cli(createArgs("Recurring pitfall"), { cwd: editRoot }).stdout).lessonId);
  const beforeDoc = yamlParse(readFileSync(lessonFilePath(editRoot, editId), "utf8"));
  const firstOccurrence = (beforeDoc.occurrences as Array<Record<string, unknown>>)[0];

  const appended = parseJson(cli(["lesson-edit", editId, "--origin", "later-change", "--evidence", "same trap, second time"], { cwd: editRoot }).stdout);
  context.assert(appended.valid === true && appended.edited === true, "lesson-edit records a recurrence");
  const afterDoc = yamlParse(readFileSync(lessonFilePath(editRoot, editId), "utf8"));
  const occurrences = afterDoc.occurrences as Array<Record<string, unknown>>;
  context.assert(occurrences.length === 2, "the recurrence is appended to the existing lesson");
  context.assert(
    occurrences[0]?.origin === firstOccurrence?.origin && occurrences[0]?.evidence === firstOccurrence?.evidence,
    "the earlier occurrence is left unchanged",
  );
  context.assert(occurrences[1]?.origin === "later-change", "the new occurrence records its origin");
  context.assert(afterDoc.updated_at !== beforeDoc.updated_at, "recording a recurrence refreshes updated_at");

  const editIndex = yamlParse(readFileSync(indexPath(editRoot), "utf8"));
  context.assert(
    Object.keys(editIndex.lessons as Record<string, unknown>).length === 1,
    "recording a recurrence does not create a second lesson",
  );
  context.assert(
    (editIndex.lessons as Record<string, Record<string, unknown>>)[editId]?.occurrences === 2,
    "the index occurrence count follows the appended recurrence",
  );

  const unpairedOccurrence = cli(["lesson-edit", editId, "--origin", "no-evidence-change"], { cwd: editRoot });
  context.assert(unpairedOccurrence.status !== 0, "lesson-edit rejects an occurrence origin with no evidence");
  context.assert(unpairedOccurrence.stderr.includes("--evidence"), "the unpaired-occurrence error names the missing argument");

  context.section("[lessons] promotion keeps the motivating context and requires a rule reference");

  const promoteRoot = makeWorkspace();
  const promoteId = String(parseJson(cli(createArgs("Becomes a rule"), { cwd: promoteRoot }).stdout).lessonId);
  const preDoc = yamlParse(readFileSync(lessonFilePath(promoteRoot, promoteId), "utf8"));
  const promoted = parseJson(
    cli(["lesson-edit", promoteId, "--promoted-standard", "typescript-esm-baseline", "--promoted-rule", "rebuild-after-source-edits"], { cwd: promoteRoot }).stdout,
  );
  context.assert(promoted.valid === true, "lesson-edit promotes a lesson");
  const promotedDoc = yamlParse(readFileSync(lessonFilePath(promoteRoot, promoteId), "utf8"));
  context.assert(promotedDoc.status === "promoted", "the promoted lesson reports promoted status");
  const reference = promotedDoc.promoted_to as Record<string, unknown>;
  context.assert(
    reference?.standard === "typescript-esm-baseline" && reference?.rule === "rebuild-after-source-edits",
    "the promotion records the standard and rule the lesson became",
  );
  context.assert(
    promotedDoc.observation === preDoc.observation && promotedDoc.takeaway === preDoc.takeaway,
    "promotion preserves the original content, which is the failure the resulting rule omits",
  );
  context.assert(
    JSON.stringify(promotedDoc.occurrences) === JSON.stringify(preDoc.occurrences),
    "promotion preserves the recorded occurrences",
  );

  const unpairedPromotion = cli(["lesson-edit", promoteId, "--promoted-standard", "some-standard"], { cwd: promoteRoot });
  context.assert(unpairedPromotion.status !== 0, "promotion without a rule id is rejected");
  context.assert(unpairedPromotion.stderr.includes("--promoted-rule"), "the unpaired-promotion error names the missing argument");

  const promotedWithoutReference = { ...(promotedDoc as Record<string, unknown>) };
  delete promotedWithoutReference.promoted_to;
  const strayRoot = makeWorkspace();
  writeFileSync(lessonFilePath(strayRoot, promoteId), yamlModule.stringifyYamlDocument(promotedWithoutReference), "utf8");
  const strayShow = cli(["lesson-edit", promoteId, "--title", "Retitled"], { cwd: strayRoot });
  context.assert(strayShow.status !== 0, "a promoted lesson with no promoted_to reference fails validation");
  context.assert(strayShow.stdout.includes("promoted_to"), "the diagnostic names the missing promoted_to reference");

  context.section("[lessons] lesson-obsolete retires without deleting");

  const retireRoot = makeWorkspace();
  const retireId = String(parseJson(cli(createArgs("No longer true"), { cwd: retireRoot }).stdout).lessonId);
  const beforeRetire = yamlParse(readFileSync(lessonFilePath(retireRoot, retireId), "utf8"));

  const noReason = cli(["lesson-obsolete", retireId], { cwd: retireRoot });
  context.assert(noReason.status !== 0, "lesson-obsolete requires a reason");
  context.assert(noReason.stderr.includes("--reason"), "the missing-reason error names the required argument");
  context.assert(
    yamlParse(readFileSync(lessonFilePath(retireRoot, retireId), "utf8")).status === "active",
    "a rejected retirement leaves the lesson untouched",
  );

  const retired = parseJson(cli(["lesson-obsolete", retireId, "--reason", "the build step it warned about no longer exists"], { cwd: retireRoot }).stdout);
  context.assert(retired.valid === true && retired.obsoleted === true, "lesson-obsolete retires the lesson");
  context.assert(existsSync(lessonFilePath(retireRoot, retireId)), "the retired lesson file is never deleted");
  const retiredDoc = yamlParse(readFileSync(lessonFilePath(retireRoot, retireId), "utf8"));
  context.assert(retiredDoc.status === "obsolete", "the retired lesson reports obsolete status");
  context.assert(
    retiredDoc.obsoleted_reason === "the build step it warned about no longer exists",
    "the retirement records why the lesson no longer holds",
  );
  context.assert(typeof retiredDoc.obsoleted_at === "string", "the retirement records when it happened");
  context.assert(
    retiredDoc.observation === beforeRetire.observation && JSON.stringify(retiredDoc.occurrences) === JSON.stringify(beforeRetire.occurrences),
    "retirement preserves the original content and occurrences",
  );

  const retireAgain = parseJson(cli(["lesson-obsolete", retireId, "--reason", "a different reason"], { cwd: retireRoot }).stdout);
  context.assert(retireAgain.valid === true && retireAgain.obsoleted === false, "retiring an already-obsolete lesson is idempotent");
  context.assert(
    yamlParse(readFileSync(lessonFilePath(retireRoot, retireId), "utf8")).obsoleted_reason === "the build step it warned about no longer exists",
    "the original retirement reason is not overwritten",
  );

  const editRetired = cli(["lesson-edit", retireId, "--title", "Resurrected"], { cwd: retireRoot });
  context.assert(editRetired.status !== 0, "an obsolete lesson cannot be edited");

  context.section("[lessons] deterministic not-found errors");

  const missingRoot = makeWorkspace();
  const showMissing = cli(["lesson-show", "no-such-lesson"], { cwd: missingRoot });
  context.assert(showMissing.status !== 0 && showMissing.stdout.includes("not found"), "lesson-show reports an unknown lesson id");
  const editMissing = cli(["lesson-edit", "no-such-lesson", "--title", "x"], { cwd: missingRoot });
  context.assert(editMissing.status !== 0 && editMissing.stdout.includes("not found"), "lesson-edit reports an unknown lesson id");
  const obsoleteMissing = cli(["lesson-obsolete", "no-such-lesson", "--reason", "x"], { cwd: missingRoot });
  context.assert(obsoleteMissing.status !== 0 && obsoleteMissing.stdout.includes("not found"), "lesson-obsolete reports an unknown lesson id");

  context.section("[lessons] lesson-show reads a lesson in any status");

  const shown = parseJson(cli(["lesson-show", retireId], { cwd: retireRoot }).stdout);
  context.assert(shown.valid === true, "lesson-show succeeds for an obsolete lesson");
  const shownLesson = shown.lesson as Record<string, unknown>;
  context.assert(shownLesson.status === "obsolete", "the obsolete lesson stays reachable after leaving the default list");
  context.assert(Array.isArray(shownLesson.occurrences), "lesson-show includes the recorded occurrences");

  rmSync(createRoot, { recursive: true, force: true });
  rmSync(listRoot, { recursive: true, force: true });
  rmSync(rankRoot, { recursive: true, force: true });
  rmSync(editRoot, { recursive: true, force: true });
  rmSync(promoteRoot, { recursive: true, force: true });
  rmSync(strayRoot, { recursive: true, force: true });
  rmSync(retireRoot, { recursive: true, force: true });
  rmSync(missingRoot, { recursive: true, force: true });
}
