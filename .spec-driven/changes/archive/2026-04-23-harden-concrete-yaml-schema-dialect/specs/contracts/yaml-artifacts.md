# Strict YAML Artifact Schemas

## ADDED Requirements

### Requirement: yaml-schema-dialect-is-machine-readable
The system MUST represent concrete schema file validation rules through machine-readable nested fields rather than prose-only shape descriptions.

#### Scenario: nested fields are inspectable
- GIVEN a concrete schema file is reviewed
- WHEN a nested artifact field is checked
- THEN the field type is available through structured YAML data
- AND required status is available through structured YAML data
- AND enum, const, item, uniqueness, reference, and additional-field rules are available through structured YAML data where they apply

### Requirement: yaml-artifact-schema-identity-consistency
The system MUST make every strict YAML artifact example identify the schema ID of the schema file it demonstrates.

#### Scenario: examples match schema identity
- GIVEN a concrete schema file and its primary example are reviewed
- WHEN their identity fields are compared
- THEN the example `schema` value matches the schema file `schema_id`
- AND the example `artifact_type` value matches the schema file `artifact_type`

### Requirement: yaml-minimal-and-coverage-example-separation
The system MUST keep minimal valid examples separate from richer coverage examples when coverage data would introduce optional operations or blocking workflow state.

#### Scenario: minimal examples remain minimal
- GIVEN a strict YAML artifact family has optional operations or blocking workflow state
- WHEN its primary minimal example is inspected
- THEN the primary example avoids optional operations and blocking workflow state
- AND richer coverage examples are identified separately when needed

### Requirement: yaml-task-testing-gates
The system MUST represent validation and unit test task gates in task-list artifacts through structured fields.

#### Scenario: testing gates are machine-readable
- GIVEN a strict YAML task-list artifact is reviewed
- WHEN testing gates are inspected
- THEN the validation task reference is available as structured YAML data
- AND the unit test task reference is available as structured YAML data
- AND testing tasks expose explicit runnable command fields
