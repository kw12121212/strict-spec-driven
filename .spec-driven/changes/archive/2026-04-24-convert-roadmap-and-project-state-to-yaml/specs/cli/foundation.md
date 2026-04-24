---
mapping:
  implementation:
    - src/migrate.ts
    - src/converters/roadmap.ts
  tests:
    - test/run.ts
---

## ADDED Requirements

### Requirement: cli-migrate-converts-roadmap-and-project-state
The system MUST convert legacy `.spec-driven/roadmap/` Markdown artifacts and the legacy specs index into strict YAML equivalents during a `migrate` run, writing results under `.strict-spec-driven/roadmap/` and the strict specs index path.

#### Scenario: migrate converts roadmap index and milestones
- GIVEN legacy `roadmap/INDEX.md` and one or more `roadmap/milestones/*.md` files exist under `.spec-driven/`
- WHEN `strict-spec-driven migrate` is executed
- THEN the roadmap index is written as a strict YAML artifact under `.strict-spec-driven/roadmap/`
- AND each milestone file is converted to a strict YAML milestone artifact preserving goal, scope, done criteria, dependencies, risks, notes, status, and planned change entries
- AND the converted artifacts appear in the migration report as converted entries

#### Scenario: migrate converts specs index
- GIVEN a legacy `specs/INDEX.md` exists under `.spec-driven/`
- WHEN `strict-spec-driven migrate` is executed
- THEN the specs index is written as a strict YAML artifact under `.strict-spec-driven/specs/`
- AND the converted artifact appears in the migration report as a converted entry

#### Scenario: unsupported roadmap Markdown shape becomes manual follow-up
- GIVEN a legacy roadmap artifact has a Markdown structure that cannot be deterministically mapped to strict YAML fields
- WHEN `strict-spec-driven migrate` is executed
- THEN the artifact appears in the migration report as a manual follow-up item
- AND no strict YAML output is invented for that artifact

## MODIFIED Requirements

### Requirement: cli-migrate-converts-bootstrap-workflow-state
Previously: The system MUST provide a `migrate` subcommand that reads legacy `.spec-driven/` workflow state, migrates supported bootstrap config, main specs, delta specs, and active and archived change artifacts into strict YAML output under `.strict-spec-driven/`, initializes any remaining required strict scaffold assets, and reports only unsupported or still-unimplemented legacy artifacts as deferred follow-up items.
The system MUST provide a `migrate` subcommand that reads legacy `.spec-driven/` workflow state and migrates supported bootstrap config, main specs, delta specs, active and archived change artifacts, roadmap index, roadmap milestones, and the specs index into strict YAML output under `.strict-spec-driven/`, initializes any remaining required strict scaffold assets, and reports only unsupported or ambiguous legacy artifacts as manual follow-up items.

## REMOVED Requirements

### Requirement: cli-migrate-converts-bootstrap-workflow-state (scenario only)
Reason: The scenario "migrate continues to defer roadmap and project-state artifacts outside this change" described a temporary deferral state. That deferral is resolved by this change; the scenario is removed from the main spec after archive.
