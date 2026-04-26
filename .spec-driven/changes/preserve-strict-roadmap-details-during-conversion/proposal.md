# preserve-strict-roadmap-details-during-conversion

## What

Update the legacy Markdown-to-YAML roadmap milestone converter to extract and preserve a `## Details` section when present, so that migrating a `.spec-driven/roadmap/` milestone that contains long-form planning guidance does not silently drop the `details` field from the resulting `.strict-spec-driven/roadmap/` artifact.

## Why

The schema, runtime model, validation, sync, and proposal-handoff paths already support `details` as an optional milestone field (delivered by the first three completed changes in milestone 10). However, the conversion path in `src/converters/roadmap.ts` does not extract `## Details` from legacy Markdown milestones, and the migration pipeline (`src/migrate/converters/roadmap.ts`) delegates to that converter. As a result, any `## Details` content in a legacy milestone is silently discarded during migration.

## Scope

- Add `Details` section extraction to `convertRoadmapMilestone` in `src/converters/roadmap.ts`, using `parseSectionText` (the same pattern used for `Goal`).
- Conditionally include `details` in the returned artifact when the section is present and non-empty; omit it when absent.
- Update or add test fixtures that include a `## Details` section to prove extraction works.
- Add conversion-specific unit tests proving `details` is preserved when present and omitted when absent.

## Unchanged Behavior

- Milestones without a `## Details` section must remain fully valid and must not gain an empty `details` field in the converted output.
- All other converted fields (goal, scope, status, planned changes, dependencies, risks, notes) must remain identical.
- Runtime roadmap behavior (model, validation, sync, status derivation, proposal handoff) is unchanged — this change only affects the conversion path.
