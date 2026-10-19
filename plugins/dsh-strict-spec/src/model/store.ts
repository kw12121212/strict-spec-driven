/**
 * The client-store exposure of the discovery model.
 *
 * The model is exposed through snapshot stores built on the shared
 * dsh-client-store module — one for the tree state, one for the open
 * document — plus explicit actions for load, expand, collapse, open, and
 * close. Expand and collapse choices are kept per workspace so a re-shown
 * workspace restores them. Later components receive data only through props
 * and stores, per the plugin client conventions, and this change registers
 * no UI: the stores are idle data holders until an entry point drives them.
 */
import { createSnapshotStore } from "@deepseek-ai/dsh-client-store";
import type { SnapshotStore } from "@deepseek-ai/dsh-client-store";
import { loadGroupChildren, loadWorkspaceTree } from "./traversal.ts";
import { loadDocument } from "./loader.ts";
import { isKnownArtifactType } from "./classifier.ts";
import { deriveDocumentLabel, deriveDocumentStatus, deriveRoadmapFacts, deriveSpecFacts } from "./labels.ts";
import type { RoadmapFacts, SpecFacts } from "./labels.ts";
import { RefreshCoordinator } from "./refresh.ts";
import { initialMilestoneOwnershipState, resolveArchivedPlannedChangeOwners } from "./roadmapOwnership.ts";
import type { MilestoneOwnershipState } from "./roadmapOwnership.ts";
import { parentDirectory, taskCompletion } from "./taskCompletion.ts";
import type { TaskCompletion } from "./taskCompletion.ts";
import { FAMILY_SOURCES, WORKFLOW_ROOT, initialOpenDocumentState, initialTreeState } from "./nodes.ts";
import type { DocumentNode, DocumentRecord, OpenDocumentState, TreeState } from "./nodes.ts";
import type { WorkspaceFilesPort } from "./port.ts";
import { workspaceFileErrorCode } from "./port.ts";

/** The stores and actions one viewer surface drives. */
export interface ViewerStores {
  /** The document tree state of the loaded Session workspace. */
  readonly tree: SnapshotStore<TreeState>;
  /** The state of the one document open in the view. */
  readonly open: SnapshotStore<OpenDocumentState>;
  /**
   * The ownership listing of the open archived roadmap milestone: its owned
   * planned-change entries resolved by reading the archived planned-change
   * files, which stay unread while they are only listed.
   */
  readonly ownership: SnapshotStore<MilestoneOwnershipState>;
  /** The explicit actions that move both stores. */
  readonly actions: ViewerActions;
}

/** The actions that drive the viewer stores. */
export interface ViewerActions {
  /** Loads the whole workspace tree of one Session, replacing any previous one. */
  loadWorkspace(sessionId: string): Promise<void>;
  /** Expands one group node, loading a deferred archive's entries on demand. */
  expandNode(sessionId: string, nodeId: string): Promise<void>;
  /** Collapses one group node, unloading a deferred archive and closing its watch. */
  collapseNode(sessionId: string, nodeId: string): void;
  /**
   * Opens one strict document: loads it completely and watches it while
   * open. The optional anchor names a stable element anchor — a covering
   * requirement — the opened document carries so the view can reveal it.
   */
  openDocument(sessionId: string, path: string, anchor?: string): Promise<void>;
  /** Closes the open document and its watch. */
  closeDocument(): void;
  /** Closes every watch and resets both stores; the viewer stops observing. */
  dispose(): void;
}

/** Per-document facts only a content read can supply. */
interface DocumentMeta {
  artifactType?: string;
  known: boolean;
  status?: string;
  roadmap?: RoadmapFacts;
  spec?: SpecFacts;
}

/**
 * Finds what still hides one document path in the tree, top-down: the family
 * whose canonical sources hold the path, then each group whose path prefixes
 * it. Returns the first collapsed node to expand, "listed" once the document
 * row is in the tree, or undefined when no node can hold the path.
 */
function nextCollapsedAbove(families: readonly DocumentNode[], path: string): DocumentNode | "listed" | undefined {
  const holds = (prefix: string): boolean => path === prefix || path.startsWith(`${prefix}/`);
  let current = families.find((node) => FAMILY_SOURCES[node.family].some((source) => holds(`${WORKFLOW_ROOT}/${source}`)));
  while (current !== undefined) {
    if (!current.loaded) {
      return current;
    }
    const child: DocumentNode | undefined = (current.children ?? []).find((node) => node.kind !== "truncation" && holds(node.path));
    if (child === undefined || child.kind === "document") {
      return child?.path === path ? "listed" : undefined;
    }
    current = child;
  }
  return undefined;
}

