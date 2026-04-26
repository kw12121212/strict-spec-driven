# Tasks: split-migration-builders-and-converters

## Implementation
- [x] Create `src/migrate/shared.ts` with extracted helpers: `toRepoRelativePath`, `listFilesRecursive`, `makeDiagnostic`, `readYamlFile`, `writeYamlFile`, `replaceMarkdownExtension`, `buildStrictMarkdownTargetPath`, `listLegacyChangeDirectories`, `recordDeferredArtifact`, `makeConversionFailure`
- [x] Create `src/migrate/converters/specs.ts` with `convertLegacySpecArtifacts` and `regenerateStrictSpecIndex`
- [x] Create `src/migrate/converters/changes.ts` with `convertLegacyChangeArtifacts`
- [x] Create `src/migrate/converters/roadmap.ts` with `convertLegacyRoadmapArtifacts` and `convertLegacySpecsIndex`
- [x] Rewrite `src/migrate.ts` to import from the new modules and keep only orchestration, types, and config normalization

## Testing
- [x] Run `bun run build` — validate TypeScript compilation succeeds
- [x] Run `bun test/run.ts` — unit tests confirm migration behavior is preserved

## Verification
- [x] Verify `src/migrate.ts` is reduced to orchestration, types, and config normalization only
- [x] Verify all migration test suites pass without modification
- [x] Verify no new public exports were introduced
