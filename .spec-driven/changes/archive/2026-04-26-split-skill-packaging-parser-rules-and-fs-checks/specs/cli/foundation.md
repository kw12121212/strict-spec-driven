---
mapping:
  implementation:
    - src/skills.ts
    - src/skills/model.ts
    - src/skills/frontmatter.ts
    - src/skills/content.ts
    - src/skills/fs-checks.ts
    - src/skills/diagnostics.ts
  tests:
    - test/suites/entrypoint-and-skills.ts
---

## MODIFIED Requirements

### Requirement: cli-skill-packaging-validation-smoke-coverage
Previously: The system MUST include automated checks that exercise strict skill packaging validation behavior for both passing and failing package states.
The system MUST include automated checks that exercise strict skill packaging validation behavior for both passing and failing package states, with validation logic sourced from focused modules under `src/skills/` rather than a single monolithic file.

### Requirement: cli-domain-diagnostic-ordering-stability
Previously: The system MUST preserve deterministic ordering for roadmap, skill-validation, and migration diagnostics or report collections even when their implementation shares helper logic across domains.
The system MUST preserve deterministic ordering for roadmap, skill-validation, and migration diagnostics or report collections even when their implementation is distributed across focused modules under `src/skills/` and shared helpers in `src/diagnostics.ts`.
