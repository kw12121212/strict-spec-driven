# Strict CLI Foundation

## Goal
Bootstrap a TypeScript CLI foundation that can create, parse, validate, and test strict YAML workflow artifacts.

## In Scope
- Establish the package, TypeScript, build, and test skeleton.
- Add a reusable YAML parsing, serialization, and validation layer.
- Implement strict initialization that creates `.strict-spec-driven/` instead of `.spec-driven/`.
- Add initial fixtures and tests for YAML validation behavior.

## Out of Scope
- Porting every workflow command.
- Rewriting skill prompts.
- Building the legacy Markdown migration tool.

## Done Criteria
- `npm run build` and `npm test` exist and pass for the initial CLI foundation.
- The init command creates `.strict-spec-driven/` with YAML scaffold files.
- YAML validation reports clear errors for missing required fields, invalid enums, invalid references, and malformed documents.
- Tests cover valid and invalid scaffold examples.

## Planned Changes
- `bootstrap-typescript-cli` - Declared: planned - add package, TypeScript config, script entrypoint, and test runner based on the reference project conventions.
- `add-yaml-validation-layer` - Declared: planned - implement shared YAML parse, stringify, and schema validation utilities for all commands.
- `implement-strict-init` - Declared: planned - create `.strict-spec-driven/` scaffold with YAML config, specs, roadmap, changes, and template files.
- `add-yaml-fixtures-and-tests` - Declared: planned - add repeatable fixtures and tests for valid scaffold generation and invalid YAML diagnostics.

## Dependencies
- `yaml-contracts-and-naming` should define the first schema version before implementation.

## Risks
- Copying reference Markdown logic too directly could make later YAML enforcement harder.
- Schema validation errors may become difficult to act on if they do not include paths and field names.

## Status
- Declared: proposed

## Notes
- Scripts should use structured YAML APIs instead of ad hoc text manipulation.
