---
mapping:
  implementation:
    - src/index.ts
    - src/scaffold.ts
    - templates/strict-spec-driven/scaffold/config.yaml
    - templates/strict-spec-driven/scaffold/specs/INDEX.yaml
    - templates/strict-spec-driven/scaffold/specs/README.md
    - templates/strict-spec-driven/scaffold/roadmap/INDEX.yaml
    - templates/strict-spec-driven/scaffold/changes/STATE.yaml
  tests:
    - test/run.ts
---

## ADDED Requirements

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
