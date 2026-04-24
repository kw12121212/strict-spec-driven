---
mapping:
  implementation:
    - src/migrate.ts
    - src/scaffold.ts
    - src/strict-spec-cli.ts
  tests:
    - test/run.ts
---

## ADDED Requirements

### Requirement: cli-migrate-converts-bootstrap-workflow-state
The system MUST provide a `migrate` subcommand that reads legacy
`.spec-driven/` workflow state, migrates the supported bootstrap config into
strict YAML output, initializes the remaining strict scaffold assets under
`.strict-spec-driven/`, and reports deferred legacy artifacts that still need
dedicated converters.

#### Scenario: migrate converts bootstrap config and initializes strict scaffold
- GIVEN legacy bootstrap workflow state exists under `.spec-driven/`
- AND no unsafe strict target conflict blocks execution
- WHEN `strict-spec-driven migrate` is executed
- THEN the command writes a migrated strict config artifact under
  `.strict-spec-driven/config.yaml`
- AND the command initializes the remaining required strict scaffold assets
  under `.strict-spec-driven/`
- AND the source `.spec-driven/` artifacts remain unchanged
- AND the command reports which artifacts were converted and which were skipped

#### Scenario: migrate reports deferred legacy artifacts without guessing
- GIVEN legacy Markdown workflow artifacts exist under `.spec-driven/`
- AND dedicated converters for those artifacts are not implemented yet
- WHEN `strict-spec-driven migrate` is executed
- THEN those legacy artifacts are reported as skipped
- AND the command records manual follow-up items instead of inventing strict
  YAML content for them

### Requirement: cli-migrate-enforces-preflight-and-overwrite-protection
The system MUST reject migration runs that cannot proceed safely and report the
blocking preflight or overwrite-protection reason deterministically.

#### Scenario: migrate rejects unsafe strict target overwrite
- GIVEN `.strict-spec-driven/` already contains conflicting workflow state
- AND no explicit safe rerun policy allows overwriting that state
- WHEN `strict-spec-driven migrate` is executed
- THEN the command exits non-zero
- AND the result identifies the overwrite-protection conflict
- AND existing strict target files are left unchanged

#### Scenario: migrate rejects missing legacy source state
- GIVEN supported legacy workflow artifacts are not present under `.spec-driven/`
- WHEN `strict-spec-driven migrate` is executed
- THEN the command exits non-zero
- AND the result identifies the missing bootstrap source state

### Requirement: cli-migrate-emits-structured-report-output
The system MUST emit a structured migration report for each migration run so the
operator can review successes, failures, warnings, and manual follow-up items.

#### Scenario: migrate report includes actionable outcome categories
- GIVEN `strict-spec-driven migrate` completes a migration attempt
- WHEN the migration result is inspected
- THEN the report includes converted artifacts, skipped artifacts, warnings, and
  errors
- AND any unsupported or ambiguous legacy shapes are recorded as manual
  follow-up items with source references
