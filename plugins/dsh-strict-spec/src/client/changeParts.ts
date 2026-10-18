/**
 * The change view-model mappers: turn one parsed change proposal, design,
 * task list, or question list into the presentation structure its dedicated
 * renderer draws, keeping the mapping React-free so rendered structure is
 * deterministically testable under bun test/run.ts.
 *
 * Every mapper follows the same unknown-field contract the milestone's
 * unknown-field-display answer settles: the scalar header renders exactly
 * as the generic view draws it, the dedicated body presents the declared
 * fields the layout knows, and every top-level field the layout does not
 * present survives as generic blocks an additional-fields section renders,
 * so a newer schema version never makes content disappear from the reader.
 */
import { documentParts } from "./documentParts.ts";
import type { DocumentBlock } from "./documentParts.ts";
import { taskCompletion } from "../model/taskCompletion.ts";
import type { TaskCompletion } from "../model/taskCompletion.ts";

/** One scalar header fact, rendered exactly as the generic header draws it. */
export interface HeaderFact {
  readonly key: string;
  readonly text: string;
}

/** The shared shape every dedicated change view model returns. */
export interface DedicatedView<B> {
  /** Top-level scalar fields, rendered as the view's facts header. */
  readonly header: readonly HeaderFact[];
  /** The declared fields the dedicated layout presents. */
  readonly body: B;
  /** Generic blocks of every top-level field the layout does not present. */
  readonly additional: readonly DocumentBlock[];
}

