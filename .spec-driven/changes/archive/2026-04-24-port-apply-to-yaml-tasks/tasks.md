# Tasks: port-apply-to-yaml-tasks

## Implementation
- [x] Create `src/apply.ts` with core task-apply logic: locate next pending task, update status, produce status result
- [x] Add `runApply` handler in `strict-spec-cli.ts` and register `apply` subcommand in the command router
- [x] Wire `src/apply.ts` exports through `strict-spec-cli.ts` re-exports for test access

## Testing

- [x] Run `bun run build` — lint or validation task
- [x] Run `bun test/run.ts` — unit tests covering apply happy path, missing change, all-complete, empty tasks, JSON output determinism

## Verification
- [x] Verify implementation matches proposal scope
