# add-repeatable-project-copy-and-reset-harness

## What

- Add shared test helpers that copy the committed `test/fixtures/projects/todo-app/`
  fixture into a fresh temporary workspace before project-level scenarios run.
- Execute mutable project-level CLI scenarios against the copied workspace rather
  than the committed baseline fixture.
- Clean up temporary workspaces after each scenario so repeated runs start from
  the same repository-contained fixture state.

## Why

Milestone 09 defines a shared real-project regression suite that milestones 07
and 08 rely on as a safety gate for large refactors. The committed todo project
fixture already exists, but the test runner does not yet provide a reusable
copy-and-reset harness that lets project-level scenarios mutate a fresh working
copy without risking baseline drift. Landing that harness first unblocks the
remaining regression scenarios and lowers refactor risk before CLI and domain
decomposition work begins.

## Scope

In scope:
- Add reusable test-side helpers for fixture copying, temporary workspace
  creation, command execution in the copied workspace, and cleanup.
- Apply the harness to the project-level regression paths that need mutable
  repository state.
- Add repeatability checks proving the committed fixture stays unchanged while
  copied-workspace scenarios can run repeatedly.

Out of scope:
- Splitting `test/run.ts` into smaller files.
- Adding the full backlog of CLI, roadmap, or migration regression scenarios.
- Changing CLI behavior, command outputs, or `.spec-driven/` artifact semantics.

## Unchanged Behavior

Behaviors that must not change as a result of this change (leave blank if nothing is at risk):
- The committed fixture under `test/fixtures/projects/todo-app/` remains the
  read-only baseline input for project-level tests.
- CLI commands, outputs, and exit-code behavior remain unchanged.
- Existing artifact formats and workflow semantics remain unchanged.
