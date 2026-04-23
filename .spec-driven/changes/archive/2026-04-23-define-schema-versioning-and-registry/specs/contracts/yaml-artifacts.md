---
mapping:
  implementation:
    - .strict-spec-driven/schemas/schema-registry.yaml
    - .strict-spec-driven/schemas/registry.yaml
    - .strict-spec-driven/examples/schema-registry.yaml
  tests:
---

# Strict YAML Artifact Schemas

## ADDED Requirements

### Requirement: yaml-schema-registry-location
The system MUST define a strict YAML schema registry under `.strict-spec-driven/schemas/` that lets validators, generators, migration tooling, and skills discover supported strict workflow artifact schemas.

#### Scenario: registry location is discoverable
- GIVEN strict workflow tooling needs to discover supported schemas
- WHEN the schema registry location is checked
- THEN the registry location is identified under `.strict-spec-driven/schemas/`
- AND the registry is separate from roadmap, proposal, and archived change artifacts

#### Scenario: registry is structured YAML
- GIVEN the strict schema registry file is loaded
- WHEN the registry is syntactically valid
- THEN registry identity and schema entries are available through structured YAML fields
- AND registry meaning does not depend on Markdown headings, frontmatter, or prose-only conventions

### Requirement: yaml-schema-registry-entry-model
The system MUST represent each schema registry entry with structured schema ID, schema version, artifact type, artifact name, schema file path, primary example file path, and compatibility metadata.

#### Scenario: registry entries expose schema identity
- GIVEN a strict YAML schema registry entry is reviewed
- WHEN its fields are inspected
- THEN the schema ID is available as structured YAML data
- AND the schema version is available as structured YAML data
- AND the artifact type and artifact name are available as structured YAML data
- AND the schema and primary example file paths are available as structured YAML data

#### Scenario: registry entries expose compatibility data
- GIVEN a strict YAML schema registry entry is reviewed
- WHEN compatibility behavior is inspected
- THEN compatibility metadata is available as structured YAML data
- AND tooling can determine whether the entry is current, deprecated, or superseded without relying on prose-only notes

### Requirement: yaml-schema-registry-file-coverage
The system MUST list every supported strict workflow artifact schema in the strict YAML schema registry.

#### Scenario: supported schemas are registered
- GIVEN the strict YAML schema registry is reviewed
- WHEN the concrete schema files for supported artifact families are compared with registry entries
- THEN every supported artifact schema has a registry entry
- AND each registry entry points to a parseable concrete schema file
- AND each registry entry points to a parseable primary example file

### Requirement: yaml-schema-id-stability
The system MUST treat schema IDs as stable semantic identifiers for strict workflow artifact schemas rather than deriving identity only from file paths.

#### Scenario: schema identity survives file organization changes
- GIVEN a strict YAML schema file is moved or reorganized
- WHEN the schema ID remains unchanged
- THEN tooling can still identify the artifact schema by stable semantic identity

### Requirement: yaml-schema-version-compatibility
The system MUST define schema version compatibility rules that distinguish compatible contract clarifications from incompatible artifact shape changes.

#### Scenario: compatible schema changes are identifiable
- GIVEN a strict YAML schema changes without removing required semantics or changing existing field meanings
- WHEN compatibility is evaluated
- THEN the change can be identified as compatible according to the versioning contract

#### Scenario: incompatible schema changes require an explicit version boundary
- GIVEN a strict YAML schema change removes required fields, changes enum meaning, changes identifier matching, or changes artifact relationships
- WHEN compatibility is evaluated
- THEN the change requires an explicit incompatible version boundary

### Requirement: yaml-artifact-type-registry
The system MUST define artifact type names and artifact names as registry-controlled values for all strict workflow artifact families.

#### Scenario: artifact type names are not ad hoc
- GIVEN a strict YAML artifact is validated
- WHEN its artifact type and artifact name are checked
- THEN the values can be matched to registry-controlled values
- AND unsupported artifact type names can be reported as deterministic validation failures

### Requirement: yaml-migration-artifact-role-mapping
The system MUST define migration mapping rules from supported legacy `.spec-driven/` Markdown artifact roles to strict `.strict-spec-driven/` YAML artifact types.

#### Scenario: supported legacy artifact roles map to strict artifact types
- GIVEN migration tooling reads a supported legacy `.spec-driven/` Markdown artifact
- WHEN the artifact role is identified
- THEN the corresponding strict YAML artifact type is determined from the migration compatibility contract
- AND the generated artifact uses a registry-controlled schema ID and artifact type

#### Scenario: core legacy artifact roles are supported
- GIVEN migration tooling reads supported legacy `.spec-driven/` Markdown workflow state
- WHEN main specs, delta specs, proposals, designs, tasks, questions, spec indexes, roadmap indexes, roadmap milestones, or planned change entries are identified by role
- THEN each supported role maps to the corresponding strict YAML artifact type defined by the registry

#### Scenario: migration mappings are machine-readable
- GIVEN the strict YAML schema registry is reviewed
- WHEN migration role mappings are inspected
- THEN each supported legacy role is available as structured YAML data
- AND each supported legacy role identifies a registry-controlled strict artifact type
- AND each supported legacy role identifies a registry-controlled schema ID

### Requirement: yaml-migration-relationship-preservation
The system MUST require migration behavior to preserve supported workflow relationships when converting legacy `.spec-driven/` Markdown artifacts into strict YAML artifacts.

#### Scenario: migration preserves change relationships
- GIVEN a legacy change contains proposal, design, task, question, and delta spec artifacts
- WHEN migration converts the change to strict YAML
- THEN the generated strict artifacts preserve the change name relationship
- AND delta specs remain associated with their target main spec identities

#### Scenario: migration preserves roadmap relationships
- GIVEN a legacy roadmap milestone contains planned change entries
- WHEN migration converts the roadmap to strict YAML
- THEN planned change entries remain associated with their owning milestone
- AND archived or active change state can still be reconciled by change name

### Requirement: yaml-migration-unsupported-shape-reporting
The system MUST require migration tooling to report unsupported legacy Markdown shapes through structured warnings and manual follow-up entries rather than silently dropping or guessing artifact semantics.

#### Scenario: unsupported legacy shape is reported
- GIVEN migration tooling encounters a legacy Markdown artifact shape that cannot be mapped deterministically
- WHEN migration reports the result
- THEN the unsupported shape is recorded as a structured warning
- AND the report identifies the source artifact path
- AND the report identifies the manual follow-up needed

#### Scenario: unsupported-shape warning fields are registered
- GIVEN the strict YAML schema registry is reviewed
- WHEN unsupported-shape reporting rules are inspected
- THEN the required warning fields are available as structured YAML data
- AND the manual follow-up field is available as structured YAML data

### Requirement: yaml-migration-compatibility-boundary
The system MUST define migration compatibility as legacy-input support rather than treating legacy `.spec-driven/` Markdown artifacts as valid strict workflow target artifacts.

#### Scenario: legacy artifacts remain migration input only
- GIVEN a repository contains legacy `.spec-driven/` Markdown workflow artifacts
- WHEN strict workflow validation and migration compatibility rules are applied
- THEN those artifacts are accepted only as migration input
- AND generated strict workflow target artifacts still use `.strict-spec-driven/` YAML formats
