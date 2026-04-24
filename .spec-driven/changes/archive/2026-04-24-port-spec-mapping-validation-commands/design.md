# Design: port-spec-mapping-validation-commands

## Approach

Add a dedicated mapping-audit command path that can run independently from
change-level verification:

1. Extend CLI command routing with `verify-spec-mappings` and deterministic
   usage/error handling.
2. Implement a mapping audit module that:
   - discovers main specs under `.spec-driven/specs/`
   - parses mapping frontmatter
   - normalizes referenced paths
   - runs mapping coverage checks per spec
   - runs unmapped evidence checks for repository implementation and test files
3. Return deterministic JSON with `valid`, `diagnostics`, and summary counts
   suitable for CI or scripted checks.
4. Add tests for valid mapping state, missing mapping coverage, unmapped files,
   and command exit semantics.

## Key Decisions

- Keep mapping audits as a standalone command rather than coupling them into
  `verify <change>` so spec-level audits remain runnable without change context.
- Reuse existing YAML/frontmatter parsing helpers where possible to keep
  diagnostics style consistent with existing verify behavior.
- Keep diagnostics path-aware and deterministic to preserve machine-readable
  automation use.

## Alternatives Considered

- Extend `verify <change>` to include mapping audits.
  Rejected because mapping coverage spans repository spec state, not only one
  active change.
- Only check mapping field shape without auditing unmapped evidence.
  Rejected because this would miss the core drift signal where code or tests
  exist but no spec mapping references them.
