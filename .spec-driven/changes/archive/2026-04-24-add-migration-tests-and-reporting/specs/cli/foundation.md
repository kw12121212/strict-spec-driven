---
mapping:
  implementation:
    - src/strict-spec-cli.ts
    - src/migrate.ts
  tests:
    - test/run.ts
---

## ADDED Requirements

### Requirement: cli-migrate-force-rerun
The system MUST allow `strict-spec-driven migrate` to rerun into an existing non-empty `.strict-spec-driven/` directory only when the operator explicitly passes `--force` or `-f`.

#### Scenario: rerun without force stays blocked
- GIVEN `strict-spec-driven migrate` already populated `.strict-spec-driven/`
- WHEN the operator runs `strict-spec-driven migrate` again without `--force`
- THEN the command exits non-zero
- AND the result identifies the strict target conflict

#### Scenario: rerun with force reuses the same structured output
- GIVEN `strict-spec-driven migrate` already populated `.strict-spec-driven/`
- WHEN the operator runs `strict-spec-driven migrate --force`
- THEN the command exits zero
- AND the result matches the structured migration report from the initial successful run

#### Scenario: short force flag reruns migration
- GIVEN `strict-spec-driven migrate` already populated `.strict-spec-driven/`
- WHEN the operator runs `strict-spec-driven migrate -f`
- THEN the command exits zero
- AND the result matches the structured migration report from the initial successful run

### Requirement: cli-migrate-report-collections-are-always-arrays
The system MUST emit `converted`, `skipped`, `warnings`, `errors`, and `manualFollowUp` as top-level array fields in every migration report, including successful, partial, and blocked runs.

#### Scenario: successful migration keeps warning collections explicit
- GIVEN a migration run converts all supported artifacts without deferred legacy spec files
- WHEN the migration report is inspected
- THEN `warnings` is present as an array
- AND `manualFollowUp` is present as an array

#### Scenario: partial migration keeps deferred collections explicit
- GIVEN a migration run converts supported artifacts while deferring ambiguous legacy spec files
- WHEN the migration report is inspected
- THEN `skipped` is present as an array
- AND `warnings` is present as an array
- AND `manualFollowUp` is present as an array

#### Scenario: blocked migration keeps report collections explicit
- GIVEN a migration run is blocked before conversion completes
- WHEN the migration report is inspected
- THEN `converted` is present as an array
- AND `skipped` is present as an array
- AND `warnings` is present as an array
- AND `errors` is present as an array
- AND `manualFollowUp` is present as an array
