/**
 * The label deriver: turns one parsed strict document into the display label
 * its tree node carries.
 *
 * Non-archived documents are labeled from their declared artifact fields —
 * milestone titles, change names, spec titles, scene names, and lesson titles
 * — with the file name as the fallback when no declaring field is available.
 * Archived entries are labeled from their directory or file names alone, so
 * an archive can be listed without reading its files: the label function
 * never receives archived content and cannot read it.
 */

/** Reads one string field of a record, when it is a non-empty string. */
function stringField(record: unknown, key: string): string | undefined {
  if (typeof record === "object" && record !== null && key in record) {
    const value = (record as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

/** Reads the single keyed child of a record, when exactly one key holds it. */
function soleValue(record: unknown, key: string): unknown {
  if (typeof record === "object" && record !== null && key in record) {
    return (record as Record<string, unknown>)[key];
  }
  return undefined;
}

/** The file-name fallback: the basename of the workspace path. */
export function filenameLabel(workspacePath: string): string {
  const parts = workspacePath.split("/");
  return parts[parts.length - 1] || workspacePath;
}

/**
 * Derives the display label of one non-archived document from its parsed
 * data and declared artifact_type, falling back to the file name when the
 * type is unknown or declares no identifying field.
 */
export function deriveDocumentLabel(workspacePath: string, data: unknown, artifactType?: string): string {
  switch (artifactType) {
    case "roadmap_milestone": {
      // A milestone file declares one keyed milestone whose title labels it.
      const milestone = soleValue(data, "milestone");
      if (typeof milestone === "object" && milestone !== null) {
        const keyed = milestone as Record<string, unknown>;
        const ids = Object.keys(keyed);
        if (ids.length === 1) {
          const title = stringField(keyed[ids[0]], "title");
          if (title !== undefined) {
            return title;
          }
        }
      }
      return filenameLabel(workspacePath);
    }
    case "planned_change":
      return stringField(soleValue(data, "planned_change"), "id") ?? filenameLabel(workspacePath);
    case "change_proposal":
      return stringField(soleValue(data, "change"), "id") ?? filenameLabel(workspacePath);
    case "main_spec":
      return stringField(soleValue(data, "spec"), "title") ?? filenameLabel(workspacePath);
    case "scene":
      return stringField(soleValue(data, "scene"), "title") ?? filenameLabel(workspacePath);
    case "lesson":
      return stringField(soleValue(data, "lesson"), "title") ?? filenameLabel(workspacePath);
    case "main_tech":
      return stringField(soleValue(data, "standard"), "title") ?? filenameLabel(workspacePath);
    case "architecture":
      return stringField(soleValue(data, "architecture"), "title") ?? filenameLabel(workspacePath);
    case "design_system":
      return stringField(soleValue(data, "design_system"), "title") ?? filenameLabel(workspacePath);
    default:
      // Unknown artifact types and index or workflow files declare no
      // identifying field; the file name is the label.
      return filenameLabel(workspacePath);
  }
}

/**
 * Derives the declared status of one non-archived document for the tree's
 * status badges: only milestones and planned changes declare a status the
 * viewer badges, and every other artifact type yields no status. The value
 * is the declared field exactly as written — never a derived roadmap state.
 * Both schemas declare status as a top-level required field, so the reader
 * reads exactly that position.
 */
export function deriveDocumentStatus(data: unknown, artifactType?: string): string | undefined {
  switch (artifactType) {
    case "roadmap_milestone":
    case "planned_change":
      return stringField(data, "status");
    default:
      return undefined;
  }
}

/**
 * The cross-document identity facts one non-archived roadmap document
 * declares, read by the same content pass that derives labels and statuses:
 * a milestone's keyed id and declared order, and a planned change's declared
 * id and owning milestone. Every fact is a declared field exactly as
 * written; the roadmap views resolve navigation and ownership from them.
 */
export interface RoadmapFacts {
  /** The milestone's keyed id, when exactly one keyed milestone declares it. */
  readonly milestoneId?: string;
  /** The milestone's declared order value, when it declares a number. */
  readonly milestoneOrder?: number;
  /** The planned change's declared id. */
  readonly plannedChangeId?: string;
  /** The planned change's declared owning milestone id. */
  readonly plannedChangeMilestone?: string;
}

/** Reads one numeric field of a record, when it is a finite number. */
function numberField(record: unknown, key: string): number | undefined {
  if (typeof record === "object" && record !== null && key in record) {
    const value = (record as Record<string, unknown>)[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

/**
 * Derives the roadmap identity facts of one parsed document: a roadmap
 * milestone yields its keyed id and order value, a planned change yields
 * its id and owning milestone, and every other artifact type yields none.
 */
export function deriveRoadmapFacts(data: unknown, artifactType?: string): RoadmapFacts {
  switch (artifactType) {
    case "roadmap_milestone": {
      const milestone = soleValue(data, "milestone");
      if (typeof milestone === "object" && milestone !== null) {
        const keyed = milestone as Record<string, unknown>;
        const ids = Object.keys(keyed);
        if (ids.length === 1) {
          return { milestoneId: ids[0], milestoneOrder: numberField(data, "order") };
        }
      }
      return {};
    }
    case "planned_change":
      return {
        plannedChangeId: stringField(soleValue(data, "planned_change"), "id"),
        plannedChangeMilestone: stringField(soleValue(data, "planned_change"), "milestone"),
      };
    default:
      return {};
  }
}
