---
mapping:
  implementation:
  tests:
---

# Strict YAML Artifact Schemas

## ADDED Requirements

### Requirement: strict-workflow-directory
The system MUST define `.strict-spec-driven/` as the target workflow state directory for strict YAML spec-driven artifacts.

#### Scenario: strict workflow directory is identifiable
- GIVEN the strict workflow artifact contract is reviewed
- WHEN the target workflow state directory is checked
- THEN `.strict-spec-driven/` is identified as the directory for strict YAML workflow artifacts

### Requirement: bootstrap-directory-compatibility
The system MUST treat `.spec-driven/` as a bootstrap or legacy workflow directory rather than the target strict YAML workflow directory.

#### Scenario: bootstrap state remains distinct from strict state
- GIVEN a repository still uses `.spec-driven/` before strict migration tooling exists
- WHEN the strict workflow directory contract is reviewed
- THEN `.spec-driven/` is not identified as the target strict YAML workflow directory
- AND `.strict-spec-driven/` remains the target strict YAML workflow directory

### Requirement: strict-spec-command-prefix
The system MUST define `strict-spec-*` as the naming family for strict spec workflow skills and slash commands.

#### Scenario: strict spec workflow commands are distinguishable
- GIVEN a strict spec workflow skill or slash command name is reviewed
- WHEN its public prefix is checked
- THEN it uses the `strict-spec-*` naming family

### Requirement: strict-roadmap-command-prefix
The system MUST define `strict-roadmap-*` as the naming family for strict roadmap workflow skills and slash commands.

#### Scenario: strict roadmap workflow commands are distinguishable
- GIVEN a strict roadmap workflow skill or slash command name is reviewed
- WHEN its public prefix is checked
- THEN it uses the `strict-roadmap-*` naming family

### Requirement: cli-naming-remains-separate
The system MUST distinguish skill and slash-command prefix rules from CLI entrypoint and CLI subcommand naming rules.

#### Scenario: CLI naming is not implied by skill prefixes
- GIVEN the strict workflow naming contract is reviewed
- WHEN CLI entrypoint or CLI subcommand names are considered
- THEN they are not treated as automatically defined by the `strict-spec-*` or `strict-roadmap-*` skill and slash-command prefixes
