# Design: split-migration-builders-and-converters

## Approach
Create three new files under `src/migrate/converters/` mirroring the artifact families already parsed under `src/migrate/parsers/`, plus one shared helper module:

1. **`src/migrate/shared.ts`** — file-system utilities, path helpers, diagnostic factories, and deferred-artifact recording used by all converter modules and the remaining orchestrator in `src/migrate.ts`.
2. **`src/migrate/converters/specs.ts`** — `convertLegacySpecArtifacts` and `regenerateStrictSpecIndex`.
3. **`src/migrate/converters/changes.ts`** — `convertLegacyChangeArtifacts`.
4. **`src/migrate/converters/roadmap.ts`** — `convertLegacyRoadmapArtifacts` and `convertLegacySpecsIndex`.

`src/migrate.ts` keeps type definitions, constants, config normalization helpers, `loadStrictConfigFromLegacy`, `sortMigrationResult`, `getReportedStrictScaffoldAssets`, `describeDeferredLegacyArtifact`, and the exported `migrateLegacyWorkflow` orchestrator. The config normalization helpers (`normalizeLegacyConfigText`, `normalizeLegacyConfigValue`) and the `LEGACY_CONFIG_TEXT_REPLACEMENTS` constant also stay in `src/migrate.ts` since they are only used by `loadStrictConfigFromLegacy`.

## Key Decisions
- **Shared helpers go to `src/migrate/shared.ts`**, not `src/migrate/converters/shared.ts`. These helpers (file I/O, path manipulation, diagnostic creation) are also used by the orchestrator in `src/migrate.ts`, so they sit one level up.
- **Converter modules import from `src/converters/roadmap.ts`** and `src/migrate/parsers/` exactly as `src/migrate.ts` does today. No new coupling.
- **Type definitions remain in `src/migrate.ts`** and are imported by the converter modules. This avoids a types-only barrel file and keeps the change focused on code movement.
- **`recordDeferredArtifact` and `makeConversionFailure` move to `src/migrate/shared.ts`** because they are used by converter coordinators during conversion, not just by the final orchestration step.

## Alternatives Considered
- **Move all helpers into each converter module** — rejected because `readYamlFile`, `writeYamlFile`, `makeDiagnostic`, and `listFilesRecursive` are genuinely shared across all converters and the orchestrator.
- **Merge `src/converters/roadmap.ts` into `src/migrate/converters/roadmap.ts`** — rejected because `src/converters/roadmap.ts` contains pure Markdown-to-YAML conversion logic that is independent of file I/O and result tracking. The converter coordinators in `src/migrate/converters/roadmap.ts` call into it.
