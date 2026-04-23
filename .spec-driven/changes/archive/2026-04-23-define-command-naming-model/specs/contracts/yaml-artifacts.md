---
mapping:
  implementation:
  tests:
---

# Strict YAML Artifact Schemas

## ADDED Requirements

### Requirement: command-surface-boundaries
The system MUST distinguish skill names, slash commands, CLI entrypoints, CLI subcommands, and installer-facing names as separate command naming surfaces.

#### Scenario: command naming surfaces are reviewable
- GIVEN the strict workflow naming contract is reviewed
- WHEN public command names are categorized
- THEN skill names, slash commands, CLI entrypoints, CLI subcommands, and installer-facing names are each identifiable as separate naming surfaces

### Requirement: strict-cli-entrypoint
The system MUST define `strict-spec-driven` as the CLI entrypoint for strict YAML workflow commands.

#### Scenario: strict CLI entrypoint is explicit
- GIVEN the strict workflow naming contract is reviewed
- WHEN the CLI entrypoint for strict YAML workflow commands is checked
- THEN `strict-spec-driven` is identified as the strict CLI entrypoint

### Requirement: cli-subcommand-naming-model
The system MUST define CLI subcommands as stable workflow verb or verb-object names under the `strict-spec-driven` entrypoint rather than as `strict-spec-*` or `strict-roadmap-*` prefixed skill names.

#### Scenario: CLI subcommands do not duplicate skill prefixes
- GIVEN a strict CLI command name is reviewed
- WHEN its subcommand is checked
- THEN the subcommand is a workflow verb or verb-object name
- AND the subcommand does not rely on the `strict-spec-*` or `strict-roadmap-*` skill naming families for its strict namespace

### Requirement: installer-facing-strict-names
The system MUST require installer-facing package, skill, or command names for strict workflows to identify the strict workflow namespace explicitly and avoid silent legacy aliases outside migration-defined compatibility behavior.

#### Scenario: installer names preserve the strict namespace
- GIVEN strict workflow installation metadata is reviewed
- WHEN package, skill, or command names are exposed for installation
- THEN the names identify the strict workflow namespace
- AND legacy `spec-driven` or `spec-driven-*` names are not treated as strict workflow aliases unless a migration compatibility contract defines that behavior

## MODIFIED Requirements

### Requirement: cli-naming-remains-separate
Previously: The system MUST distinguish skill and slash-command prefix rules from CLI entrypoint and CLI subcommand naming rules.
The system MUST distinguish skill and slash-command prefix rules from CLI entrypoint, CLI subcommand, and installer-facing naming rules, and MUST apply each rule only to its own naming surface.

#### Scenario: CLI naming is not implied by skill prefixes
- GIVEN the strict workflow naming contract is reviewed
- WHEN CLI entrypoint, CLI subcommand, or installer-facing names are considered
- THEN they are not treated as automatically defined by the `strict-spec-*` or `strict-roadmap-*` skill and slash-command prefixes
- AND each naming surface is checked against its own strict naming rule
