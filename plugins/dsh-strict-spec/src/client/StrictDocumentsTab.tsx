/**
 * The strict documents right-sidebar tab body: the Session-bound,
 * pane-width surface the sidebar.right.pane.tab seat renders for the
 * Session whose docking surface holds the tab.
 *
 * The seat's inject factory hands the body one per-Session surface — the
 * viewer stores and the effect-free controller the model owns — so the
 * component itself stays a pure props consumer: it stacks the shared
 * DocumentTree above the shared DocumentView in one column sized to the
 * pane width, and delegates its mount lifecycle to the controller. The
 * default unmount-on-Session-switch behavior of a non-keepMounted tab body
 * runs the teardown: unmounting disposes the surface's watches, and
 * remounting reloads the workspace, so the tab follows the active Session
 * with exactly one Session observed at a time. The tree's loading, empty,
 * and error conditions and the renderer's own states render as they do on
 * the page, and every visible string renders through the strictSpec
 * catalogs, per the plugin conventions.
 */
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import type { Translate } from "@deepseek-ai/dsh-client-ui-slots";
import type { SnapshotStore } from "@deepseek-ai/dsh-client-store";
import { DocumentTree } from "./DocumentTree.tsx";
import { DocumentView } from "./DocumentView.tsx";
import type { TabSurface } from "../model/tab.ts";
import type { StrictSpecKey } from "./locales.ts";
import styles from "./StrictDocumentsTab.module.css";

/** Props the strict documents tab consumes, per the plugin conventions. */
export interface StrictDocumentsTabProps {
  /** The per-Session surface the seat's inject factory bound this body to. */
  readonly surface: TabSurface;
  /** The strictSpec translate function; every visible string renders through it. */
  readonly t: Translate<StrictSpecKey>;
}

/**
 * Reads a store through useSyncExternalStore with the static-render
 * fallback getSnapshot, the same pattern the page uses.
 */
function useSnapshot<T>(store: SnapshotStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** Renders the strict documents right-sidebar tab body. */
export function StrictDocumentsTab(props: StrictDocumentsTabProps): ReactNode {
  const { surface, t } = props;
  const openState = useSnapshot(surface.viewer.open);
  // Delegate the mount lifecycle to the effect-free controller: show loads
  // this surface's Session workspace once, and the unmount teardown closes
  // its directory and open-document watches.
  useEffect(() => {
    surface.controller.show();
  }, [surface]);
  useEffect(() => () => surface.controller.dispose(), [surface]);

  return (
    <div className={styles.tab}>
      <div className={styles.treeRegion} role="region" aria-label={t("tab.tree-region")}>
        <DocumentTree sessionId={surface.sessionId} tree={surface.viewer.tree} actions={surface.viewer.actions} t={t} />
      </div>
      <div className={styles.documentRegion} role="region" aria-label={t("tab.document-region")}>
        <DocumentView state={openState} t={t} />
      </div>
    </div>
  );
}
