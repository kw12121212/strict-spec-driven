---
mapping:
  implementation:
    - skills/strict-spec-maintenance/SKILL.md
    - templates/strict-spec-driven/scaffold/config.yaml
    - src/skills.ts
  tests:
    - test/run.ts
---

## ADDED Requirements

### Requirement: strict-maintenance-skill-command-contract
The system MUST provide a strict maintenance skill package for `maintenance` with an explicit command mapping that references `strict-spec-driven maintenance` as the primary command.

#### Scenario: maintenance skill exposes concrete strict command
- GIVEN the `strict-spec-maintenance/SKILL.md` file is reviewed
- WHEN its `## This Skill's Commands` section is inspected
- THEN the command mapping identifies `node {{SKILL_DIR}}/scripts/strict-spec-driven.js maintenance` as the primary maintenance command
- AND the command mapping is not limited to a generic placeholder command

### Requirement: strict-maintenance-config-section-contract
The system MUST allow `.strict-spec-driven/config.yaml` to include an optional `maintenance` section that lists configured checks, where each check entry exposes at minimum a structured `type` field.

#### Scenario: maintenance config section is optional and structured
- GIVEN a `.strict-spec-driven/config.yaml` is reviewed
- WHEN the `maintenance` section is present
- THEN configured checks are available as a structured YAML sequence
- AND each check entry exposes a `type` field as structured data

#### Scenario: absence of maintenance section does not invalidate config
- GIVEN a `.strict-spec-driven/config.yaml` has no `maintenance` section
- WHEN the config is validated
- THEN the config is considered valid
- AND maintenance behavior exits cleanly with zero checks run

### Requirement: strict-maintenance-skill-guidance-contract
The system MUST ensure the `strict-spec-maintenance` skill describes the `maintenance` subcommand as the entry point for seeding maintenance changes from configured checks, and describes `.strict-spec-driven/changes/` as the output location for generated maintenance changes.

#### Scenario: maintenance skill references strict maintenance command and output
- GIVEN the `strict-spec-maintenance/SKILL.md` skill prompt is reviewed
- WHEN its workflow guidance is inspected
- THEN the skill identifies the `maintenance` subcommand as the entry point
- AND the skill describes `.strict-spec-driven/changes/` as the output location for generated maintenance changes
