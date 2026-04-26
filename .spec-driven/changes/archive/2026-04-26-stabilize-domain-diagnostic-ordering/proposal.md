# stabilize-domain-diagnostic-ordering

## What

Create a shared `src/diagnostics.ts` helper module for deterministic diagnostic
ordering and shared normalization rules, then update the roadmap, skill
packaging, and migration domains to use it without changing their observable
command behavior.

## Why

Milestone 08 still has large unsplit workflow-domain files in `src/skills.ts`
and `src/migrate.ts`, while roadmap decomposition is already underway. Those
domains currently carry their own diagnostic-construction and sorting logic,
which means the remaining splits risk drifting user-visible error ordering or
report ordering as responsibilities move into smaller modules.

Stabilizing diagnostic ordering first gives the remaining domain refactors one
shared baseline for deterministic behavior. It also makes later roadmap-details
feature work safer by reducing the chance that feature changes and refactors
interact in the same surfaces at once.

## Scope

In scope:

- add `src/diagnostics.ts` as the shared home for deterministic ordering and
  normalization helpers used by roadmap, skill-validation, and migration flows
- update `src/roadmap/shared.ts`, `src/skills.ts`, and `src/migrate.ts` to use
  the shared helper while preserving their existing domain-specific diagnostic
  shapes and messages
- add or update regression coverage proving repeated invalid runs preserve the
  same diagnostic or report ordering for roadmap, skill, and migration surfaces
- capture the cross-domain deterministic-ordering contract in spec deltas so
  later decomposition changes have an explicit observable baseline

Out of scope:

- changing command names, flags, exit codes, JSON field names, or human-readable
  diagnostic text
- splitting `src/skills.ts` or `src/migrate.ts` into their final milestone-08
  module boundaries
- adding new roadmap schema behavior such as milestone `details`
- widening migration scope beyond deterministic ordering of existing report
  collections

## Unchanged Behavior

Behaviors that must not change as a result of this change (leave blank if nothing is at risk):

- `strict-spec-driven roadmap-status` keeps the same validation semantics and
  artifact or field-path diagnostic meaning.
- `strict-spec-driven validate-skills` keeps the same diagnostic codes, summary
  counts, and JSON result shape.
- `strict-spec-driven migrate` keeps the same report collections, entry meaning,
  and success or failure behavior.
- No command gains new output fields or loses existing report entries solely
  because diagnostic helpers are centralized.
