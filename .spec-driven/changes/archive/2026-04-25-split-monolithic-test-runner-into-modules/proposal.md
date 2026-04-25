# split-monolithic-test-runner-into-modules

## What

- Decompose `test/run.ts` into smaller test modules and shared helpers while
  preserving the current repository test surface and assertions.
- Reduce `test/run.ts` to a thin orchestration layer that delegates to focused
  suites for validation fixtures, strict CLI commands, roadmap behavior,
  migration behavior, and real-project fixture coverage.
- Keep the committed todo-project fixture and copied-workspace harness as shared
  building blocks that later milestone-09 scenario changes can extend.

## Why

Milestone 09 is the shared regression foundation for the CLI and workflow-domain
decomposition work in milestones 07 and 08. The fixture baseline and copied
workspace harness already exist, but the suite still runs through one very large
`test/run.ts` script. That makes the next regression additions harder to stage
and raises the risk of mixing structural cleanup with future scenario expansion.

Splitting the runner now is the dependency-order move that lowers coordination
cost before broader CLI, roadmap, and migration fixture scenarios are added or
before large behavior-preserving refactors begin in the production code.

## Scope

In scope:
- Extract shared test helpers for suite execution, fixture access, copied
  project workspaces, command execution, and common assertions where the current
  runner already repeats those concerns.
- Move the current test coverage into smaller domain-oriented modules while
  preserving the existing assertions, exit-code checks, and deterministic output
  expectations.
- Keep `test/run.ts` as a thin entrypoint that invokes the modularized suites in
  a stable order.

Out of scope:
- Adding the backlog of new CLI regression scenarios from
  `add-todo-project-cli-regression-scenarios`.
- Adding the roadmap and migration project-fixture scenarios from
  `add-todo-project-roadmap-and-migration-scenarios`.
- Changing CLI behavior, command names, artifact formats, or workflow
  semantics.
- Reworking production modules in `src/` as part of this proposal.

## Unchanged Behavior

Behaviors that must not change as a result of this change (leave blank if nothing is at risk):
- The repository test entry command remains `bun test/run.ts`.
- Existing assertions, command-output expectations, and deterministic diagnostic
  checks remain behaviorally equivalent after the split.
- The committed todo-project fixture and copied-workspace baseline semantics
  remain unchanged.
