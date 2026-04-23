# port-apply-to-yaml-tasks

## What

Implement the `apply` CLI subcommand that reads and updates `tasks.yaml` for an active strict change, presenting the next incomplete task, marking it complete on invocation, and emitting machine-readable task status JSON.

## Why

The spec-driven lifecycle flows propose → apply → verify → archive. The `propose` subcommand already scaffolds strict change artifacts including `tasks.yaml`. The `apply` subcommand is the next command needed to drive task completion through the strict workflow. Later commands (`verify`, `archive`) depend on task state that `apply` manages.

## Scope

- Add `apply` subcommand to the strict CLI command router.
- Locate and read `tasks.yaml` from `.strict-spec-driven/changes/<name>/`.
- Identify the first pending task across all sections (one-task-at-a-time semantics).
- Mark the identified task as `complete` and write the updated `tasks.yaml` back to disk.
- Emit deterministic JSON task status output describing which task was completed and the remaining task summary.
- Reject invocations where the named change does not exist.
- Reject invocations where no pending tasks remain (all complete).
- Preserve existing `tasks.yaml` structure and fields unchanged except for the target task `status` field.
- Add tests covering happy path, missing change, all-complete, empty tasks, and JSON output determinism.

## Unchanged Behavior

- Existing `init` and `propose` subcommands remain unchanged.
- The `tasks.yaml` template structure and field names remain unchanged.
- The validation layer, scaffold utilities, and YAML utilities remain unchanged.
