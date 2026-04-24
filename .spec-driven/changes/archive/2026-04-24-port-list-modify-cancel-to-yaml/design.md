# Design: port-list-modify-cancel-to-yaml

## Approach

Add `runList`, `runModify`, and `runCancel` handlers in the strict CLI command
router, following the existing command pattern (`runInit`, `runPropose`,
`runApply`, `runVerify`, `runArchive`). Each handler reads strict change state
from `.strict-spec-driven/changes/` and prints deterministic command output.

`list` enumerates active change directories and archive directories, and
provides status for active changes based on strict planning artifacts.

`modify` supports two modes:
- No argument: print active changes with status for quick selection.
- Named target: print editable artifact paths for the target change. Active
  targets use `<name>`. Archived targets must use exact directory name
  `YYYY-MM-DD-<name>`.

`cancel` removes active change directories only and rejects archive targets.

## Key Decisions

- **Archive immutability for cancellation**: `cancel` applies only to active
  changes. Archived changes are historical records and must not be deleted by
  the normal cancel path.
- **Exact archived modify target**: archived `modify` requires the exact
  directory name (`YYYY-MM-DD-<name>`) to avoid ambiguous auto-resolution when
  multiple archived entries share the same base change name.
- **Reference-aligned UX with strict paths**: command behavior mirrors the
  reference workflow interaction model while operating on strict YAML artifact
  locations under `.strict-spec-driven/`.

## Alternatives Considered

- **Allow `cancel` on archived changes**: rejected due to auditability and
  history-safety risk.
- **Allow bare `<name>` for archived `modify` with auto-match**: rejected due
  to ambiguity and non-deterministic behavior with duplicate historical names.
