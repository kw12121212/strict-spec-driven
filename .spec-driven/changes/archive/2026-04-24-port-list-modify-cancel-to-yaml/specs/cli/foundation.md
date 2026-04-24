---
mapping:
  implementation:
    - src/strict-spec-cli.ts
  tests:
    - test/run.ts
---

## ADDED Requirements

### Requirement: cli-list-reports-active-and-archived-strict-changes
The system MUST provide a `list` subcommand that reports active and archived
strict changes from `.strict-spec-driven/changes/`.

#### Scenario: list reports active changes
- GIVEN one or more active strict change directories exist under
  `.strict-spec-driven/changes/`
- WHEN `strict-spec-driven list` is executed
- THEN the command output includes active change names
- AND each active change includes a status summary derived from strict planning
  artifacts

#### Scenario: list reports archived changes
- GIVEN one or more archived strict change directories exist under
  `.strict-spec-driven/changes/archive/`
- WHEN `strict-spec-driven list` is executed
- THEN the command output includes archived directory names

#### Scenario: list handles empty state
- GIVEN no active and no archived strict changes exist
- WHEN `strict-spec-driven list` is executed
- THEN the command reports that no changes are present

### Requirement: cli-modify-reports-strict-artifact-paths
The system MUST provide a `modify` subcommand that reports editable strict
artifact paths for the selected change.

#### Scenario: modify with no argument lists active changes
- GIVEN one or more active strict changes exist
- WHEN `strict-spec-driven modify` is executed without a change target
- THEN the command lists active changes with status summaries

#### Scenario: modify reports active change artifacts
- GIVEN `.strict-spec-driven/changes/<name>/` exists
- WHEN `strict-spec-driven modify <name>` is executed
- THEN the command output lists `proposal.yaml`, `design.yaml`, `tasks.yaml`,
  `questions.yaml`, and the `specs/` delta spec paths for that change

#### Scenario: modify reports archived change artifacts by exact directory name
- GIVEN `.strict-spec-driven/changes/archive/<archive-dir>/` exists
- WHEN `strict-spec-driven modify <archive-dir>` is executed with the exact
  archive directory name
- THEN the command output lists the strict planning artifact and delta spec
  paths for the archived change

#### Scenario: modify rejects archived bare-name ambiguity
- GIVEN archived changes exist whose directories use `YYYY-MM-DD-<name>`
- WHEN `strict-spec-driven modify <name>` is executed without the date prefix
- THEN the command exits non-zero
- AND the error explains that archived targets require exact archive directory
  names

### Requirement: cli-cancel-removes-active-strict-changes-only
The system MUST provide a `cancel` subcommand that removes active strict changes
and rejects archived change targets.

#### Scenario: cancel removes an active change
- GIVEN `.strict-spec-driven/changes/<name>/` exists
- WHEN `strict-spec-driven cancel <name>` is executed
- THEN the active change directory is removed
- AND command output confirms cancellation

#### Scenario: cancel rejects archived target
- GIVEN `.strict-spec-driven/changes/archive/<archive-dir>/` exists
- WHEN `strict-spec-driven cancel <archive-dir>` is executed
- THEN the command exits non-zero
- AND the archived directory remains unchanged
- AND the error explains that cancel is limited to active changes
