/**
 * Recognizing when shipped guidance names a strict skill package.
 *
 * A skill name that resolves to no package fails nothing on its own: the slash command is simply
 * missing when someone types it, so the reference rots silently. This module owns the matching so
 * the shipped validation command and the repository-wide regression scan read one source; a matcher
 * that lives only in a test suite proves the pattern fires, never that the command an operator runs
 * reports the failure.
 */

/** A recognized reference to a strict skill package, with the 1-based line it appears on. */
export type SkillReference = {
  name: string;
  line: number;
};

/**
 * References in text that routes a reader to a skill — bundled skills and operator documentation.
 *
 * The bare form is governed here because all three forms read the same way to an operator: a name
 * in a sentence is a command they will try to type, whether or not the author wrapped it in a
 * backtick. The trailing group is written as segments rather than as one `[a-z0-9-]+` class so a
 * name is matched whole; the leading lookbehind stops the pattern from matching the tail of a
 * longer hyphenated identifier.
 */
export const ROUTING_SKILL_REFERENCE_PATTERN =
  /(?<![A-Za-z0-9-])(strict-(?:spec|roadmap|tech)-[a-z0-9]+(?:-[a-z0-9]+)*)/g;

/**
 * References in source files, where only the prefixed forms are governed.
 *
 * A source comment that names a deleted skill while explaining that it was deleted states a fact;
 * it routes nobody, and the same exemption already covers the removal-sweep tests and the archived
 * workflow state that record which skills existed at the time. What a source file can still do is
 * route a reader through a diagnostic message, and a diagnostic that names a skill writes it as a
 * slash command or a backticked name, which is exactly what this form matches.
 */
export const SOURCE_SKILL_REFERENCE_PATTERN =
  /(?:`|\/|skills\/)(strict-(?:spec|roadmap|tech)-[a-z0-9-]+)/g;

/**
 * Identifiers that share the strict prefix and never denote a skill package: the CLI entry points,
 * the product name, the shared schema cache directory, and the committed fixture packages whose
 * evidence paths the mutation inventory names in generated source.
 *
 * A skill that once existed and was deleted does not belong here — that is exactly the finding this
 * matching is for, and an allowlist entry is global: it would silence the real routing reference as
 * well as the fixture path that earned it.
 */
export const NON_SKILL_STRICT_IDENTIFIERS: ReadonlySet<string> = new Set([
  "strict-spec-cli",
  "strict-spec-driven",
  "strict-spec-driven-mcp",
  "strict-spec-schemas",
  "strict-spec-fixture-direct-file-edit",
  "strict-spec-fixture-absent-skill-reference",
]);

/**
 * Every reference in `text` to a strict skill name that `packagedSkillNames` does not contain.
 *
 * The valid set is supplied by the caller rather than derived from the text being read, because a
 * check that decides its own scope from its subject can be satisfied by the very content it
 * governs. One entry is returned per distinct name, carrying the first line it appears on.
 */
export function findUnpackagedSkillReferences(
  text: string,
  packagedSkillNames: Iterable<string>,
  pattern: RegExp = ROUTING_SKILL_REFERENCE_PATTERN,
): SkillReference[] {
  const packaged = packagedSkillNames instanceof Set ? packagedSkillNames : new Set(packagedSkillNames);
  const found = new Map<string, number>();
  for (const match of text.matchAll(pattern)) {
    const name = match[1] as string;
    if (NON_SKILL_STRICT_IDENTIFIERS.has(name) || packaged.has(name) || found.has(name)) continue;
    found.set(name, text.slice(0, match.index).split("\n").length);
  }
  return [...found.entries()]
    .map(([name, line]) => ({ name, line }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * The marker that suspends reference scanning for the rest of a document section.
 *
 * An upgrade note has to name the commands it retires, or it cannot tell a reader which invocation
 * stopped working. That is the same statement-of-fact case as a removal sweep test, and the rule
 * puts such text outside the scanned scope rather than inside an allowlist: an allowlist entry is
 * global and would silence a real routing reference to the same name anywhere else, while this
 * marker is placed deliberately and reaches only as far as the next heading.
 */
export const RETIRED_NAMES_MARKER = "<!-- retired-skill-names -->";

/** `text` with every marked retirement section removed, so a retired name it states is not a finding. */
export function withoutRetirementSections(text: string): string {
  let remaining = text;
  for (;;) {
    const start = remaining.indexOf(RETIRED_NAMES_MARKER);
    if (start === -1) return remaining;
    const next = remaining.indexOf("\n## ", start + RETIRED_NAMES_MARKER.length);
    remaining = remaining.slice(0, start) + (next === -1 ? "" : remaining.slice(next));
  }
}
