---
mapping:
  implementation:
    - src/cli/changes.ts
    - src/cli/fs.ts
    - src/strict-spec-cli.ts
  tests:
    - test/run.ts
    - test/suites/operations.ts
---

## MODIFIED Requirements

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
