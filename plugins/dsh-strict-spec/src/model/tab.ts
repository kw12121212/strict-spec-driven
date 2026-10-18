/**
 * The right-sidebar tab model: per-Session viewer surfaces for the
 * Session-bound strict documents tab, plus the effect-free controller each
 * tab body delegates its mount lifecycle to.
 *
 * The dsh right sidebar holds one docking surface per Session, and the
 * `sidebar.right.pane.tab` seat hands a tab body the sessionId of the
 * Session surface rendering it. This module turns that into data: one
 * `TabSurface` per sessionId — its own viewer stores, so two mounted
 * surfaces never couple their loads — and a `TabController` the body's
 * effects only delegate to, per the plugin conventions. The controller is
 * restartable: `dispose()` closes the surface's watches and resets it, so
 * the default unmount-on-Session-switch teardown leaves a surface that
 * remounts cleanly when the operator returns, while the registration's own
 * disposal clears every cached surface. Modules here stay dsh-free like the
 * rest of the model, testable under bun test/run.ts with the scripted fake.
 */
import { createViewerStores } from "./store.ts";
import type { ViewerStores } from "./store.ts";
import type { WorkspaceFilesPort } from "./port.ts";

/**
 * Drives one tab surface's viewer from the Session the seat bound it to.
 * The load-once and reset-on-dispose ordering lives here as a plain object
 * so suites prove it without a React effect runtime.
 */
export interface TabController {
  /**
   * Ensures the bound Session's workspace is loading or loaded; a repeat
   * call is a no-op. A load superseded by `dispose` writes nothing, because
   * the viewer's own staleness guard sees the watched Session cleared.
   */
  show(): void;
  /**
   * Closes this surface's directory and open-document watches and resets
   * it; a later `show()` loads the workspace again.
   */
  dispose(): void;
}

/** One Session's tab surface: what the seat's inject factory hands the body. */
export interface TabSurface {
  /** The sessionId of the Session surface rendering the tab. */
  readonly sessionId: string;
  /** This Session's viewer stores; never shared with another Session. */
  readonly viewer: ViewerStores;
  /** The effect-free controller the body's mount effects delegate to. */
  readonly controller: TabController;
}

/** The per-Session surface cache the tab registration owns. */
export interface TabSurfaces {
  /** Returns the surface bound to one sessionId, creating it on first use. */
  get(sessionId: string): TabSurface;
  /** Disposes and forgets every cached surface; later gets create fresh ones. */
  dispose(): void;
}

/**
 * Creates the controller for one tab surface. `show()` starts at most one
 * workspace load per surface lifetime between resets — the page controller
 * pattern minus the page's recorded-document restore, which the tab does
 * not carry — and `dispose()` hands the teardown to the viewer's dispose
 * contract, which closes every watch and abandons any in-flight load by
 * clearing the watched Session the load's staleness guard reads.
 */
export function createTabController(viewer: ViewerStores, sessionId: string): TabController {
  let shown = false;
  return {
    show(): void {
      if (shown) {
        return;
      }
      shown = true;
      void viewer.actions.loadWorkspace(sessionId);
    },
    dispose(): void {
      shown = false;
      viewer.actions.dispose();
    },
  };
}

/**
 * Creates the per-Session tab surfaces over one shared remote port. The
 * port is a stateless adapter, so the page viewer and the tab surfaces can
 * share it; the stores are per surface, so a Session switch never mixes two
 * workspaces' trees. Cached surfaces survive their body's unmount disposed
 * and idle, and the registration's disposer calls `dispose()` to clear them
 * all when the plugin unloads.
 */
export function createTabSurfaces(port: WorkspaceFilesPort): TabSurfaces {
  const surfaces = new Map<string, TabSurface>();
  return {
    get(sessionId: string): TabSurface {
      const cached = surfaces.get(sessionId);
      if (cached !== undefined) {
        return cached;
      }
      const viewer = createViewerStores(port);
      const surface: TabSurface = { sessionId, viewer, controller: createTabController(viewer, sessionId) };
      surfaces.set(sessionId, surface);
      return surface;
    },
    dispose(): void {
      for (const surface of surfaces.values()) {
        surface.controller.dispose();
      }
      surfaces.clear();
    },
  };
}
