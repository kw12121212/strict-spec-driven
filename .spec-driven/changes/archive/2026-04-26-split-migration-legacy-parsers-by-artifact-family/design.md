# Design: split-migration-legacy-parsers-by-artifact-family

## Approach

Split legacy Markdown parsers by artifact family under `src/migrate/parsers/`
while keeping `src/migrate.ts` as the stable public orchestration surface that
exports `runMigration` and re-exports the currently-exported parser functions.

Planned module boundaries:

- **`src/migrate/parsers/shared.ts`** — `parseMarkdownItems` and other
  low-level Markdown tokenization helpers (heading extraction, section
  splitting, list parsing) that are used by multiple artifact families
- **`src/migrate/parsers/specs.ts`** — `parseLegacyMainSpec` and
  `parseLegacyDeltaSpec`
- **`src/migrate/parsers/change-artifacts.ts`** — `parseLegacyProposal`,
  `parseLegacyDesign`, `parseLegacyTasks`, and `parseLegacyQuestions`

Roadmap and index parsing is more tightly coupled with converter logic in
`convertLegacyRoadmapArtifacts` and `convertLegacySpecsIndex`. Those boundaries
are better resolved in the next planned split
(`split-migration-builders-and-converters`) when the converter layer is
extracted. They are explicitly out of scope here.

The extraction should be mostly mechanical: move existing functions with minimal
semantic change, then have `src/migrate.ts` import and re-export them. The goal
is clearer ownership and stable interfaces, not new migration behavior.

## Key Decisions

- **Keep `src/migrate.ts` as the public facade.** External callers import
  `parseLegacyProposal` and related functions from `src/migrate.ts`. Keeping
  those re-exports avoids coupling this refactor to an import-surface churn
  across the codebase.
- **Split by artifact family, not by file size.** Each family (specs, change
  artifacts) has a single parser module. This is granular enough to give each
  family a clear owner without producing too many tiny files.
- **Extract shared parsing primitives into `shared.ts` first.** `parseMarkdownItems`
  and heading helpers are used by multiple families. Moving them to a shared
  module prevents duplication between `specs.ts` and `change-artifacts.ts`.
- **Leave roadmap and index parsing for the next split.** The boundary between
  legacy parsing and conversion is blurrier for roadmap/index artifacts.
  Forcing that split here would require anticipating the converter module
  interfaces prematurely.
- **Treat this as behavior-preserving work.** Any observable migration output
  change discovered during extraction must be flagged explicitly rather than
  being silently absorbed.

## Alternatives Considered

- **One file per parser function (8 separate modules).** Rejected — too granular;
  would create import overhead without clearer responsibility boundaries than
  per-family grouping.
- **Include roadmap and index parsers in this split.** Rejected — those parsers
  are entangled with converter logic and their extraction is cleanest when the
  converters are also being extracted in the next split.
- **Extract all three migration splits at once.** Rejected — incremental splits
  are easier to verify against migration regression output and match the pattern
  established by the roadmap and skills decompositions.
