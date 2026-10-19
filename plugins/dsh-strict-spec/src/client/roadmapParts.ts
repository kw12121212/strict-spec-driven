/**
 * The roadmap view-model mappers: turn one parsed roadmap index, roadmap
 * milestone, or planned change into the presentation structure its dedicated
 * renderer draws, keeping the mapping React-free so rendered structure is
 * deterministically testable under bun test/run.ts.
 *
 * Every mapper follows the same unknown-field contract the milestone's
 * unknown-field-display answer settles: the scalar header renders exactly
 * as the generic view draws it, the dedicated body presents the declared
 * fields the layout knows, and every top-level field the layout does not
 * present survives as generic blocks an additional-fields section renders.
 * A milestone's legacy inline `planned_changes` mapping and a planned
 * change's `team` mapping are deliberately not presented by the dedicated
 * layouts — the owned-planned-changes listing comes from the planned-change
 * files' declared milestone field — so both stay visible through the
 * additional-fields append.
 *
 * The module also owns the navigation mapping the roadmap views share:
 * resolving a planned-change id against the tree's documents record and
 * ordering index milestones by the order values their milestone files
 * declare, both pure functions over passed-in state, so navigation and
 * ordering are assertable without a host.
 */
import { partitionDocument, soleValue, stringEntries, stringField } from "./recordFields.ts";
import type { DedicatedView } from "./changeParts.ts";
import type { ViewerActions } from "../model/store.ts";
import type { DocumentRecord } from "../model/nodes.ts";

/** Whether one parsed value is a mapping record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One milestone entry of a roadmap index, as the index file declares it. */
export interface RoadmapIndexEntry {
  /** The milestone id the index records the entry under. */
  readonly id: string;
  /** The declared title, when the entry carries one. */
  readonly title?: string;
  /** The declared milestone file path, when the entry carries one. */
  readonly path?: string;
  /** The declared status, when the entry carries one. */
  readonly status?: string;
  /** The order value the milestone file declares, attached from tree state. */
  readonly order?: number;
}

/** The roadmap index view body: the declared milestone entries. */
export interface RoadmapIndexBody {
  readonly milestones: readonly RoadmapIndexEntry[];
}

/** The top-level keys the roadmap index layout presents. */
const INDEX_KEYS: ReadonlySet<string> = new Set([
  "schema", "schema_version", "artifact_type", "schema_file", "milestones",
]);

/** Maps one parsed roadmap index onto the index view's presentation. */
export function roadmapIndexView(data: unknown): DedicatedView<RoadmapIndexBody> {
  const milestonesSource = soleValue(data, "milestones");
  const milestones: RoadmapIndexEntry[] = [];
  if (isRecord(milestonesSource)) {
    for (const [id, entry] of Object.entries(milestonesSource)) {
      milestones.push({
        id,
        title: stringField(entry, "title"),
        path: stringField(entry, "path"),
        status: stringField(entry, "status"),
      });
    }
  }
  return { ...partitionDocument(data, INDEX_KEYS), body: { milestones } };
}

/**
 * Orders roadmap index entries by the order values their milestone files
 * declare, as the tree's documents record carries them: entries with a
 * recorded order sort by that value, entries without one keep their
 * declaration order after them, and the input is never reordered otherwise.
 */
export function orderedIndexMilestones(
  entries: readonly RoadmapIndexEntry[],
  documents: Readonly<Record<string, DocumentRecord>>,
): readonly RoadmapIndexEntry[] {
  const orderByMilestoneId = new Map<string, number>();
  for (const record of Object.values(documents)) {
    if (record.milestoneId !== undefined && record.milestoneOrder !== undefined) {
      orderByMilestoneId.set(record.milestoneId, record.milestoneOrder);
    }
  }
  return entries
    .map((entry, index) => ({ entry, index, order: orderByMilestoneId.get(entry.id) }))
    .sort((left, right) => {
      if (left.order !== undefined && right.order !== undefined && left.order !== right.order) {
        return left.order - right.order;
      }
      if (left.order !== undefined && right.order === undefined) {
        return -1;
      }
      if (left.order === undefined && right.order !== undefined) {
        return 1;
      }
      return left.index - right.index;
    })
    .map((ranked) => ({ ...ranked.entry, order: ranked.order }));
}

/** One intake question card of a milestone: every declared field it may carry. */
export interface MilestoneIntakeQuestion {
  readonly id: string;
  readonly question: string;
  readonly context?: string;
  readonly impact?: string;
  readonly recommendation?: string;
}

/** The milestone view body: identity and every declared planning group. */
export interface MilestoneBody {
  /** The single keyed milestone's id and title, when one is declared. */
  readonly milestone?: { readonly id: string; readonly title?: string };
  /** The declared top-level status, badged beside the title. */
  readonly status?: string;
  readonly goal?: string;
  readonly in: readonly string[];
  readonly out: readonly string[];
  readonly doneCriteria: readonly string[];
  readonly dependencies: readonly string[];
  readonly risks: readonly string[];
  readonly notes: readonly string[];
  readonly details?: string;
  readonly intakeQuestions: readonly MilestoneIntakeQuestion[];
}

/** The top-level keys the milestone layout presents. */
const MILESTONE_KEYS: ReadonlySet<string> = new Set([
  "schema", "schema_version", "artifact_type", "schema_file", "milestone",
  "order", "goal", "scope", "done_criteria", "intake_questions",
  "dependencies", "risks", "status", "notes", "details",
]);

