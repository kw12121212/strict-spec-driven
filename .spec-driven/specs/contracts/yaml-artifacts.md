---
mapping:
  implementation:
  tests:
---

# Strict YAML Artifact Schemas

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

### Requirement: strict-workflow-directory
The system MUST define `.strict-spec-driven/` as the target workflow state directory for strict YAML spec-driven artifacts.

#### Scenario: strict workflow directory is identifiable
- GIVEN the strict workflow artifact contract is reviewed
- WHEN the target workflow state directory is checked
- THEN `.strict-spec-driven/` is identified as the directory for strict YAML workflow artifacts

### Requirement: bootstrap-directory-compatibility
The system MUST treat `.spec-driven/` as a bootstrap or legacy workflow directory rather than the target strict YAML workflow directory.

#### Scenario: bootstrap state remains distinct from strict state
- GIVEN a repository still uses `.spec-driven/` before strict migration tooling exists
- WHEN the strict workflow directory contract is reviewed
- THEN `.spec-driven/` is not identified as the target strict YAML workflow directory
- AND `.strict-spec-driven/` remains the target strict YAML workflow directory

### Requirement: strict-spec-command-prefix
The system MUST define `strict-spec-*` as the naming family for strict spec workflow skills and slash commands.

#### Scenario: strict spec workflow commands are distinguishable
- GIVEN a strict spec workflow skill or slash command name is reviewed
- WHEN its public prefix is checked
- THEN it uses the `strict-spec-*` naming family

### Requirement: strict-roadmap-command-prefix
The system MUST define `strict-roadmap-*` as the naming family for strict roadmap workflow skills and slash commands.

#### Scenario: strict roadmap workflow commands are distinguishable
- GIVEN a strict roadmap workflow skill or slash command name is reviewed
- WHEN its public prefix is checked
- THEN it uses the `strict-roadmap-*` naming family

### Requirement: cli-naming-remains-separate
The system MUST distinguish skill and slash-command prefix rules from CLI entrypoint and CLI subcommand naming rules.

#### Scenario: CLI naming is not implied by skill prefixes
- GIVEN the strict workflow naming contract is reviewed
- WHEN CLI entrypoint or CLI subcommand names are considered
- THEN they are not treated as automatically defined by the `strict-spec-*` or `strict-roadmap-*` skill and slash-command prefixes
