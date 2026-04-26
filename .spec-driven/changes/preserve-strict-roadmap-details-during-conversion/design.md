# Design: preserve-strict-roadmap-details-during-conversion

## Approach

Extend the existing `convertRoadmapMilestone` function in `src/converters/roadmap.ts` to extract a `## Details` section using the same `parseSectionText` helper already used for the `Goal` field. Conditionally spread `details` into the returned artifact object only when the extracted text is non-empty. This follows the established pattern for optional text fields in the converter and requires no changes to the migration pipeline itself — `convertLegacyRoadmapArtifacts` in `src/migrate/converters/roadmap.ts` already passes the converter output directly to `writeYamlFile`.

## Key Decisions

- **Use `parseSectionText` rather than `parseMarkdownBulletList`**: `details` is freeform long-form text (like `Goal`), not a bullet list. The `parseSectionText` helper strips the heading and returns the raw paragraph content, which matches the intended YAML block-scalar representation.
- **Omit `details` from the artifact when absent**: The schema marks `details` as optional, and the runtime sync logic already handles absence by not emitting a placeholder. The converter must follow the same convention — no empty string, no null, just no field.
- **No migration-pipeline changes needed**: The migration converter module calls `convertRoadmapMilestone` and writes the result verbatim. Fixing the converter fixes migration automatically.

## Alternatives Considered

- **Post-migration manual follow-up**: Could defer `details` preservation to a manual step, but this contradicts the goal of deterministic conversion and would add noise to migration reports.
- **Structured sub-fields for details**: Out of scope — milestone 10 explicitly excludes turning `details` into a structured schema with fixed subfields. The field remains freeform text.
