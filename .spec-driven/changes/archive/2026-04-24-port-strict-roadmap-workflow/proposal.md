# port-strict-roadmap-workflow

## What

Implement the missing strict roadmap workflow surface so milestone-backed
planning can run on `.strict-spec-driven/roadmap/` YAML artifacts instead of
placeholder skills and nonexistent CLI behavior.

This change will:

- add strict roadmap CLI behavior for validation, status reporting, index
  regeneration, sync, and archive reconciliation
- wire roadmap recommendation and roadmap-to-change proposal handoff so one
  planned change becomes a normal strict change scaffold without duplicating
  roadmap-only planning metadata
- replace the placeholder `strict-roadmap-plan`,
  `strict-roadmap-milestone`, `strict-roadmap-recommend`,
  `strict-roadmap-propose`, and `strict-roadmap-sync` skill prompts with real
  strict YAML workflow instructions
- add automated coverage for roadmap command behavior and roadmap skill content

## Why

The strict roadmap schemas and skill packaging baseline already exist, but the
actual roadmap workflow does not. The current CLI has no roadmap-specific
subcommands, and the strict roadmap skill packages are still metadata stubs with
placeholder command blocks. That leaves milestone 04 incomplete and blocks
milestone 05 from depending on a usable strict roadmap surface.

Landing this change next preserves dependency order: the roadmap CLI and
roadmap skills become real before migration and self-hosting try to use them.

## Scope

In scope:

- add roadmap command routing and implementation for strict roadmap status and
  sync behavior
- validate `.strict-spec-driven/roadmap/` artifacts and derive milestone and
  planned change status from active and archived strict changes
- regenerate or reconcile roadmap index and milestone state without inventing
  new planning data
- rewrite only the strict roadmap skill prompts listed in the roadmap item
- add tests or validation coverage that reject placeholder roadmap skill
  content and exercise roadmap command behavior
- keep roadmap recommendation and proposal handoff aligned with the existing
  strict `propose` flow

Out of scope:

- brainstorm, simple-task, spec-content, spec-edit, sync-specs, or mapping
  repair skill rewrites owned by `update-planning-and-spec-content-skills-for-yaml`
- migration from bootstrap `.spec-driven/` Markdown artifacts into
  `.strict-spec-driven/` YAML state
- installation polish, maintenance workflow, ship workflow, or public
  documentation work from milestone 06
- changing the roadmap YAML schema contract already delivered by
  `define-yaml-roadmap-schema`
- widening core strict lifecycle command semantics beyond the roadmap-specific
  additions this change needs

## Unchanged Behavior

Behaviors that must not change as a result of this change (leave blank if nothing is at risk):

- Bootstrap `.spec-driven/roadmap/` Markdown artifacts remain the active
  planning source for this repository until migration work lands.
- Existing strict core lifecycle commands (`init`, `propose`, `apply`,
  `verify`, `review`, `archive`, `list`, `modify`, `cancel`, and
  `verify-spec-mappings`) remain owned by milestone 03 behavior unless this
  change explicitly extends them with roadmap routing.
- Planning and spec-content strict skills remain owned by
  `update-planning-and-spec-content-skills-for-yaml`.