/** Maps one parsed roadmap milestone onto the milestone view's presentation. */
export function milestoneView(data: unknown): DedicatedView<MilestoneBody> {
  const milestoneSource = soleValue(data, "milestone");
  let milestone: MilestoneBody["milestone"];
  if (isRecord(milestoneSource)) {
    const ids = Object.keys(milestoneSource);
    if (ids.length === 1) {
      milestone = { id: ids[0], title: stringField(milestoneSource[ids[0]], "title") };
    }
  }
  const scope = soleValue(data, "scope");
  const questionsSource = soleValue(data, "intake_questions");
  const intakeQuestions: MilestoneIntakeQuestion[] = [];
  if (Array.isArray(questionsSource)) {
    for (const entry of questionsSource) {
      const id = stringField(entry, "id");
      const question = stringField(entry, "question");
      if (id === undefined || question === undefined) {
        continue;
      }
      intakeQuestions.push({
        id,
        question,
        context: stringField(entry, "context"),
        impact: stringField(entry, "impact"),
        recommendation: stringField(entry, "recommendation"),
      });
    }
  }
  const body: MilestoneBody = {
    milestone,
    status: stringField(data, "status"),
    goal: stringField(data, "goal"),
    in: stringEntries(soleValue(scope, "in")),
    out: stringEntries(soleValue(scope, "out")),
    doneCriteria: stringEntries(soleValue(data, "done_criteria")),
    dependencies: stringEntries(soleValue(data, "dependencies")),
    risks: stringEntries(soleValue(data, "risks")),
    notes: stringEntries(soleValue(data, "notes")),
    details: stringField(data, "details"),
    intakeQuestions,
  };
  return { ...partitionDocument(data, MILESTONE_KEYS), body };
}

/** One planned change owned by a milestone, as a listing row presents it. */
export interface OwnedPlannedChange {
  /** Workspace path of the planned-change file, used to open it. */
  readonly path: string;
  /** The declared planned-change id, when it was read. */
  readonly id?: string;
  /** The row's display label: the derived label or the file name. */
  readonly label: string;
  /** The declared status, when it was read. */
  readonly status?: string;
}

/**
 * Lists the non-archived planned changes a milestone owns: the documents
 * whose recorded owning milestone names it, in a stable path order.
 */
export function ownedPlannedChanges(
  documents: Readonly<Record<string, DocumentRecord>>,
  milestoneId: string,
): readonly OwnedPlannedChange[] {
  return Object.values(documents)
    .filter((record) =>
      !record.archived
      && record.family === "roadmap"
      && record.plannedChangeId !== undefined
      && record.plannedChangeMilestone === milestoneId)
    .map((record) => ({
      path: record.path,
      id: record.plannedChangeId,
      label: record.label,
      status: record.status,
    }))
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

/** The planned-change view body: identity and dependency entries. */
export interface PlannedChangeBody {
  readonly id?: string;
  readonly milestone?: string;
  readonly status?: string;
  readonly summary?: string;
  readonly details?: string;
  readonly dependsOn: readonly string[];
}

/** The top-level keys the planned-change layout presents. */
const PLANNED_CHANGE_KEYS: ReadonlySet<string> = new Set([
  "schema", "schema_version", "artifact_type", "schema_file", "planned_change",
  "status", "summary", "details", "depends_on",
]);

/** Maps one parsed planned change onto the planned-change view's presentation. */
export function plannedChangeView(data: unknown): DedicatedView<PlannedChangeBody> {
  const plannedChange = soleValue(data, "planned_change");
  return {
    ...partitionDocument(data, PLANNED_CHANGE_KEYS),
    body: {
      id: stringField(plannedChange, "id"),
      milestone: stringField(plannedChange, "milestone"),
      status: stringField(data, "status"),
      summary: stringField(data, "summary"),
      details: stringField(data, "details"),
      dependsOn: stringEntries(soleValue(data, "depends_on")),
    },
  };
}

/**
 * Resolves one planned-change id against the tree's documents record: the
 * non-archived planned-change document whose recorded id matches. Archived
 * files stay unread while they are only listed, so an archived target is
 * not resolvable from the loaded tree and reports as not found.
 */
export function resolvePlannedChangeTarget(
  documents: Readonly<Record<string, DocumentRecord>>,
  plannedChangeId: string,
): DocumentRecord | undefined {
  return Object.values(documents).find(
    (record) => !record.archived && record.plannedChangeId === plannedChangeId,
  );
}

/** The navigator the roadmap views use to open another roadmap document. */
export interface RoadmapNavigator {
  /**
   * Opens the planned change one depends_on entry names, when its target
   * resolves in the loaded tree; returns whether it opened.
   */
  openPlannedChange(plannedChangeId: string): boolean;
  /** Opens one workspace path directly, as an owned planned-change row does. */
  openPath(path: string): void;
}

/**
 * Creates the roadmap navigator over the shared viewer open action: the one
 * action a tree row uses, so a document opened from a rendered link behaves
 * exactly as one opened from the tree. The navigator reads only passed-in
 * state and touches no store, port, or tree mutation.
 */
export function createRoadmapNavigator(
  actions: Pick<ViewerActions, "openDocument">,
  sessionId: string,
  documents: Readonly<Record<string, DocumentRecord>>,
): RoadmapNavigator {
  return {
    openPlannedChange(plannedChangeId: string): boolean {
      const target = resolvePlannedChangeTarget(documents, plannedChangeId);
      if (target === undefined) {
        return false;
      }
      void actions.openDocument(sessionId, target.path);
      return true;
    },
    openPath(path: string): void {
      void actions.openDocument(sessionId, path);
    },
  };
}
