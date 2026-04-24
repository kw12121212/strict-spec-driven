---
mapping:
  implementation:
    - src/skills.ts
  tests:
    - test/run.ts
---

## ADDED Requirements

### Requirement: cli-core-skill-content-validation-smoke-coverage
The system MUST include automated checks that exercise strict core lifecycle
skill content for both passing and failing states, not only package-shape
validation.

#### Scenario: automated checks accept aligned core skill content
- GIVEN the strict core lifecycle skills contain explicit strict command
  mappings and `.strict-spec-driven/` workflow guidance
- WHEN repository automated checks are executed
- THEN the core skill content checks pass

#### Scenario: automated checks reject placeholder core skill content
- GIVEN a strict core lifecycle skill keeps a generic placeholder command block
  or omits required strict workflow guidance
- WHEN repository automated checks are executed
- THEN the core skill content checks fail
- AND diagnostics identify the failing skill package deterministically
