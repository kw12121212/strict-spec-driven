/**
 * The workspace traversal: turns the Session workspace's
 * `.strict-spec-driven/` directory into family node trees through the
 * workspace-files port's `list`.
 *
 * One root listing decides which families are present, so an absent family is
 * omitted instead of shown empty. Loading a family walks its non-archive
 * subdirectories recursively and records the truncated flag of every listing
 * as an explicit truncation marker node — `list` has a 2000-entry cap, no
 * paging, and no continuation token, so a retry would return the same cut
 * listing. Archive directories are deferred: they appear as collapsed groups
 * whose entries are not read until an explicit expand request loads them.
 */
import type { DirectoryEntry, WorkspaceFilesPort } from "./port.ts";
import { FAMILY_ORDER, FAMILY_SOURCES, WORKFLOW_ROOT } from "./nodes.ts";
import type { DocumentNode, FamilyId, TreeState } from "./nodes.ts";
import { workspaceFileErrorCode } from "./port.ts";

/** The basename that marks a deferred archive group. */
const ARCHIVE_DIR_NAME = "archive";

/** A workspace root listing split into the families it proves present. */
export interface FamilyPresence {
  /** The present families in fixed order. */
  readonly present: readonly FamilyId[];
  /** The absent families in fixed order. */
  readonly absent: readonly FamilyId[];
}

/** Joins a directory path and an entry name into a workspace-relative path. */
function joinPath(dir: string, name: string): string {
  return dir === "" ? name : `${dir}/${name}`;
}

/**
 * Reads one workspace root listing and splits the fixed family order into
 * present and absent families by matching each family's canonical source
 * names against the direct children of `.strict-spec-driven/`.
 */
export function resolveFamilyPresence(rootEntries: readonly DirectoryEntry[]): FamilyPresence {
  const names = new Set(rootEntries.map((entry) => entry.name));
  const present: FamilyId[] = [];
  const absent: FamilyId[] = [];
  for (const family of FAMILY_ORDER) {
    const sources = FAMILY_SOURCES[family];
    if (sources.some((name) => names.has(name))) {
      present.push(family);
    } else {
      absent.push(family);
    }
  }
  return { present, absent };
}

/** One directory the traversal walked, with the truncation fact of its listing. */
interface WalkedDirectory {
  readonly children: DocumentNode[];
  readonly truncated: boolean;
}

/** Builds the truncation marker node one truncated listing records. */
function truncationMarker(dirPath: string, family: FamilyId, archived: boolean): DocumentNode {
  return {
    id: `${dirPath === "" ? WORKFLOW_ROOT : dirPath}::truncated`,
    kind: "truncation",
    path: dirPath,
    family,
    label: "",
    archived,
    loaded: true,
    truncated: true,
    watch: "none",
  };
}

/** Builds a group node for one listed directory entry. */
function groupNode(dirPath: string, family: FamilyId, archived: boolean, loaded: boolean, children: DocumentNode[] = []): DocumentNode {
  return {
    id: dirPath,
    kind: "group",
    path: dirPath,
    family,
    label: dirPath.split("/").pop() ?? dirPath,
    archived,
    children,
    loaded,
    truncated: false,
    watch: "none",
  };
}

/** Builds a document leaf node for one listed file entry. */
function documentNode(filePath: string, family: FamilyId, archived: boolean): DocumentNode {
  return {
    id: filePath,
    kind: "document",
    path: filePath,
    family,
    label: filePath.split("/").pop() ?? filePath,
    archived,
    loaded: true,
    truncated: false,
    watch: "none",
  };
}

/**
 * Walks one directory into child nodes: files become document leaves,
 * non-archive directories become recursively loaded groups, and an `archive`
 * directory becomes a deferred group whose entries stay unread. The listing's
 * truncated flag becomes one explicit truncation marker at the end of the
 * children, and the walk never retries or pages a truncated listing.
 */
async function walkDirectory(
  port: WorkspaceFilesPort,
  sessionId: string,
  dirPath: string,
  family: FamilyId,
  archived: boolean,
  signal?: AbortSignal,
): Promise<WalkedDirectory> {
  const listing = await port.list(sessionId, dirPath, signal);
  const children: DocumentNode[] = [];
  for (const entry of listing.entries) {
    const entryPath = joinPath(listing.path, entry.name);
    if (entry.type === "directory") {
      if (entry.name === ARCHIVE_DIR_NAME && !archived) {
        children.push(groupNode(entryPath, family, true, false));
        continue;
      }
      const walked = await walkDirectory(port, sessionId, entryPath, family, archived, signal);
      children.push(withChildren(groupNode(entryPath, family, archived, true), walked.children, walked.truncated));
      continue;
    }
    if (entry.type === "file") {
      children.push(documentNode(entryPath, family, archived));
    }
  }
  return { children, truncated: listing.truncated };
}

