# Tasks: cover-strict-roadmap-details-with-regression

## Implementation

- [x] Extend `test/suites/roadmap-and-migration.ts` to cover `details`-aware roadmap validation, sync, and proposal-handoff regression paths
- [x] Add or refine roadmap fixtures and skill assertions so milestones with `details` are preserved correctly and milestones without `details` stay valid without placeholders
- [x] Update the `cli/foundation` delta spec to make details-focused roadmap regression coverage explicit

## Testing

- [x] Run `bun run build` — build to verify TypeScript compilation
- [x] Run `bun test/run.ts` — run unit tests including roadmap and migration coverage

## Verification

- [x] Verify implementation matches proposal scope
