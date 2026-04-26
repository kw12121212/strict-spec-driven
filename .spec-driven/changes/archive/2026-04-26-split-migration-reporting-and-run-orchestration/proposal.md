# split-migration-reporting-and-run-orchestration

## What

Extract migration reporting types, deferred-artifact classification, deterministic result sorting, config preflight, and the top-level `migrateLegacyWorkflow` orchestration from `src/migrate.ts` into focused modules under `src/migrate/`.

## Why

After extracting legacy parsers (by artifact family) and builders/converters into `src/migrate/parsers/` and `src/migrate/converters/`, `src/migrate.ts` still contains 373 lines mixing result-envelope types, config normalization, preflight checks, deferred-artifact classification, deterministic sorting, scaffold-asset reporting, and the main run orchestration in one file. Separating these responsibilities into dedicated modules mirrors the decomposition pattern already applied to parsers and converters and keeps each module focused on one concern.

## Scope

- Extract migration result types (`MigrationResult`, `MigrationConvertedArtifact`, `MigrationSkippedArtifact`, `MigrationDiagnostic`, `MigrationManualFollowUp`) into a reporting module.
- Extract `describeDeferredLegacyArtifact` (deferred-artifact classification) into the reporting module alongside the result types it depends on.
- Extract `sortMigrationResult` (deterministic result sorting) into the reporting module.
- Extract `normalizeLegacyConfigText`, `normalizeLegacyConfigValue`, `LEGACY_CONFIG_TEXT_REPLACEMENTS`, `loadStrictConfigFromLegacy`, and `getReportedStrictScaffoldAssets` into a preflight module.
- Reduce `src/migrate.ts` to a thin orchestration layer that imports from `src/migrate/reporting.ts`, `src/migrate/preflight.ts`, `src/migrate/shared.ts`, and the existing `parsers/` and `converters/` modules.
- Preserve all observable migration behavior: generated artifacts, diagnostics, ordering, and command outputs remain identical.

## Unchanged Behavior

- Migration command output and exit behavior remain identical.
- Generated strict YAML artifacts, diagnostic codes, warning messages, and manual follow-up entries remain identical.
- Deterministic ordering of `converted`, `skipped`, `warnings`, `errors`, and `manualFollowUp` entries in `MigrationResult` remains identical.
- The public exports from `src/migrate.ts` (including re-exports used by `src/migrate/shared.ts`) remain available at the same import paths.
