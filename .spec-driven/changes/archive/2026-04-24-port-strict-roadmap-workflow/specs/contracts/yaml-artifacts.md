---
mapping:
  implementation:
    - src/skills.ts
    - skills/strict-roadmap-plan/SKILL.md
    - skills/strict-roadmap-milestone/SKILL.md
    - skills/strict-roadmap-recommend/SKILL.md
    - skills/strict-roadmap-propose/SKILL.md
    - skills/strict-roadmap-sync/SKILL.md
  tests:
    - test/run.ts
---

## ADDED Requirements

### Requirement: strict-roadmap-skill-command-contract
The system MUST provide strict roadmap skill packages for `plan`, `milestone`,
`recommend`, `propose`, and `sync` with explicit command mappings that
reference the strict roadmap command(s) and shared strict change commands those
skills depend on.

#### Scenario: roadmap skills expose concrete strict commands
- GIVEN a strict roadmap `SKILL.md` file is reviewed
- WHEN its `## This Skill's Commands` section is inspected
- THEN the command mapping identifies the specific strict command entry or
  entries the skill uses
- AND the command mapping is not limited to generic placeholder commands

### Requirement: strict-roadmap-skill-guidance-contract
The system MUST ensure strict roadmap skill packages describe
`.strict-spec-driven/roadmap/` YAML artifacts, canonical milestone ordering,
declared and derived roadmap status rules, and the prompt-vs-script split used
by the strict workflow.

#### Scenario: roadmap skills reference strict roadmap artifacts
- GIVEN a strict roadmap skill prompt is reviewed
- WHEN its prerequisites and workflow guidance are inspected
- THEN the skill describes `.strict-spec-driven/roadmap/` YAML artifacts and the
  roadmap files it reads or writes
- AND the skill does not fall back to generic or legacy roadmap instructions
  where strict behavior is required

#### Scenario: roadmap skills preserve deterministic mechanics in scripts
- GIVEN a strict roadmap skill prompt is reviewed
- WHEN its workflow steps are inspected
- THEN deterministic validation, status derivation, index regeneration, and
  proposal scaffolding remain delegated to strict CLI commands
- AND the prompt guidance remains focused on recommendation, planning judgment,
  editing, and user checkpoints

### Requirement: strict-roadmap-proposal-handoff-contract
The system MUST ensure roadmap recommendation and roadmap proposal-handoff
behavior convert exactly one planned change into a normal strict change
scaffold without duplicating roadmap-only planning metadata inside the change
artifacts.

#### Scenario: roadmap recommendation hands off one planned change to strict propose
- GIVEN a roadmap milestone includes a planned change entry
- WHEN the strict roadmap recommendation flow is accepted and the proposal
  handoff runs
- THEN a normal strict change scaffold is created for that planned change
- AND the change artifacts describe proposal scope for that one change rather
  than copying the full milestone plan

#### Scenario: roadmap proposal handoff preserves canonical planned change identity
- GIVEN a planned change already exists as a single roadmap item under one
  milestone
- WHEN the roadmap proposal handoff creates the strict change scaffold
- THEN the resulting change uses the planned change name as its change identity
- AND the roadmap artifact remains the canonical home of milestone-level
  planning metadata
