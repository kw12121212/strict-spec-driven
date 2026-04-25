# Tasks: split-monolithic-test-runner-into-modules

## Implementation

- [x] Extract shared test-support helpers from `test/run.ts` for command
      execution, fixture access, copied-workspace setup, and result reporting.
- [x] Split the current monolithic runner coverage into smaller domain-oriented
      test modules while preserving the existing scenario order and assertions.
- [x] Reduce `test/run.ts` to a thin orchestration entrypoint that imports and
      runs the modular suites without changing the repository test command
      surface.

## Testing

- [x] Run `bun run build` — build validation for the modularized test runner and
      supporting test modules.
- [x] Run `bun test/run.ts` — unit tests covering the split runner,
      shared helpers, and preserved suite behavior.

## Verification

- [x] Verify implementation matches proposal scope and does not absorb the later
      CLI or roadmap/migration scenario additions planned elsewhere in milestone
      09.
