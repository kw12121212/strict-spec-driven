# Design: define-concrete-yaml-schema-files

## Approach

Add contract-level requirements to `contracts/yaml-artifacts.md` that make
schema and example files first-class strict workflow artifacts.

This is still a planning-only change. The delta spec should define observable
requirements for what future file sets must contain and how humans or scripts
can recognize completeness, without selecting a parser, schema dialect, or
runtime validator.

## Key Decisions

- Require concrete files instead of prose-only schema descriptions so later
  validators and skills can load stable artifacts.
- Require one identifiable schema contract for each required artifact family,
  while leaving the exact directory layout and registry naming to the dedicated
  versioning and registry roadmap item.
- Require examples to be separate minimal YAML documents associated with their
  schemas. This gives future tests concrete valid inputs without embedding
  examples in Markdown prose.
- Keep schema version as a required file-level field, but defer compatibility
  rules, schema IDs, and registry behavior to
  `define-schema-versioning-and-registry`.
- Avoid implementation mappings because the repository has no source tree,
  package manifest, or test runner yet.

## Alternatives Considered

- Define schemas only in narrative spec text: rejected because validators and
  generators would still need to infer file contracts from prose.
- Choose JSON Schema, OpenAPI, or a custom validator format now: rejected
  because this roadmap item only needs concrete YAML file contracts; the final
  validation library belongs to later CLI foundation work.
- Combine all schemas and examples into one required file: rejected because a
  single-file requirement would over-constrain the future layout before the
  schema registry item decides naming and compatibility rules.
