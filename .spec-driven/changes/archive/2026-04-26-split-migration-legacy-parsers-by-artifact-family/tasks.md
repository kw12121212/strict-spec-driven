# Tasks: split-migration-legacy-parsers-by-artifact-family

## Implementation

- [x] Extract `parseMarkdownItems` and shared low-level Markdown tokenization helpers from `src/migrate.ts` into `src/migrate/parsers/shared.ts` with explicit exports
- [x] Extract `parseLegacyMainSpec` and `parseLegacyDeltaSpec` from `src/migrate.ts` into `src/migrate/parsers/specs.ts`, importing shared helpers from the new shared module
- [x] Extract `parseLegacyProposal`, `parseLegacyDesign`, `parseLegacyTasks`, and `parseLegacyQuestions` from `src/migrate.ts` into `src/migrate/parsers/change-artifacts.ts`, importing shared helpers from the new shared module
- [x] Update `src/migrate.ts` to import from the new parser modules and re-export the previously-exported parser functions so the public module surface is unchanged

## Testing

- [x] Run `bun run build` — build and typecheck the refactored migration parser modules end-to-end
- [x] Run `bun test/run.ts` — run unit tests covering migration conversion behavior after the parser extraction

## Verification

- [x] Verify implementation matches proposal scope
