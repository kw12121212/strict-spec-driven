import { generateArchitectureDocument } from "./architecture.js";
import { generateDesignDocument } from "./design-system.js";
import { DocumentSourceError, type DocumentRenderResult } from "./document-render.js";

/**
 * One generated document, named once for every consumer that has to reason about it.
 *
 * The renderer is stored in its general form rather than pre-bound to check mode, because the two
 * consumers need opposite modes over the same document: the maintenance check reports drift without
 * writing, and the post-write step rewrites it. Storing one check-bound function and letting the
 * writer reach for the renderer directly would put the list of generated documents in two places,
 * which is how a document ends up checked but never re-rendered.
 */
export type GeneratedDocumentTarget = {
  /** The command an operator runs to re-render this document by hand. */
  reRenderCommand: string;
  render: (rootDir: string, options?: { check?: boolean }) => DocumentRenderResult;
};

/**
 * The generated documents this workflow renders from strict YAML sources.
 *
 * Both renderers already render in memory, compare against disk, and name the sources that went
 * stale in check mode, so consumers reuse them rather than reimplementing comparison. A third
 * generated document is added here once and is picked up by the maintenance check and by every
 * source-writing command at the same time.
 */
export const GENERATED_DOCUMENT_TARGETS: GeneratedDocumentTarget[] = [
  {
    reRenderCommand: "strict-spec-cli architecture-generate",
    render: (rootDir, options) => generateArchitectureDocument(rootDir, options),
  },
  {
    reRenderCommand: "strict-spec-cli design-generate",
    render: (rootDir, options) => generateDesignDocument(rootDir, options),
  },
];

/**
 * The mutation-inventory artifact kinds whose artifacts the renderers above read.
 *
 * Declared here so the set of commands that must re-render is derivable rather than remembered: the
 * inventory names the owning commands for each kind, and a command that gains ownership of one of
 * these kinds is a command that can stale a generated document. Without this list the wired set
 * would be a hand-kept enumeration in seven files, and the eighth command to write a source would
 * join them silently.
 */
export const GENERATED_DOCUMENT_SOURCE_KINDS = [
  "architecture-state",
  "design-system-state",
  "spec-state",
  "tech-state",
  "workflow-config",
] as const;

/**
 * Re-renders every generated document that is present on disk and no longer matches its sources.
 *
 * Called by a command after its source write commits, so a command that stales a generated document
 * leaves it current instead of handing the drift to whoever runs next. The two skip rules are the
 * ones the maintenance check already applies, and they have to stay the same: a document absent from
 * disk is declined rather than stale, so rendering one here would push an unrequested root-level file
 * into a project that never asked for it, and an unreadable source artifact has nothing to render
 * from. If the two disagreed, the check would report drift the writer refused to fix, or the writer
 * would create a document the check treats as declined.
 *
 * Returns the repo-relative paths it rewrote, for the caller to report: seven commands gain a write
 * beyond the artifact they are named for, and a caller reading only the command name has no other
 * way to learn that a root-level document changed.
 */
export function rerenderStaleGeneratedDocuments(rootDir: string): string[] {
  const rerendered: string[] = [];

  for (const target of GENERATED_DOCUMENT_TARGETS) {
    let status: DocumentRenderResult;
    try {
      status = target.render(rootDir, { check: true });
    } catch (error) {
      if (error instanceof DocumentSourceError) continue;
      throw error;
    }

    if (!status.documentExists || status.current) continue;
    rerendered.push(target.render(rootDir).outputPath);
  }

  return rerendered;
}
