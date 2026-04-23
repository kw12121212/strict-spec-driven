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
The system MUST define required fields, optional fields, enum values, relationship fields, stable identifiers, uniqueness scopes, matching rules, and minimal valid examples for each strict YAML artifact schema.

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

### Requirement: yaml-main-spec-file-model
The system MUST define strict YAML main spec files as YAML documents with structured schema identity, stable spec identity, human-readable title, file-level mappings, and requirement collections.

#### Scenario: main spec top-level fields are structured
- GIVEN a strict YAML main spec file is reviewed
- WHEN its top-level data is inspected
- THEN the schema identity is available as a structured field
- AND the stable spec identifier is available as a structured field
- AND the human-readable title is available as a structured field
- AND implementation and test mappings are available as structured file-level fields
- AND requirements are available as a structured collection

### Requirement: yaml-main-spec-requirement-model
The system MUST represent each strict YAML main spec requirement with a stable identifier, RFC 2119 strength enum, observable behavior statement, and zero or more structured scenarios.

#### Scenario: main spec requirement fields are structured
- GIVEN a strict YAML main spec requirement is reviewed
- WHEN its requirement data is inspected
- THEN the requirement identifier is available as a structured field
- AND the RFC 2119 strength is available as a structured field with a valid MUST, SHOULD, or MAY value
- AND the observable behavior statement is available as a structured field
- AND scenarios are available as a structured collection

#### Scenario: requirement strength values are constrained
- GIVEN a strict YAML main spec requirement is validated
- WHEN the requirement strength is checked
- THEN MUST, SHOULD, and MAY are accepted values
- AND other strength values can be reported as deterministic validation failures

### Requirement: yaml-scenario-step-model
The system MUST represent strict YAML scenarios with stable scenario identifiers and ordered structured step entries that preserve GIVEN, WHEN, THEN, and AND semantics without relying on Markdown bullet formatting.

#### Scenario: scenario steps are machine-readable
- GIVEN a strict YAML scenario is reviewed
- WHEN its steps are inspected
- THEN the scenario identifier is available as a structured field
- AND each step has a structured step kind with a valid GIVEN, WHEN, THEN, or AND value
- AND each step has structured step text
- AND the step order is preserved

### Requirement: yaml-requirement-and-scenario-identifiers
The system MUST require stable identifiers for strict YAML specs, requirements, and scenarios that can be validated for uniqueness within their owning scope.

#### Scenario: spec identifiers are stable
- GIVEN a strict YAML main spec file is renamed or moved
- WHEN archive or validation behavior matches the spec to known workflow state
- THEN the stable spec identifier remains available without deriving identity from the file path alone

#### Scenario: duplicate requirement identifiers can be rejected
- GIVEN a strict YAML spec file repeats a requirement identifier
- WHEN validation is run against the spec and delta model
- THEN the duplicate requirement identifier can be reported as a deterministic validation failure

#### Scenario: duplicate scenario identifiers can be rejected
- GIVEN a strict YAML requirement repeats a scenario identifier within that requirement
- WHEN validation is run against the spec and delta model
- THEN the duplicate scenario identifier can be reported as a deterministic validation failure

### Requirement: yaml-spec-file-mapping-model
The system MUST represent implementation and test mappings for strict YAML spec files as structured file-level fields containing normalized repo-relative file path collections.

#### Scenario: mappings stay outside requirement prose
- GIVEN a strict YAML spec file is reviewed
- WHEN implementation and test mappings are inspected
- THEN the mappings are available in structured file-level fields
- AND the mappings are not embedded in requirement or scenario prose

#### Scenario: mapping paths are repo-relative
- GIVEN a strict YAML spec mapping is validated
- WHEN each implementation or test path is checked
- THEN normalized repo-relative paths are accepted
- AND absolute paths or parent-directory traversal paths can be reported as deterministic validation failures

### Requirement: yaml-main-spec-minimal-example
The system MUST provide a minimal valid YAML main spec example that includes schema identity, stable spec identity, title, mapping fields, one requirement, one scenario, and ordered scenario steps.

#### Scenario: main spec example is complete enough to validate
- GIVEN the strict YAML main spec contract is reviewed
- WHEN its minimal valid example is inspected
- THEN every required top-level main spec field is present
- AND every required requirement field is present
- AND every required scenario field is present

#### Scenario: main spec example demonstrates enum and mapping values
- GIVEN the strict YAML main spec example is inspected
- WHEN requirement strength, scenario step kinds, and mapping fields are reviewed
- THEN the example demonstrates a valid MUST, SHOULD, or MAY requirement strength
- AND the example demonstrates valid GIVEN, WHEN, THEN, and optional AND step kinds
- AND the example demonstrates implementation and test mapping fields as repo-relative path collections

### Requirement: yaml-delta-operation-model
The system MUST represent strict YAML delta specs with structured schema identity, target spec identity, and explicit ADDED, MODIFIED, and REMOVED operation collections instead of Markdown section headings.

#### Scenario: delta operation groups are structured
- GIVEN a strict YAML delta spec is reviewed
- WHEN the requested spec changes are inspected
- THEN the schema identity is available as a structured field
- AND the target spec identity is available as a structured field
- AND added requirements are available through a structured ADDED collection
- AND modified requirements are available through a structured MODIFIED collection
- AND removed requirements are available through a structured REMOVED collection

