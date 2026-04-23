---
mapping:
  implementation:
  tests:
---

## ADDED Requirements

### Requirement: markdown-exception-categories
The system MUST define the Markdown file categories that remain allowed in a strict YAML workflow repository because they are not strict workflow artifacts.

#### Scenario: packaging markdown remains allowed
- GIVEN the strict YAML artifact contract is reviewed
- WHEN Agent Skills packaging files are checked
- THEN `SKILL.md` is identified as an allowed Markdown exception
- AND the exception is limited to the skill packaging container rather than generated or consumed strict workflow state

#### Scenario: repository documentation remains allowed
- GIVEN the strict YAML artifact contract is reviewed
- WHEN repository documentation files are checked
- THEN `README.md`, `AGENTS.md`, `RTK.md`, and similar non-workflow documentation are allowed to remain Markdown
- AND repository documentation is not treated as strict workflow state unless a later schema explicitly classifies it that way

### Requirement: workflow-artifacts-use-yaml
The system MUST require generated or consumed strict workflow artifacts to use YAML formats rather than Markdown formats.

#### Scenario: strict workflow state is yaml
- GIVEN strict workflow artifacts under `.strict-spec-driven/` are reviewed
- WHEN specs, delta specs, proposals, designs, tasks, questions, indexes, roadmap indexes, roadmap milestones, and planned change entries are checked
- THEN each artifact family is required to use YAML structure
- AND Markdown headings, list formatting, or frontmatter are not accepted as the authoritative structure for those artifact families

#### Scenario: strict generated filenames are yaml
- GIVEN a strict workflow command or skill generates workflow artifacts
- WHEN artifact filenames are selected
- THEN generated proposal, design, task, question, spec, delta, index, roadmap, and milestone artifacts use YAML filenames
- AND legacy Markdown artifact filenames are not generated as strict workflow targets

### Requirement: bootstrap-markdown-is-legacy-input
The system MUST treat bootstrap or legacy `.spec-driven/` Markdown artifacts as migration input rather than valid target artifacts for strict workflows.

#### Scenario: bootstrap artifacts are not strict targets
- GIVEN a repository still contains `.spec-driven/` Markdown workflow artifacts
- WHEN the strict Markdown exception policy is reviewed
- THEN those artifacts are identified as bootstrap or legacy workflow state
- AND they are not treated as valid `.strict-spec-driven/` target artifacts

#### Scenario: migration can read legacy markdown
- GIVEN migration tooling reads supported `.spec-driven/` Markdown artifacts
- WHEN the Markdown exception policy is applied
- THEN reading those legacy artifacts for conversion remains allowed
- AND the generated strict workflow output is still required to use YAML artifacts

### Requirement: markdown-exception-validation-boundary
The system MUST require validation and migration behavior to distinguish Markdown exceptions from strict workflow artifacts by artifact role.

#### Scenario: validators do not reject packaging documentation
- GIVEN validation checks strict workflow artifact formats
- WHEN an allowed Markdown exception such as `SKILL.md`, `README.md`, `AGENTS.md`, or `RTK.md` is encountered outside strict workflow state
- THEN the file is not rejected merely because it is Markdown

#### Scenario: validators reject strict workflow markdown targets
- GIVEN validation checks strict workflow artifact formats
- WHEN a generated or consumed strict workflow artifact is represented only as Markdown
- THEN the artifact can be reported as a deterministic validation failure
