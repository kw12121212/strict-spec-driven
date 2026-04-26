---
mapping:
  implementation:
    - src/skills/model.ts
    - skills/strict-roadmap-propose/SKILL.md
    - skills/strict-roadmap-recommend/SKILL.md
  tests:
    - test/suites/roadmap-and-migration.ts
    - test/run.ts
---

## MODIFIED Requirements

### Requirement: cli-roadmap-validation-and-skill-smoke-coverage
Previously: The system MUST include automated checks that exercise strict roadmap command behavior and strict roadmap skill content for both aligned and failing states.
The system MUST include automated checks that exercise strict roadmap command behavior and strict roadmap skill content for both aligned and failing states, including regression coverage for milestones that use the optional `details` field across roadmap validation, sync, and proposal-handoff flows.

#### Scenario: automated checks accept details-bearing roadmap workflow surfaces
- GIVEN strict roadmap commands and `strict-roadmap-*` skill packages are aligned with `.strict-spec-driven/roadmap/`
- AND a milestone includes a valid `details` field
- WHEN repository automated checks are executed
- THEN the roadmap workflow checks pass
- AND the checks verify that roadmap validation accepts the milestone artifact
- AND the checks verify that roadmap sync preserves the `details` content
- AND the checks verify that roadmap proposal-handoff guidance remains details-aware

#### Scenario: automated checks accept milestones without details
- GIVEN strict roadmap commands and `strict-roadmap-*` skill packages are aligned with `.strict-spec-driven/roadmap/`
- AND a milestone omits the optional `details` field
- WHEN repository automated checks are executed
- THEN the roadmap workflow checks pass
- AND no placeholder or synthetic `details` value is required
