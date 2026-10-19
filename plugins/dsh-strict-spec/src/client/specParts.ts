/**
 * The spec view-model mappers: turn one parsed main spec and one parsed
 * specs index into the presentation structure their dedicated renderers
 * draw, keeping the mapping React-free so rendered structure is
 * deterministically testable under bun test/run.ts.
 *
 * Every mapper follows the same unknown-field contract the milestone's
 * unknown-field-display answer settles: the scalar header renders exactly
 * as the generic view draws it, the dedicated body presents the declared
 * fields the layout knows, and every top-level field the layout does not
 * present survives as generic blocks an additional-fields section renders,
 * so a newer schema version never makes content disappear from the reader.
 *
 * The module also owns the stable requirement anchor id: the spec view
 * renders one anchor per requirement, and a scene step's coverage link
 * opens the covering requirement through that anchor, so the two sides
 * derive the same id from one exported function instead of agreeing by
 * convention.
 */
import type { DedicatedView } from "./changeParts.ts";
import { partitionDocument, soleValue, stringField } from "./recordFields.ts";
import { requirementBody } from "./deltaParts.ts";
import type { RequirementBody } from "./deltaParts.ts";

/** The stable DOM anchor id one requirement renders under in the spec view. */
export function requirementAnchor(specId: string, requirementId: string): string {
  return `strict-spec-req-${specId}-${requirementId}`;
}

/** The spec view body: declared identity and every declared requirement. */
export interface SpecViewBody {
  /** The single declared spec's id and title, when the file declares them. */
  readonly spec?: { readonly id?: string; readonly title?: string };
  /** Every declared requirement, in declaration order. */
  readonly requirements: readonly RequirementBody[];
}

/** The top-level keys the spec layout presents. */
const SPEC_KEYS: ReadonlySet<string> = new Set([
  "schema", "schema_version", "artifact_type", "schema_file",
  "spec", "requirements",
]);

/**
 * Maps one parsed main spec onto the spec view's presentation. The body
 * presents the declared identity the main-spec schema carries — the spec's
 * id and title — and every declared requirement through the same body
 * mapper the delta spec view uses, so a requirement reads the same way
 * before and after it merges.
 */
export function specView(data: unknown): DedicatedView<SpecViewBody> {
  const spec = soleValue(data, "spec");
  const requirementsSource = soleValue(data, "requirements");
  const requirements: RequirementBody[] = [];
  if (typeof requirementsSource === "object" && requirementsSource !== null && !Array.isArray(requirementsSource)) {
    for (const [id, entry] of Object.entries(requirementsSource as Record<string, unknown>)) {
      requirements.push(requirementBody(id, entry));
    }
  }
  const body: SpecViewBody = {
    spec: spec === undefined
      ? undefined
      : { id: stringField(spec, "id"), title: stringField(spec, "title") },
    requirements,
  };
  return { ...partitionDocument(data, SPEC_KEYS), body };
}

/** One spec entry of a specs index, as the index file declares it. */
export interface SpecIndexEntry {
  /** The spec id the index records the entry under. */
  readonly id: string;
  /** The declared title, when the entry carries one. */
  readonly title?: string;
  /** The declared spec file path, when the entry carries one. */
  readonly path?: string;
}

/** One spec-area group of the specs index view. */
export interface SpecAreaGroup {
  /** The area name derived from the entries' declared paths. */
  readonly area: string;
  /** The entries whose declared paths name this area. */
  readonly specs: readonly SpecIndexEntry[];
}

/** The specs index view body: entries grouped by their declared spec areas. */
export interface SpecIndexBody {
  readonly groups: readonly SpecAreaGroup[];
}

/** The top-level keys the specs index layout presents. */
const SPEC_INDEX_KEYS: ReadonlySet<string> = new Set([
  "schema", "schema_version", "artifact_type", "schema_file", "specs",
]);

/** The area name an entry whose path names no area subdirectory groups under. */
export const UNSPECIFIED_AREA = "(unspecified)";

/**
 * Derives one declared spec path's area: the subdirectory the path names
 * under its specs directory. A path that names no area subdirectory — a
 * spec the index records directly under specs/ — yields the stable
 * unspecified fallback, so the entry groups visibly instead of vanishing.
 */
export function specAreaOfPath(declaredPath: string | undefined): string {
  if (declaredPath === undefined) {
    return UNSPECIFIED_AREA;
  }
  const segments = declaredPath.split("/");
  const specsAt = segments.lastIndexOf("specs");
  const rest = specsAt === -1 ? segments : segments.slice(specsAt + 1);
  // The first segment after specs/ is the area only when a file follows it.
  return rest.length >= 2 && rest[0] !== undefined && rest[0].length > 0 ? rest[0] : UNSPECIFIED_AREA;
}

/**
 * Maps one parsed specs index onto the index view's presentation: entries
 * group by the spec areas their declared paths name, and each group keeps
 * its entries' declaration order.
 */
export function specIndexView(data: unknown): DedicatedView<SpecIndexBody> {
  const specsSource = soleValue(data, "specs");
  const entries: SpecIndexEntry[] = [];
  if (Array.isArray(specsSource)) {
    for (const entry of specsSource) {
      const id = stringField(entry, "id");
      if (id === undefined) {
        continue;
      }
      entries.push({ id, title: stringField(entry, "title"), path: stringField(entry, "path") });
    }
  }
  const groups: SpecAreaGroup[] = [];
  const groupByArea = new Map<string, { area: string; specs: SpecIndexEntry[] }>();
  for (const entry of entries) {
    const area = specAreaOfPath(entry.path);
    let group = groupByArea.get(area);
    if (group === undefined) {
      group = { area, specs: [] };
      groupByArea.set(area, group);
      groups.push(group);
    }
    group.specs.push(entry);
  }
  return { ...partitionDocument(data, SPEC_INDEX_KEYS), body: { groups } };
}
