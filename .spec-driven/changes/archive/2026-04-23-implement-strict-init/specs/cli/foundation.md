---
mapping:
  implementation:
    - src/index.ts
    - src/scaffold.ts
    - templates/strict-spec-driven/scaffold/config.yaml
    - templates/strict-spec-driven/scaffold/specs/INDEX.yaml
    - templates/strict-spec-driven/scaffold/roadmap/INDEX.yaml
    - templates/strict-spec-driven/scaffold/changes/STATE.yaml
    - templates/strict-spec-driven/scaffold/specs/README.md
  tests:
    - test/run.ts
---

## ADDED Requirements

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
