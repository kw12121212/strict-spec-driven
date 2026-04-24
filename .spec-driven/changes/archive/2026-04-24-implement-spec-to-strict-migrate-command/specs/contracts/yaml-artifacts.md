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

### Requirement: yaml-migration-report-envelope
The system MUST define a structured migration report model for strict migration
runs that records converted artifacts, initialized scaffold artifacts, skipped
artifacts, warnings, errors, and manual follow-up items, while preserving
source-artifact references for legacy inputs that were converted, skipped, or
deferred.

#### Scenario: migration report preserves actionable source context for legacy inputs
- GIVEN migration tooling converts supported legacy `.spec-driven/` artifacts
- WHEN the migration report is reviewed
- THEN each converted legacy artifact entry identifies the relevant source
  artifact path
- AND each skipped artifact entry identifies the relevant source artifact path
- AND each warning or error identifies the source artifact path that triggered
  the outcome

#### Scenario: migration report records initialized strict scaffold assets
- GIVEN migration tooling initializes required strict scaffold artifacts during a
  migration run
- WHEN the migration report is reviewed
- THEN each initialized scaffold artifact entry identifies its strict target
  path
- AND the entry does not need to invent a legacy source-artifact mapping when
  the scaffold asset came from bundled strict templates

#### Scenario: migration report captures manual follow-up items
- GIVEN migration tooling encounters an unsupported or ambiguous legacy Markdown
  shape
- WHEN the migration report is emitted
- THEN the report records a manual follow-up item for that source artifact
- AND the follow-up item explains what could not be converted deterministically