/** Attaches walked children and the walked truncation marker to a group node. */
function withChildren(group: DocumentNode, children: DocumentNode[], truncated: boolean): DocumentNode {
  const fullChildren = truncated ? [...children, truncationMarker(group.path, group.family, group.archived)] : children;
  return { ...group, children: fullChildren, truncated };
}

/**
 * Loads one present family's node tree from its canonical sources against an
 * already-read root listing: singleton file families yield one document leaf
 * each, and directory families walk their subdirectories with archive
 * deferral.
 */
export async function loadFamilyTree(
  port: WorkspaceFilesPort,
  sessionId: string,
  family: FamilyId,
  rootEntries: readonly DirectoryEntry[],
  signal?: AbortSignal,
): Promise<DocumentNode> {
  const familyNode: DocumentNode = {
    id: `${WORKFLOW_ROOT}/${family}`,
    kind: "family",
    path: `${WORKFLOW_ROOT}/${family}`,
    family,
    label: family,
    archived: false,
    children: [],
    loaded: true,
    truncated: false,
    watch: "none",
  };
  const sources = FAMILY_SOURCES[family];
  const children: DocumentNode[] = [];
  for (const source of sources) {
    const entry = rootEntries.find((candidate) => candidate.name === source);
    if (!entry) {
      continue;
    }
    if (entry.type === "file") {
      children.push(documentNode(joinPath(WORKFLOW_ROOT, source), family, false));
      continue;
    }
    if (entry.type === "directory") {
      const sourcePath = joinPath(WORKFLOW_ROOT, source);
      const walked = await walkDirectory(port, sessionId, sourcePath, family, false, signal);
      const group = withChildren(groupNode(sourcePath, family, false, true), walked.children, walked.truncated);
      // A directory family's single canonical source collapses into the
      // family node itself, so the tree shows one level, not two.
      children.push(...(group.children ?? []));
    }
  }
  return { ...familyNode, children };
}

/**
 * Loads one group node's children from the workspace: a deferred archive
 * group gets its entries on explicit expand — listed once, its files labeled
 * from their names alone, its content never read — and a loaded directory
 * gets the same walk again on refresh invalidation. A family root rebuilds
 * from its canonical sources against a fresh workflow root listing, because
 * its synthetic path names no directory for a single-file family.
 */
export async function loadGroupChildren(
  port: WorkspaceFilesPort,
  sessionId: string,
  node: DocumentNode,
  signal?: AbortSignal,
): Promise<DocumentNode> {
  if (node.kind === "family") {
    const rootListing = await port.list(sessionId, WORKFLOW_ROOT, signal);
    // A family whose sources left the workspace fails like a missing
    // directory, so callers keep their last state instead of an empty group.
    if (!resolveFamilyPresence(rootListing.entries).present.includes(node.family)) {
      throw Object.assign(new Error(`family ${node.family} is absent from the workflow root`), { code: "workspace-file/not-found" });
    }
    const rebuilt = await loadFamilyTree(port, sessionId, node.family, rootListing.entries, signal);
    return { ...node, children: rebuilt.children, loaded: true };
  }
  const walked = await walkDirectory(port, sessionId, node.path, node.family, node.archived, signal);
  return withChildren({ ...node, loaded: true }, walked.children, walked.truncated);
}

/**
 * Loads the whole workspace tree: one root listing resolves family presence,
 * an absent workflow directory yields the empty state, and each present family
 * loads its node tree in the fixed order.
 */
export async function loadWorkspaceTree(
  port: WorkspaceFilesPort,
  sessionId: string,
  signal?: AbortSignal,
): Promise<TreeState> {
  let rootListing;
  try {
    rootListing = await port.list(sessionId, WORKFLOW_ROOT, signal);
  } catch (error) {
    const code = workspaceFileErrorCode(error);
    if (code === "workspace-file/not-found" || code === "workspace-file/outside-workspace" || code === "workspace-file/not-directory") {
      return { status: "empty", families: [], documents: {} };
    }
    return { status: "error", errorCode: code ?? "unknown", families: [], documents: {} };
  }
  const presence = resolveFamilyPresence(rootListing.entries);
  const families: DocumentNode[] = [];
  for (const family of presence.present) {
    families.push(await loadFamilyTree(port, sessionId, family, rootListing.entries, signal));
  }
  // A truncated root listing means the family set itself may be incomplete:
  // the flag is recorded for the tree to mark, never silently dropped.
  return { status: "ready", families, documents: {}, rootTruncated: rootListing.truncated };
}
