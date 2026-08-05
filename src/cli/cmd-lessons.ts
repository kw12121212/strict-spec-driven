import {
  createLesson,
  editLesson,
  getLessonStatus,
  listLessons,
  obsoleteLesson,
  showLesson,
  type CreateLessonInput,
  type EditLessonInput,
  type LessonOccurrence,
} from "../lessons.js";
import { handleHelpRequest } from "./argv.js";
import { getCommandUsage } from "./command-metadata.js";
import { writeJson, writeUsage } from "./output.js";

type FlagMap = Record<string, string[]>;

const BOOLEAN_FLAGS = new Set(["all"]);

function parseFlagMap(argv: string[]): FlagMap {
  const flags: FlagMap = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--") || token.length === 2) {
      throw new Error(`unexpected argument '${token}'`);
    }
    const name = token.slice(2);
    if (BOOLEAN_FLAGS.has(name)) {
      flags[name] ??= [];
      flags[name].push("true");
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`missing value for --${name}`);
    }
    flags[name] ??= [];
    flags[name].push(value);
    index += 1;
  }
  return flags;
}

function ensureAllowedFlags(flags: FlagMap, allowed: string[]): void {
  const allowedSet = new Set(allowed);
  const unsupported = Object.keys(flags).filter((flag) => !allowedSet.has(flag));
  if (unsupported.length > 0) {
    throw new Error(`unsupported argument(s): ${unsupported.map((flag) => `--${flag}`).join(", ")}`);
  }
}

