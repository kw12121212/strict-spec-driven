# split-roadmap-load-validate-derive-sync

## What

Split roadmap artifact loading, validation, status derivation, canonical
artifact rebuilding, and sync writes out of `src/roadmap.ts` into smaller
roadmap-focused modules while keeping `getRoadmapStatus` and `syncRoadmap` as
the stable public entrypoints.

## Why

`src/roadmap.ts` is already about 1046 lines and currently mixes path
resolution, YAML loading, schema and semantic validation, change-state lookup,
status derivation, canonical milestone rebuilding, and sync write behavior in a
single file.

That concentration makes the roadmap domain harder to extend safely and leaves
future roadmap work — especially milestone 10's roadmap `details` support —
landing on top of a monolith. Splitting the roadmap domain first preserves
dependency order and reduces the risk of later feature changes accidentally
altering current roadmap behavior.

## Scope

In scope:

- extract roadmap path/constants, deterministic helper logic, and artifact file
  discovery into roadmap-owned support modules
- separate roadmap index, milestone, and planned-change validation from higher
  level load and orchestration logic
- separate active and archived change-state lookup plus milestone and
  planned-change status derivation from artifact validation logic
- separate canonical milestone rebuilding and sync write behavior from
  read-only roadmap-status reporting
- reduce `src/roadmap.ts` to a thinner orchestration and export surface for
  roadmap operations
- add or update regression coverage needed to prove roadmap-status and
  roadmap-sync behavior stays stable after the split

Out of scope:

- changing roadmap schema rules, planned-change status enums, or milestone
  semantics
- adding the milestone `details` field or any other new roadmap capability
- refactoring `src/skills.ts`, `src/migrate.ts`, or CLI command routing beyond
  what roadmap module extraction directly needs
- changing command names, exit codes, JSON shapes, diagnostic meaning, or the
  canonical rewrite behavior already observed by roadmap commands

## Unchanged Behavior

Behaviors that must not change as a result of this change (leave blank if nothing is at risk):

- `roadmap-status` must keep the same validation expectations, declared and
  derived status semantics, milestone ordering, and planned-change state
  reporting.
- `roadmap-sync` must keep the same canonical index regeneration, completion
  reconciliation, and "do not invent new roadmap items" behavior.
- Roadmap diagnostics and rewritten artifact ordering must remain deterministic.
