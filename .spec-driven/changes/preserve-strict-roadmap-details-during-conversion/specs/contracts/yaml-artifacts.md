---
mapping:
  implementation:
    - src/converters/roadmap.ts
  tests:
    - test/suites/roadmap-and-migration.ts
---

## MODIFIED Requirements

### Requirement: yaml-migration-relationship-preservation
Previously: The system MUST require migration behavior to preserve supported workflow relationships when converting legacy `.spec-driven/` Markdown artifacts into strict YAML artifacts.
The system MUST require migration behavior to preserve supported workflow relationships when converting legacy `.spec-driven/` Markdown artifacts into strict YAML artifacts, including the optional `details` field on roadmap milestones.

#### Scenario: migration preserves milestone details
- GIVEN a legacy roadmap milestone Markdown artifact contains a `## Details` section
- WHEN migration converts the milestone to a strict YAML roadmap milestone artifact
- THEN the converted artifact includes the `details` field with the section content
- AND the `details` content matches the original Markdown section text

#### Scenario: migration omits details when absent in legacy milestone
- GIVEN a legacy roadmap milestone Markdown artifact does not contain a `## Details` section
- WHEN migration converts the milestone to a strict YAML roadmap milestone artifact
- THEN the converted artifact omits the `details` field
- AND no empty string or placeholder is emitted in its place
