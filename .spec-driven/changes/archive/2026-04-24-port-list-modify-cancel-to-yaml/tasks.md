# Tasks: port-list-modify-cancel-to-yaml

## Implementation

- [x] Add strict change discovery helpers for active and archived directories,
  including active status derivation from strict planning artifacts
- [x] Add `list` and `modify` command handlers in `src/strict-spec-cli.ts`,
  including deterministic editable-artifact path output
- [x] Add `cancel` command handler in `src/strict-spec-cli.ts` for active
  changes only, with explicit rejection of archived targets
- [x] Add and update tests in `test/run.ts` covering list/modify/cancel happy
  paths and failure paths

## Testing

- [x] Run `bun run build` — build validation task
- [x] Run `bun test/run.ts` — unit tests for list/modify/cancel behavior

## Verification

- [x] Verify implementation matches proposal scope
