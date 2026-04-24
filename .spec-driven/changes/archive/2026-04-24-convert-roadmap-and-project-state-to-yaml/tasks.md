# Tasks: convert-roadmap-and-project-state-to-yaml

## Implementation

- [x] Create `src/converters/roadmap.ts` with `convertRoadmapIndex`, `convertRoadmapMilestone`, and `convertSpecsIndex` pure converter functions
- [x] Add roadmap index conversion to `migrate.ts`: replace the `describeDeferredLegacyArtifact` roadmap-index branch with a call to `convertRoadmapIndex`, writing converted entries and manual follow-up items
- [x] Add roadmap milestone conversion to `migrate.ts`: replace the roadmap milestones deferral branch with calls to `convertRoadmapMilestone` for each `roadmap/milestones/*.md` file
- [x] Add specs index conversion to `migrate.ts`: replace the `specs/INDEX.md` deferral branch with a call to `convertSpecsIndex`
- [x] Add fixture files under `test/fixtures/` covering minimal valid roadmap index, minimal valid milestone, malformed milestone (missing status), unsupported Markdown shape, and minimal valid specs index

## Testing

- [x] Run `bun run build` — compile TypeScript and confirm zero errors
- [x] Run `bun test/run.ts` — unit tests covering successful roadmap index conversion, successful milestone conversion with all planning sections, planned change entry field mapping, status enum mapping, malformed/unsupported shape producing manual follow-up, specs index conversion, and idempotent-safe behavior when strict target exists

## Verification

- [x] Verify implementation matches proposal scope: roadmap and specs-index converters added, no other migration paths changed
