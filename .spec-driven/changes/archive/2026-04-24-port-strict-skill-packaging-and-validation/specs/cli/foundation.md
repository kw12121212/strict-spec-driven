---
mapping:
  implementation:
    - package.json
    - src/strict-spec-cli.ts
    - src/skills.ts
  tests:
    - test/run.ts
---

## ADDED Requirements

### Requirement: cli-skill-packaging-validation-smoke-coverage
The system MUST include automated checks that exercise strict skill packaging
validation behavior for both passing and failing package states.

#### Scenario: packaging checks confirm valid strict package state
- GIVEN strict skill packages satisfy metadata, command reference, and symlink
  assumptions
- WHEN repository automated checks are executed
- THEN strict skill packaging checks pass

#### Scenario: packaging checks report deterministic diagnostics for invalid state
- GIVEN a strict skill package has stale naming, missing required metadata, or
  broken symlink assumptions
- WHEN repository automated checks are executed
- THEN strict skill packaging checks fail
- AND diagnostics remain machine-readable and path-specific

#### Scenario: validate-skills command emits machine-readable results
- GIVEN strict skill packaging validation is executed through CLI
- WHEN `strict-spec-driven validate-skills` runs
- THEN command output is parseable JSON
- AND output includes validity, deterministic diagnostics, and summary counts
