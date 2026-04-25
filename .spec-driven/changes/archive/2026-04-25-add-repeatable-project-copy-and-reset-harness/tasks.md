# Tasks: add-repeatable-project-copy-and-reset-harness

## Implementation

- [x] Add shared test helpers for creating a fresh copied todo-project workspace,
  running commands in that workspace, and cleaning it up deterministically.
- [x] Update project-level regression coverage to use the copied-workspace
  harness wherever scenarios require mutable repository state.
- [x] Add repeatability assertions that prove copied-workspace runs do not mutate
  the committed fixture baseline and can be rerun cleanly.

## Testing

- [x] Run `bun run build` — build validation for the copied-fixture harness and
  related test helpers.
- [x] Run `bun test/run.ts` — unit tests for copied-fixture harness behavior and
  repeatable project-level scenarios.

## Verification

- [x] Verify implementation matches proposal scope and preserves existing CLI and
  artifact behavior.
