# Tasks: extract-cli-command-handlers-by-domain

## Implementation

- [x] Export `CHANGE_NAME_PATTERN` from `src/cli/argv.ts` so it can be shared by handler modules
- [x] Create `src/cli/cmd-scaffold.ts` with `runInit` and `runPropose` handler functions, importing `CHANGE_NAME_PATTERN` from `./argv.js` and domain functions from `../scaffold.js`
- [x] Create `src/cli/cmd-change.ts` with `printChangeArtifacts`, `runApply`, `runVerify`, `runReview`, `runArchive`, `runList`, `runModify`, and `runCancel` handler functions, importing `CHANGE_NAME_PATTERN` from `./argv.js` and domain functions from their respective `src/` modules
- [x] Create `src/cli/cmd-roadmap.ts` with `runRoadmapStatus` and `runRoadmapSync` handler functions, importing domain functions from `../roadmap.js`
- [x] Create `src/cli/cmd-migration.ts` with `runMigrate` and `runMaintenanceCommand` handler functions, importing domain functions from `../migrate.js` and `../maintenance.js`
- [x] Create `src/cli/cmd-operations.ts` with `runShip`, `runValidateSkills`, and `runVerifySpecMappings` handler functions and the `ShipResult` type, importing domain functions from their respective `src/` modules
- [x] Replace each inline handler function body in `src/strict-spec-cli.ts` with an import from its new domain module; keep all existing re-exports and the command table unchanged
- [x] Update mapping frontmatter in `.spec-driven/specs/cli/foundation.md` to include the five new `src/cli/cmd-*.ts` implementation paths

## Testing

- [x] Run `bun run build` — typecheck that all new modules compile without errors and no import paths are broken
- [x] Run `bun test/run.ts` — unit tests confirm all commands still produce identical output and exit codes after the handler move

## Verification

- [x] Verify `src/strict-spec-cli.ts` contains no inline handler function bodies — only imports, re-exports, the command table, `run()`, and the process entry guard
- [x] Verify implementation matches proposal scope