#### Scenario: empty operation groups remain explicit
- GIVEN a strict YAML delta spec has no entries for one operation kind
- WHEN the operation groups are inspected
- THEN the empty operation kind remains identifiable without relying on an omitted Markdown heading

### Requirement: yaml-delta-stable-matching
The system MUST require strict YAML delta modifications and removals to target existing requirements by stable requirement identifier.

#### Scenario: added requirements carry stable identifiers
- GIVEN a strict YAML delta spec adds a requirement
- WHEN the added requirement is inspected
- THEN the added requirement includes the same stable requirement fields required by a main spec requirement

#### Scenario: modified requirements target stable identifiers
- GIVEN a strict YAML delta spec modifies a requirement
- WHEN the modification target is inspected
- THEN the target existing requirement is identified by stable requirement identifier
- AND the replacement requirement data is available as structured fields

#### Scenario: removed requirements target stable identifiers
- GIVEN a strict YAML delta spec removes a requirement
- WHEN the removal target is inspected
- THEN the target existing requirement is identified by stable requirement identifier

### Requirement: yaml-delta-removal-reason
The system MUST require each strict YAML removed requirement delta to include a structured removal reason.

#### Scenario: removal rationale is reviewable
- GIVEN a strict YAML delta spec removes a requirement
- WHEN the removal entry is reviewed
- THEN the reason for removal is available as a structured field

### Requirement: yaml-delta-minimal-example
The system MUST provide a minimal valid YAML delta spec example that includes schema identity, target spec identity, and explicit ADDED, MODIFIED, and REMOVED operation collections.

#### Scenario: delta spec example is complete enough to validate
- GIVEN the strict YAML delta spec contract is reviewed
- WHEN its minimal valid example is inspected
- THEN every required top-level delta spec field is present
- AND each delta operation collection is represented as structured YAML data
- AND modification and removal entries demonstrate stable requirement identifier matching

#### Scenario: delta spec example demonstrates operation payloads
- GIVEN the strict YAML delta spec example is inspected
- WHEN ADDED, MODIFIED, and REMOVED entries are reviewed
- THEN the added entry demonstrates the required main spec requirement fields
- AND the modified entry demonstrates a target requirement identifier and replacement requirement fields
- AND the removed entry demonstrates a target requirement identifier and removal reason

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

### Requirement: structured-yaml-semantics
The system MUST represent workflow artifact meaning through structured YAML fields rather than Markdown headings, frontmatter, list indentation, or free-form prose conventions.

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

### Requirement: command-surface-boundaries
The system MUST distinguish skill names, slash commands, CLI entrypoints, CLI subcommands, and installer-facing names as separate command naming surfaces.

#### Scenario: command naming surfaces are reviewable
- GIVEN the strict workflow naming contract is reviewed
- WHEN public command names are categorized
- THEN skill names, slash commands, CLI entrypoints, CLI subcommands, and installer-facing names are each identifiable as separate naming surfaces

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

### Requirement: strict-cli-entrypoint
The system MUST define `strict-spec-driven` as the CLI entrypoint for strict YAML workflow commands.

#### Scenario: strict CLI entrypoint is explicit
- GIVEN the strict workflow naming contract is reviewed
- WHEN the CLI entrypoint for strict YAML workflow commands is checked
- THEN `strict-spec-driven` is identified as the strict CLI entrypoint

### Requirement: cli-subcommand-naming-model
The system MUST define CLI subcommands as stable workflow verb or verb-object names under the `strict-spec-driven` entrypoint rather than as `strict-spec-*` or `strict-roadmap-*` prefixed skill names.

#### Scenario: CLI subcommands do not duplicate skill prefixes
- GIVEN a strict CLI command name is reviewed
- WHEN its subcommand is checked
- THEN the subcommand is a workflow verb or verb-object name
- AND the subcommand does not rely on the `strict-spec-*` or `strict-roadmap-*` skill naming families for its strict namespace

### Requirement: installer-facing-strict-names
The system MUST require installer-facing package, skill, or command names for strict workflows to identify the strict workflow namespace explicitly and avoid silent legacy aliases outside migration-defined compatibility behavior.

#### Scenario: installer names preserve the strict namespace
- GIVEN strict workflow installation metadata is reviewed
- WHEN package, skill, or command names are exposed for installation
- THEN the names identify the strict workflow namespace
- AND legacy `spec-driven` or `spec-driven-*` names are not treated as strict workflow aliases unless a migration compatibility contract defines that behavior

### Requirement: cli-naming-remains-separate
The system MUST distinguish skill and slash-command prefix rules from CLI entrypoint, CLI subcommand, and installer-facing naming rules, and MUST apply each rule only to its own naming surface.

#### Scenario: CLI naming is not implied by skill prefixes
- GIVEN the strict workflow naming contract is reviewed
- WHEN CLI entrypoint, CLI subcommand, or installer-facing names are considered
- THEN they are not treated as automatically defined by the `strict-spec-*` or `strict-roadmap-*` skill and slash-command prefixes
- AND each naming surface is checked against its own strict naming rule
