/**
 * The document shape mapper: turns one parsed strict YAML document into the
 * presentation parts of the generic structured view.
 *
 * The mapping is purely structural and knows no artifact type: top-level
 * scalar fields form the header, multiline strings become wrapped paragraph
 * parts, top-level mapping values become titled sections, sequence values
 * become lists, and mapping or sequence values nested below the top level
 * become collapsible blocks. Keeping the mapping React-free makes the
 * rendered structure deterministically testable and leaves the next
 * milestone free to replace presentation per artifact type.
 */

/** One scalar value as the view renders it. */
export interface ScalarPart {
  readonly kind: "scalar";
  /** The value rendered as text; booleans and numbers use their YAML spelling. */
  readonly text: string;
  /** Whether the scalar spans lines and renders as a wrapped paragraph. */
  readonly multiline: boolean;
}

/** One field of a mapping: a key plus the part its value renders as. */
export interface DocumentField {
  readonly key: string;
  readonly value: DocumentPart;
}

/** One rendered value of the structured view. */
export type DocumentPart =
  | ScalarPart
  | { readonly kind: "mapping"; readonly fields: readonly DocumentField[] }
  | { readonly kind: "sequence"; readonly items: readonly DocumentPart[] };

/** One top-level block of the view: a titled section, a list, or a paragraph. */
export type DocumentBlock =
  | { readonly kind: "section"; readonly title: string; readonly fields: readonly DocumentField[] }
  | { readonly kind: "list"; readonly title: string; readonly items: readonly DocumentPart[] }
  | { readonly kind: "paragraph"; readonly title: string; readonly text: string };

/** The presentation parts of one parsed strict document. */
export interface DocumentParts {
  /** Top-level scalar fields, rendered as the view's header. */
  readonly header: readonly { readonly key: string; readonly text: string }[];
  /** Top-level non-scalar and multiline fields, in declaration order. */
  readonly blocks: readonly DocumentBlock[];
}

/** Renders one scalar as the view's text, preserving the YAML spelling. */
function scalarPart(value: unknown): ScalarPart {
  if (typeof value === "string") {
    return { kind: "scalar", text: value, multiline: value.includes("\n") };
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return { kind: "scalar", text: String(value), multiline: false };
  }
  // YAML null and any exotic node render as their plain spelling.
  return { kind: "scalar", text: value === null ? "null" : String(value), multiline: false };
}

/** Maps one parsed YAML value onto the part the view renders for it. */
function partFor(value: unknown): DocumentPart {
  if (Array.isArray(value)) {
    return { kind: "sequence", items: value.map(partFor) };
  }
  if (typeof value === "object" && value !== null) {
    return { kind: "mapping", fields: Object.entries(value as Record<string, unknown>).map(([key, entry]) => ({ key, value: partFor(entry) })) };
  }
  return scalarPart(value);
}

/** Whether one parsed value is a mapping the view renders as fields. */
function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Maps one parsed strict document onto its presentation parts. A document
 * whose root is not a mapping — an empty file parses to undefined — yields
 * no header and no blocks, which the view renders as its empty-document
 * condition rather than inventing structure.
 */
export function documentParts(data: unknown): DocumentParts {
  if (!isMapping(data)) {
    return { header: [], blocks: [] };
  }
  const header: { key: string; text: string }[] = [];
  const blocks: DocumentBlock[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (isMapping(value)) {
      blocks.push({
        kind: "section",
        title: key,
        fields: Object.entries(value).map(([fieldKey, fieldValue]) => ({ key: fieldKey, value: partFor(fieldValue) })),
      });
      continue;
    }
    if (Array.isArray(value)) {
      blocks.push({ kind: "list", title: key, items: value.map(partFor) });
      continue;
    }
    const scalar = scalarPart(value);
    if (scalar.multiline) {
      blocks.push({ kind: "paragraph", title: key, text: scalar.text });
      continue;
    }
    header.push({ key, text: scalar.text });
  }
  return { header, blocks };
}
