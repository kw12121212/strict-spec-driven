/**
 * The collapsible document tree: the shared component both viewer entry
 * points render.
 *
 * Rows flatten from the discovery store's tree state and render on the
 * shared ui-primitives disclosure row and file-type glyph, one consistent
 * CSS Module indentation step per depth level, with the entry count of each
 * loaded group and the declared status badge of each milestone and planned
 * change. Archived groups stay collapsed with their entries unread until
 * expansion, truncation markers render as explicit notices, and the viewport
 * virtualizes rows through the host-shared @tanstack/react-virtual so an
 * expanded archive of hundreds of changes stays responsive. The keyboard
 * model, flattening, and presentation facts live in the React-free row
 * model, so this component owns only rendering, focus, and store actions.
 */
import { useCallback, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DisclosureRow, FileTypeIcon, Tag } from "@deepseek-ai/dsh-client-ui-primitives";
import type { SnapshotStore } from "@deepseek-ai/dsh-client-store";
import type { Translate } from "@deepseek-ai/dsh-client-ui-slots";
import type { TreeState } from "../model/nodes.ts";
import type { FamilyId } from "../model/nodes.ts";
import type { ViewerActions } from "../model/store.ts";
import { flattenTreeRows, keyOutcomeFor } from "./treeRows.ts";
import type { TreeRow } from "./treeRows.ts";
import type { StrictSpecKey } from "./locales.ts";
import styles from "./DocumentTree.module.css";

/**
 * The locale key each family root's plugin-defined label renders through:
 * family ids are viewer constants, not workspace data, so they localize like
 * every other user-visible string instead of rendering as raw ids.
 */
const FAMILY_LABEL_KEYS: Readonly<Record<FamilyId, StrictSpecKey>> = {
  config: "tree.family.config",
  architecture: "tree.family.architecture",
  roadmap: "tree.family.roadmap",
  changes: "tree.family.changes",
  scenes: "tree.family.scenes",
  specs: "tree.family.specs",
  tech: "tree.family.tech",
  lessons: "tree.family.lessons",
  sops: "tree.family.sops",
  "design-system": "tree.family.design-system",
};

/** Props the document tree consumes: stores and actions only, per the plugin conventions. */
export interface DocumentTreeProps {
  /** The Session whose workspace the tree shows; every action call takes it. */
  readonly sessionId: string;
  /** The discovery tree store the rows flatten from. */
  readonly tree: SnapshotStore<TreeState>;
  /** The store actions that expand, collapse, and open. */
  readonly actions: ViewerActions;
  /** The strictSpec translate function; every visible string renders through it. */
  readonly t: Translate<StrictSpecKey>;
}

/** The tone a declared status badges with; unknown statuses stay outlined. */
const STATUS_TONES: Readonly<Record<string, "success" | "info" | "neutral" | "warning" | "outline" | "quiet">> = {
  complete: "success",
  active: "info",
  accepted: "success",
  proposed: "info",
  planned: "neutral",
  deferred: "warning",
  paused: "warning",
  obsolete: "quiet",
};

/** Renders one visible tree row: a disclosure row, a document row, or a truncation notice. */
function TreeRowView(
  props: {
    readonly row: TreeRow;
    readonly focused: boolean;
    readonly t: Translate<StrictSpecKey>;
    readonly onToggle: (row: TreeRow) => void;
  },
): ReactNode {
  const { row, focused, t, onToggle } = props;
  const depthStyle = { "--dssw-depth": row.depth } as CSSProperties;
  if (row.kind === "truncation") {
    return (
      <div className={styles.truncation} style={depthStyle} role="presentation">
        {t("tree.truncated")}
      </div>
    );
  }
  const icon = (
    <FileTypeIcon path={row.path} size={16} />
  );
  // Family roots render their localized plugin label; every other row shows
  // the workspace-derived label from the model.
  const title = row.kind === "family" ? t(FAMILY_LABEL_KEYS[row.family]) : row.label;
  const accessory = (
    <>
      {row.status === undefined ? null : (
        <Tag tone={STATUS_TONES[row.status] ?? "outline"}>{row.status}</Tag>
      )}
      {row.taskCompletion === undefined ? null : (
        <Tag tone={row.taskCompletion.done === row.taskCompletion.total ? "success" : "info"}>
          {t("tree.task-completion", { done: row.taskCompletion.done, total: row.taskCompletion.total })}
        </Tag>
      )}
      {row.count === undefined ? null : (
        <span className={styles.count}>{t("tree.group-count", { count: row.count })}</span>
      )}
    </>
  );
  return (
    <div
      className={styles.row}
      style={depthStyle}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-expanded={row.expandable ? row.open : undefined}
      aria-selected={row.document && focused ? true : undefined}
      data-focused={focused ? "" : undefined}
    >
      <DisclosureRow
        icon={icon}
        title={title}
        open={row.open}
        expandable={row.expandable}
        onToggle={() => onToggle(row)}
        headerAccessory={accessory}
        className={styles.disclosure}
      />
    </div>
  );
}

