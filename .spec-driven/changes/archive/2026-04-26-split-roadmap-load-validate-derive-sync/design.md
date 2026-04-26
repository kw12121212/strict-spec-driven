# Design: split-roadmap-load-validate-derive-sync

## Approach

Split the roadmap domain by responsibility under `src/roadmap/` while keeping
`src/roadmap.ts` as the stable orchestration layer that exports
`getRoadmapStatus` and `syncRoadmap`.

Planned module boundaries:

- **Shared roadmap helpers** — roadmap-specific constants, resolved paths,
  repo-relative path normalization, deterministic diagnostic creation and
  sorting, and other helpers that are still owned by the roadmap domain
- **Validation and loading** — roadmap index, milestone, and planned-change
  validation plus the load flow that reads YAML artifacts and assembles the
  loaded roadmap model
- **Status derivation** — active and archived change-state lookup, planned-change
  state derivation, milestone derived-status calculation, and ordered status
  reporting
- **Canonical rebuild and sync** — milestone artifact rebuilding, roadmap index
  rebuilding, and write-if-changed sync behavior

The extraction should be mostly mechanical: move existing logic with minimal
semantic change, then rewire `src/roadmap.ts` to import and compose the new
modules. The goal is clearer ownership, not new roadmap behavior.

## Key Decisions

- **Keep `src/roadmap.ts` as the public facade.** Other code already imports the
  roadmap domain through this file. Keeping the entrypoints stable avoids
  coupling this refactor to broader import-surface churn.
- **Split by workflow responsibility, not by arbitrary file size.** Loading,
  validation, derivation, and sync represent the actual roadmap lifecycle
  phases, so those boundaries are easier to extend safely than a generic
  "helpers" breakup.
- **Keep deterministic ordering rules inside the roadmap domain unless reuse is
  proven.** The milestone explicitly calls out diagnostic ordering stability. It
  is safer to preserve those helpers locally during the split than to force a
  premature shared abstraction.
- **Treat this as behavior-preserving work.** If implementation reveals an
  externally observable behavior change would be required, that should be called
  out explicitly instead of being smuggled into the refactor.

## Alternatives Considered

- **Start with `define-strict-roadmap-details-field-contract`.** Rejected
  because it adds new roadmap behavior before the roadmap domain has been
  decomposed, which is the opposite of the dependency order the roadmap already
  suggests.
- **Split only loading and sync, leaving validation and status derivation in
  `src/roadmap.ts`.** Rejected because it would leave the hardest-to-reason
  logic concentrated in the same file and only partially solve the hotspot.
- **Extract generic cross-domain helpers immediately.** Rejected because it
  risks mixing roadmap, skills, and migration semantics too early; milestone 08
  explicitly prefers focused domain modules before shared extraction.
