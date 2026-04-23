---
mapping:
  implementation:
    - package.json
    - tsconfig.json
    - src/strict-spec-cli.ts
    - src/scaffold.ts
    - src/validation.ts
    - src/yaml.ts
    - templates/strict-spec-driven/scaffold/config.yaml
    - templates/strict-spec-driven/scaffold/changes/proposal.yaml
    - templates/strict-spec-driven/scaffold/changes/design.yaml
    - templates/strict-spec-driven/scaffold/changes/tasks.yaml
    - templates/strict-spec-driven/scaffold/changes/questions.yaml
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

### Requirement: cli-init-creates-strict-workflow-scaffold
The system MUST provide an `init` subcommand that creates strict workflow state
under `.strict-spec-driven/` using bundled scaffold template assets.

#### Scenario: init creates missing strict scaffold artifacts
- GIVEN a repository with bundled strict scaffold template assets
- AND `.strict-spec-driven/` does not yet exist
- WHEN `strict-spec-driven init` is executed
- THEN `.strict-spec-driven/` is created
- AND strict config, specs index, roadmap index, changes state, and seed README
  guidance artifacts are created from bundled templates

### Requirement: cli-init-is-idempotent-and-non-clobbering
The system MUST make `init` idempotent and MUST NOT overwrite existing strict
workflow artifacts.

#### Scenario: existing strict artifacts are preserved on rerun
- GIVEN `.strict-spec-driven/` already exists with user-authored artifact content
- WHEN `strict-spec-driven init` is executed again
- THEN existing strict workflow artifacts are left unchanged
- AND only missing required scaffold artifacts are created

### Requirement: cli-init-handles-bootstrap-coexistence
The system MUST allow strict scaffold initialization to proceed when a legacy
`.spec-driven/` directory is present and MUST emit a warning about coexistence.

#### Scenario: init warns and continues when bootstrap directory exists
- GIVEN a repository contains `.spec-driven/`
- WHEN `strict-spec-driven init` is executed
- THEN the command emits one warning indicating `.spec-driven/` is bootstrap or
  legacy workflow state
- AND strict scaffold initialization continues without failing solely due to
  that directory's presence

### Requirement: cli-propose-creates-strict-change-scaffold
The system MUST provide a `propose` subcommand that creates strict change
planning artifacts under `.strict-spec-driven/changes/<name>/`.

#### Scenario: propose scaffolds strict yaml artifacts
- GIVEN a valid kebab-case change name that does not already exist
- WHEN `strict-spec-driven propose <name>` is executed
- THEN the change directory is created under `.strict-spec-driven/changes/`
- AND `proposal.yaml`, `design.yaml`, `tasks.yaml`, and `questions.yaml` are
  created from strict templates
- AND a `specs/` directory is created for delta specs

### Requirement: cli-propose-validates-change-name-and-collision
The system MUST reject invalid strict change names and existing strict change
collisions before writing scaffold files.

#### Scenario: propose rejects invalid name
- GIVEN a requested change name that is not kebab-case
- WHEN `strict-spec-driven propose <name>` is executed
- THEN the command exits non-zero
- AND no strict change directory is created

#### Scenario: propose rejects duplicate change
- GIVEN `.strict-spec-driven/changes/<name>/` already exists
- WHEN `strict-spec-driven propose <name>` is executed
- THEN the command exits non-zero
- AND existing change artifacts are left unchanged

### Requirement: cli-propose-reports-created-artifacts
The system MUST emit deterministic output listing the strict change artifacts
created by `propose`.

#### Scenario: propose output includes artifact paths
- GIVEN `strict-spec-driven propose <name>` completes successfully
- WHEN command output is reviewed
- THEN output identifies the created strict change directory
- AND output lists the created planning artifact paths for follow-up editing