/** Renders the collapsible document tree of one Session workspace. */
export function DocumentTree(props: DocumentTreeProps): ReactNode {
  const { sessionId, tree, actions, t } = props;
  // The third argument serves static rendering, where the server dispatcher
  // resolves the initial snapshot through it; the value equals the client's
  // own snapshot source, so the two paths can never disagree.
  const state = useSyncExternalStore(tree.subscribe, tree.getSnapshot, tree.getSnapshot);
  const [focusedId, setFocusedId] = useState<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rows = flattenTreeRows(state);
  const effectiveFocusedId = focusedId !== undefined && rows.some((row) => row.id === focusedId)
    ? focusedId
    : rows[0]?.id;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 28,
    overscan: 8,
    // The pre-measurement viewport: the host's first paint and every static
    // render window rows from this rect until the scroll element is measured.
    initialRect: { width: 320, height: 480 },
    getItemKey: (index) => rows[index]?.id ?? index,
  });

  /** Applies one row toggle: groups expand and collapse, documents open. */
  const handleToggle = useCallback(
    (row: TreeRow): void => {
      if (row.expandable) {
        if (row.open) {
          actions.collapseNode(sessionId, row.id);
        } else {
          void actions.expandNode(sessionId, row.id);
        }
        return;
      }
      if (row.document) {
        void actions.openDocument(sessionId, row.path);
      }
    },
    [actions, sessionId],
  );

  /** Resolves one keyboard interaction through the row model and applies it. */
  const handleKeyDown = useCallback(
    (event: { readonly key: string; readonly preventDefault: () => void }): void => {
      const outcome = keyOutcomeFor(rows, effectiveFocusedId, event.key);
      if (outcome === undefined) {
        return;
      }
      event.preventDefault();
      if (outcome.focusId !== undefined) {
        setFocusedId(outcome.focusId);
        const index = rows.findIndex((row) => row.id === outcome.focusId);
        if (index >= 0) {
          virtualizer.scrollToIndex(index);
        }
        return;
      }
      if (outcome.activation === undefined || effectiveFocusedId === undefined) {
        return;
      }
      const row = rows.find((candidate) => candidate.id === effectiveFocusedId);
      if (row === undefined) {
        return;
      }
      if (outcome.activation === "expand") {
        void actions.expandNode(sessionId, row.id);
      } else if (outcome.activation === "collapse") {
        actions.collapseNode(sessionId, row.id);
      } else if (outcome.activation === "open") {
        void actions.openDocument(sessionId, row.path);
      }
    },
    [actions, effectiveFocusedId, rows, sessionId, virtualizer],
  );

  if (state.status === "loading") {
    return <div className={styles.state} role="status">{t("tree.loading")}</div>;
  }
  if (state.status === "empty") {
    return <div className={styles.state} role="status">{t("tree.empty")}</div>;
  }
  if (state.status === "error") {
    return <div className={styles.state} role="alert">{t("tree.error", { code: state.errorCode ?? "unknown" })}</div>;
  }
  return (
    <div
      className={styles.viewport}
      role="tree"
      aria-label={t("tree.label")}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {state.rootTruncated ? <div className={styles.truncation} role="presentation">{t("tree.root-truncated")}</div> : null}
      <div ref={scrollRef} className={styles.scroll}>
        <div className={styles.rows} style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            if (row === undefined) {
              return null;
            }
            return (
              <div
                key={item.key}
                className={styles.virtualRow}
                style={{ transform: `translateY(${item.start}px)` }}
                data-index={item.index}
              >
                <TreeRowView row={row} focused={row.id === effectiveFocusedId} t={t} onToggle={handleToggle} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
