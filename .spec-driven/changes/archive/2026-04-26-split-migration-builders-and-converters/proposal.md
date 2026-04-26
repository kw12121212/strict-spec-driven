# Proposal: split-migration-builders-and-converters

## What
Extract the five converter-coordinator functions (`convertLegacySpecArtifacts`, `convertLegacyChangeArtifacts`, `convertLegacyRoadmapArtifacts`, `convertLegacySpecsIndex`, `regenerateStrictSpecIndex`) and their supporting file-I/O, path, and deferred-artifact helpers from `src/migrate.ts` into focused modules under `src/migrate/converters/` and `src/migrate/shared.ts`.

## Why
`src/migrate.ts` is still ~972 lines after parser extraction. About 350 lines are builder/converter logic that iterates legacy files, calls parsers, writes strict YAML, and tracks conversion results. Separating these coordinators into focused modules leaves `src/migrate.ts` as a thin orchestration layer (preflight, converter dispatch, result sorting) and makes the next split (reporting and orchestration) straightforward.

## Scope
- Extract `convertLegacySpecArtifacts` and `regenerateStrictSpecIndex` into `src/migrate/converters/specs.ts`.
- Extract `convertLegacyChangeArtifacts` into `src/migrate/converters/changes.ts`.
- Extract `convertLegacyRoadmapArtifacts` and `convertLegacySpecsIndex` into `src/migrate/converters/roadmap.ts`.
- Extract shared helpers (`toRepoRelativePath`, `listFilesRecursive`, `makeDiagnostic`, `readYamlFile`, `writeYamlFile`, `replaceMarkdownExtension`, `buildStrictMarkdownTargetPath`, `listLegacyChangeDirectories`, `recordDeferredArtifact`, `makeConversionFailure`) into `src/migrate/shared.ts`.
- Re-export any public API from `src/migrate.ts` so downstream consumers remain unchanged.
- Preserve all observable migration behavior, diagnostic output, and artifact ordering.

## Unchanged Behavior
- Migration command output, report structure, and exit codes remain identical.
- Diagnostic ordering stays deterministic.
- No new public exports are added beyond what already exists.
- `src/converters/roadmap.ts` (pure conversion logic) is not modified.
- `src/migrate/parsers/` modules are not modified.
