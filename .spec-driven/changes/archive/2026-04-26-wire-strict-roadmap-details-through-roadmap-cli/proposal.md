# wire-strict-roadmap-details-through-roadmap-cli

## What

Preserve the `details` field through strict roadmap sync, canonical artifact emission, and the converter type so that milestone-level long-form planning guidance survives roadmap CLI operations instead of being silently dropped.

## Why

The previous change (`define-strict-roadmap-details-field-contract`) added `details` to the model type, schema, and validation layer. However, `buildCanonicalMilestoneArtifact()` in `sync.ts` does not copy `details` to its output, so every sync operation silently discards the field. The converter type in `src/converters/roadmap.ts` also lacks `details`, which will block future conversion work. Without this change, any `details` content authored in a milestone file is lost the first time the roadmap syncs.

## Scope

- Update `buildCanonicalMilestoneArtifact()` in `src/roadmap/sync.ts` to copy `details` from the source milestone artifact into the canonical output
- Add `details?: string` to the `StrictRoadmapMilestoneArtifact` type in `src/converters/roadmap.ts`
- Add unit tests proving `details` survives sync and is absent from canonical output when missing

## Unchanged Behavior

- Milestones without `details` must continue to validate, sync, and emit canonical artifacts exactly as before
- Status derivation (`RoadmapMilestoneStatus`) does not carry `details` — it tracks derived state, not artifact content
- The migration converter output for legacy Markdown milestones still omits `details` (legacy format has no `## Details` section; that belongs to the separate `preserve-strict-roadmap-details-during-conversion` change)
- Schema version remains v1 (no breaking change)
