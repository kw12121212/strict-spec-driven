---
mapping:
  implementation:
    - src/index.ts
    - src/validation.ts
    - src/yaml.ts
  tests:
    - test/run.ts
---

## ADDED Requirements

### Requirement: cli-shared-yaml-validation-layer
The system MUST provide shared strict-CLI validation utilities for YAML parse/stringify, schema compilation, bundled schema loading, and deterministic diagnostics so multiple commands can validate artifacts through one consistent pipeline.

#### Scenario: bundled schemas are loadable for command validation
- GIVEN a strict CLI command needs to validate an artifact
- WHEN it requests a schema through the shared validation utilities
- THEN the schema is loaded from bundled strict schema assets under `templates/strict-spec-driven/schemas/`

#### Scenario: validation diagnostics are deterministic
- GIVEN the same invalid artifact is validated multiple times against the same schema
- WHEN diagnostics are emitted by the shared validation utilities
- THEN diagnostic entries are stable in structure and ordering
- AND each diagnostic includes artifact path and field-path context
