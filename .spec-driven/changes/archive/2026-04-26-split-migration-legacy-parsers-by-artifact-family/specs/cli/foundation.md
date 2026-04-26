---
mapping:
  implementation:
    - src/migrate.ts
    - src/migrate/parsers/shared.ts
    - src/migrate/parsers/specs.ts
    - src/migrate/parsers/change-artifacts.ts
  tests:
    - test/suites/roadmap-and-migration.ts
---

## MODIFIED Requirements

### Requirement: cli-migrate-converts-bootstrap-workflow-state
Previously: The system MUST provide a `migrate` subcommand that reads legacy `.spec-driven/` workflow state and migrates supported bootstrap config, main specs, delta specs, active and archived change artifacts, roadmap index, roadmap milestones, and the specs index into strict YAML output under `.strict-spec-driven/`, initializes any remaining required strict scaffold assets, and reports only unsupported or ambiguous legacy artifacts as manual follow-up items.
The system MUST provide a `migrate` subcommand that reads legacy `.spec-driven/` workflow state and migrates supported bootstrap config, main specs, delta specs, active and archived change artifacts, roadmap index, roadmap milestones, and the specs index into strict YAML output under `.strict-spec-driven/`, with legacy Markdown parsing for specs and change artifacts sourced from focused modules under `src/migrate/parsers/`, initializes any remaining required strict scaffold assets, and reports only unsupported or ambiguous legacy artifacts as manual follow-up items.

### Requirement: cli-domain-diagnostic-ordering-stability
Previously: The system MUST preserve deterministic ordering for roadmap, skill-validation, and migration diagnostics or report collections even when their implementation is distributed across focused modules under `src/skills/` and shared helpers in `src/diagnostics.ts`.
The system MUST preserve deterministic ordering for roadmap, skill-validation, and migration diagnostics or report collections even when their implementation is distributed across focused modules under `src/skills/`, `src/migrate/parsers/`, and shared helpers in `src/diagnostics.ts`.
