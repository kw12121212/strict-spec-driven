---
mapping:
  implementation:
    - src/migrate.ts
  tests:
    - test/run.ts
---

## ADDED Requirements

### Requirement: yaml-migrated-core-spec-preservation
The system MUST preserve strict workflow identity, ordering, and mapping data
when legacy Markdown main specs and delta specs are converted into strict YAML
artifacts.

#### Scenario: migrated main specs preserve stable identifiers and mappings
- GIVEN migration tooling converts a legacy Markdown main spec
- WHEN the generated strict YAML spec artifact is inspected
- THEN the migrated artifact preserves the stable spec, requirement, and
  scenario identifiers represented by the legacy workflow state
- AND implementation and test mappings remain represented as structured
  file-level data rather than requirement prose
- AND scenario ordering remains recoverable from the strict YAML artifact data

#### Scenario: migrated delta specs preserve operation intent
- GIVEN migration tooling converts a legacy Markdown delta spec
- WHEN the generated strict YAML delta artifact is inspected
- THEN added, modified, and removed requirement operations remain represented
  through the strict YAML delta structure
- AND any preserved requirement identifiers remain reviewable through structured
  YAML fields

### Requirement: yaml-migrated-change-artifact-state-preservation
The system MUST preserve active and archived change state when legacy Markdown
proposal, design, tasks, and questions artifacts are converted into strict YAML
change artifacts.

#### Scenario: migrated active changes preserve task and question state
- GIVEN migration tooling converts an active legacy change directory
- WHEN the generated strict YAML change artifacts are inspected
- THEN proposal, design, tasks, and questions content remains represented in
  the corresponding strict artifact families
- AND completed versus pending task state remains reviewable through structured
  YAML data
- AND open versus resolved question state remains reviewable through structured
  YAML data

#### Scenario: migrated archived changes preserve archive-date behavior
- GIVEN migration tooling converts an archived legacy change directory with a
  date-prefixed folder name
- WHEN the generated strict archived change output is inspected
- THEN the archive-date prefix remains preserved in the migrated strict archive
  location or archived change identity
- AND the migrated archived change remains distinguishable from active strict
  changes without reconstructing that state from Markdown headings