/** Reads one non-empty string field of a record, when it is one. */
function stringField(record: unknown, key: string): string | undefined {
  if (typeof record === "object" && record !== null && key in record) {
    const value = (record as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

/** Reads the single keyed child of a record, when the key holds it. */
function soleValue(record: unknown, key: string): unknown {
  if (typeof record === "object" && record !== null && key in record) {
    return (record as Record<string, unknown>)[key];
  }
  return undefined;
}

/** Collects the string entries of one sequence value, skipping non-strings. */
function stringEntries(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

/**
 * Partitions one parsed document for a dedicated renderer: the scalar header
 * renders as the generic view draws it, and the additional blocks carry every
 * top-level block field the dedicated layout does not present, derived from
 * the same generic mapper so the two presentations can never disagree about
 * how a YAML shape renders.
 */
function partitionDocument(data: unknown, knownKeys: ReadonlySet<string>): { header: HeaderFact[]; additional: DocumentBlock[] } {
  const parts = documentParts(data);
  return {
    header: [...parts.header],
    additional: parts.blocks.filter((block) => !knownKeys.has(block.title)),
  };
}

/** The proposal view body: identity, motivation, scope, and roadmap link. */
export interface ProposalBody {
  readonly change?: { readonly id?: string; readonly status?: string };
  readonly what: readonly string[];
  readonly why: readonly string[];
  readonly in: readonly string[];
  readonly out: readonly string[];
  readonly unchanged: readonly string[];
  readonly roadmap?: { readonly milestone?: string; readonly plannedChange?: string };
}

/** The top-level keys the proposal layout presents. */
const PROPOSAL_KEYS: ReadonlySet<string> = new Set([
  "schema", "schema_version", "artifact_type", "schema_file",
  "change", "summary", "scope", "unchanged_behavior", "roadmap",
]);

/** Maps one parsed change proposal onto the proposal view's presentation. */
export function proposalView(data: unknown): DedicatedView<ProposalBody> {
  const change = soleValue(data, "change");
  const summary = soleValue(data, "summary");
  const scope = soleValue(data, "scope");
  const roadmap = soleValue(data, "roadmap");
  const body: ProposalBody = {
    change: change === undefined
      ? undefined
      : { id: stringField(change, "id"), status: stringField(change, "status") },
    what: stringEntries(soleValue(summary, "what")),
    why: stringEntries(soleValue(summary, "why")),
    in: stringEntries(soleValue(scope, "in")),
    out: stringEntries(soleValue(scope, "out")),
    unchanged: stringEntries(soleValue(data, "unchanged_behavior")),
    roadmap: roadmap === undefined
      ? undefined
      : {
        milestone: stringField(roadmap, "milestone"),
        plannedChange: stringField(roadmap, "planned_change"),
      },
  };
  return { ...partitionDocument(data, PROPOSAL_KEYS), body };
}

/** One design decision: its id, decided text, and rationale. */
export interface DesignDecision {
  readonly id: string;
  readonly text: string;
  readonly rationale: string;
}

/** One rejected alternative: the option and the reason it lost. */
export interface DesignAlternative {
  readonly option: string;
  readonly reason: string;
}

/** The design view body: approach, decisions, alternatives, and risks. */
export interface DesignBody {
  readonly approach: readonly string[];
  readonly decisions: readonly DesignDecision[];
  readonly alternatives: readonly DesignAlternative[];
  readonly risks: readonly string[];
}

/** The top-level keys the design layout presents. */
const DESIGN_KEYS: ReadonlySet<string> = new Set([
  "schema", "schema_version", "artifact_type", "schema_file",
  "change", "approach", "decisions", "alternatives", "risks",
]);

/** Maps one parsed change design onto the design view's presentation. */
export function designView(data: unknown): DedicatedView<DesignBody> {
  const decisionsSource = soleValue(data, "decisions");
  const decisions: DesignDecision[] = [];
  if (typeof decisionsSource === "object" && decisionsSource !== null) {
    for (const [id, entry] of Object.entries(decisionsSource as Record<string, unknown>)) {
      const text = stringField(entry, "decision");
      const rationale = stringField(entry, "rationale");
      if (text !== undefined && rationale !== undefined) {
        decisions.push({ id, text, rationale });
      }
    }
  }
  const alternativesSource = soleValue(data, "alternatives");
  const alternatives: DesignAlternative[] = [];
  if (Array.isArray(alternativesSource)) {
    for (const entry of alternativesSource) {
      const option = stringField(entry, "option");
      const reason = stringField(entry, "reason");
      if (option !== undefined && reason !== undefined) {
        alternatives.push({ option, reason });
      }
    }
  }
  const body: DesignBody = {
    approach: stringEntries(soleValue(data, "approach")),
    decisions,
    alternatives,
    risks: stringEntries(soleValue(data, "risks")),
  };
  return { ...partitionDocument(data, DESIGN_KEYS), body };
}

/** One task of a task list: its id, text, marker, and recorded command. */
export interface TaskEntry {
  readonly id: string;
  readonly text: string;
  readonly done: boolean;
  readonly command?: string;
}

/** One declared section of a task list, with its completion count. */
export interface TaskSection {
  readonly id: string;
  readonly tasks: readonly TaskEntry[];
  readonly completion: TaskCompletion;
}

/** The tasks view body: sections with per-task markers and completion. */
export interface TasksBody {
  readonly sections: readonly TaskSection[];
  readonly overall: TaskCompletion | undefined;
  readonly gates?: { readonly validationTask?: string; readonly unitTestTask?: string };
}

/** The top-level keys the tasks layout presents. */
const TASKS_KEYS: ReadonlySet<string> = new Set([
  "schema", "schema_version", "artifact_type", "schema_file",
  "change", "sections", "testing_gates",
]);

/** Maps one parsed task list onto the tasks view's presentation. */
export function tasksView(data: unknown): DedicatedView<TasksBody> {
  const sectionsSource = soleValue(data, "sections");
  const sections: TaskSection[] = [];
  if (typeof sectionsSource === "object" && sectionsSource !== null) {
    for (const [sectionId, tasksSource] of Object.entries(sectionsSource as Record<string, unknown>)) {
      const tasks: TaskEntry[] = [];
      if (typeof tasksSource === "object" && tasksSource !== null) {
        for (const [id, entry] of Object.entries(tasksSource as Record<string, unknown>)) {
          const text = stringField(entry, "text");
          if (text === undefined) {
            continue;
          }
          tasks.push({
            id,
            text,
            done: stringField(entry, "status") === "complete",
            command: stringField(entry, "command"),
          });
        }
      }
      if (tasks.length === 0) {
        continue;
      }
      const done = tasks.filter((task) => task.done).length;
      sections.push({ id: sectionId, tasks, completion: { done, total: tasks.length } });
    }
  }
  const gatesSource = soleValue(data, "testing_gates");
  const gates = gatesSource === undefined
    ? undefined
    : {
      validationTask: stringField(gatesSource, "validation_task"),
      unitTestTask: stringField(gatesSource, "unit_test_task"),
    };
  const overall = taskCompletion(data);
  return { ...partitionDocument(data, TASKS_KEYS), body: { sections, overall, gates } };
}

/** One question entry: its id, question text, and why it is asked. */
export interface QuestionEntry {
  readonly id: string;
  readonly question: string;
  readonly context?: string;
}

/** The questions view body: open questions separated from resolved ones. */
export interface QuestionsBody {
  readonly open: readonly QuestionEntry[];
  readonly resolved: readonly (QuestionEntry & { readonly answer?: string })[];
}

/** The top-level keys the questions layout presents. */
const QUESTIONS_KEYS: ReadonlySet<string> = new Set([
  "schema", "schema_version", "artifact_type", "schema_file",
  "change", "open", "resolved",
]);

/** Reads one declared question entry of an open or resolved list. */
function questionEntry(id: string, entry: unknown): QuestionEntry | undefined {
  const question = stringField(entry, "question");
  if (question === undefined) {
    return undefined;
  }
  return { id, question, context: stringField(entry, "context") };
}

/** Maps one parsed question list onto the questions view's presentation. */
export function questionsView(data: unknown): DedicatedView<QuestionsBody> {
  const openSource = soleValue(data, "open");
  const open: QuestionEntry[] = [];
  if (Array.isArray(openSource)) {
    for (const entry of openSource) {
      const id = stringField(entry, "id");
      const mapped = id === undefined ? undefined : questionEntry(id, entry);
      if (mapped !== undefined) {
        open.push(mapped);
      }
    }
  }
  const resolvedSource = soleValue(data, "resolved");
  const resolved: (QuestionEntry & { readonly answer?: string })[] = [];
  if (Array.isArray(resolvedSource)) {
    for (const entry of resolvedSource) {
      const id = stringField(entry, "id");
      const mapped = id === undefined ? undefined : questionEntry(id, entry);
      if (mapped !== undefined) {
        resolved.push({ ...mapped, answer: stringField(entry, "answer") });
      }
    }
  }
  return { ...partitionDocument(data, QUESTIONS_KEYS), body: { open, resolved } };
}
