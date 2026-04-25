# Design: split-monolithic-test-runner-into-modules

## Approach

- Identify the current logical sections inside `test/run.ts` and convert them
  into focused suite modules rather than trying to redesign the test strategy at
  the same time.
- Extract the helpers that are already acting as shared infrastructure — such as
  CLI invocation, temporary workspace setup, fixture path resolution, pass/fail
  reporting, and repeated assertion utilities — into reusable test-support
  modules.
- Keep one thin runner entrypoint that preserves the current execution order and
  aggregates pass/fail accounting so the outward test command stays stable while
  the internal structure becomes easier to extend.

## Key Decisions

- Land runner decomposition before adding new project-level scenario backlog.
  This keeps scope bounded and reduces the chance that structure work gets mixed
  with new behavior coverage in one proposal.
- Preserve the existing test command and execution order instead of introducing
  a new runner tool. The roadmap item is about modularity and maintainability,
  not changing the repository's test surface.
- Treat this as internal regression infrastructure only. Because the proposal
  reorganizes test code without changing observable product behavior, the delta
  spec directory can stay empty unless implementation reveals a real external
  contract change.

## Alternatives Considered

- Add the CLI project-fixture scenarios first. Rejected because that would push
  more coverage into the current monolithic runner before the suite is easier to
  extend safely.
- Start milestone 07 CLI decomposition first. Rejected because the acceptance
  gate for that work is still concentrated in one oversized test script.
- Replace the current runner with a different test framework or command surface.
  Rejected because the roadmap item only calls for decomposition, not a testing
  stack migration.
