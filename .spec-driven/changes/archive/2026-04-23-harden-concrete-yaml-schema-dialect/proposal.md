# harden-concrete-yaml-schema-dialect

## What

Harden the concrete strict YAML schema files so they are useful as validator
inputs rather than prose-like metadata.

This change updates the existing `.strict-spec-driven/schemas/*.yaml` files to
use a uniform nested field dialect, updates examples to match stable schema
identities, and splits minimal examples from coverage examples where a single
example would otherwise be misleading.

## Why

The first concrete schema files existed, but they were too descriptive to drive
strict validation. Required nested fields, artifact identity, task testing gates,
and example semantics were not machine-readable enough for later CLI and skill
work.

## Scope

In scope:

- Add stable `schema_id` values to schema files.
- Use recursive `fields` entries for top-level and nested validation.
- Require consistent artifact identity fields across all artifact families,
  including planned change entries.
- Update examples so their `schema` values match schema IDs.
- Make question-list and delta-spec minimal examples genuinely minimal.
- Add separate coverage examples for open questions and delta operations.
- Add task-list testing gates and explicit testing task commands.

Out of scope:

- Implementing the production validator.
- Choosing a third-party schema validation standard.
- Changing the roadmap or lifecycle command semantics.

## Unchanged Behavior

Behaviors that must not change as a result of this change (leave blank if nothing is at risk):

- The schema and example files remain YAML documents under `.strict-spec-driven/`.
- Bootstrap `.spec-driven/` remains the active workflow state until migration.
- Existing strict artifact families remain unchanged.
