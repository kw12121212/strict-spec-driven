# Design: materialize-concrete-yaml-schema-files

## Approach

Create a small repository-native schema dialect expressed as YAML documents.
Each schema file will identify the artifact family, schema version, required
and optional fields, enum values, relationship fields, stable identifiers,
uniqueness scopes, supported top-level shape, and its minimal example path.

Create one minimal valid example YAML document per required artifact family.
The examples intentionally use minimal data, but they must remain parseable and
show the core structured fields expected by the corresponding schema.

## Key Decisions

- Use `.strict-spec-driven/schemas/` and `.strict-spec-driven/examples/` because
  `.strict-spec-driven/` is already the target strict workflow directory.
- Use one schema file per artifact family to make coverage easy to audit.
- Keep the schema dialect simple and self-describing rather than choosing JSON
  Schema or another validator format before the CLI foundation exists.
- Put schema/example association in both the schema files and example files so
  humans and future scripts can traverse either direction.
- Add a spec delta documenting the chosen file organization as an observable
  contract.

## Alternatives Considered

- Only update prose requirements again: rejected because the defect is that no
  concrete files were created.
- Store schemas under `.spec-driven/`: rejected because that directory is
  bootstrap/legacy state, while `.strict-spec-driven/` is the target product
  workflow directory.
- Create a single combined schema file: rejected because the contract says every
  artifact family should have an identifiable concrete schema file.
