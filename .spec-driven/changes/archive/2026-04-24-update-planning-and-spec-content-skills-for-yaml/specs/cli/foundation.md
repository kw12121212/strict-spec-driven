---
mapping:
  implementation:
    - src/skills.ts
  tests:
    - test/run.ts
---

## ADDED Requirements

### Requirement: cli-planning-skill-content-validation-smoke-coverage
The system MUST include automated checks that exercise strict planning and
documentation skill content for both passing and failing states, not only
package-shape validation.

#### Scenario: automated checks accept aligned planning skill content
- GIVEN the strict planning and documentation skills contain explicit strict
  command mappings and `.strict-spec-driven/` workflow guidance
- WHEN repository automated checks are executed
- THEN the planning skill content checks pass

#### Scenario: automated checks reject placeholder planning skill content
- GIVEN a strict planning or documentation skill keeps a generic placeholder
  command block or omits required strict workflow guidance
- WHEN repository automated checks are executed
- THEN the planning skill content checks fail
- AND diagnostics identify the failing skill package deterministically
