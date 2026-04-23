# define-strict-directory-and-prefixes

## What

Define the strict workflow directory and public skill/slash-command prefixes for
the YAML-first spec-driven workflow.

This change will document that:

- `.strict-spec-driven/` is the target workflow state directory for strict YAML
  artifacts.
- `strict-spec-*` is the naming family for strict spec workflow skills and slash
  commands.
- `strict-roadmap-*` is the naming family for strict roadmap workflow skills and
  slash commands.
- The existing bootstrap `.spec-driven/` state remains temporary until migration
  tooling exists.

## Why

The first schema-contract change established that strict workflow artifacts must
use structured YAML, but it intentionally left directory and command-family
naming out of scope. Later CLI, skill, roadmap, migration, and self-hosting work
need a stable target namespace before they can safely generate files, update
skills, or validate stale references.

## Scope

In scope:

- Add delta spec requirements for the strict workflow directory.
- Add delta spec requirements for strict spec and roadmap skill/slash-command
  prefix families.
- Require the bootstrap `.spec-driven/` directory to remain a non-target
  compatibility state until migration tooling moves workflow state.
- Keep the naming contract aligned with `README.md`, `RTK.md`, and the roadmap
  milestone.

Out of scope:

- Choosing the CLI binary name or CLI subcommand naming model.
- Implementing init, migration, validation, or skill rewrites.
- Renaming this repository's current bootstrap `.spec-driven/` directory.
- Defining field-level YAML schemas for every artifact family.

## Unchanged Behavior

Behaviors that must not change as a result of this change (leave blank if nothing is at risk):

- Existing bootstrap `.spec-driven/` Markdown artifacts remain the active
  planning workflow until migration tooling exists.
- `SKILL.md`, `README.md`, `AGENTS.md`, and `RTK.md` remain allowed Markdown
  files because they are packaging or repository documentation, not strict
  workflow artifacts.
- CLI entrypoint and subcommand naming remain undecided for the dedicated
  `define-command-naming-model` roadmap item.
