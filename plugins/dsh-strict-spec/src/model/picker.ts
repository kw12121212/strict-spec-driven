/**
 * The Session picker model: the React-free seam the left-sidebar page's
 * picker consumes, plus the pure grouping and page-selection logic.
 *
 * The main keyed slot receives no Session binding while every
 * remote.workspaceFiles call needs a sessionId, so the page chooses a
 * Session itself. The host's session and workspace service faces stay
 * behind the `SessionCatalogPort` seam, mirroring the workspace-files
 * port pattern: model modules never import a dsh service face, the client
 * entry adapts the real faces once, and tests script a fake. Grouping,
 * last-choice memory, and selection restore are pure functions over the
 * catalog snapshots, so they run under bun test/run.ts with no dsh host.
 */
import { createSnapshotStore } from "@deepseek-ai/dsh-client-store";
import type { SnapshotStore } from "@deepseek-ai/dsh-client-store";
import type { ViewerStores } from "./store.ts";

/** The session-summary row the picker reads from the host catalog. */
export interface SessionSummaryRow {
  /** The host-derived human-facing label of the Session. */
  readonly displayTitle: string;
  /** Last-update instant, used for newest-first ordering. */
  readonly updatedAt: number;
}

/** The sessions-list snapshot slice the grouping reads. */
export interface SessionsListSnapshot {
  /** Host list order; every id has a matching byId row in the same snapshot. */
  readonly ids: readonly string[];
  readonly byId: Readonly<Record<string, SessionSummaryRow>>;
  readonly phase: "pending" | "ready";
}

/** The workspace row the picker reads from the host registry. */
export interface WorkspaceItemRow {
  readonly workspaceId: string;
  /** User-visible Workspace title. */
  readonly title: string;
  /** Canonical host directory path of the Workspace. */
  readonly path: string;
  /** Sessions accounted to this Workspace, in the host's manual order. */
  readonly sessionIds: readonly string[];
}

/** The workspaces-list snapshot slice the grouping reads. */
export interface WorkspacesListSnapshot {
  readonly items: readonly WorkspaceItemRow[];
  readonly state: "idle" | "loading" | "error";
  readonly phase: "pending" | "ready";
}

/** One Session offered by the picker: the fields the picker row shows. */
export interface PickerSession {
  /** The sessionId every workspace-files call takes. */
  readonly sessionId: string;
  /** The host-derived human-facing label of the Session. */
  readonly displayTitle: string;
  /** Last-update instant, newest first within a workspace group. */
  readonly updatedAt: number;
}

/** One Workspace group of the picker: its Sessions in newest-first order. */
export interface PickerWorkspace {
  readonly workspaceId: string;
  /** User-visible Workspace title. */
  readonly title: string;
  /** Canonical host directory path of the Workspace. */
  readonly path: string;
  readonly sessions: readonly PickerSession[];
}

/** The grouped catalog the picker renders, with its arrival status. */
export interface PickerCatalog {
  /** Workspaces in host registry order, each with newest-first Sessions. */
  readonly workspaces: readonly PickerWorkspace[];
  /**
   * Host-list Sessions no Workspace accounts to itself. A healthy host
   * keeps this empty; the picker offers them as a trailing group rather
   * than silently losing readable Sessions.
   */
  readonly ungrouped: readonly PickerSession[];
  /** The catalog's arrival status, from both snapshots' phases and state. */
  readonly status: "loading" | "ready" | "error";
}

/**
 * The session-and-workspace seam the page consumes. `getCatalog` reads the
 * identity-stable current grouping and `subscribe` reports every change of
 * it, so a component renders it through useSyncExternalStore and the entry
 * adapts the real host faces with one function.
 */
