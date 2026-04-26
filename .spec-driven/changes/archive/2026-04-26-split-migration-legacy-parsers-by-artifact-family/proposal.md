# split-migration-legacy-parsers-by-artifact-family

## What

Extract legacy Markdown parser functions from `src/migrate.ts` into dedicated
per-artifact-family modules under `src/migrate/parsers/`, giving each artifact
family an explicit TypeScript interface that later builder and orchestration
splits can depend on.

## Why

`src/migrate.ts` is 2026 lines — the largest remaining hotspot after roadmap
and skills were decomposed in earlier milestone 08 changes. The file mixes
legacy Markdown parsing for five distinct artifact families (specs, change
artifacts, roadmap, index) with shared parsing primitives, type definitions,
builder logic, converter functions, and run orchestration in a single monolith.

Parsers are the correct first split because the subsequent two migration splits
(`split-migration-builders-and-converters` and
`split-migration-reporting-and-run-orchestration`) both need parser interfaces
to be explicit and stable before they can extract converter and orchestration
logic cleanly. Splitting parsers first preserves the same dependency order
established by the roadmap and skills decompositions.

## Scope

In scope:

- Extract `parseMarkdownItems` and related low-level Markdown tokenization
  helpers into `src/migrate/parsers/shared.ts`
- Extract `parseLegacyMainSpec` and `parseLegacyDeltaSpec` into
  `src/migrate/parsers/specs.ts`
- Extract `parseLegacyProposal`, `parseLegacyDesign`, `parseLegacyTasks`, and
  `parseLegacyQuestions` into `src/migrate/parsers/change-artifacts.ts`
- Keep `src/migrate.ts` as the stable public entrypoint exporting `runMigration`
  and re-exporting the currently-exported parser functions so external callers
  are unaffected
- Add or update regression coverage proving migration CLI output remains stable
  after the extraction

Out of scope:

- Extracting builder, converter, reporting, or orchestration logic from
  `src/migrate.ts` — those belong to the subsequent two planned splits
- Changing migration schema rules, output formats, diagnostic content, or
  artifact ordering
- Adding new migration capabilities or supporting new artifact families
- Refactoring `src/roadmap.ts`, `src/skills.ts`, or CLI command routing beyond
  what parser module extraction directly needs

## Unchanged Behavior

Behaviors that must not change as a result of this change:

- `migrate` command output, diagnostics, artifact content, field ordering, and
  diagnostic sorting must remain identical before and after the split
- All parser functions must produce the same outputs for every current fixture
  and test input
- `parseLegacyProposal`, `parseLegacyDesign`, `parseLegacyTasks`, and
  `parseLegacyQuestions` are currently exported from `src/migrate.ts` — those
  exports must remain importable at the same module path
