# Design: split-migration-reporting-and-run-orchestration

## Approach

Create two new focused modules under `src/migrate/` and reduce `src/migrate.ts` to a thin import-and-delegate layer:

1. **`src/migrate/reporting.ts`** — migration result envelope types, deferred-artifact classification, and deterministic result sorting:
   - `MigrationConvertedArtifact`, `MigrationSkippedArtifact`, `MigrationDiagnostic`, `MigrationManualFollowUp`, `MigrationResult` types
   - `describeDeferredLegacyArtifact()` — classifies legacy files that lack dedicated converters
   - `sortMigrationResult()` — deterministic sorting of all result collections using `sortByDeterministicKey`

2. **`src/migrate/preflight.ts`** — config normalization, config loading, and scaffold-asset discovery:
   - `LEGACY_CONFIG_TEXT_REPLACEMENTS`, `normalizeLegacyConfigText()`, `normalizeLegacyConfigValue()` — config text normalization
   - `StrictWorkflowConfig`, `LegacyWorkflowConfig` types
   - `loadStrictConfigFromLegacy()` — loads and validates legacy config, builds strict config
   - `getReportedStrictScaffoldAssets()` — lists scaffold assets to report in migration results

3. **`src/migrate.ts`** — thin orchestration layer:
   - Re-exports public types from `reporting.ts` (maintaining backward compatibility for `src/migrate/shared.ts` which imports `MigrationResult` etc.)
   - Contains only `migrateLegacyWorkflow()`, the main entry function that composes preflight, conversion, deferred-artifact handling, and result sorting

The constant paths (`LEGACY_CONFIG_PATH`, `STRICT_CONFIG_PATH`) move to `preflight.ts` alongside the config logic that uses them.

## Key Decisions

- **Result types live in `reporting.ts`**, not in `shared.ts` — `shared.ts` already contains shared helpers (path normalization, directory walking, YAML I/O) and deferred-artifact recording. The result envelope types describe the migration report shape rather than shared conversion helpers, so they belong with reporting.
- **`src/migrate/shared.ts` imports from `reporting.ts`** — `shared.ts` already imports `MigrationDiagnostic`, `MigrationResult`, and `MigrationSkippedArtifact` from `../migrate.js`. After this change those imports will resolve through the re-export in `src/migrate.ts`, preserving the existing dependency direction.
- **`describeDeferredLegacyArtifact` moves to `reporting.ts`** — it classifies artifacts for the result envelope (skipped/manual-follow-up), which is a reporting concern rather than a conversion or orchestration concern.
- **Config normalization stays together with config loading** — `normalizeLegacyConfigText`, `normalizeLegacyConfigValue`, and `LEGACY_CONFIG_TEXT_REPLACEMENTS` are only used by `loadStrictConfigFromLegacy`, so they move as a unit to `preflight.ts`.

## Alternatives Considered

- **Keep all reporting types in `src/migrate.ts` and only extract preflight** — rejected because the 373-line file would remain mixed, defeating the decomposition goal. The result types and sorting logic are a cohesive unit that deserves its own module.
- **Create `src/migrate/orchestrate.ts` instead of keeping orchestration in `src/migrate.ts`** — rejected because the main function is the module's primary export and only about 60 lines after extraction. An extra indirection layer adds import complexity without reducing file size meaningfully.
- **Merge result types into `src/migrate/shared.ts`** — rejected because `shared.ts` is already 166 lines of utility helpers. Adding result-envelope types and classification logic would make it a second catch-all rather than a focused module.
