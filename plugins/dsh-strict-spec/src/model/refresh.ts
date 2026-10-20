/**
 * The refresh coordinator: keeps one `changes` watch per loaded directory and
 * one for the open document, and invalidates only the node a watch owns.
 *
 * `changes` observes one file or one directory's direct entries and is not
 * recursive, so correctness demands one watch per loaded directory rather
 * than one for the tree. A watch closes when its node collapses or the
 * document closes, which bounds the watch count to what is visible; a
 * backends that reports `watch-unsupported` leaves the node without live
 * refresh, and the coordinator records that as node health so the tree can
 * surface it instead of implying freshness.
 */
import type { WatchHealth } from "./nodes.ts";
import { workspaceFileErrorCode } from "./port.ts";
import type { WorkspaceFilesPort } from "./port.ts";

/** One invalidation a watch observed, named by the path the model watches. */
export interface InvalidationTarget {
  /** The workspace-relative path the watch was opened for. */
  readonly path: string;
  /** Whether the watched target is a directory or the open document file. */
  readonly kind: "directory" | "file";
  /** Whether the change reported the target gone. */
  readonly absent: boolean;
}

/** What one live watch needs from its owner. */
export interface RefreshCallbacks {
  /** Reports one observed invalidation of a watched target. */
  onInvalidate: (target: InvalidationTarget) => void;
  /** Reports one watch's health change, so the tree can surface it. */
  onHealthChange?: (path: string, health: WatchHealth) => void;
}

/** The bookkeeping one open watch holds. */
interface WatchEntry {
  readonly controller: AbortController;
  health: WatchHealth;
}

/**
 * Coordinates the workspace watch lifecycle for one Session's discovery
 * model. One instance serves one sessionId; the facade recreates it when the
 * Session changes.
 */
export class RefreshCoordinator {
  private readonly directoryWatches = new Map<string, WatchEntry>();
  private openDocumentWatch: WatchEntry | undefined;
  private openDocumentPath: string | undefined;
  private disposed = false;

  constructor(
    private readonly port: WorkspaceFilesPort,
    private readonly sessionId: string,
    private readonly callbacks: RefreshCallbacks,
  ) {}

  /** The recorded health of one watched path, or `none` when unwatched. */
  healthOf(path: string): WatchHealth {
    if (this.openDocumentPath === path) {
      return this.openDocumentWatch?.health ?? "none";
    }
    return this.directoryWatches.get(path)?.health ?? "none";
  }

  /** Opens the watch for one loaded directory; idempotent per path. */
  watchDirectory(path: string): void {
    if (this.disposed || this.directoryWatches.has(path)) {
      return;
    }
    const entry: WatchEntry = { controller: new AbortController(), health: "active" };
    this.directoryWatches.set(path, entry);
    void this.pump(entry, path, "directory");
  }

  /** Closes the watch for one collapsed directory. */
  unwatchDirectory(path: string): void {
    const entry = this.directoryWatches.get(path);
    if (entry === undefined) {
      return;
    }
    this.directoryWatches.delete(path);
    entry.controller.abort();
  }

  /** Opens the watch for the open document, closing any previous one. */
  watchOpenDocument(path: string): void {
    if (this.disposed) {
      return;
    }
    if (this.openDocumentPath === path) {
      return;
    }
    this.unwatchOpenDocument();
    const entry: WatchEntry = { controller: new AbortController(), health: "active" };
    this.openDocumentWatch = entry;
    this.openDocumentPath = path;
    void this.pump(entry, path, "file");
  }

  /** Closes the open document's watch. */
  unwatchOpenDocument(): void {
    const entry = this.openDocumentWatch;
    if (entry === undefined) {
      return;
    }
    this.openDocumentWatch = undefined;
    this.openDocumentPath = undefined;
    entry.controller.abort();
  }

  /** Closes every watch the coordinator holds. */
  dispose(): void {
    this.disposed = true;
    this.unwatchOpenDocument();
    for (const path of [...this.directoryWatches.keys()]) {
      this.unwatchDirectory(path);
    }
  }

  /** Records one health change and reports it to the owner. */
  private setHealth(entry: WatchEntry, path: string, health: WatchHealth): void {
    entry.health = health;
    this.callbacks.onHealthChange?.(path, health);
  }

  /**
   * Iterates one watch's frame stream until it ends: `ready` confirms the
   * watcher, each `change` reports one invalidation of the watched path, an
   * intentional close exits quietly, `watch-unsupported` records the missing
   * live refresh, and any other end or failure records a failed watch.
   */
  private async pump(entry: WatchEntry, path: string, kind: "directory" | "file"): Promise<void> {
    try {
      for await (const frame of this.port.changes(this.sessionId, path, entry.controller.signal)) {
        if (frame.kind === "ready") {
          this.setHealth(entry, path, "active");
        }
        if (frame.kind === "change") {
          this.callbacks.onInvalidate({ path, kind, absent: "absent" in frame.change });
        }
      }
      if (!entry.controller.signal.aborted) {
        this.setHealth(entry, path, "failed");
      }
    } catch (error) {
      if (entry.controller.signal.aborted) {
        return;
      }
      this.setHealth(
        entry,
        path,
        workspaceFileErrorCode(error) === "workspace-file/watch-unsupported" ? "unsupported" : "failed",
      );
    }
  }
}