/** Finds one node by id in a family forest, depth-first. */
function findNode(nodes: readonly DocumentNode[], id: string): DocumentNode | undefined {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    const child = node.children === undefined ? undefined : findNode(node.children, id);
    if (child !== undefined) {
      return child;
    }
  }
  return undefined;
}

/** Finds one group node by its workspace path in a family forest. */
function findGroupByPath(nodes: readonly DocumentNode[], path: string): DocumentNode | undefined {
  for (const node of nodes) {
    if (node.path === path && (node.kind === "group" || node.kind === "family")) {
      return node;
    }
    const child = node.children === undefined ? undefined : findGroupByPath(node.children, path);
    if (child !== undefined) {
      return child;
    }
  }
  return undefined;
}

/** Replaces one node in a family forest, preserving order and siblings. */
function replaceNode(nodes: readonly DocumentNode[], replacement: DocumentNode): DocumentNode[] {
  return nodes.map((node) => {
    if (node.id === replacement.id) {
      return replacement;
    }
    if (node.children === undefined) {
      return node;
    }
    const children = replaceNode(node.children, replacement);
    return children === node.children ? node : { ...node, children };
  });
}

/** Collects every group node's path whose children are loaded. */
function loadedDirectoryPaths(nodes: readonly DocumentNode[], collected: string[] = []): string[] {
  for (const node of nodes) {
    if ((node.kind === "group" || node.kind === "family") && node.loaded) {
      collected.push(node.path);
    }
    if (node.children !== undefined) {
      loadedDirectoryPaths(node.children, collected);
    }
  }
  return collected;
}

/** Opens one watch per loaded directory of one node's subtree, idempotently. */
function watchLoadedDirectories(activeCoordinator: RefreshCoordinator, node: DocumentNode): void {
  for (const dirPath of loadedDirectoryPaths([node])) {
    activeCoordinator.watchDirectory(dirPath);
  }
}

