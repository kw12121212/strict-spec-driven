import { rerenderStaleGeneratedDocuments } from "../generated-documents.js";

/** The result key every source-writing command reports its re-rendered documents under. */
export const RERENDERED_DOCUMENTS_KEY = "rerenderedDocuments";

/**
 * Re-renders the generated documents a just-committed source write staled, and folds the paths into
 * the result the command is about to print.
 *
 * The wiring lives here rather than inside each author function because the render is a property of
 * having written a source, not of any one artifact's authoring rules: one wrapper means the eight
 * source-writing commands cannot drift apart in when they render or in what they call the key.
 *
 * A result that reports its own write as rejected renders nothing. `valid: false` is how every
 * author function reports that it wrote no bytes, and a document must not be rewritten on behalf of
 * a mutation that did not happen — a rejected edit would otherwise still rewrite a root-level
 * document, which is a write the operator did not ask for and the command's own exit code denies.
 */
export function withRerenderedDocuments<T extends object>(rootDir: string, result: T): T {
  // The constraint is `object` rather than `{ valid?: boolean }` because not every author result
  // carries a validity flag — design-init reports what it created instead. A result with no flag has
  // no rejection to report, so it is treated as written, which is what those commands mean.
  if ((result as { valid?: unknown }).valid === false) return result;
  return { ...result, [RERENDERED_DOCUMENTS_KEY]: rerenderStaleGeneratedDocuments(rootDir) };
}
