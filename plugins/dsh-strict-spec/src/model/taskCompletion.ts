/**
 * The task completion counter: the one computed summary the viewer shows.
 *
 * Counting lives in the model layer because two consumers need the same
 * number: the tree badges each non-archived change group with it, and the
 * dedicated tasks view presents it per section and overall. The count
 * derives from declared task statuses only — `complete` against all tasks
 * across every section — so it summarizes what the file writes and never
 * invents a status, and a tasks file with no sections yields no count at
 * all rather than a zero badge.
 */

/** One string field of a record, when it is a non-empty string. */
function stringField(record: unknown, key: string): string | undefined {
  if (typeof record === "object" && record !== null && key in record) {
    const value = (record as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

/** The completed-over-total count of one parsed task-list document. */
export interface TaskCompletion {
  /** Tasks whose declared status is `complete`. */
  readonly done: number;
  /** Every declared task across all sections. */
  readonly total: number;
}

/**
 * Counts the declared task statuses of one parsed task-list document. A
 * document that declares no sections, or sections holding no tasks, yields
 * no completion rather than a zero-over-zero count, so a change without a
 * readable tasks file badges with nothing instead of a fabricated total.
 */
export function taskCompletion(data: unknown): TaskCompletion | undefined {
  if (typeof data !== "object" || data === null) {
    return undefined;
  }
  const sections = (data as Record<string, unknown>).sections;
  if (typeof sections !== "object" || sections === null) {
    return undefined;
  }
  let done = 0;
  let total = 0;
  for (const tasks of Object.values(sections as Record<string, unknown>)) {
    if (typeof tasks !== "object" || tasks === null) {
      continue;
    }
    for (const task of Object.values(tasks as Record<string, unknown>)) {
      if (typeof task !== "object" || task === null) {
        continue;
      }
      total += 1;
      if (stringField(task, "status") === "complete") {
        done += 1;
      }
    }
  }
  return total === 0 ? undefined : { done, total };
}

/** The workspace directory holding one workspace-relative file path. */
export function parentDirectory(filePath: string): string {
  const slash = filePath.lastIndexOf("/");
  return slash === -1 ? "" : filePath.slice(0, slash);
}
