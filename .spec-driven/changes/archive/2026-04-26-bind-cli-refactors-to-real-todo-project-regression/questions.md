# Questions: bind-cli-refactors-to-real-todo-project-regression

## Open

<!-- No open questions -->

## Resolved

- [x] Q: Should the new regression scenarios live in existing suites or a new dedicated suite?
  Context: Determines file layout for the implementation tasks and whether the test/run.ts orchestrator needs updating.
  A: Add to existing suites — `list` and archive-lookup go into the existing [15f] section in `change-lifecycle.ts` as additional assertions in the same copied-workspace flow.
