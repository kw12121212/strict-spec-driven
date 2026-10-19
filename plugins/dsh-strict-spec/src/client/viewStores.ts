/**
 * The one shared context-free tree-store reader every dedicated renderer
 * that navigates consumes: the identity-stable fallback store that keeps
 * context-free static renders on a single snapshot, and the hook that
 * reads the tree's documents record from the view context. One module
 * owns them so a second view module can never restate the fallback and
 * let its context-free identity contract drift from the first's.
 */
import { useSyncExternalStore } from "react";
import type { ViewContext } from "./changeParts.ts";
import type { DocumentRecord, TreeState } from "../model/nodes.ts";

/** The readable face of a snapshot store the context-free fallbacks satisfy. */
interface ReadableStore<T> {
  subscribe(onStoreChange: () => void): () => void;
  getSnapshot(): T;
}

/** A stable empty tree state, so context-free renders keep one snapshot. */
const EMPTY_TREE_STATE: TreeState = { status: "ready", families: [], documents: {} };

/** The stable fallback tree store for context-free renders. */
const FALLBACK_TREE_STORE: ReadableStore<TreeState> = {
  subscribe: () => () => undefined,
  getSnapshot: () => EMPTY_TREE_STATE,
};

/**
 * Reads the tree's documents record from the view context, when one
 * exists: the store's own snapshot source serves the static-render
 * fallback, so one hook shape serves both the hosted and context-free
 * paths without varying on the context's presence.
 */
export function useTreeDocuments(context: ViewContext | undefined): Readonly<Record<string, DocumentRecord>> {
  const store: ReadableStore<TreeState> = context === undefined ? FALLBACK_TREE_STORE : context.viewer.tree;
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).documents;
}
