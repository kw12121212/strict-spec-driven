/**
 * The strict documents page: the two-pane main page the left-sidebar panel
 * icon opens.
 *
 * The main keyed slot receives no Session binding while every
 * remote.workspaceFiles call needs a sessionId, so the page owns an
 * explicit Session picker fed by the picker port, grouping Sessions by
 * Workspace and remembering the last choice in the root-scoped page
 * selection. A chosen Session shows the shared document tree in the left
 * pane and the shared generic renderer in the wide right pane; a
 * sessionless Workspace shows a prompt to open a Session instead of
 * reading its files without authority. Reopening the page restores the
 * chosen Session and the selected document from page state. The component
 * reads data only through its props — picker port, page-selection store,
 * viewer stores, and the translate function — per the plugin conventions.
 */
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import type { Translate } from "@deepseek-ai/dsh-client-ui-slots";
import type { SnapshotStore } from "@deepseek-ai/dsh-client-store";
import { DocumentTree } from "./DocumentTree.tsx";
import { DocumentView } from "./DocumentView.tsx";
import { revealAnchor } from "./anchorReveal.ts";
import { resolveShownSession } from "../model/picker.ts";
import type { PageController, PageSelection, PageSelectionActions, PickerCatalog, SessionCatalogPort } from "../model/picker.ts";
import type { ViewerStores } from "../model/store.ts";
import type { StrictSpecKey } from "./locales.ts";
import styles from "./StrictDocumentsPage.module.css";

/** The picker option value for one Session choice. */
const SESSION_VALUE_PREFIX = "session:";

/** The picker option value for one sessionless Workspace choice. */
const WORKSPACE_VALUE_PREFIX = "workspace:";

/** Props the strict documents page consumes, per the plugin conventions. */
export interface StrictDocumentsPageProps {
  /** The grouped Session catalog seam the picker renders. */
  readonly picker: SessionCatalogPort;
  /** The root-scoped page selection that survives page remounts. */
  readonly pageSelection: SnapshotStore<PageSelection>;
  /** The actions that record page choices. */
  readonly pageActions: PageSelectionActions;
  /** The effect-free controller that drives the viewer from the shown Session. */
  readonly controller: PageController;
  /** The shared viewer stores both entry points drive. */
  readonly viewer: ViewerStores;
  /** The strictSpec translate function; every visible string renders through it. */
  readonly t: Translate<StrictSpecKey>;
}

/**
 * Reads a store through useSyncExternalStore with the static-render
 * fallback getSnapshot, the same pattern the tree uses.
 */
