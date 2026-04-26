# Tasks: split-migration-reporting-and-run-orchestration

## Implementation
- [x] Create `src/migrate/reporting.ts` with migration result types, `describeDeferredLegacyArtifact`, and `sortMigrationResult`
- [x] Create `src/migrate/preflight.ts` with config types, normalization helpers, `loadStrictConfigFromLegacy`, and `getReportedStrictScaffoldAssets`
- [x] Reduce `src/migrate.ts` to a thin orchestration layer that re-exports from `reporting.ts`, delegates to `preflight.ts`, and composes the migration run

## Testing

- [x] Run `bun run build` — validate TypeScript compilation after module extraction
- [x] Run `bun test/run.ts` — unit tests to confirm migration behavior is unchanged

## Verification
- [x] Verify `src/migrate.ts` is reduced to orchestration + re-exports only
- [x] Verify `src/migrate/reporting.ts` contains result types, deferred-artifact classification, and result sorting
- [x] Verify `src/migrate/preflight.ts` contains config normalization and preflight loading
- [x] Verify all existing tests pass without modification
