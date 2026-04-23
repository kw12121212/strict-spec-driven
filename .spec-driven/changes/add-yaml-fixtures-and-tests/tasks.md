# Tasks: add-yaml-fixtures-and-tests

## Implementation

- [ ] Add strict YAML validation fixtures for positive and negative artifact
      cases under `test/fixtures/` with deterministic naming and coverage notes.
- [ ] Extend `test/run.ts` to execute fixture-driven validation assertions for
      malformed YAML, missing required fields, invalid enums, invalid
      references, duplicate IDs, and unsupported shapes.
- [ ] Add M01 requirement ID traceability markers from
      `.spec-driven/specs/contracts/yaml-artifacts.md` to the new fixture-driven
      tests.

## Testing

- [ ] Run `bun run build` — build/typecheck validation after fixture and test
      updates
- [ ] Run `bun test/run.ts` — run unit tests for strict YAML fixture validation
      and deterministic diagnostics

## Verification

- [ ] Verify implementation matches proposal scope