function useSnapshot<T>(store: SnapshotStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** Renders one grouped picker catalog as optgroup/option markup. */
function PickerOptions(props: { readonly catalog: PickerCatalog; readonly t: Translate<StrictSpecKey> }): ReactNode {
  const { catalog, t } = props;
  return (
    <>
      {catalog.workspaces.map((workspace) => (
        <optgroup key={workspace.workspaceId} label={workspace.title}>
          {workspace.sessions.length > 0 ? (
            workspace.sessions.map((session) => (
              <option key={session.sessionId} value={`${SESSION_VALUE_PREFIX}${session.sessionId}`}>
                {session.displayTitle}
              </option>
            ))
          ) : (
            <option value={`${WORKSPACE_VALUE_PREFIX}${workspace.workspaceId}`}>{t("page.workspace-empty")}</option>
          )}
        </optgroup>
      ))}
      {catalog.ungrouped.length > 0 ? (
        <optgroup label={t("page.workspace-other")}>
          {catalog.ungrouped.map((session) => (
            <option key={session.sessionId} value={`${SESSION_VALUE_PREFIX}${session.sessionId}`}>
              {session.displayTitle}
            </option>
          ))}
        </optgroup>
      ) : null}
    </>
  );
}

/** Renders the strict documents two-pane main page. */
export function StrictDocumentsPage(props: StrictDocumentsPageProps): ReactNode {
  const { picker, pageSelection, pageActions, viewer, t } = props;
  const catalog = useSyncExternalStore(picker.subscribe, picker.getCatalog, picker.getCatalog);
  const selection = useSnapshot(pageSelection);
  const openState = useSnapshot(viewer.open);
  const shown = resolveShownSession(catalog, selection);
  // The picker's current value: the shown Session, or the sessionless
  // Workspace prompt option when only a Workspace resolves.
  const pickerValue = shown.sessionId !== undefined
    ? `${SESSION_VALUE_PREFIX}${shown.sessionId}`
    : shown.workspaceId !== undefined
      ? `${WORKSPACE_VALUE_PREFIX}${shown.workspaceId}`
      : "";
  const controller = props.controller;

  // Drive the shared viewer from the shown Session through the effect-free
  // page controller: it loads the shown workspace, restores the recorded
  // document captured before any await, tears the previous Session's
  // watches down on switch, stops observing when no Session resolves, and
  // closes every watch on unmount.
  useEffect(() => {
    controller.showSession(shown.sessionId);
  }, [shown.sessionId, controller]);
  useEffect(() => () => controller.dispose(), [controller]);

  // Keep the recorded document in page state as the operator opens and
  // closes documents, so reopening the page restores the last one.
  useEffect(() => {
    if (shown.sessionId === undefined) {
      return;
    }
    pageActions.recordDocument(openState.status === "ready" || openState.status === "error" || openState.status === "absent" ? openState.path : undefined);
  }, [openState, pageActions, shown.sessionId]);

  // Reveal the anchored element the open document names — a covering
  // requirement opened from a scene step — once the view has rendered it.
  useEffect(() => {
    revealAnchor(openState.anchor);
  }, [openState]);

  /** Applies one picker choice from its option value. */
  function handlePickerChange(value: string): void {
    if (value.startsWith(SESSION_VALUE_PREFIX)) {
      const sessionId = value.slice(SESSION_VALUE_PREFIX.length);
      const workspace = catalog.workspaces.find((candidate) =>
        candidate.sessions.some((session) => session.sessionId === sessionId));
      if (sessionId !== shown.sessionId) {
        // A newly chosen Session invalidates the recorded document: it
        // belongs to the previous Session's workspace.
        pageActions.recordDocument(undefined);
      }
      pageActions.chooseSession(workspace?.workspaceId, sessionId);
      return;
    }
    if (value.startsWith(WORKSPACE_VALUE_PREFIX)) {
      const workspaceId = value.slice(WORKSPACE_VALUE_PREFIX.length);
      const workspace = catalog.workspaces.find((candidate) => candidate.workspaceId === workspaceId);
      // The recorded Session survives the choice only while it is a member
      // of the chosen Workspace; otherwise it and its recorded document
      // clear, so the sessionless Workspace shows its prompt.
      const keepSession = workspace !== undefined
        && selection.sessionId !== undefined
        && workspace.sessions.some((session) => session.sessionId === selection.sessionId);
      pageActions.chooseWorkspace(workspaceId, keepSession);
    }
  }

  if (catalog.status === "loading") {
    return <div className={styles.state} role="status">{t("page.loading")}</div>;
  }
  if (catalog.status === "error") {
    return <div className={styles.state} role="alert">{t("page.error")}</div>;
  }

  const emptyHost = catalog.workspaces.length === 0 && catalog.ungrouped.length === 0;
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <label className={styles.pickerLabel} htmlFor="strict-spec-session-picker">{t("page.picker-label")}</label>
        {emptyHost ? (
          <span className={styles.pickerEmpty}>{t("page.no-sessions")}</span>
        ) : (
          <select
            id="strict-spec-session-picker"
            className={styles.picker}
            value={pickerValue}
            onChange={(event) => handlePickerChange(event.target.value)}
          >
            {pickerValue === "" ? <option value="">{t("page.picker-placeholder")}</option> : null}
            <PickerOptions catalog={catalog} t={t} />
          </select>
        )}
      </header>
      {emptyHost ? (
        <div className={styles.state} role="status">{t("page.no-sessions")}</div>
      ) : shown.sessionId !== undefined ? (
        <div className={styles.panes}>
          <div className={styles.treePane} role="region" aria-label={t("page.tree-pane")}>
            <DocumentTree sessionId={shown.sessionId} tree={viewer.tree} actions={viewer.actions} open={viewer.open} t={t} />
          </div>
          <div className={styles.documentPane} role="region" aria-label={t("page.document-pane")}>
            <DocumentView state={openState} t={t} context={{ sessionId: shown.sessionId, viewer }} />
          </div>
        </div>
      ) : shown.workspaceId !== undefined ? (
        <div className={styles.state} role="status">{t("page.no-session-prompt")}</div>
      ) : (
        <div className={styles.state} role="status">{t("page.picker-placeholder")}</div>
      )}
    </div>
  );
}
