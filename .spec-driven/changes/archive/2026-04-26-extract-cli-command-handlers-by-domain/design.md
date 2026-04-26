# Design: extract-cli-command-handlers-by-domain

## Approach

Move handler functions from `src/strict-spec-cli.ts` into five flat files under `src/cli/`, grouped by the domain each handler coordinates:

- `src/cli/cmd-scaffold.ts` — handlers that invoke scaffold.ts domain functions (`runInit`, `runPropose`)
- `src/cli/cmd-change.ts` — handlers that operate on active change directories (`runApply`, `runVerify`, `runReview`, `runArchive`, `runList`, `runModify`, `runCancel`) plus the `printChangeArtifacts` helper
- `src/cli/cmd-roadmap.ts` — handlers that delegate to roadmap.ts domain functions (`runRoadmapStatus`, `runRoadmapSync`)
- `src/cli/cmd-migration.ts` — handlers that delegate to migrate.ts and maintenance.ts (`runMigrate`, `runMaintenanceCommand`)
- `src/cli/cmd-operations.ts` — handlers that span or cross domains: ship (archive + roadmap), validate-skills, verify-spec-mappings, and the `ShipResult` type

Each new module imports the domain dependencies it needs directly from `src/`. `src/strict-spec-cli.ts` replaces each inline function body with an import from its new module, then re-exports it through the existing public API surface to avoid breaking external consumers.

`CHANGE_NAME_PATTERN` is exported from `src/cli/argv.ts` (the existing arg-parsing module) so scaffold and change modules share one definition rather than each duplicating the constant.

## Key Decisions

**Flat files in `src/cli/` vs. a `src/cli/handlers/` subdirectory.** Flat was chosen because the existing `src/cli/` modules (`argv.ts`, `changes.ts`, `entrypoint.ts`, `fs.ts`, `registry.ts`, `spec-mapping.ts`, `usage.ts`) are all flat. Adding a subdirectory for handlers only would create uneven nesting without a commensurate benefit at current scale.

**Operations as the catch-all domain.** `ship` bridges archive lookup and roadmap reading. `validate-skills` and `verify-spec-mappings` are audit commands that don't belong to scaffold, change, roadmap, or migration domains. Grouping them under `cmd-operations.ts` follows the milestone's "operations surface" concept from the milestone 06 split.

**`printChangeArtifacts` moves with `cmd-change.ts`.** It is only called by `runModify`, which lives in the change domain. No other handler needs it.

**No output shaping abstraction.** Handler output (stdout/stderr write calls) is moved verbatim. Centralizing output shapes is deferred to `stabilize-cli-output-contracts` so this change is a pure file split with zero behavioral delta.

## Alternatives Considered

**`src/cli/handlers/` subdirectory.** Rejected to keep layout consistent with existing flat `src/cli/` modules. The added nesting would require adjusting relative import paths throughout and offers no practical benefit at this scale.

**Single `src/cli/cmd-all.ts` combined handlers file.** Rejected. Moving all handlers to one file reduces the entrypoint line count without improving ownership clarity. Domain grouping is the structural goal.

**Exporting `CHANGE_NAME_PATTERN` from a new `src/cli/validation.ts`.** Considered, but argv.ts is already the module most associated with argument parsing and naming constraints. Adding a new file for one constant is unnecessary indirection.
