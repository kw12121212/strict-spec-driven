---
mapping:
  implementation:
    - src/roadmap/sync.ts
    - src/converters/roadmap.ts
  tests:
    - test/suites/roadmap-and-migration.ts
---

## MODIFIED Requirements

### Requirement: yaml-roadmap-milestone-planning-model
Previously: The system MUST represent roadmap milestone planning state through structured YAML fields for goal, scope, done criteria, dependencies, risks, status, notes, planned change entries, and an optional `details` field for long-form planning guidance.
The system MUST preserve the optional `details` field when building canonical milestone artifacts during sync operations so that authored long-form planning guidance is not silently discarded.

#### Scenario: sync preserves details when present
- GIVEN a strict roadmap milestone artifact includes a `details` field
- WHEN the roadmap sync operation builds the canonical milestone artifact
- THEN the output milestone artifact includes the same `details` content
- AND the `details` content is not modified or truncated

#### Scenario: sync omits details when absent
- GIVEN a strict roadmap milestone artifact omits the `details` field
- WHEN the roadmap sync operation builds the canonical milestone artifact
- THEN the output milestone artifact omits the `details` field
- AND no empty string or placeholder is emitted in its place
