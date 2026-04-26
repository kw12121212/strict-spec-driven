# Design: stabilize-domain-diagnostic-ordering

## Approach

Introduce `src/diagnostics.ts` as a small shared utility module that owns the
deterministic sort-key construction and normalization rules that are currently
duplicated across roadmap, skills, and migration code.

The implementation should stay behavior-preserving:

- move shared ordering logic into `src/diagnostics.ts`
- update roadmap, skills, and migration code to call the shared helper instead
  of maintaining local sort implementations
- keep each domain's public result shape and domain-specific diagnostic fields
  intact unless a shared helper can support them without changing emitted data
- extend regression coverage so repeated runs against the same invalid state
  prove the ordering remains stable after the helper is shared

This change should stop at the shared baseline. The later milestone-08 splits
can then extract smaller modules on top of one deterministic diagnostic contract
instead of carrying local ordering rules forward into each new module.

## Key Decisions

- **Use `src/diagnostics.ts` as the shared home.** This keeps the helper neutral
  across roadmap, skills, and migration without making the other domains depend
  on a roadmap-owned file.
- **Preserve domain-specific diagnostic shapes.** Roadmap, skill, and migration
  diagnostics expose different fields today. The shared layer should centralize
  ordering and normalization rules first, not force a premature unified
  diagnostic schema.
- **Treat deterministic ordering as observable behavior.** The goal is not only
  code reuse; it is to lock down a stable cross-domain ordering contract that
  later decompositions must preserve.
- **Keep the change narrower than the full domain split.** This proposal should
  make future refactors safer, not absorb the remaining milestone-08 extraction
  work into one oversized change.

## Alternatives Considered

- **Start with `split-skill-packaging-parser-rules-and-fs-checks`.** Rejected
  because it would move a large validation surface before its ordering behavior
  is centralized, increasing the risk of silent diagnostic drift.
- **Start with `split-migration-legacy-parsers-by-artifact-family`.** Rejected
  because migration has the largest unsplit file and several independently
  sorted report collections, making it a riskier place to begin without a shared
  ordering baseline.
- **Promote `src/roadmap/shared.ts` into the cross-domain helper.** Rejected
  because roadmap-specific ownership and naming would create awkward coupling
  for skills and migration.
