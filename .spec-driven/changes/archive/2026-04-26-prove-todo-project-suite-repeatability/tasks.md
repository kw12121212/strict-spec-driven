# Tasks: prove-todo-project-suite-repeatability

## Implementation

- [x] Audit the existing copied todo-project CLI, roadmap, and migration
  scenarios to identify which shared flows need explicit rerun assertions for
  milestone-09 repeatability proof.
- [x] Add repeatability assertions in the copied-workspace suites so fresh
  reruns preserve the committed fixture baseline and keep stable output
  ordering or diagnostics for the selected real-project flows.
- [x] Refine shared harness helpers or suite-local comparison utilities only
  where needed so repeated copied-workspace assertions do not depend on
  temp-directory names.

## Testing

- [x] Run `bun run build` — build validation for repeatability assertions and
  helper updates.
- [x] Run `bun test/run.ts` — unit tests for repeated copied-fixture CLI,
  roadmap, and migration scenarios.

## Verification

- [x] Verify implementation matches proposal scope and leaves
  `.spec-driven/changes/prove-todo-project-suite-repeatability/specs/` empty
  unless implementation reveals an observable contract change.
