# Tasks: bind-domain-refactors-to-real-todo-project-regression

## Implementation
- [x] Add copied-project regression scenarios for validate-skills against the migrated todo-project workspace
- [x] Add copied-project regression scenarios for post-migration change lifecycle commands (verify, list, review) against the migrated todo-project workspace
- [x] Add copied-project regression scenarios for archive against the migrated todo-project workspace with completed tasks
- [x] Add repeated-run assertions confirming diagnostic ordering and report determinism across all new scenarios
- [x] Assert committed todo-project fixture baseline is unchanged after all new scenarios

## Testing

- [x] Run `bun run build` — build to compile TypeScript sources
- [x] Run `bun test/run.ts` — unit tests and regression tests

## Verification

- [x] Verify implementation matches proposal scope
