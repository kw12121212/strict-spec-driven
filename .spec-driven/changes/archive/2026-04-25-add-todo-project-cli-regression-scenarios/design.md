# Design: add-todo-project-cli-regression-scenarios

## Approach

- Extend the existing modular test suites with copied-workspace scenarios that
  execute the selected CLI commands against `test/fixtures/projects/todo-app/`
  through `createCopiedProjectWorkspace()` and `projectWorkspaceCli()`.
- Keep the new assertions command-focused: verify exit status, output shape, and
  on-disk artifact effects in the temp workspace, then separately assert that
  the committed fixture baseline was not mutated.
- Reuse or lightly extend shared test helpers only when multiple scenarios need
  the same copied-workspace assertion pattern, keeping this change focused on
  scenario coverage rather than another runner refactor.

## Key Decisions

- Limit the proposal to the explicitly named CLI commands from milestone 09.
  This was confirmed during recommendation and keeps the change aligned with the
  dependency-order goal of unblocking milestone 07 first.
- Treat the change as regression coverage only. Because it is intended to prove
  existing observable behavior in a real project workspace, the delta spec
  directory can stay empty unless implementation reveals a user-visible contract
  change.
- Build on the current fixture, copy/reset harness, and modular suites instead
  of introducing a separate project-test framework. The prerequisites for this
  slice are already present, so the remaining work should stay close to the
  existing test architecture.

## Alternatives Considered

- Include additional CLI commands in the same proposal. This would blur the
  first-slice boundary and make the dependency-unblocking step larger than
  necessary.
- Start milestone 07 command-surface extraction before these scenarios exist.
  That would weaken the acceptance gate for behavior-preserving refactors.
- Prioritize roadmap and migration fixture scenarios first. Those are important,
  but they align more directly with milestone 08 than the CLI-focused
  decomposition work that comes next.
