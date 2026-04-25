# add-todo-project-roadmap-and-migration-scenarios

## What

- Add copied-workspace regression scenarios for `roadmap-status`,
  `roadmap-sync`, and `migrate` against the committed
  `test/fixtures/projects/todo-app/` fixture.
- Assert command exit codes, JSON report structure, roadmap reconciliation
  effects, migrated strict outputs, and source-baseline preservation inside a
  fresh copied workspace.
- Extend the existing roadmap-and-migration test suite and copied-workspace
  harness instead of changing production CLI behavior or workflow semantics.

## Why

Milestone 09 is the shared regression foundation for the command-surface and
workflow-domain decomposition work in milestones 07 and 08. The repository now
has the real todo-project fixture, the copy-and-reset harness, the modular test
runner, and the first CLI-focused copied-workspace slice, but roadmap and
migration behavior still lacks the same shared real-project regression coverage.

Landing this change next follows the roadmap dependency order: it closes the
remaining project-fixture scenario gap before the final repeatability proof and
before larger CLI or domain refactors depend on this acceptance gate.

## Scope

In scope:
- Add copied-workspace scenarios for `roadmap-status` and `roadmap-sync` using
  the fixture's existing `.spec-driven/roadmap/` state and asserting ordered
  milestone or planned-change results plus any rewritten roadmap artifacts.
- Add copied-workspace scenarios for `migrate`, asserting structured report
  output and resulting `.strict-spec-driven/` artifacts generated from the
  copied fixture's bootstrap state.
- Reuse the existing copied-workspace helpers and modular suite structure,
  refining shared test helpers only where multiple project-fixture assertions
  need the same deterministic pattern.

Out of scope:
- Proving repeated reruns across the full project-fixture suite; that belongs to
  `prove-todo-project-suite-repeatability`.
- Expanding this proposal to unrelated CLI commands already covered by
  `add-todo-project-cli-regression-scenarios`.
- Changing production code in `src/`, altering roadmap or migration semantics,
  or adding new main-spec requirements unless implementation reveals a
  user-visible contract gap.

## Unchanged Behavior

Behaviors that must not change as a result of this change (leave blank if nothing is at risk):
- Existing `roadmap-status`, `roadmap-sync`, and `migrate` behavior under
  `.spec-driven/specs/cli/foundation.md` remains the observable baseline.
- The committed fixture under `test/fixtures/projects/todo-app/` remains the
  read-only baseline input for project-level tests.
- The repository validation and unit-test entry commands remain `bun run build`
  and `bun test/run.ts`.