function singleValue(flags: FlagMap, name: string): string | undefined {
  const values = flags[name];
  return values && values.length > 0 ? values[values.length - 1] : undefined;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const LESSON_CREATE_FLAGS = [
  "title",
  "category",
  "context",
  "observation",
  "takeaway",
  "applies-when",
  "origin",
  "evidence",
  "date",
];

export function runLessonCreate(argv: string[]): number {
  if (handleHelpRequest("lesson-create", argv)) {
    return 0;
  }

  let flags: FlagMap;
  try {
    flags = parseFlagMap(argv);
    ensureAllowedFlags(flags, LESSON_CREATE_FLAGS);
  } catch (error) {
    writeUsage(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  const required = ["title", "category", "context", "observation", "takeaway", "applies-when", "origin", "evidence"];
  const missing = required.filter((flag) => {
    const value = singleValue(flags, flag);
    return value === undefined || value.trim().length === 0;
  });
  if (missing.length > 0) {
    writeUsage(`Error: ${missing.map((flag) => `--${flag}`).join(", ")} ${missing.length === 1 ? "is" : "are"} required\n`);
    return 1;
  }

  const input: CreateLessonInput = {
    title: singleValue(flags, "title")!,
    category: singleValue(flags, "category")!,
    context: singleValue(flags, "context")!,
    observation: singleValue(flags, "observation")!,
    takeaway: singleValue(flags, "takeaway")!,
    appliesWhen: singleValue(flags, "applies-when")!,
    occurrence: {
      origin: singleValue(flags, "origin")!,
      date: singleValue(flags, "date") ?? today(),
      evidence: singleValue(flags, "evidence")!,
    },
  };

  const result = createLesson(process.cwd(), input);
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runLessonList(argv: string[]): number {
  if (handleHelpRequest("lesson-list", argv)) {
    return 0;
  }

  let flags: FlagMap;
  try {
    flags = parseFlagMap(argv);
    ensureAllowedFlags(flags, ["all", "category"]);
  } catch (error) {
    writeUsage(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  const result = listLessons(process.cwd(), {
    includeAll: "all" in flags,
    category: singleValue(flags, "category"),
  });
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runLessonStatus(argv: string[]): number {
  if (handleHelpRequest("lesson-status", argv)) {
    return 0;
  }

  let flags: FlagMap;
  try {
    flags = parseFlagMap(argv);
    ensureAllowedFlags(flags, ["all", "category"]);
  } catch (error) {
    writeUsage(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  const result = getLessonStatus(process.cwd(), {
    includeAll: "all" in flags,
    category: singleValue(flags, "category"),
  });
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runLessonShow(argv: string[]): number {
  if (handleHelpRequest("lesson-show", argv)) {
    return 0;
  }
  if (argv.length !== 1 || argv[0].startsWith("--")) {
    writeUsage(getCommandUsage("lesson-show"));
    return 1;
  }
  const result = showLesson(process.cwd(), argv[0]);
  writeJson(result);
  return result.valid ? 0 : 1;
}

const LESSON_EDIT_FLAGS = [
  "title",
  "context",
  "observation",
  "takeaway",
  "applies-when",
  "origin",
  "evidence",
  "date",
  "promoted-standard",
  "promoted-rule",
];

export function runLessonEdit(argv: string[]): number {
  if (handleHelpRequest("lesson-edit", argv)) {
    return 0;
  }
  if (argv.length === 0 || argv[0].startsWith("--")) {
    writeUsage(getCommandUsage("lesson-edit"));
    return 1;
  }
  const lessonId = argv[0];

  let flags: FlagMap;
  try {
    flags = parseFlagMap(argv.slice(1));
    ensureAllowedFlags(flags, LESSON_EDIT_FLAGS);
  } catch (error) {
    writeUsage(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  if (Object.keys(flags).length === 0) {
    writeUsage("Error: lesson-edit requires at least one editable field, an occurrence, or a promotion\n");
    return 1;
  }
  for (const flag of ["title", "context", "observation", "takeaway", "applies-when"]) {
    const value = singleValue(flags, flag);
    if (value !== undefined && value.trim().length === 0) {
      writeUsage(`Error: --${flag} must not be blank\n`);
      return 1;
    }
  }

  const origin = singleValue(flags, "origin");
  const evidence = singleValue(flags, "evidence");
  if ((origin === undefined) !== (evidence === undefined)) {
    writeUsage("Error: recording an occurrence requires both --origin and --evidence\n");
    return 1;
  }

  const promotedStandard = singleValue(flags, "promoted-standard");
  const promotedRule = singleValue(flags, "promoted-rule");
  if ((promotedStandard === undefined) !== (promotedRule === undefined)) {
    writeUsage("Error: promoting a lesson requires both --promoted-standard and --promoted-rule\n");
    return 1;
  }

  const input: EditLessonInput = { lessonId };
  if ("title" in flags) input.title = singleValue(flags, "title");
  if ("context" in flags) input.context = singleValue(flags, "context");
  if ("observation" in flags) input.observation = singleValue(flags, "observation");
  if ("takeaway" in flags) input.takeaway = singleValue(flags, "takeaway");
  if ("applies-when" in flags) input.appliesWhen = singleValue(flags, "applies-when");
  if (origin !== undefined && evidence !== undefined) {
    const occurrence: LessonOccurrence = { origin, date: singleValue(flags, "date") ?? today(), evidence };
    input.occurrence = occurrence;
  }
  if (promotedStandard !== undefined && promotedRule !== undefined) {
    input.promotedTo = { standard: promotedStandard, rule: promotedRule };
  }

  const result = editLesson(process.cwd(), input);
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runLessonObsolete(argv: string[]): number {
  if (handleHelpRequest("lesson-obsolete", argv)) {
    return 0;
  }
  if (argv.length === 0 || argv[0].startsWith("--")) {
    writeUsage(getCommandUsage("lesson-obsolete"));
    return 1;
  }
  const lessonId = argv[0];

  let flags: FlagMap;
  try {
    flags = parseFlagMap(argv.slice(1));
    ensureAllowedFlags(flags, ["reason"]);
  } catch (error) {
    writeUsage(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  const reason = singleValue(flags, "reason");
  if (reason === undefined || reason.trim().length === 0) {
    writeUsage("Error: --reason is required; retiring a lesson must record why it no longer holds\n");
    return 1;
  }

  const result = obsoleteLesson(process.cwd(), lessonId, reason);
  writeJson(result);
  return result.valid ? 0 : 1;
}
