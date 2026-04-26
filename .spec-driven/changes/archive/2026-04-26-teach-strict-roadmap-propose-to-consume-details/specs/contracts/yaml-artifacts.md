---
mapping:
  implementation:
    - skills/strict-roadmap-propose/SKILL.md
    - skills/strict-roadmap-recommend/SKILL.md
  tests:
    - test/suites/roadmap-and-migration.ts
---

## MODIFIED Requirements

### Requirement: strict-roadmap-proposal-handoff-contract
Previously: The system MUST ensure roadmap recommendation and roadmap proposal-handoff behavior convert exactly one planned change into a normal strict change scaffold without duplicating roadmap-only planning metadata inside the change artifacts.
The system MUST ensure roadmap recommendation and roadmap proposal-handoff behavior convert exactly one planned change into a normal strict change scaffold without duplicating roadmap-only planning metadata inside the change artifacts, and MUST read the owning milestone's `details` field as targeted planning guidance when populating change artifacts.

#### Scenario: roadmap proposal handoff consumes milestone details
- GIVEN a roadmap milestone includes a planned change and a `details` field
- WHEN the strict roadmap proposal handoff scaffolds a strict change
- THEN the skill reads the milestone `details` field as context for populating the change artifacts
- AND the change artifacts reflect guidance extracted from `details` without copying the full milestone plan

#### Scenario: roadmap proposal handoff works without milestone details
- GIVEN a roadmap milestone includes a planned change but omits the `details` field
- WHEN the strict roadmap proposal handoff scaffolds a strict change
- THEN the change artifacts are populated using only the planned change entry and milestone goal
- AND the absence of `details` does not cause a failure or placeholder content
