# Tasks: preserve-strict-roadmap-details-during-conversion

## Implementation

- [x] Add `## Details` section extraction to `convertRoadmapMilestone` in `src/converters/roadmap.ts` using `parseSectionText`, conditionally including `details` in the returned artifact when present and non-empty
- [ ] Add or update a test fixture Markdown milestone file under `test/fixtures/roadmap/milestones/` that includes a `## Details` section

## Testing

- [ ] Run `bun run build` — build validation
- [ ] Run `bun test/run.ts` — unit tests covering details extraction (present, absent, empty)

## Verification

- [ ] Verify implementation matches proposal scope
