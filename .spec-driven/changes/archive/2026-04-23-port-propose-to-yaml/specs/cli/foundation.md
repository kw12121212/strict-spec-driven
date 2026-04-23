---
mapping:
  implementation:
    - src/strict-spec-cli.ts
    - src/scaffold.ts
    - templates/strict-spec-driven/scaffold/changes/proposal.yaml
    - templates/strict-spec-driven/scaffold/changes/design.yaml
    - templates/strict-spec-driven/scaffold/changes/tasks.yaml
    - templates/strict-spec-driven/scaffold/changes/questions.yaml
  tests:
    - test/run.ts
---

## ADDED Requirements

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
