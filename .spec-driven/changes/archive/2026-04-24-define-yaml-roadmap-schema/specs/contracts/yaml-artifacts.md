---
mapping:
  implementation:
    - templates/strict-spec-driven/schemas/roadmap-index.yaml
    - templates/strict-spec-driven/schemas/roadmap-milestone.yaml
    - templates/strict-spec-driven/schemas/planned-change-entry.yaml
    - templates/strict-spec-driven/schemas/registry.yaml
    - templates/strict-spec-driven/examples/roadmap-index.yaml
    - templates/strict-spec-driven/examples/roadmap-index.ordering.yaml
    - templates/strict-spec-driven/examples/roadmap-milestone.yaml
    - templates/strict-spec-driven/examples/roadmap-milestone.planning.yaml
    - templates/strict-spec-driven/examples/planned-change-entry.yaml
    - templates/strict-spec-driven/scaffold/roadmap/INDEX.yaml
  tests:
    - test/run.ts
---

# Strict YAML Artifact Schemas

## ADDED Requirements

### Requirement: yaml-roadmap-index-ordering-contract
The system MUST represent roadmap index milestone ordering through structured
YAML sequence data rather than relying on Markdown list formatting or filename
sorting alone.

#### Scenario: roadmap index preserves milestone order
- GIVEN a strict roadmap index artifact is reviewed
- WHEN the `milestones` field is inspected
- THEN milestone entries appear in an ordered YAML sequence
- AND each entry exposes structured `id`, `title`, `path`, and `status` fields
- AND milestone order remains recoverable from the artifact data alone

### Requirement: yaml-roadmap-milestone-planning-model
The system MUST represent roadmap milestone planning state through structured
YAML fields for goal, scope, done criteria, dependencies, risks, status, notes,
and planned change entries.

#### Scenario: roadmap milestone exposes planning sections as fields
- GIVEN a strict roadmap milestone artifact is reviewed
- WHEN its planning content is inspected
- THEN the milestone goal is available as structured YAML data
- AND in-scope and out-of-scope items are available through structured YAML
  fields
- AND done criteria, dependencies, risks, and notes are available through
  structured YAML fields
- AND the milestone status is available as a structured YAML field rather than a
  prose heading
- AND planned changes are available as structured YAML entries owned by the
  milestone

#### Scenario: milestone declared status uses roadmap enums
- GIVEN a strict roadmap milestone artifact is validated
- WHEN the milestone status is inspected
- THEN the declared status is limited to `proposed`, `active`, `blocked`, or
  `complete`

### Requirement: yaml-planned-change-entry-dependency-model
The system MUST represent each planned change entry with a stable identifier,
declared status, summary, and structured dependency references.

#### Scenario: planned change entries expose roadmap planning fields
- GIVEN a strict planned change entry is reviewed
- WHEN its fields are inspected
- THEN the entry exposes structured `id`, `status`, `summary`, and `depends_on`
  fields
- AND the entry status is limited to `planned` or `complete`
- AND dependency references are expressed as structured planned change
  identifiers instead of prose-only notes

### Requirement: yaml-roadmap-example-contract-coverage
The system MUST provide roadmap example artifacts that demonstrate the roadmap
schema contract fields needed for validation and review while keeping the
primary minimal examples minimal.

#### Scenario: primary roadmap examples remain minimal
- GIVEN the primary strict roadmap examples are reviewed
- WHEN minimal example content is inspected
- THEN the primary roadmap index example remains a minimal valid artifact
- AND the primary roadmap milestone example remains a minimal valid artifact
- AND richer workflow-state coverage is kept in separate roadmap example files

#### Scenario: roadmap coverage examples demonstrate milestone ordering fields
- GIVEN the strict roadmap index coverage example is reviewed
- WHEN its milestone entries are inspected
- THEN the coverage example demonstrates ordered milestone entries with structured
  `id`, `title`, `path`, and `status` fields

#### Scenario: roadmap coverage example demonstrates planning fields
- GIVEN the strict roadmap milestone coverage example is reviewed
- WHEN its roadmap-specific fields are inspected
- THEN the coverage example demonstrates structured scope, done criteria, dependencies,
  risks, status, notes, and planned change entry fields
- AND the planned change entry example remains aligned with the milestone
  coverage example's dependency and status model
