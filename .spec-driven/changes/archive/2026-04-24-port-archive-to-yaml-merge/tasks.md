# Tasks: port-archive-to-yaml-merge

## Implementation

- [x] Create archive lifecycle logic to load change artifacts, enforce pre-archive gates, and collect delta specs for merge
- [x] Implement deterministic YAML delta merge into main strict specs, including missing-target fallback/skip rules and merge reporting
- [x] Regenerate strict specs index artifacts from merged spec state
- [x] Move completed active changes into `.strict-spec-driven/changes/archive/<YYYY-MM-DD>-<name>/` with collision-safe behavior
- [x] Register `archive` subcommand in `src/strict-spec-cli.ts` and emit deterministic JSON result output
- [x] Add/extend automated tests for archive happy path, invalid preconditions, and merge edge cases

## Testing

- [x] Run `bun run build` — build validation for archive command and merge utilities
- [x] Run `bun test/run.ts` — unit tests for archive merge behavior, archive move behavior, and failure diagnostics

## Verification

- [x] Verify implementation matches proposal scope
