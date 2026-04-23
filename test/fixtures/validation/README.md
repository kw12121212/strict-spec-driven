# Validation Fixtures

Naming convention:
- `schema-check.*.yaml` => schema-based validation fixtures
- `reference-check.*.yaml` => cross-field reference-check fixtures
- `duplicate-check.*.yaml` => duplicate-ID check fixtures

Coverage notes:
- malformed YAML parse failure
- missing required field validation
- invalid enum validation
- unsupported shape validation
- invalid reference detection
- duplicate identifier detection

M01 traceability targets:
- deterministic-schema-validation
- yaml-schema-field-contracts
- yaml-main-spec-requirement-model
- yaml-requirement-and-scenario-identifiers
- yaml-migration-artifact-role-mapping
