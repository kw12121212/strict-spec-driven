# Strict YAML Artifact Schemas

## ADDED Requirements

### Requirement: strict-schema-file-organization
The system MUST store strict workflow schema files under `.strict-spec-driven/schemas/` and minimal valid example files under `.strict-spec-driven/examples/`.

#### Scenario: schema and example directories are discoverable
- GIVEN the strict workflow repository files are reviewed
- WHEN concrete schema and example locations are checked
- THEN schema files are available under `.strict-spec-driven/schemas/`
- AND minimal valid example files are available under `.strict-spec-driven/examples/`

### Requirement: strict-schema-example-file-naming
The system MUST name schema and example files so each required artifact family has a corresponding schema file and example file with matching artifact identity.

#### Scenario: artifact family file pairs are identifiable
- GIVEN the strict workflow schema and example directories are reviewed
- WHEN an artifact family is checked
- THEN a schema file for that artifact family is identifiable
- AND an example file for that artifact family is identifiable
- AND the schema and example expose matching artifact type identity through structured YAML fields
