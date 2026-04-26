# Tasks: wire-strict-roadmap-details-through-roadmap-cli

## Implementation
- [x] Add `details` propagation to `buildCanonicalMilestoneArtifact()` in `src/roadmap/sync.ts` — copy `milestone.artifact.details` when present, omit when undefined
- [x] Add `details?: string` to `StrictRoadmapMilestoneArtifact` in `src/converters/roadmap.ts`

## Testing

- [x] Run `bun run build` — build passes after type changes
- [x] Run `bun test/run.ts` — unit tests pass including new details sync tests

## Verification
- [x] Verify `details` survives a sync round-trip when present in a milestone
- [x] Verify sync output omits `details` when the source milestone has none
- [x] Verify converter type includes `details` but converter output does not invent it
