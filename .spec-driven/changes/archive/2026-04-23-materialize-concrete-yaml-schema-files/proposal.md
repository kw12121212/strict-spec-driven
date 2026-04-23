# materialize-concrete-yaml-schema-files

## What

Create the concrete YAML schema files and minimal valid example files required
by the strict YAML artifact contract.

This is a corrective follow-up to the archived
`define-concrete-yaml-schema-files` change, which defined the requirement but
did not materialize the files.

## Why

The strict workflow now says schema and example files MUST exist for every
required artifact family. Validators, generators, migration tooling, and skills
need actual parseable YAML files to target, not only prose requirements.

## Scope

In scope:

- Add concrete YAML schema files under `.strict-spec-driven/schemas/`.
- Add minimal valid YAML example files under `.strict-spec-driven/examples/`.
- Cover main specs, delta specs, change proposals, change designs, task lists,
  question lists, spec indexes, roadmap indexes, roadmap milestones, and planned
  change entries.
- Keep schema identity, artifact type, version, required fields, optional
  fields, enum values, relationship fields, stable identifiers, uniqueness
  scopes, supported shapes, and example associations in structured YAML fields.
- Record the chosen schema/example file organization in the spec contract.

Out of scope:

- Implementing a CLI validator.
- Choosing a permanent third-party validation library.
- Migrating bootstrap `.spec-driven/` artifacts into `.strict-spec-driven/`.
- Replacing the later schema registry and compatibility milestone.

## Unchanged Behavior

Behaviors that must not change as a result of this change (leave blank if nothing is at risk):

- Existing bootstrap `.spec-driven/` Markdown artifacts remain the active
  planning workflow until migration tooling exists.
- Existing archived changes and roadmap state remain intact.
- Reference workflow semantics from `../auto-spec-driven` remain the baseline.
