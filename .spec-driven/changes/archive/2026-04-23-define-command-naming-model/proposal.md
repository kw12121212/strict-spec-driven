# define-command-naming-model

## What

Define the strict workflow command naming model across the distinct public
surfaces that users, agents, installers, and scripts interact with.

This change will document that:

- Skill and slash-command names remain in the already-defined `strict-spec-*`
  and `strict-roadmap-*` families.
- The strict CLI entrypoint is `strict-spec-driven`, separate from skill and
  slash-command prefixes.
- CLI subcommands use stable workflow verbs and objects instead of repeating
  the `strict-spec-*` or `strict-roadmap-*` prefixes.
- Installer-facing names must identify strict packages and skills without
  silently aliasing legacy `spec-driven-*` names into strict workflows.
- Compatibility aliases for legacy command names are not part of the strict
  command contract unless a later migration-specific change defines them.

## Why

The previous contract change established the target workflow directory and
public skill/slash-command prefixes, but intentionally left CLI and installer
naming undecided. The CLI foundation, skill rename, roadmap workflow, migration,
and self-hosting milestones all need a stable naming model before they can
generate scripts, validation rules, installation paths, or user instructions.

Separating these surfaces avoids accidental coupling between agent-facing skill
names and machine-facing CLI names while preserving a clear strict namespace.

## Scope

In scope:

- Define the public naming surfaces: skills, slash commands, CLI entrypoint,
  CLI subcommands, and installer-facing names.
- Choose `strict-spec-driven` as the strict CLI entrypoint.
- Define CLI subcommand naming as unprefixed workflow verbs or verb-object
  names under the strict CLI entrypoint.
- Require installer-facing names to preserve strict naming and avoid silent
  legacy aliases outside migration contexts.
- Add delta spec requirements to the existing YAML artifact contract.

Out of scope:

- Implementing the CLI entrypoint or subcommands.
- Renaming any existing files, skills, or installed commands.
- Defining full CLI behavior for individual workflow commands.
- Defining migration compatibility aliases for legacy `spec-driven` or
  `spec-driven-*` names.
- Changing the existing bootstrap `.spec-driven/` planning state.

## Unchanged Behavior

Behaviors that must not change as a result of this change (leave blank if nothing is at risk):

- `.strict-spec-driven/` remains the target strict workflow state directory.
- `.spec-driven/` remains the bootstrap or legacy workflow state directory until
  migration tooling exists.
- `strict-spec-*` and `strict-roadmap-*` remain the skill and slash-command
  naming families.
- `SKILL.md`, `README.md`, `AGENTS.md`, and `RTK.md` remain Markdown exceptions
  because they are packaging or repository documentation files, not strict
  workflow artifacts.