/** Creates the viewer stores and actions over one workspace-files port. */
export function createViewerStores(port: WorkspaceFilesPort): ViewerStores {
  const tree = createSnapshotStore<TreeState>(initialTreeState());
  const open = createSnapshotStore<OpenDocumentState>(initialOpenDocumentState());
  const ownership = createSnapshotStore<MilestoneOwnershipState>(initialMilestoneOwnershipState());
  const documentMeta = new Map<string, DocumentMeta>();
  /**
   * Task completion keyed by each non-archived change's tasks-file path,
   * recorded by the same content pass that refines labels, so the badge
   * adds no workspace reads. The recomputed tree state keys it by change
   * directory and drops entries whose tasks file the walked tree no longer
   * holds, so a deleted tasks file loses its badge instead of going stale.
   */
  const taskCompletionByFile = new Map<string, TaskCompletion>();
  /**
   * Operator expand choices per workspace, keyed by the sessionId the host
   * derives the workspace root from — the only workspace identity the port
   * exposes. Recording both directions ("open" and "closed") lets a re-shown
   * workspace restore collapses of eagerly loaded groups as well as
   * expansions of deferred archives; a restored archive expansion still
   * reads its entries through that expansion, never while collapsed.
   */
  const expandChoices = new Map<string, Map<string, "open" | "closed">>();
  let coordinator: RefreshCoordinator | undefined;
  let watchedSessionId: string | undefined;

  /** Records one operator expand choice for the watched workspace. */
  function recordExpandChoice(nodeId: string, choice: "open" | "closed"): void {
    const sessionId = watchedSessionId;
    if (sessionId === undefined) {
      return;
    }
    const choices = expandChoices.get(sessionId) ?? new Map<string, "open" | "closed">();
    choices.set(nodeId, choice);
    expandChoices.set(sessionId, choices);
  }

  /**
   * Re-applies the recorded expand choices of one workspace after its tree
   * reloads: recorded opens expand groups the reload left deferred (their
   * entries are read here, through this expansion), and recorded closes
   * collapse groups the reload left loaded. Choices for nodes the reloaded
   * tree no longer holds are skipped.
   */
  async function restoreExpandChoices(sessionId: string): Promise<void> {
    const choices = expandChoices.get(sessionId);
    if (choices === undefined) {
      return;
    }
    // Shallow paths first, so a restored parent expansion loads before a
    // recorded child of it is re-expanded.
    const ordered = [...choices.entries()].sort((a, b) => a[0].length - b[0].length);
    for (const [nodeId, choice] of ordered) {
      if (choice === "open") {
        await actions.expandNode(sessionId, nodeId);
      } else {
        actions.collapseNode(sessionId, nodeId);
      }
    }
  }

  /** Recomputes the documents map and change completion from the tree and the read-side metadata. */
  function recomputeDocuments(state: TreeState): TreeState {
    const documents: Record<string, DocumentRecord> = {};
    const documentPaths = new Set<string>();
    const collect = (nodes: readonly DocumentNode[]): void => {
      for (const node of nodes) {
        if (node.kind === "document") {
          documentPaths.add(node.path);
          const meta = documentMeta.get(node.path);
          documents[node.path] = {
            path: node.path,
            family: node.family,
            label: node.label,
            artifactType: meta?.artifactType,
            known: meta?.known ?? false,
            status: meta?.status,
            milestoneId: meta?.roadmap?.milestoneId,
            milestoneOrder: meta?.roadmap?.milestoneOrder,
            plannedChangeId: meta?.roadmap?.plannedChangeId,
            plannedChangeMilestone: meta?.roadmap?.plannedChangeMilestone,
            specId: meta?.spec?.specId,
            requirementIds: meta?.spec?.requirementIds,
            archived: node.archived,
          };
        }
        if (node.children !== undefined) {
          collect(node.children);
        }
      }
    };
    collect(state.families);
    const changeCompletion: Record<string, TaskCompletion> = {};
    for (const [path, completion] of taskCompletionByFile) {
      if (!documentPaths.has(path)) {
        continue;
      }
      const directory = parentDirectory(path);
      if (directory !== "") {
        changeCompletion[directory] = completion;
      }
    }
    return { ...state, documents, changeCompletion };
  }

  /** Applies the recorded watch health of each loaded directory to its nodes. */
  function applyWatchHealth(state: TreeState): TreeState {
    const apply = (nodes: readonly DocumentNode[]): DocumentNode[] =>
      nodes.map((node) => {
        const children = node.children === undefined ? undefined : apply(node.children);
        const health = (node.kind === "group" || node.kind === "family") && node.loaded
          ? (coordinator?.healthOf(node.path) ?? "none")
          : "none";
        return node.watch === health && children === node.children
          ? node
          : { ...node, watch: health, children };
      });
    return { ...state, families: apply(state.families) };
  }

  /**
   * Reads one non-archived document to refine its label from declared fields
   * and record its artifact_type. A read or parse failure keeps the filename
   * label: the tree stays usable, and opening the document surfaces the
   * located error instead.
   */
  async function refineDocument(sessionId: string, node: DocumentNode): Promise<DocumentNode> {
    if (node.kind !== "document" || node.archived) {
      return node;
    }
    const result = await loadDocument(port, sessionId, node.path);
    if (!result.ok) {
      return node;
    }
    documentMeta.set(node.path, {
      artifactType: result.artifactType,
      known: isKnownArtifactType(result.artifactType),
      status: deriveDocumentStatus(result.data, result.artifactType),
      roadmap: deriveRoadmapFacts(result.data, result.artifactType),
      spec: deriveSpecFacts(result.data, result.artifactType),
    });
    // A change's tasks file records its completion for the change group
    // badge during this same read; an unreadable tasks list clears any
    // earlier count instead of badging a change whose file went bad.
    if (node.family === "changes" && result.artifactType === "task_list") {
      const completion = taskCompletion(result.data);
      if (completion === undefined) {
        taskCompletionByFile.delete(node.path);
      } else {
        taskCompletionByFile.set(node.path, completion);
      }
    }
    const label = deriveDocumentLabel(node.path, result.data, result.artifactType);
    return label === node.label ? node : { ...node, label };
  }

  /** Refines the labels of every non-archived document under one node tree. */
  async function refineLabels(sessionId: string, nodes: readonly DocumentNode[]): Promise<DocumentNode[]> {
    const refined: DocumentNode[] = [];
    for (const node of nodes) {
      if (node.children !== undefined) {
        const children = await refineLabels(sessionId, node.children);
        refined.push(children === node.children ? node : { ...node, children });
        continue;
      }
      refined.push(await refineDocument(sessionId, node));
    }
    return refined;
  }

  /** Ensures the refresh coordinator serves one sessionId, recreating it on change. */
  function ensureCoordinator(sessionId: string): RefreshCoordinator {
    if (coordinator === undefined || watchedSessionId !== sessionId) {
      coordinator?.dispose();
      coordinator = new RefreshCoordinator(port, sessionId, {
        onInvalidate: handleInvalidation,
        onHealthChange: handleWatchHealthChange,
      });
      watchedSessionId = sessionId;
    }
    return coordinator;
  }

  /**
   * Updates the ownership listing for the document that just opened: an
   * archived roadmap milestone resolves its owned planned-change entries by
   * reading the archived planned-change files, and every other document —
   * including a non-archived milestone, whose owned entries derive from the
   * tree's recorded facts — returns the listing to idle. A resolution that
   * lands after a newer open switched the view records nothing: the newer
   * open's own update decides the state.
   */
  async function updateOwnershipForOpenDocument(
    sessionId: string,
    path: string,
    data: unknown,
    artifactType: string | undefined,
    node: DocumentNode | undefined,
  ): Promise<void> {
    if (artifactType !== "roadmap_milestone" || node === undefined || !node.archived) {
      ownership.set(initialMilestoneOwnershipState());
      return;
    }
    const facts = deriveRoadmapFacts(data, artifactType);
    if (facts.milestoneId === undefined) {
      ownership.set(initialMilestoneOwnershipState());
      return;
    }
    ownership.set({ status: "loading", milestoneId: facts.milestoneId, owned: [], truncated: false });
    const resolved = await resolveArchivedPlannedChangeOwners(port, sessionId, facts.milestoneId);
    const current = open.getSnapshot();
    if (current.status === "idle" || current.path !== path) {
      return;
    }
    ownership.set(resolved.failed
      ? { status: "error", milestoneId: facts.milestoneId, owned: [], truncated: false }
      : { status: "ready", milestoneId: facts.milestoneId, owned: resolved.owned, truncated: resolved.truncated });
  }

  /** Surfaces one watch health change onto the loaded tree nodes. */
  function handleWatchHealthChange(): void {
    const state = tree.getSnapshot();
    if (state.status === "ready") {
      tree.set(applyWatchHealth(state));
    }
  }

  /** Handles one observed invalidation: reload the affected node only. */
  function handleInvalidation(target: { path: string; kind: "directory" | "file"; absent: boolean }): void {
    const activeCoordinator = coordinator;
    if (activeCoordinator === undefined) {
      return;
    }
    if (target.kind === "file") {
      const current = open.getSnapshot();
      if (current.status === "idle" || current.path !== target.path) {
        return;
      }
      if (target.absent) {
        open.set({ status: "absent", path: target.path });
        void reloadParentDirectoryOf(target.path);
        return;
      }
      void refreshOpenDocument(target.path);
      return;
    }
    void reloadDirectory(target.path);
  }

  /** Reloads one loaded directory group after its watch reported a change. */
  async function reloadDirectory(dirPath: string): Promise<void> {
    const state = tree.getSnapshot();
    const group = findGroupByPath(state.families, dirPath);
    if (group === undefined || !group.loaded) {
      return;
    }
    const sessionId = watchedSessionId;
    if (sessionId === undefined) {
      return;
    }
    try {
      const reloaded = await loadGroupChildren(port, sessionId, group);
      const withLabels = { ...reloaded, children: await refineLabels(sessionId, reloaded.children ?? []) };
      let next: TreeState = { ...state, families: replaceNode(state.families, withLabels) };
      next = applyWatchHealth(recomputeDocuments(next));
      const activeCoordinator = ensureCoordinator(sessionId);
      watchLoadedDirectories(activeCoordinator, withLabels);
      tree.set(next);
    } catch {
      // A failed relist keeps the last loaded children; the watch stays open
      // and the next invalidation retries.
    }
  }

  /** Reloads the directory group holding one file path. */
  async function reloadParentDirectoryOf(filePath: string): Promise<void> {
    const slash = filePath.lastIndexOf("/");
    await reloadDirectory(slash === -1 ? "" : filePath.slice(0, slash));
  }

  /** Re-reads the open document after its watch reported a change. */
  async function refreshOpenDocument(path: string): Promise<void> {
    const sessionId = watchedSessionId;
    if (sessionId === undefined) {
      return;
    }
    const result = await loadDocument(port, sessionId, path);
    const current = open.getSnapshot();
    if (current.status === "idle" || current.path !== path) {
      return;
    }
    if (result.ok) {
      documentMeta.set(path, {
        artifactType: result.artifactType,
        known: isKnownArtifactType(result.artifactType),
        status: deriveDocumentStatus(result.data, result.artifactType),
        roadmap: deriveRoadmapFacts(result.data, result.artifactType),
        spec: deriveSpecFacts(result.data, result.artifactType),
      });
      // The refresh keeps the anchor the document was opened with, so a
      // live file change does not un-anchor the element the view revealed.
      open.set({ status: "ready", path, data: result.data, anchor: current.anchor });
      return;
    }
    open.set({ status: "error", path, error: result.error });
  }

  /**
   * Expands every collapsed node above one opened document, one level per
   * expansion, until its row is listed; stops when the Session changes,
   * another document opens, no node can hold the path, or an expansion fails
   * and leaves its node closed.
   */
  async function revealDocument(sessionId: string, path: string): Promise<void> {
    for (let step = 0; step < 32 && watchedSessionId === sessionId && open.getSnapshot().path === path; step += 1) {
      const next = nextCollapsedAbove(tree.getSnapshot().families, path);
      if (next === undefined || next === "listed") {
        return;
      }
      await actions.expandNode(sessionId, next.id);
      if (findNode(tree.getSnapshot().families, next.id)?.loaded !== true) {
        return;
      }
    }
  }

  const actions: ViewerActions = {
    async loadWorkspace(sessionId: string): Promise<void> {
      const activeCoordinator = ensureCoordinator(sessionId);
      /** True once a newer load switched the watched Session: this load is stale. */
      const stale = (): boolean => watchedSessionId !== sessionId;
      tree.set(initialTreeState());
      documentMeta.clear();
      taskCompletionByFile.clear();
      let loaded: TreeState;
      try {
        loaded = await loadWorkspaceTree(port, sessionId);
      } catch (error) {
        // A family walk that fails mid-load reports the error state instead
        // of stranding the tree in loading; the next load retries. A stale
        // load reports nothing: a newer Session's load owns the tree.
        if (stale()) {
          return;
        }
        tree.set({ status: "error", errorCode: workspaceFileErrorCode(error) ?? "unknown", families: [], documents: {} });
        return;
      }
      if (stale()) {
        return;
      }
      if (loaded.status !== "ready") {
        open.set(initialOpenDocumentState());
        ownership.set(initialMilestoneOwnershipState());
        activeCoordinator.unwatchOpenDocument();
        tree.set(loaded);
        return;
      }
      const families: DocumentNode[] = [];
      try {
        for (const family of loaded.families) {
          families.push({ ...family, children: await refineLabels(sessionId, family.children ?? []) });
        }
      } catch (error) {
        // A family walk that fails mid-load reports the error state instead
        // of stranding the tree in loading; the next load retries. A stale
        // load reports nothing: a newer Session's load owns the tree.
        if (stale()) {
          return;
        }
        tree.set({ status: "error", errorCode: workspaceFileErrorCode(error) ?? "unknown", families: [], documents: {} });
        return;
      }
      if (stale()) {
        return;
      }
      let next: TreeState = { status: "ready", families, documents: {}, rootTruncated: loaded.rootTruncated };
      next = recomputeDocuments(next);
      for (const family of next.families) {
        watchLoadedDirectories(activeCoordinator, family);
      }
      tree.set(applyWatchHealth(next));
      // A workspace re-shown after the operator expanded or collapsed groups
      // restores those choices; a first load has none recorded.
      await restoreExpandChoices(sessionId);
    },

    async expandNode(sessionId: string, nodeId: string): Promise<void> {
      const state = tree.getSnapshot();
      const node = findNode(state.families, nodeId);
      if (node === undefined || (node.kind !== "group" && node.kind !== "family") || node.loaded) {
        return;
      }
      const activeCoordinator = ensureCoordinator(sessionId);
      let expanded: DocumentNode;
      let children: DocumentNode[];
      try {
        expanded = await loadGroupChildren(port, sessionId, node);
        children = expanded.archived
          ? expanded.children ?? []
          : await refineLabels(sessionId, expanded.children ?? []);
      } catch {
        // A failed expansion leaves the group deferred and the tree as it
        // was; the next expand retries.
        return;
      }
      // A Session switch while the listing was in flight makes it another
      // workspace's entries: node ids are workspace-relative, so applying it
      // would graft them into the new Session's tree.
      if (watchedSessionId !== sessionId) {
        return;
      }
      // Re-read the state: a watch invalidation may have landed while the
      // expansion was loading, and clobbering it would drop that reload.
      const current = tree.getSnapshot();
      let next: TreeState = { ...current, families: replaceNode(current.families, { ...expanded, children }) };
      next = recomputeDocuments(next);
      watchLoadedDirectories(activeCoordinator, expanded);
      tree.set(applyWatchHealth(next));
      recordExpandChoice(nodeId, "open");
    },

    collapseNode(_sessionId: string, nodeId: string): void {
      const state = tree.getSnapshot();
      const node = findNode(state.families, nodeId);
      if (node === undefined || (node.kind !== "group" && node.kind !== "family")) {
        return;
      }
      // Collapsing unloads the group's children and closes its watch for
      // every group, archived or not: the watch count stays bounded by what
      // is loaded, and re-expanding reloads the entries and reopens the
      // watch, so no loaded directory is ever left unwatched.
      coordinator?.unwatchDirectory(node.path);
      const collapsed: DocumentNode = { ...node, children: [], loaded: false, truncated: false };
      let next: TreeState = { ...state, families: replaceNode(state.families, collapsed) };
      next = applyWatchHealth(recomputeDocuments(next));
      tree.set(next);
      recordExpandChoice(nodeId, "closed");
    },

    async openDocument(sessionId: string, path: string, anchor?: string): Promise<void> {
      const activeCoordinator = ensureCoordinator(sessionId);
      open.set({ status: "loading", path, anchor });
      // The tree follows every open, from a row, a link, or a restore,
      // without holding the document load on the tree's listings.
      void revealDocument(sessionId, path);
      const result = await loadDocument(port, sessionId, path);
      const current = open.getSnapshot();
      if (current.status === "idle" || current.path !== path) {
        return;
      }
      if (result.ok) {
        const state = tree.getSnapshot();
        const node = findNode(state.families, path);
        // Opening an archived document serves the view but records no
        // document meta: a later reload of its directory must not badge the
        // archived row with the status the design keeps badge-less.
        if (node !== undefined && node.kind === "document" && !node.archived) {
          documentMeta.set(path, {
            artifactType: result.artifactType,
            known: isKnownArtifactType(result.artifactType),
            status: deriveDocumentStatus(result.data, result.artifactType),
            roadmap: deriveRoadmapFacts(result.data, result.artifactType),
            spec: deriveSpecFacts(result.data, result.artifactType),
          });
          if (node.family === "changes" && result.artifactType === "task_list") {
            const completion = taskCompletion(result.data);
            if (completion === undefined) {
              taskCompletionByFile.delete(path);
            } else {
              taskCompletionByFile.set(path, completion);
            }
          }
          const label = deriveDocumentLabel(path, result.data, result.artifactType);
          let next: TreeState = { ...state, families: replaceNode(state.families, { ...node, label }) };
          next = recomputeDocuments(next);
          tree.set(next);
        }
        open.set({ status: "ready", path, data: result.data, anchor });
        activeCoordinator.watchOpenDocument(path);
        await updateOwnershipForOpenDocument(sessionId, path, result.data, result.artifactType, node);
        return;
      }
      open.set({ status: "error", path, error: result.error });
      activeCoordinator.watchOpenDocument(path);
      ownership.set(initialMilestoneOwnershipState());
    },

    closeDocument(): void {
      coordinator?.unwatchOpenDocument();
      open.set(initialOpenDocumentState());
      ownership.set(initialMilestoneOwnershipState());
    },

    dispose(): void {
      coordinator?.dispose();
      coordinator = undefined;
      watchedSessionId = undefined;
      documentMeta.clear();
      taskCompletionByFile.clear();
      expandChoices.clear();
      open.set(initialOpenDocumentState());
      ownership.set(initialMilestoneOwnershipState());
      tree.set(initialTreeState());
    },
  };

  return { tree, open, ownership, actions };
}
