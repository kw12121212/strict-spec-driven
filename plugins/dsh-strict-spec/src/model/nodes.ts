/**
 * The taxonomy and node model of the strict document tree.
 *
 * The families and their canonical locations under `.strict-spec-driven/`
 * restate the viewer contract's fixed order: config, architecture, roadmap,
 * changes, scenes, specs, tech, lessons, SOPs, and design system. A family
 * whose canonical locations are absent from the workspace is omitted rather
 * than shown as an empty group, and an archive directory renders as a
 * collapsed group whose entries are not read until the operator expands it.
 */
import type { TaskCompletion } from "./taskCompletion.ts";

export type { TaskCompletion };

/** The fixed strict artifact family order of the document tree. */
export const FAMILY_ORDER = [
  "config",
  "architecture",
  "roadmap",
  "changes",
  "scenes",
  "specs",
  "tech",
  "lessons",
  "sops",
  "design-system",
] as const;

/** One strict artifact family of the fixed order. */
export type FamilyId = (typeof FAMILY_ORDER)[number];

/** The root directory of the strict workflow inside the Session workspace. */
export const WORKFLOW_ROOT = ".strict-spec-driven";

/**
 * The canonical top-level locations each family populates from, as entries
 * relative to the workflow root: a file for the singleton families and a
 * directory for the grouped ones. The presence check reads one root listing
 * and matches these names against it.
 */
export const FAMILY_SOURCES: Readonly<Record<FamilyId, readonly string[]>> = {
  config: ["config.yaml"],
  architecture: ["architecture.yaml"],
  roadmap: ["roadmap"],
  changes: ["changes"],
  scenes: ["scenes"],
  specs: ["specs"],
  tech: ["tech"],
  lessons: ["lessons"],
  sops: ["sops"],
  "design-system": ["design-system.yaml"],
};

/** What one node of the document tree is. */
export type NodeKind =
  | "family"
  | "group"
  | "document"
  | "truncation";

/** One node of the document tree, as the model exposes it to stores. */
export interface DocumentNode {
  /** Stable node id: the workspace path for real entries, a synthetic id for markers. */
  readonly id: string;
  /** What the node is: a family root, a directory group, a document leaf, or a truncation marker. */
  readonly kind: NodeKind;
  /** Workspace-relative path of the entry; synthetic markers reuse their directory's. */
  readonly path: string;
  /** The family the node belongs to. */
  readonly family: FamilyId;
  /** Display label derived from declared fields, with filename fallback. */
  label: string;
  /** Whether the node's entry lives inside an archive directory. */
  readonly archived: boolean;
  /** Child nodes, present once a group has been loaded. */
  children?: DocumentNode[];
  /** Whether a group's entries have been read from the workspace. */
  loaded: boolean;
  /** Whether the truncated flag of the listing that produced this node's children was set. */
  truncated: boolean;
  /** Whether a live watch backs this node, when the coordinator reports one. */
  watch: WatchHealth;
}

/** The live-refresh health of one node, as the refresh coordinator reports it. */
export type WatchHealth =
  | "none"
  | "active"
  | "unsupported"
  | "failed";

/** The state of one loaded strict document, keyed by workspace path. */
export interface DocumentRecord {
  /** Workspace-relative path of the document. */
  readonly path: string;
  /** The family the document was classified into. */
  readonly family: FamilyId;
  /** Display label derived from declared fields, with filename fallback. */
  label: string;
  /** The declared artifact_type, when the document was read and declared one. */
  artifactType?: string;
  /** Whether the classifier knew the declared artifact_type; the unknown fallback still lists the file. */
  known: boolean;
  /**
   * The status a milestone or planned change declares in its file, read from
   * the same non-archived content pass that derives the label. Archived
   * entries stay unread, so they carry no status.
   */
  status?: string;
  /** Whether the document lives inside an archive directory. */
  readonly archived: boolean;
}

/** A parse error located by 1-based line and column. */
export interface LocatedParseError {
  readonly kind: "parse";
  /** Human-readable reason, as the parser reported it. */
  readonly message: string;
  /** 1-based line of the error's location. */
  readonly line: number;
  /** 1-based column of the error's location. */
  readonly column: number;
  /** The raw document text as read, so the error view can show it beside the located message. */
  readonly raw: string;
}

/** A read failure that is not a parse defect, classified by error code. */
export interface ReadError {
  readonly kind: "read";
  /** The workspace-files error code, or "unknown" when none was carried. */
  readonly code: string;
}

/** The outcome of loading one document: parsed data or a located failure. */
export type DocumentLoadResult =
  | { readonly ok: true; readonly data: unknown; readonly artifactType?: string }
  | { readonly ok: false; readonly error: LocatedParseError | ReadError };

/** The whole tree state one Session workspace yields, as stores expose it. */
export interface TreeState {
  /** `empty` when the workspace holds no workflow directory; `error` when the root listing failed otherwise. */
  readonly status: "empty" | "loading" | "ready" | "error";
  /** The root-listing error code when status is `error`. */
  readonly errorCode?: string;
  /** Whether the workflow root listing was cut short by the host entry cap, so the family set may be incomplete. */
  readonly rootTruncated?: boolean;
  /** Family root nodes in the fixed order, only the families present. */
  readonly families: readonly DocumentNode[];
  /** Every classified document keyed by workspace path. */
  readonly documents: Readonly<Record<string, DocumentRecord>>;
  /**
   * Task completion per non-archived change directory, keyed by the group
   * node's workspace path, counted from the declared statuses of the
   * change's tasks file. Present once the tree has been recomputed;
   * archived change directories never appear because their files stay
   * unread while they are only listed.
   */
  readonly changeCompletion?: Readonly<Record<string, TaskCompletion>>;
}

/** The state of the one document open in the view. */
export interface OpenDocumentState {
  /** `idle` when nothing is open; `absent` when a watch reported the open file gone. */
  readonly status: "idle" | "loading" | "ready" | "absent" | "error";
  /** Workspace-relative path of the open document. */
  readonly path?: string;
  /** Parsed document data when status is `ready`. */
  readonly data?: unknown;
  /** The located parse error or read error when status is `error`. */
  readonly error?: LocatedParseError | ReadError;
}

/** The initial, nothing-loaded tree state. */
export function initialTreeState(): TreeState {
  return { status: "loading", families: [], documents: {} };
}

/** The initial, nothing-open document state. */
export function initialOpenDocumentState(): OpenDocumentState {
  return { status: "idle" };
}
