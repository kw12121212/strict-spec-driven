/**
 * The shared record-field readers and the known-keys partition every
 * dedicated renderer's view model builds on. One module owns them so the
 * additional-fields partition is a single implementation: the guarantee
 * that the dedicated additional-fields section and the generic view can
 * never disagree about how a YAML shape renders lives here once, and every
 * mapper — change, delta, and project-context — derives from it.
 */
import { documentParts } from "./documentParts.ts";
import type { DocumentBlock } from "./documentParts.ts";

/** One scalar header fact, rendered exactly as the generic view draws it. */
export interface HeaderFact {
  readonly key: string;
  readonly text: string;
}

/** Reads one non-empty string field of a record, when it is one. */
export function stringField(record: unknown, key: string): string | undefined {
  if (typeof record === "object" && record !== null && key in record) {
    const value = (record as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

/** Reads the single keyed child of a record, when the key holds it. */
export function soleValue(record: unknown, key: string): unknown {
  if (typeof record === "object" && record !== null && key in record) {
    return (record as Record<string, unknown>)[key];
  }
  return undefined;
}

/** Collects the string entries of one sequence value, skipping non-strings. */
export function stringEntries(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

/**
 * Renders one scalar value as the view's text, preserving the YAML
 * spelling; booleans and numbers use their plain spelling, and non-scalars
 * yield undefined so their own mappers handle them.
 */
export function scalarText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim().length > 0 ? value : undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

/** Reads one scalar field of a record as the view's text, when it is one. */
export function scalarField(record: unknown, key: string): string | undefined {
  if (typeof record === "object" && record !== null && key in record) {
    return scalarText((record as Record<string, unknown>)[key]);
  }
  return undefined;
}

/**
 * Partitions one parsed document for a dedicated renderer: the scalar header
 * renders as the generic view draws it, and the additional blocks carry every
 * top-level block field the dedicated layout does not present, derived from
 * the same generic mapper so the two presentations can never disagree about
 * how a YAML shape renders.
 */
export function partitionDocument(data: unknown, knownKeys: ReadonlySet<string>): { header: HeaderFact[]; additional: DocumentBlock[] } {
  const parts = documentParts(data);
  return {
    header: [...parts.header],
    additional: parts.blocks.filter((block) => !knownKeys.has(block.title)),
  };
}
