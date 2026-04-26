---
mapping:
  implementation:
    - src/diagnostics.ts
    - src/roadmap/shared.ts
    - src/skills.ts
    - src/migrate.ts
  tests:
    - test/suites/entrypoint-and-skills.ts
    - test/suites/roadmap-and-migration.ts
---

## ADDED Requirements

### Requirement: cli-domain-diagnostic-ordering-stability
The system MUST preserve deterministic ordering for roadmap, skill-validation,
and migration diagnostics or report collections even when their implementation
shares helper logic across domains.

#### Scenario: roadmap diagnostics keep stable ordering across repeated runs
- GIVEN strict roadmap artifacts produce multiple validation diagnostics
- WHEN `strict-spec-driven roadmap-status` is executed repeatedly against the
  same repository state
- THEN the diagnostics appear in the same order each time
- AND each diagnostic still identifies the invalid artifact and field context

#### Scenario: skill validation diagnostics keep stable ordering across repeated runs
- GIVEN strict skill packaging or content validation produces multiple
  diagnostics
- WHEN `strict-spec-driven validate-skills` is executed repeatedly against the
  same repository state
- THEN the diagnostics appear in the same order each time
- AND the JSON result keeps the same diagnostic field shape and summary counts

#### Scenario: migration report collections keep stable ordering across repeated runs
- GIVEN bootstrap migration produces multiple warnings, errors, skipped entries,
  or manual follow-up items
- WHEN `strict-spec-driven migrate` is executed repeatedly against the same
  repository state
- THEN each report collection keeps deterministic ordering across runs
- AND shared diagnostic helpers do not invent, drop, or reorder entries
  nondeterministically
