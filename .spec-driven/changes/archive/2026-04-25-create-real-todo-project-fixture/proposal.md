# create-real-todo-project-fixture

## What

Add a committed real todo-project fixture under `test/fixtures/projects/` that
looks like a small consumer repository and includes enough source files,
repository metadata, and strict workflow artifacts to support future
fixture-backed CLI, roadmap, and migration scenarios.

## Why

The current repository mostly relies on single-file validation fixtures and a
large `test/run.ts` script. Milestones 07 and 08 both depend on a repeatable
real-project regression path so behavior-preserving refactors can be checked
against something closer to a real consumer repository. The committed fixture is
the first dependency in that path and unblocks the later copy/reset harness and
scenario work without forcing decomposition changes to begin first.

## Scope

In scope:
- Add one committed todo-project fixture directory under `test/fixtures/projects/`.
- Include realistic but compact project files such as source files, package
  metadata, and strict workflow artifacts that upcoming tests can exercise.
- Seed the fixture with enough workflow state to support future CLI, roadmap,
  and migration scenarios without requiring ad hoc fixture assembly in each
  test.

Out of scope:
- Adding the copy/reset harness for temporary workspaces.
- Rewriting `test/run.ts` into modules.
- Adding the full CLI, roadmap, or migration scenario suite against the new
  fixture.
- Changing CLI behavior, command names, artifact formats, or workflow semantics.

## Unchanged Behavior

- Existing CLI behavior and outputs remain unchanged.
- Existing single-file validation and roadmap fixtures remain available.
- The build and test command surface remains `bun run build` and
  `bun test/run.ts`.
