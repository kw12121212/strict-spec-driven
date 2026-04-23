---
mapping:
  implementation:
    - package.json
    - tsconfig.json
    - src/index.ts
    - src/scaffold.ts
    - src/validation.ts
    - src/yaml.ts
    - templates/strict-spec-driven/scaffold/config.yaml
    - templates/strict-spec-driven/scaffold/specs/INDEX.yaml
    - templates/strict-spec-driven/scaffold/specs/README.md
    - templates/strict-spec-driven/scaffold/roadmap/INDEX.yaml
    - templates/strict-spec-driven/scaffold/changes/STATE.yaml
  tests:
    - test/run.ts
---

# CLI Foundation

### Requirement: cli-build-and-test-commands
The system MUST provide `build` and `test` package scripts that compile TypeScript sources to `dist/` and run the test suite using bun.

#### Scenario: build compiles without errors
- GIVEN the TypeScript sources under `src/` are syntactically valid
- WHEN `bun run build` is executed
- THEN the TypeScript compiler produces compiled output under `dist/` with zero errors

#### Scenario: test suite is executable
- GIVEN the `dist/` output exists
- WHEN `bun test/run.ts` is executed
- THEN the test suite runs and reports pass or fail status

### Requirement: cli-unknown-subcommand-rejection
The system MUST exit non-zero and write a usage hint to stderr when invoked with an unknown subcommand or no arguments.

#### Scenario: unknown subcommand exits non-zero
- GIVEN the `strict-spec-driven` CLI is invoked with an unrecognized subcommand
- WHEN the command router processes the argument
- THEN the process exits with a non-zero exit code
- AND a usage hint is written to stderr

#### Scenario: no-arg invocation exits non-zero
- GIVEN the `strict-spec-driven` CLI is invoked with no arguments
- WHEN the command router processes the argument
- THEN the process exits with a non-zero exit code
- AND a usage hint is written to stderr

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

### Requirement: cli-strict-scaffold-template-assets
The system MUST provide bundled strict scaffold template assets that can seed initial `.strict-spec-driven/` project state for init and fixture-driven tests.

#### Scenario: required scaffold template asset families are present
- GIVEN the strict CLI bundled templates are inspected
- WHEN scaffold template assets are enumerated
- THEN template assets exist for strict config, specs index, roadmap index, empty changes state, and seed README guidance

#### Scenario: scaffold templates remain separate from contract schemas and examples
- GIVEN strict template directories are inspected
- WHEN scaffold template assets are compared to schema and example assets
- THEN scaffold assets are stored as a distinct template bundle
- AND schema and example files remain dedicated to validation contracts and examples
