# prove-todo-project-suite-repeatability

## What

- Add explicit repeatability checks around the committed todo-project copied
  workspace scenarios that milestone 09 uses as its shared regression harness.
- Prove that repeated runs of the same copied-fixture CLI, roadmap, and
  migration flows preserve the committed baseline fixture and keep deterministic
  output ordering or diagnostics where the workflow already promises stability.
- Tighten shared test-side helpers or assertion utilities only where needed to
  compare repeated copied-workspace runs without depending on temp-directory
  names.

## Why

Milestone 09 is almost complete, but its last planned change is still missing:
an explicit proof that the real-project regression suite can be rerun cleanly.
The repository already contains the committed `test/fixtures/projects/todo-app/`
fixture, copied-workspace helpers in `test/support/harness.ts`, and project
coverage in `test/suites/foundation-and-fixtures.ts` plus
`test/suites/roadmap-and-migration.ts`. What is still missing is a shared
acceptance gate that shows those copied-fixture flows can run repeatedly
without baseline drift and with stable observable outputs. Landing that proof
first unblocks milestone 08 refactors and supports later roadmap work that
expects the copied-project harness to be trustworthy.

## Scope

In scope:
- Add repeatability assertions for the copied todo-project CLI flows already
  covered by the suite.
- Add repeatability assertions for copied todo-project roadmap and migration
  flows, including baseline-preservation checks and stable output or ordering
  expectations.
- Refine shared test helpers or comparison utilities only where necessary to
  make repeated copied-workspace checks deterministic and reviewable.

Out of scope:
- Adding unrelated new CLI features, roadmap behavior, or migration semantics.
- Expanding the fixture set beyond the committed todo-project baseline.
- Treating milestone 09 as permission to start milestone 08 domain refactors in
  the same change.
- Adding delta spec prose unless implementation reveals an observable behavior
  contract change.

## Unchanged Behavior

Behaviors that must not change as a result of this change (leave blank if nothing is at risk):
- The committed fixture under `test/fixtures/projects/todo-app/` remains the
  read-only baseline input for project-level regression coverage.
- Existing CLI behavior, exit codes, and artifact semantics remain unchanged.
- Roadmap and migration assertions keep validating current behavior rather than
  redefining it through test-only convenience shortcuts.
