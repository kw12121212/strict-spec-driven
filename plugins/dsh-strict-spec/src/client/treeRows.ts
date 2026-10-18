/**
 * The tree row model: the React-free seam between the discovery stores and
 * the document tree component.
 *
 * Flattening turns the loaded node forest into the visible row list — a
 * group's children appear only while the group is loaded, which is the
 * store's open state, and archived groups stay deferred until expanded, so
 * their rows appear only after that expansion reads them. Each row carries
 * the presentation facts the component renders: depth for the one consistent
 * indentation step per level, a file-type glyph classification, the entry
 * count of a loaded group, and the declared status a milestone or planned
 * change badges. The keyboard model lives here too, so focus movement,
 * expansion, and activation are deterministic and testable without a host.
 */
import type { DocumentNode, FamilyId, NodeKind, TreeState } from "../model/nodes.ts";

/** One visible row of the document tree. */
export interface TreeRow {
  /** Stable row id: the node id, which is the workspace path or a marker id. */
  readonly id: string;
  /** What the row renders: a family root, a group, a document, or a truncation marker. */
  readonly kind: NodeKind;
  /** Nesting depth of the row: 0 for family roots, one more per entered group. */
  readonly depth: number;
  /** Display label derived from declared fields, with the filename fallback. */
  readonly label: string;
  /** Workspace-relative path of the entry; markers reuse their directory's. */
  readonly path: string;
  /** The family the row belongs to. */
  readonly family: FamilyId;
  /** Whether the entry lives inside an archive directory. */
  readonly archived: boolean;
  /** Entry count of a loaded group; absent while the group is deferred or collapsed. */
  readonly count?: number;
  /** Declared status badge of a milestone or planned-change document, as written in its file. */
  readonly status?: string;
  /** Whether a group row shows its children. */
  readonly open: boolean;
  /** Whether the row can expand and collapse. */
  readonly expandable: boolean;
  /** Whether the row is a document that can open in the document view. */
  readonly document: boolean;
}

/** Flattens one loaded node forest into the visible rows of the tree. */
export function flattenTreeRows(state: TreeState): TreeRow[] {
  if (state.status !== "ready") {
    return [];
  }
  const rows: TreeRow[] = [];
  const visit = (nodes: readonly DocumentNode[], depth: number): void => {
    for (const node of nodes) {
      if (node.kind === "truncation") {
        rows.push({
          id: node.id,
          kind: "truncation",
          depth,
          label: node.label,
          path: node.path,
          family: node.family,
          archived: node.archived,
          open: false,
          expandable: false,
          document: false,
        });
        continue;
      }
      const isGroup = node.kind === "family" || node.kind === "group";
      // The store's open state is loadedness: collapse unloads a group's
      // children and expansion reloads them, so children are visible exactly
      // while the group is loaded.
      const open = isGroup && node.loaded;
      const children = node.children ?? [];
      const count = isGroup && node.loaded
        ? children.filter((child) => child.kind !== "truncation").length
        : undefined;
      const record = state.documents[node.path];
      rows.push({
        id: node.id,
        kind: node.kind,
        depth,
        label: node.label,
        path: node.path,
        family: node.family,
        archived: node.archived,
        count,
        status: node.kind === "document" ? record?.status : undefined,
        open,
        expandable: isGroup,
        document: node.kind === "document",
      });
      if (open && children.length > 0) {
        visit(children, depth + 1);
      }
    }
  };
  visit(state.families, 0);
  return rows;
}

/** What one keyboard interaction on the focused row asks the viewer to do. */
export interface KeyOutcome {
  /** The row focus moves to; absent when focus stays. */
  readonly focusId?: string;
  /** The activation the focused row performs, when the key activates it. */
  readonly activation?: "expand" | "collapse" | "open";
}

/**
 * Resolves one keyboard interaction against the visible rows: ArrowUp and
 * ArrowDown move focus row by row, ArrowRight expands a collapsed group or
 * steps into an open one, ArrowLeft collapses an open group or steps out to
 * its parent, Home and End jump to the first and last row, and Enter or
 * Space toggles a group and opens a document.
 */
export function keyOutcomeFor(rows: readonly TreeRow[], focusedId: string | undefined, key: string): KeyOutcome | undefined {
  if (rows.length === 0) {
    return undefined;
  }
  const index = focusedId === undefined ? -1 : rows.findIndex((row) => row.id === focusedId);
  const focused = index >= 0 ? rows[index] : undefined;
  switch (key) {
    case "ArrowDown": {
      const next = rows[index + 1];
      return next === undefined ? undefined : { focusId: next.id };
    }
    case "ArrowUp": {
      const previous = rows[index - 1];
      return previous === undefined ? undefined : { focusId: previous.id };
    }
    case "Home": {
      const first = rows[0];
      return first === undefined ? undefined : { focusId: first.id };
    }
    case "End": {
      const last = rows[rows.length - 1];
      return last === undefined ? undefined : { focusId: last.id };
    }
    case "ArrowRight": {
      if (focused === undefined) {
        return undefined;
      }
      if (focused.expandable) {
        return focused.open
          ? { focusId: rows[index + 1]?.id }
          : { activation: "expand" };
      }
      return undefined;
    }
    case "ArrowLeft": {
      if (focused === undefined) {
        return undefined;
      }
      if (focused.expandable && focused.open) {
        return { activation: "collapse" };
      }
      // Stepping out lands on the nearest ancestor group above the row.
      for (let candidate = index - 1; candidate >= 0; candidate -= 1) {
        if (rows[candidate].expandable && rows[candidate].depth < focused.depth) {
          return { focusId: rows[candidate].id };
        }
      }
      return undefined;
    }
    case "Enter":
    case " ":
    case "Spacebar": {
      if (focused === undefined) {
        return undefined;
      }
      if (focused.expandable) {
        return { activation: focused.open ? "collapse" : "expand" };
      }
      if (focused.document) {
        return { activation: "open" };
      }
      return undefined;
    }
    default:
      return undefined;
  }
}
