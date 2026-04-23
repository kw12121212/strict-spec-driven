# Design: add-yaml-validation-layer

## Approach

Create a reusable validation layer in source modules and keep the command entrypoint thin. The layer will own YAML parsing/serialization, schema compilation, bundled schema loading, and validation diagnostics so future commands can call one consistent API.

Validation diagnostics will normalize errors into a stable structure that includes artifact path and field path, with expected-versus-actual details when the validator provides them. Duplicate identifier and reference checks will run as explicit post-schema validation passes so semantic checks remain deterministic.

## Key Decisions

- Centralize validation helpers instead of embedding logic in individual subcommands to avoid drift across command implementations.
- Keep `ajv` + `ajv-formats` as the schema engine selected in milestone 02 and avoid introducing additional validation libraries.
- Treat bundled schema files under `templates/strict-spec-driven/schemas/` as the canonical validation source for this layer.
- Normalize diagnostics into one shape so tests can assert deterministic error output.

## Alternatives Considered

- Implement schema validation independently inside each future subcommand. Rejected because this duplicates parsing and diagnostics logic.
- Defer duplicate-ID/reference checks until `verify` command implementation. Rejected because milestone 02 explicitly requires reusable validation capabilities before command-port work.
- Introduce a new schema DSL or validator abstraction. Rejected to keep milestone scope focused on foundational behavior using the existing dependency choices.
