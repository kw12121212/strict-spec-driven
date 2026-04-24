# Tasks: port-spec-mapping-validation-commands

## Implementation
- [x] Add `verify-spec-mappings` command routing and usage handling in
      `src/strict-spec-cli.ts`.
- [x] Implement mapping coverage and unmapped evidence audit logic using
      existing spec parsing helpers.
- [x] Add deterministic JSON output and diagnostics for audit results.

## Testing

- [x] Run `bun run build` build validation after command and audit logic changes.
- [x] Run `bun test/run.ts` unit tests for mapping coverage and unmapped
      evidence diagnostics.

## Verification
- [x] Verify implementation matches proposal scope