export interface SessionCatalogPort {
  /** Read the current grouped catalog snapshot. */
  getCatalog(): PickerCatalog;
  /** Subscribe to catalog changes; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

/** The structural slice of the host sessions face the adapter reads. */
export interface HostSessionsFace {
  readonly list: {
    getSnapshot(): SessionsListSnapshot;
    subscribe(listener: () => void): () => void;
  };
}

/** The structural slice of the host workspaces face the adapter reads. */
export interface HostWorkspacesFace {
  readonly list: {
    getSnapshot(): WorkspacesListSnapshot;
    subscribe(listener: () => void): () => void;
  };
}

/**
 * Adapts the host session and workspace service faces to the picker port.
 * The faces are structural: the real `ctx.sessions` and `ctx.workspaces`
 * satisfy them without any runtime import of their packages, so the bundle
 * gains no require and the model stays dsh-free. The grouped catalog is
 * memoized on the identity of both source snapshots — both faces return
 * identity-stable snapshots, and React's useSyncExternalStore requires
 * getSnapshot to return a cached value, so recomputing the grouping per
 * call would loop the render.
 */
export function createSessionCatalogPort(sessions: HostSessionsFace, workspaces: HostWorkspacesFace): SessionCatalogPort {
  let cache: { workspaces: WorkspacesListSnapshot; sessions: SessionsListSnapshot; catalog: PickerCatalog } | undefined;
  const readCatalog = (): PickerCatalog => {
    const workspacesSnapshot = workspaces.list.getSnapshot();
    const sessionsSnapshot = sessions.list.getSnapshot();
    if (cache !== undefined && cache.workspaces === workspacesSnapshot && cache.sessions === sessionsSnapshot) {
      return cache.catalog;
    }
    const catalog = computePickerCatalog(workspacesSnapshot, sessionsSnapshot);
    cache = { workspaces: workspacesSnapshot, sessions: sessionsSnapshot, catalog };
    return catalog;
  };
  return {
    getCatalog: readCatalog,
    subscribe: (listener: () => void): (() => void) => {
      const unsubscribeWorkspaces = workspaces.list.subscribe(listener);
      const unsubscribeSessions = sessions.list.subscribe(listener);
      return () => {
        unsubscribeWorkspaces();
        unsubscribeSessions();
      };
    },
  };
}

/** Resolves one session row through the catalog, when the host holds it. */
function pickerSession(sessionId: string, byId: SessionsListSnapshot["byId"]): PickerSession | undefined {
  const row = byId[sessionId];
  if (row === undefined) {
    return undefined;
  }
  return { sessionId, displayTitle: row.displayTitle, updatedAt: row.updatedAt };
}

/** Orders two picker sessions newest-first. */
function byNewestFirst(left: PickerSession, right: PickerSession): number {
  return right.updatedAt - left.updatedAt;
}

/**
 * Groups the catalog snapshots into picker rows: Workspaces in registry
 * order with their Sessions newest-first, then the host-list Sessions no
 * Workspace accounts to itself. Pure over its inputs, so the model suite
 * exercises grouping, membership, and status mapping directly. The error
 * status comes from the workspaces registry alone: the sessions face
 * exposes no error axis (only its pending/ready phase), so a failed
 * sessions pull keeps the catalog loading rather than erroring — a
 * limitation of the pinned host face, not a viewer choice.
 */
export function computePickerCatalog(workspaces: WorkspacesListSnapshot, sessions: SessionsListSnapshot): PickerCatalog {
  const status: PickerCatalog["status"] =
    workspaces.state === "error" ? "error" : workspaces.phase === "pending" || sessions.phase === "pending" ? "loading" : "ready";
  const accounted = new Set<string>();
  const grouped: PickerWorkspace[] = [];
  for (const item of workspaces.items) {
    const members: PickerSession[] = [];
    for (const sessionId of item.sessionIds) {
      const row = pickerSession(sessionId, sessions.byId);
      if (row !== undefined) {
        accounted.add(sessionId);
        members.push(row);
      }
    }
    members.sort(byNewestFirst);
    grouped.push({ workspaceId: item.workspaceId, title: item.title, path: item.path, sessions: members });
  }
  const ungrouped: PickerSession[] = [];
  for (const sessionId of sessions.ids) {
    if (accounted.has(sessionId)) {
      continue;
    }
    const row = pickerSession(sessionId, sessions.byId);
    if (row !== undefined) {
      ungrouped.push(row);
    }
  }
  ungrouped.sort(byNewestFirst);
  return { workspaces: grouped, ungrouped, status };
}

/**
 * Resolves the Session the page shows for a recorded selection: the chosen
 * Session while the catalog still holds it, otherwise the newest Session of
 * the chosen Workspace, otherwise the newest Session of the first Workspace
 * that holds one, otherwise nothing — the state the no-Session prompt
 * renders for.
 */
export function resolveShownSession(
  catalog: PickerCatalog,
  selection: Readonly<PageSelection>,
): { workspaceId?: string; sessionId?: string } {
  if (selection.sessionId !== undefined) {
    for (const workspace of catalog.workspaces) {
      const member = workspace.sessions.some((session) => session.sessionId === selection.sessionId);
      if (member) {
        return { workspaceId: workspace.workspaceId, sessionId: selection.sessionId };
      }
    }
    const ungroupedMember = catalog.ungrouped.some((session) => session.sessionId === selection.sessionId);
    if (ungroupedMember) {
      return { sessionId: selection.sessionId };
    }
  }
  if (selection.workspaceId !== undefined) {
    const workspace = catalog.workspaces.find((candidate) => candidate.workspaceId === selection.workspaceId);
    if (workspace !== undefined) {
      return workspace.sessions.length > 0 ? { workspaceId: workspace.workspaceId, sessionId: workspace.sessions[0]?.sessionId } : { workspaceId: workspace.workspaceId };
    }
  }
  const firstWorkspace = catalog.workspaces.find((workspace) => workspace.sessions.length > 0);
  if (firstWorkspace !== undefined && firstWorkspace.sessions[0] !== undefined) {
    return { workspaceId: firstWorkspace.workspaceId, sessionId: firstWorkspace.sessions[0].sessionId };
  }
  return {};
}

/** The page's remembered selection: what reopening the page restores. */
export interface PageSelection {
  /** The last chosen Workspace, when one was chosen. */
  readonly workspaceId?: string;
  /** The last chosen Session, when one was chosen. */
  readonly sessionId?: string;
  /** The last selected document path, when one was open. */
  readonly documentPath?: string;
}

/** The actions that move the root-scoped page-selection store. */
export interface PageSelectionActions {
  /** Records a Session choice together with the Workspace it belongs to. */
  chooseSession(workspaceId: string | undefined, sessionId: string): void;
  /**
   * Records a Workspace choice. `keepSession` says whether the recorded
   * Session is a member of the chosen Workspace: when it is not, the
   * Session and its recorded document clear, so the page shows the chosen
   * Workspace alone — the no-Session prompt state when it holds none.
   */
  chooseWorkspace(workspaceId: string, keepSession: boolean): void;
  /** Records the open document of the chosen Session. */
  recordDocument(path: string | undefined): void;
}

/** The root-scoped page-selection store the entry creates once per load. */
export interface PageSelectionStore {
  readonly store: SnapshotStore<PageSelection>;
  readonly actions: PageSelectionActions;
}

/** Creates the page-selection store that survives page remounts. */
export function createPageSelectionStore(): PageSelectionStore {
  const store = createSnapshotStore<PageSelection>({});
  return {
    store,
    actions: {
      chooseSession(workspaceId, sessionId): void {
        store.set({ ...store.getSnapshot(), workspaceId, sessionId });
      },
      chooseWorkspace(workspaceId, keepSession): void {
        const current = store.getSnapshot();
        store.set(keepSession ? { ...current, workspaceId } : { workspaceId });
      },
      recordDocument(path): void {
        store.set({ ...store.getSnapshot(), documentPath: path });
      },
    },
  };
}

/** Drives the shared viewer from the page's shown Session. */
export interface PageController {
  /**
   * Shows one Session: loads its workspace and reopens the recorded
   * document. A repeat call for the same Session is a no-op; `undefined`
   * stops observing (nothing is shown, so every watch closes).
   */
  showSession(sessionId: string | undefined): void;
  /** Cancels any in-flight restore and closes every watch. */
  dispose(): void;
}

/**
 * The effect-free restore driver the page's effects delegate to, so the
 * load-then-restore ordering is a plain testable object instead of
 * React-only logic. The recorded document path is captured synchronously
 * at `showSession` entry — the page's recording effect clears it as soon
 * as a remounted page first renders over the disposed, idle open store,
 * so restoring it after the load's await would always read `undefined`.
 */
export function createPageController(
  viewer: ViewerStores,
  pageSelection: SnapshotStore<PageSelection>,
): PageController {
  let shownSessionId: string | undefined;
  let epoch = 0;
  let disposed = false;
  return {
    showSession(sessionId): void {
      if (disposed) {
        return;
      }
      if (sessionId === undefined) {
        if (shownSessionId === undefined) {
          return;
        }
        shownSessionId = undefined;
        epoch += 1;
        viewer.actions.dispose();
        return;
      }
      if (shownSessionId === sessionId) {
        return;
      }
      shownSessionId = sessionId;
      epoch += 1;
      const activeEpoch = epoch;
      // Captured before any await: the recording effect may clear the
      // recorded path while the workspace load is still in flight.
      const recorded = pageSelection.getSnapshot().documentPath;
      void (async () => {
        await viewer.actions.loadWorkspace(sessionId);
        if (disposed || activeEpoch !== epoch) {
          return;
        }
        if (recorded !== undefined) {
          await viewer.actions.openDocument(sessionId, recorded);
        }
      })();
    },
    dispose(): void {
      disposed = true;
      epoch += 1;
      viewer.actions.dispose();
    },
  };
}
