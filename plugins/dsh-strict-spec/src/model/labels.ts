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
