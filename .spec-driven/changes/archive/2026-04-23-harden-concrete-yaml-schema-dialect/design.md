# Design: harden-concrete-yaml-schema-dialect

## Approach

Replace the descriptive schema-file shape with a compact internal schema
dialect:

- `schema` identifies a schema document.
- `schema_id` identifies the artifact schema that examples reference.
- `artifact_type` identifies the artifact family.
- `fields` recursively describes required fields, types, enum or const values,
  item shapes, reference hints, uniqueness rules, and additional-field policy.

The dialect is intentionally simple and repository-native. It is not a full
validator implementation yet, but it gives the CLI foundation concrete data to
interpret later.

## Key Decisions

- Keep YAML schema files in `.strict-spec-driven/schemas/`.
- Keep examples in `.strict-spec-driven/examples/`.
- Use `schema_id` as the stable artifact identity and make example `schema`
  values match that ID.
- Keep `schema: strict-spec-driven/schema/v1` for schema documents to separate
  schema-document identity from artifact schema identity.
- Require planned change entries to carry the same strict artifact identity
  fields as the other artifact families.
- Add task-list `testing_gates` to make validation and unit test requirements
  machine-readable.

## Alternatives Considered

- Switch directly to JSON Schema: rejected for now because the roadmap has not
  selected final validation tooling.
- Leave descriptions as strings: rejected because later validators would need to
  parse prose.
- Keep open questions in the minimal question example: rejected because open
  questions intentionally block automated execution.
