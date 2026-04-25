# Tasks: add-todo-project-roadmap-and-migration-scenarios

## Implementation

- [x] Add copied-workspace regression scenarios for `roadmap-status` and
  `roadmap-sync` in `test/suites/roadmap-and-migration.ts`, asserting ordered
  output, planned-change state, and any rewritten roadmap artifacts against the
  copied todo-project workspace.
- [x] Add copied-workspace regression scenarios for `migrate`, asserting
  structured report output and resulting `.strict-spec-driven/` artifacts from
  the copied todo-project workspace while preserving source `.spec-driven/`
  inputs.
- [x] Refine shared harness helpers or suite-local assertion utilities only
  where needed to keep roadmap and migration project-fixture scenarios
  deterministic and baseline-safe.

## Testing

- [x] Run `bun run build` — build validation for roadmap and migration
  copied-workspace regression coverage.
- [x] Run `bun test/run.ts` — unit tests for roadmap and migration
  copied-workspace scenarios and existing suites.

## Verification

- [x] Verify implementation matches proposal scope, covers only the remaining
  milestone-09 roadmap and migration scenarios, and preserves the committed
  fixture baseline.
