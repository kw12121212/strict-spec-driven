---
mapping:
  implementation:
    - skills/marketplace.json
    - src/skills.ts
    - skills/strict-spec-migrate/SKILL.md
  tests:
    - test/run.ts
---

## ADDED Requirements

### Requirement: strict-migration-skill-command-contract
The system MUST provide a strict migration skill package for `migrate` with
explicit command mappings that reference the strict bundled CLI commands used
for migration execution and post-migration validation.

#### Scenario: migration skill exposes concrete strict commands
- GIVEN the strict migration `SKILL.md` file is reviewed
- WHEN its `## This Skill's Commands` section is inspected
- THEN the command mapping includes
  `node {{SKILL_DIR}}/scripts/strict-spec-driven.js migrate`
- AND the command mapping includes strict validation or inspection commands
  needed after migration
- AND the command mapping is not limited to a generic placeholder command

### Requirement: strict-migration-skill-guidance-contract
The system MUST ensure the strict migration skill describes
`.strict-spec-driven/` YAML workflow artifacts, treats `.spec-driven/` as legacy
migration input, and guides operators through structured report review and
manual follow-up without inventing missing data.

#### Scenario: migration skill describes the correct source and target state
- GIVEN the strict migration skill prompt is reviewed
- WHEN its prerequisites and workflow instructions are inspected
- THEN the skill treats `.spec-driven/` as migration input
- AND the skill treats `.strict-spec-driven/` as the strict YAML target state
- AND the prompt does not describe legacy Markdown workflow state as the desired
  end state

#### Scenario: migration skill preserves report-review and manual-follow-up boundaries
- GIVEN a migration run leaves warnings, errors, or manual follow-up items
- WHEN the strict migration skill guidance is inspected
- THEN the skill directs the operator to review structured report output
- AND the skill preserves manual follow-up as an explicit human review step
- AND the prompt does not claim unsupported structures were silently converted
