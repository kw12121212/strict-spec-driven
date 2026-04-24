# port-list-modify-cancel-to-yaml

## What

Implement `list`, `modify`, and `cancel` CLI subcommands for strict workflow
changes under `.strict-spec-driven/changes/`, with deterministic path output
for agent editing and explicit archive safety boundaries.

## Why

Milestone 03 still lacks the operational commands needed to inspect and manage
strict YAML changes after `propose`, `apply`, `verify`, and `archive` were
ported. Without these commands, agent workflows cannot reliably discover active
and archived changes, locate editing artifacts, or safely cancel abandoned
active work.

## Scope

- Add `list` subcommand to report active strict changes and archived strict
  change directories.
- Add `modify` subcommand to print editable artifact paths for a target strict
  change, including strict planning artifacts and `specs/` delta files.
- Keep `modify` behavior deterministic for archived changes by requiring the
  exact archive directory name (`YYYY-MM-DD-<name>`), not bare-name guessing.
- Add `cancel` subcommand for active strict changes only.
- Reject cancellation of archived changes to preserve immutable history and
  auditability.
- Add tests covering active and archived discovery, artifact path output,
  safety checks, and missing-target errors.

## Unchanged Behavior

- Existing `init`, `propose`, `apply`, `verify`, and `archive` command behavior
  remains unchanged.
- Strict YAML artifact schemas and scaffold template file formats remain
  unchanged.
