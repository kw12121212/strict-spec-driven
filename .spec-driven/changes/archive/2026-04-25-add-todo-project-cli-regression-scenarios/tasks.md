# Tasks: add-todo-project-cli-regression-scenarios

## Implementation

- [x] Add copied-workspace CLI regression scenarios for `init`, `propose`, and
  `list`, asserting expected outputs and artifact effects without mutating the
  committed fixture baseline.
- [x] Add copied-workspace CLI regression scenarios for `modify`, `cancel`, and
  `verify-spec-mappings`, asserting artifact targeting, removal behavior, and
  mapping diagnostics in the temp workspace.
- [x] Refine shared test helpers or suite-local assertions only where needed to
  keep the new project-fixture CLI scenarios deterministic and repeatable.

## Testing

- [x] Run `bun run build` — build validation for the new project-fixture CLI
  regression coverage.
- [x] Run `bun test/run.ts` — unit tests for copied-workspace CLI regression
  scenarios and existing suites.

## Verification

- [x] Verify implementation matches proposal scope, covers only the explicitly
  named CLI commands, and preserves committed fixture baseline behavior.
