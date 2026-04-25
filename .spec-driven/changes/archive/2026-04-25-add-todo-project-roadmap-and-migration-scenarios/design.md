# Design: add-todo-project-roadmap-and-migration-scenarios

## Approach

- Extend the existing modular `test/suites/roadmap-and-migration.ts` suite with
  copied-workspace scenarios that execute `roadmap-status`, `roadmap-sync`, and
  `migrate` against `test/fixtures/projects/todo-app/` through
  `createCopiedProjectWorkspace()` and `projectWorkspaceCli()`.
- Keep the new assertions command-focused: verify exit status, JSON output
  shape, roadmap rewrites or migrated strict artifacts in the temp workspace,
  and then separately assert that the committed fixture baseline was not
  mutated.
- Reuse the current synthetic roadmap and migration tests for narrow invalid or
  ambiguous cases while using the real project fixture for happy-path
  end-to-end regression coverage.

## Key Decisions

- Limit the proposal to the remaining milestone-09 roadmap and migration
  project-fixture scenarios. This keeps the dependency-ordered slice small and
  leaves `prove-todo-project-suite-repeatability` as a distinct follow-up
  change.
- Treat the change as regression coverage only. Because it is intended to prove
  existing observable behavior in a real project workspace, the delta spec
  directory can stay empty unless implementation reveals a user-visible contract
  change.
- Build on the current roadmap-and-migration suite and copied-workspace harness
  instead of introducing a separate project-test framework. The prerequisites
  for this slice already exist, so the remaining work should stay close to the
  existing test architecture.

## Alternatives Considered

- Combine this work with `prove-todo-project-suite-repeatability`. That would
  enlarge the proposal and make it harder to tell whether missing scenario
  coverage or repeatability mechanics caused failures.
- Start milestone 07 or 08 decomposition before these scenarios exist. That
  would weaken the acceptance gate for behavior-preserving refactors that depend
  on the shared real-project suite.
- Split roadmap and migration fixture scenarios into separate proposals. That
  would leave milestone 09 partially unblocked and delay the shared project
  coverage this milestone is supposed to provide.
