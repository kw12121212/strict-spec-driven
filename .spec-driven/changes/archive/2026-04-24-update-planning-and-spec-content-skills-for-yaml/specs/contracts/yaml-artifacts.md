---
mapping:
  implementation:
    - src/skills.ts
    - skills/strict-spec-brainstorm/SKILL.md
    - skills/strict-spec-simple-task/SKILL.md
    - skills/strict-spec-spec-edit/SKILL.md
    - skills/strict-spec-sync-specs/SKILL.md
    - skills/strict-spec-resync-code-mapping/SKILL.md
  tests:
    - test/run.ts
---

## ADDED Requirements

### Requirement: strict-planning-skill-command-contract
The system MUST provide strict planning and documentation skill packages for
`brainstorm`, `simple-task`, `spec-edit`, `sync-specs`, and
`resync-code-mapping` with explicit command mappings that reference the strict
bundled CLI subcommands those skills depend on.

#### Scenario: planning skills expose concrete strict commands
- GIVEN a strict planning or documentation `SKILL.md` file is reviewed
- WHEN its `## This Skill's Commands` section is inspected
- THEN the command mapping identifies the specific strict bundled CLI command
  entry or entries the skill uses
- AND the command mapping is not limited to a generic placeholder command

### Requirement: strict-planning-skill-guidance-contract
The system MUST ensure strict planning and documentation skill packages describe
`.strict-spec-driven/` YAML workflow artifacts and preserve the intended
boundaries between brainstorming, simple tasks, direct main-spec edits,
repository spec synchronization, and mapping repair.

#### Scenario: planning skills reference strict workflow artifacts
- GIVEN a strict planning or documentation `SKILL.md` file is reviewed
- WHEN its prerequisites and workflow instructions are inspected
- THEN the skill describes `.strict-spec-driven/` YAML workflow artifacts rather
  than legacy or packaging-only placeholder state

#### Scenario: planning skills preserve workflow ownership boundaries
- GIVEN the strict planning and documentation skill prompts are reviewed
- WHEN their workflow guidance is inspected
- THEN direct main-spec editing remains owned by `strict-spec-spec-edit`
- AND repository drift synchronization remains owned by `strict-spec-sync-specs`
- AND mapping repair remains owned by `strict-spec-resync-code-mapping`
- AND the prompts do not require a separate `strict-spec-spec-content` package
  to make those workflows usable
