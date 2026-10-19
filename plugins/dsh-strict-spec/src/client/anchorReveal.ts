/**
 * The anchored-document reveal: scrolls the element a document's recorded
 * anchor names into view, so a covering requirement opened from a scene
 * step's coverage link is the element the reader lands on.
 *
 * The lookup is injectable so the reveal decision — which anchor resolves,
 * and whether the resolved element scrolls — is assertable under
 * bun test/run.ts with a scripted element and no DOM; the default lookup
 * reads the host document only when one exists, keeping static renders
 * and the dsh-free suite free of any DOM dependency.
 */

/** The face of an element the reveal needs, so tests can script one. */
export interface RevealableElement {
  scrollIntoView(options?: { block?: "start" | "center" | "end" | "nearest" }): void;
}

/** Looks one element up by id in the host document, when one exists. */
function hostElementById(id: string): RevealableElement | null {
  if (typeof document === "undefined") {
    return null;
  }
  const element = document.getElementById(id);
  return element === null ? null : { scrollIntoView: (options) => element.scrollIntoView(options) };
}

/**
 * Reveals the element one anchor names: no anchor or no resolved element
 * reveals nothing and reports false, and a resolved element scrolls into
 * view at the block start and reports true.
 */
export function revealAnchor(
  anchor: string | undefined,
  lookup: (id: string) => RevealableElement | null = hostElementById,
): boolean {
  if (anchor === undefined || anchor.length === 0) {
    return false;
  }
  const element = lookup(anchor);
  if (element === null) {
    return false;
  }
  element.scrollIntoView({ block: "start" });
  return true;
}
