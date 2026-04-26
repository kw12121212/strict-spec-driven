# Design: prove-todo-project-suite-repeatability

## Approach

- Reuse the existing copied-workspace harness and extend the real-project test
  suites with explicit rerun coverage instead of inventing a second regression
  path.
- Identify the copied todo-project flows that already act as milestone-level
  acceptance coverage, then execute those flows across fresh workspace copies
  and compare their stable outputs, ordering, and baseline-preservation
  behavior.
- Add small shared helpers only where repeated-flow assertions need consistent
  comparison rules, especially when temp workspace roots differ between runs.

## Key Decisions

- Keep this change focused on regression proof, not product behavior. The
  planned change is a testing gate for later milestones, so the proposal should
  stay in test and helper surfaces unless the repository proves an observable
  contract change is required.
- Prove repeatability at the real-project scenario level, not only with
  synthetic temp-dir fixtures. Milestones 08 and 10 depend on the copied
  todo-project harness specifically, so that is the right acceptance boundary.
- Compare deterministic fields and ordering rather than raw temp-directory
  strings where workspace-specific paths would otherwise make equivalent runs
  look different.

## Alternatives Considered

- Treat the existing scattered copied-workspace assertions as sufficient. That
  leaves the roadmap item incomplete because the suite still lacks a clear
  repeatability gate for the shared real-project flows.
- Add more isolated unit-style fixtures instead of strengthening the copied
  todo-project scenarios. That would not prove the acceptance harness that
  later refactors depend on.
- Start milestone 08 decomposition first and fill in repeatability proof later.
  That would increase refactor risk before the shared regression gate is fully
  established.
