# Design: add-repeatable-project-copy-and-reset-harness

## Approach

- Introduce shared test helpers that locate the committed todo-project fixture,
  copy it into a fresh temporary directory, run CLI commands from that copied
  workspace, and always remove the temporary workspace in cleanup.
- Move project-level scenarios that need mutable repository state onto that
  harness so they no longer rely on in-place fixture mutation or ad hoc temp-dir
  setup.
- Add assertions that compare repeated copied-workspace runs against the same
  baseline expectations so repeatability is proven before broader regression
  coverage is added.

## Key Decisions

- Treat the committed project fixture as read-only baseline input. This keeps the
  fixture reviewable in git and prevents accidental state drift between runs.
- Land the copy/reset harness before broader scenario expansion or runner
  decomposition. It is the dependency-order step that unblocks later milestone 09
  work and reduces risk for milestones 07 and 08.
- Keep this proposal as testing infrastructure only. Because it does not change
  observable product behavior, the delta spec directory can remain empty unless
  implementation reveals an externally visible contract change.

## Alternatives Considered

- Mutate the committed fixture in place and manually restore it after each
  scenario. This is fragile and makes repeated runs depend on perfect cleanup.
- Split `test/run.ts` into modules first. That improves structure later, but it
  does not solve the baseline-drift problem that blocks realistic copied-fixture
  scenarios today.
- Start milestone 07 or 08 refactors before the harness exists. That would make
  behavior-preservation harder to prove during high-risk decomposition work.
