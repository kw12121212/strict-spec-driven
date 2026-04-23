# define-schema-versioning-and-registry

## What

Define the strict YAML schema versioning, registry, and migration
compatibility contract in one consolidated change.

This change covers two planned milestone items:

- `define-schema-versioning-and-registry`
- `define-migration-compatibility-contract`

## Why

The strict workflow already has concrete schema and example files, but later CLI
validation, migration, and skill updates still need a stable way to discover
schemas, compare versions, name artifact types, and decide how legacy
`.spec-driven/` Markdown artifacts map into `.strict-spec-driven/` YAML
artifacts.

Combining migration compatibility with schema registry/versioning keeps the
contract coherent: migration output cannot be specified safely until schema IDs,
artifact type names, compatibility expectations, and registry lookup rules are
defined.

## Scope

In scope:

- Define stable schema ID, schema version, artifact type, and artifact name
  expectations for strict workflow artifacts.
- Define a schema registry location and the minimum registry fields needed for
  validators, generators, migration tooling, and skills to discover schemas.
- Define compatibility rules for patching or extending strict schema versions
  without silently changing artifact semantics.
- Define legacy `.spec-driven/` Markdown to `.strict-spec-driven/` YAML
  migration mapping rules for supported artifact families.
- Define unsupported-shape warning and manual follow-up reporting requirements
  for migration tooling.
- Add delta spec coverage for both schema registry/versioning and migration
  compatibility behavior.

Out of scope:

- Implementing the production CLI validator.
- Implementing the migration command.
- Choosing or pinning the YAML parser or validation library.
- Migrating this repository's active workflow state.
- Rewriting skills to consume the registry.

## Unchanged Behavior

Behaviors that must not change as a result of this change (leave blank if nothing is at risk):

- Bootstrap `.spec-driven/` Markdown artifacts remain the active planning state
  until migration tooling exists.
- Existing concrete schema and example files remain YAML documents under
  `.strict-spec-driven/`.
- Reference workflow semantics from `../auto-spec-driven` remain the baseline
  unless this change records a deliberate strict YAML compatibility decision.
