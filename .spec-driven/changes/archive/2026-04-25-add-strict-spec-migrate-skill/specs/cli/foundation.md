---
mapping:
  implementation:
    - src/skills.ts
  tests:
    - test/run.ts
---

## ADDED Requirements

### Requirement: cli-migration-skill-content-validation-smoke-coverage
The system MUST include automated checks that exercise strict migration skill
content for both passing and failing states, not only generic package-shape
validation.

#### Scenario: automated checks accept aligned migration skill content
- GIVEN the strict migration skill contains explicit strict command mappings and
  `.strict-spec-driven/` migration guidance
- WHEN repository automated checks are executed
- THEN the migration skill content checks pass

#### Scenario: automated checks reject placeholder migration skill content
- GIVEN the strict migration skill keeps a generic placeholder command block or
  omits required migration guidance
- WHEN repository automated checks are executed
- THEN the migration skill content checks fail
- AND diagnostics identify the failing skill package deterministically
