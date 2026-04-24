---
mapping:
  implementation:
    - src/roadmap.ts
    - src/strict-spec-cli.ts
    - src/skills.ts
  tests:
    - test/run.ts
---

## ADDED Requirements

### Requirement: cli-roadmap-status-reports-strict-roadmap-state
The system MUST provide a `roadmap-status` subcommand that validates
`.strict-spec-driven/roadmap/` artifacts and reports milestone and planned
change state using strict roadmap declared-status rules and derived completion
semantics.

#### Scenario: roadmap-status reports ordered milestone state
- GIVEN a valid strict roadmap exists under `.strict-spec-driven/roadmap/`
- WHEN `strict-spec-driven roadmap-status` is executed
- THEN the output includes milestone entries in roadmap order
- AND each milestone reports its declared status and derived status
- AND each planned change reports its declared roadmap status and workflow-backed state

#### Scenario: roadmap-status rejects invalid roadmap artifacts
- GIVEN a strict roadmap artifact violates the roadmap contract
- WHEN `strict-spec-driven roadmap-status` is executed
- THEN the command exits non-zero
- AND the diagnostics identify the invalid artifact and field context

### Requirement: cli-roadmap-sync-reconciles-strict-roadmap-state
The system MUST provide a `roadmap-sync` subcommand that regenerates or repairs
strict roadmap index state and reconciles milestone and planned change
completion against active and archived strict changes without inventing new
roadmap items.

#### Scenario: roadmap-sync regenerates canonical roadmap index state
- GIVEN strict roadmap milestone files exist under
  `.strict-spec-driven/roadmap/milestones/`
- WHEN `strict-spec-driven roadmap-sync` is executed
- THEN the roadmap index reflects the canonical milestone ordering and file paths
- AND milestone entries keep their declared status values within the strict roadmap enums

#### Scenario: roadmap-sync reconciles planned change completion from workflow state
- GIVEN a roadmap planned change has moved into archived strict change state
- WHEN `strict-spec-driven roadmap-sync` is executed
- THEN the planned change is reconciled as complete in roadmap state
- AND no duplicate planned change entry is created
- AND unrelated milestone notes and scope content remain unchanged

### Requirement: cli-roadmap-validation-and-skill-smoke-coverage
The system MUST include automated checks that exercise strict roadmap command
behavior and strict roadmap skill content for both aligned and failing states.

#### Scenario: automated checks accept aligned roadmap workflow surfaces
- GIVEN strict roadmap commands and `strict-roadmap-*` skill packages are aligned
  with `.strict-spec-driven/roadmap/`
- WHEN repository automated checks are executed
- THEN the roadmap workflow checks pass

#### Scenario: automated checks reject placeholder or stale roadmap surfaces
- GIVEN a strict roadmap skill keeps a generic placeholder command block or a
  roadmap command ignores strict roadmap status rules
- WHEN repository automated checks are executed
- THEN the roadmap workflow checks fail
- AND diagnostics identify the failing skill or roadmap surface deterministically
