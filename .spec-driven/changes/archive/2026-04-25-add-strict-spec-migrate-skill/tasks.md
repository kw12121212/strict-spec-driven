# Tasks: add-strict-spec-migrate-skill

## Implementation

- [x] Add roadmap-backed proposal deltas for the strict migration skill contract
      and validation coverage.
- [x] Create `skills/strict-spec-migrate/SKILL.md` with concrete `migrate`,
      `roadmap-status`, and `verify-spec-mappings` command mappings plus
      migration guidance.
- [x] Extend strict skill validation and tests so migration skill content is
      checked for required commands and `.strict-spec-driven/` guidance.

## Testing

- [x] Run `bun run build` — build validation after migration skill and validator
      updates.
- [x] Run `bun test/run.ts` — unit tests for migration skill packaging and
      content validation.

## Verification

- [x] Verify implementation matches proposal scope
