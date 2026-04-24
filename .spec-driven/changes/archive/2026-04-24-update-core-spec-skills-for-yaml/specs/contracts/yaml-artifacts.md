---
mapping:
  implementation:
    - src/skills.ts
    - skills/strict-spec-init/SKILL.md
    - skills/strict-spec-propose/SKILL.md
    - skills/strict-spec-apply/SKILL.md
    - skills/strict-spec-verify/SKILL.md
    - skills/strict-spec-review/SKILL.md
    - skills/strict-spec-archive/SKILL.md
    - skills/strict-spec-auto/SKILL.md
    - skills/strict-spec-modify/SKILL.md
    - skills/strict-spec-cancel/SKILL.md
  tests:
    - test/run.ts
---

## ADDED Requirements

### Requirement: strict-core-skill-command-contract
The system MUST provide strict core lifecycle skill packages for `init`,
`propose`, `apply`, `verify`, `review`, `archive`, `auto`, `modify`, and
`cancel` with explicit command mappings that reference the strict bundled CLI
subcommands those skills depend on.

#### Scenario: core skills expose concrete strict commands
- GIVEN a strict core lifecycle `SKILL.md` file is reviewed
- WHEN its `## This Skill's Commands` section is inspected
- THEN the command mapping identifies the specific strict bundled CLI command
  entry or entries the skill uses
- AND the command mapping is not limited to a generic placeholder command

### Requirement: strict-core-skill-guidance-contract
The system MUST ensure strict core lifecycle skill packages describe
`.strict-spec-driven/` YAML workflow artifacts and preserve the split where
scripts handle deterministic mechanics while skill prompts handle planning and
judgment.

#### Scenario: core skills reference strict workflow artifacts
- GIVEN a strict core lifecycle `SKILL.md` file is reviewed
- WHEN its prerequisites and workflow instructions are inspected
- THEN the skill describes `.strict-spec-driven/` YAML workflow artifacts rather
  than legacy or generic workflow state

#### Scenario: core skills preserve prompt-vs-script responsibilities
- GIVEN a strict core lifecycle skill prompt is reviewed
- WHEN its workflow guidance is inspected
- THEN deterministic parsing, validation, scaffolding, and merge behavior remain
  delegated to the strict CLI commands
- AND the prompt guidance remains focused on planning, editing, review, and user
  decision checkpoints
