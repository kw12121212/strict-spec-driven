# Strict YAML Artifact Schemas

## ADDED Requirements

### Requirement: yaml-concrete-schema-file-coverage
The system MUST provide concrete YAML schema files for main specs, delta specs, change proposals, change designs, task lists, question lists, spec indexes, roadmap indexes, roadmap milestones, and planned change entries.

#### Scenario: schema files cover every required artifact family
- GIVEN the strict workflow schema files are reviewed
- WHEN the required artifact families are compared with the available schema files
- THEN every required artifact family has at least one concrete YAML schema file

### Requirement: yaml-concrete-schema-file-identity
The system MUST require each concrete YAML schema file to expose structured artifact type and schema version fields.

#### Scenario: schema file identity is machine-readable
- GIVEN a concrete YAML schema file is inspected
- WHEN its identity fields are reviewed
- THEN the artifact type is available as a structured field
- AND the schema version is available as a structured field

### Requirement: yaml-concrete-schema-file-contract
The system MUST require concrete YAML schema files to define required fields, optional fields, enum values, relationship fields, stable identifier fields, uniqueness scopes, and supported top-level shapes as structured YAML data.

#### Scenario: schema file contract is structured
- GIVEN a concrete YAML schema file is inspected
- WHEN its validation contract is reviewed
- THEN required fields are available as structured data
- AND optional fields are available as structured data
- AND enum values are available as structured data
- AND relationship fields are available as structured data
- AND stable identifier and uniqueness rules are available as structured data
- AND supported top-level shapes are available as structured data

### Requirement: yaml-concrete-example-file-coverage
The system MUST provide minimal valid YAML example files for main specs, delta specs, change proposals, change designs, task lists, question lists, spec indexes, roadmap indexes, roadmap milestones, and planned change entries.

#### Scenario: example files cover every required artifact family
- GIVEN the strict workflow example files are reviewed
- WHEN the required artifact families are compared with the available example files
- THEN every required artifact family has at least one minimal valid YAML example file

### Requirement: yaml-example-schema-association
The system MUST make each minimal valid YAML example file associated with the concrete schema file or artifact type it demonstrates.

#### Scenario: examples identify their schema target
- GIVEN a minimal valid YAML example file is inspected
- WHEN its schema association is reviewed
- THEN the target schema file or target artifact type is identifiable through structured YAML data or repository-defined file organization

### Requirement: yaml-schema-and-example-parseability
The system MUST require concrete schema files and minimal valid example files to be parseable as YAML documents without relying on Markdown headings, frontmatter, list indentation, or prose-only conventions.

#### Scenario: schema files are parseable YAML
- GIVEN a concrete schema file is loaded by a YAML parser
- WHEN the file is syntactically valid
- THEN the schema contract is available through structured YAML fields

#### Scenario: example files are parseable YAML
- GIVEN a minimal valid example file is loaded by a YAML parser
- WHEN the file is syntactically valid
- THEN the example artifact data is available through structured YAML fields
