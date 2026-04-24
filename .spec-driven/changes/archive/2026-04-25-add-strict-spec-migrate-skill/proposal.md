# add-strict-spec-migrate-skill

## What

Create a strict migration skill package, `strict-spec-migrate`, that guides
operators through migration preflight checks, runs the existing strict
`migrate` CLI, reviews the structured migration report, validates migrated
strict state, and records manual follow-up instead of guessing unsupported
legacy data.

This change will:
- add the `skills/strict-spec-migrate/` package with concrete command mappings
  for migration and post-migration validation
- define spec coverage for migration skill command expectations and guidance
  boundaries
- extend strict skill validation and automated tests so migration skill content
  is checked alongside the other supported strict skills

## Why

Milestone 05 is down to one planned change: the migration skill. The repository
already has the strict `migrate` subcommand and a self-hosted
`.strict-spec-driven/` state, so the remaining gap is the operator-facing skill
that makes migration repeatable, reviewable, and aligned with the strict skill
surface.

Landing this change closes the migration-and-self-hosting milestone before the
roadmap moves on to milestone 06 operational polish such as maintenance, ship,
installation, and public documentation.

## Scope

In scope:
- strict migration skill package metadata, command block, and workflow guidance
- post-migration validation guidance built on existing strict commands and
  reports
- skill-validation coverage that rejects placeholder or stale migration skill
  content

Out of scope:
- changing `strict-spec-driven migrate` semantics or the migration report schema
- maintenance, ship, installation, or public documentation work owned by
  milestone 06
- reworking already-complete self-hosted strict workflow state beyond what the
  migration skill needs to describe

## Unchanged Behavior

Behaviors that must not change as a result of this change (leave blank if nothing is at risk):
- existing `strict-spec-driven migrate` conversion behavior, overwrite
  protection, and structured report fields
- strict core, roadmap, and planning skill behavior already shipped in earlier
  milestones
- milestone 06 operations and documentation boundaries
