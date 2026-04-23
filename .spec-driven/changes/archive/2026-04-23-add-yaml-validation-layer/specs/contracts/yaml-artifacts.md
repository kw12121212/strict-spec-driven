---
mapping:
  implementation:
    - src/index.ts
    - src/validation.ts
    - src/yaml.ts
  tests:
    - test/run.ts
---

## MODIFIED Requirements

### Requirement: deterministic-schema-validation
Previously: The system MUST define strict YAML artifact schemas precisely enough for scripts to validate missing required fields, invalid enum values, invalid references, malformed YAML, duplicate stable identifiers, and unsupported artifact shapes.
The system MUST define strict YAML artifact schemas and validation diagnostics precisely enough for scripts to report missing required fields, invalid enum values, invalid references, malformed YAML, duplicate stable identifiers, and unsupported artifact shapes with artifact-path and field-path context.

#### Scenario: invalid artifacts can be rejected
- GIVEN a strict YAML workflow artifact with a schema violation
- WHEN validation is run against the artifact contract
- THEN the violation can be reported as a deterministic validation failure

#### Scenario: duplicate identifiers can be rejected
- GIVEN a strict YAML workflow artifact repeats a stable identifier where uniqueness is required
- WHEN validation is run against the artifact contract
- THEN the duplicate identifier can be reported as a deterministic validation failure

#### Scenario: diagnostics include actionable location context
- GIVEN validation reports an artifact contract failure
- WHEN diagnostics are emitted
- THEN each diagnostic identifies the artifact path and field path
- AND each diagnostic includes expected-versus-actual details when validator data provides those values
