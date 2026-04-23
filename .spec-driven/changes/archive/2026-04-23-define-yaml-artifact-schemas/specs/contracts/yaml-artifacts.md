# Strict YAML Artifact Schemas

## ADDED Requirements

### Requirement: yaml-artifact-schema-coverage
The system MUST define strict YAML schemas for main specs, delta specs, change proposals, change designs, task lists, question lists, spec indexes, roadmap indexes, roadmap milestones, and planned change entries.

#### Scenario: required artifact families are covered
- GIVEN the strict workflow artifact contract is reviewed
- WHEN each required artifact family is checked
- THEN every required artifact family has a YAML schema definition

### Requirement: yaml-schema-field-contracts
The system MUST define required fields, optional fields, enum values, relationship fields, stable identifiers, and minimal valid examples for each strict YAML artifact schema.

#### Scenario: schema fields are reviewable
- GIVEN a strict YAML artifact schema
- WHEN a human or script reviews the schema contract
- THEN the required fields, optional fields, enum values, relationships, stable identifiers, and minimal valid example are identifiable without relying on unstated convention

### Requirement: yaml-schema-example-coverage
The system MUST provide at least one minimal valid YAML example for each required artifact family.

#### Scenario: artifact examples cover the contract
- GIVEN strict YAML artifact schema examples are reviewed
- WHEN the required artifact families are compared with the available examples
- THEN main specs, delta specs, change proposals, change designs, task lists, question lists, spec indexes, roadmap indexes, roadmap milestones, and planned change entries each have at least one minimal valid YAML example

### Requirement: structured-yaml-semantics
The system MUST represent workflow artifact meaning through structured YAML fields rather than Markdown headings, list indentation, or free-form prose conventions.

#### Scenario: artifact meaning is structured
- GIVEN a strict YAML workflow artifact
- WHEN its workflow meaning is inspected
- THEN the meaning is available through named YAML fields
- AND the meaning does not depend on Markdown section titles or list formatting

### Requirement: deterministic-schema-validation
The system MUST define strict YAML artifact schemas precisely enough for scripts to validate missing required fields, invalid enum values, invalid references, malformed YAML, duplicate stable identifiers, and unsupported artifact shapes.

#### Scenario: invalid artifacts can be rejected
- GIVEN a strict YAML workflow artifact with a schema violation
- WHEN validation is run against the artifact contract
- THEN the violation can be reported as a deterministic validation failure

#### Scenario: duplicate identifiers can be rejected
- GIVEN a strict YAML workflow artifact repeats a stable identifier where uniqueness is required
- WHEN validation is run against the artifact contract
- THEN the duplicate identifier can be reported as a deterministic validation failure

### Requirement: schema-contract-preserves-reference-semantics
The system MUST preserve the reference workflow semantics from `../auto-spec-driven` unless the YAML schema contract explicitly requires a deliberate difference.

#### Scenario: reference behavior remains the baseline
- GIVEN a strict YAML artifact schema is compared with the corresponding reference workflow artifact
- WHEN a behavior difference exists
- THEN the difference is documented as a deliberate YAML contract decision
