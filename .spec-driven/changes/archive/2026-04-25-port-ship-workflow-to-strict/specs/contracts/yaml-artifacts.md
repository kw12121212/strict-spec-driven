---
mapping:
  implementation:
    - skills/strict-spec-ship/SKILL.md
  tests:
    - test/run.ts
---

## ADDED Requirements

### Requirement: strict-ship-skill-command-contract
The system MUST provide a strict ship skill package for `ship` with an explicit command mapping that references `strict-spec-driven ship` and any strict verification commands the skill depends on.

#### Scenario: ship skill exposes concrete strict commands
- GIVEN the `strict-spec-ship/SKILL.md` file is reviewed
- WHEN its `## This Skill's Commands` section is inspected
- THEN the command mapping identifies `node {{SKILL_DIR}}/scripts/strict-spec-driven.js ship <change-name>` as the primary ship command
- AND the command mapping is not limited to a generic placeholder command

### Requirement: strict-ship-skill-guidance-contract
The system MUST ensure the strict ship skill describes `.strict-spec-driven/` YAML workflow artifacts, uses structured `ship` command output to construct a focused git commit, and documents the push handoff for the operator without automating `git push`.

#### Scenario: ship skill references strict workflow artifacts
- GIVEN the `strict-spec-ship/SKILL.md` skill prompt is reviewed
- WHEN its workflow guidance is inspected
- THEN the skill describes `.strict-spec-driven/changes/archive/` as the source of the archived change being shipped
- AND the skill does not treat legacy `.spec-driven/` artifacts as the ship source

#### Scenario: ship skill preserves operator review before push
- GIVEN the `strict-spec-ship/SKILL.md` workflow is executed for an archived change
- WHEN the git push step is reached
- THEN the skill presents the `git push` command to the operator for explicit confirmation before execution
- AND the skill does not automate `git push` without operator review
