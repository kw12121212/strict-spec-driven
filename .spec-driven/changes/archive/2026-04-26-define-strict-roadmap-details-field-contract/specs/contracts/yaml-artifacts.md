---
mapping:
  implementation:
    - templates/strict-spec-driven/schemas/roadmap-milestone.yaml
    - templates/strict-spec-driven/examples/roadmap-milestone.yaml
    - templates/strict-spec-driven/examples/roadmap-milestone.planning.yaml
    - src/roadmap/model.ts
    - src/roadmap/validate.ts
  tests:
    - test/run.ts
---

## MODIFIED Requirements

### Requirement: yaml-roadmap-milestone-planning-model
Previously: The system MUST represent roadmap milestone planning state through structured YAML fields for goal, scope, done criteria, dependencies, risks, status, notes, and planned change entries.
The system MUST represent roadmap milestone planning state through structured YAML fields for goal, scope, done criteria, dependencies, risks, status, notes, planned change entries, and an optional `details` field for long-form planning guidance.

#### Scenario: roadmap milestone exposes details as optional long-form field
- GIVEN a strict roadmap milestone artifact is reviewed
- WHEN its `details` field is inspected
- THEN the details content is available as an optional string field
- AND the details content is freeform text suitable for YAML block scalar representation
- AND the details field is clearly distinct from short `notes` entries and concrete `planned_changes`

#### Scenario: milestones without details remain valid
- GIVEN a strict roadmap milestone artifact omits the `details` field
- WHEN the artifact is validated
- THEN no validation failure is emitted for the missing `details` field
- AND the milestone remains fully valid
