---
mapping:
  implementation:
    - src/migrate.ts
    - src/scaffold.ts
    - templates/strict-spec-driven/schemas/schema-registry.yaml
    - templates/strict-spec-driven/schemas/registry.yaml
    - templates/strict-spec-driven/schemas/roadmap-index.yaml
    - templates/strict-spec-driven/schemas/roadmap-milestone.yaml
    - templates/strict-spec-driven/schemas/planned-change-entry.yaml
    - templates/strict-spec-driven/examples/schema-registry.yaml
    - templates/strict-spec-driven/examples/roadmap-index.yaml
    - templates/strict-spec-driven/examples/roadmap-index.ordering.yaml
    - templates/strict-spec-driven/examples/roadmap-milestone.yaml
    - templates/strict-spec-driven/examples/roadmap-milestone.planning.yaml
    - templates/strict-spec-driven/examples/planned-change-entry.yaml
    - src/validation.ts
    - src/yaml.ts
    - install.sh
    - scripts/strict-spec-driven.js
    - skills/marketplace.json
    - skills/strict-spec-archive/SKILL.md
    - skills/strict-spec-apply/SKILL.md
    - skills/strict-spec-auto/SKILL.md
    - skills/strict-spec-brainstorm/SKILL.md
    - skills/strict-spec-cancel/SKILL.md
    - skills/strict-spec-init/SKILL.md
    - skills/strict-spec-migrate/SKILL.md
    - skills/strict-spec-maintenance/SKILL.md
    - skills/strict-spec-modify/SKILL.md
    - skills/strict-spec-propose/SKILL.md
    - skills/strict-spec-resync-code-mapping/SKILL.md
    - skills/strict-spec-review/SKILL.md
    - skills/strict-spec-ship/SKILL.md
    - skills/strict-spec-simple-task/SKILL.md
    - skills/strict-spec-spec-edit/SKILL.md
    - skills/strict-spec-sync-specs/SKILL.md
    - skills/strict-spec-verify/SKILL.md
    - skills/strict-roadmap-milestone/SKILL.md
    - skills/strict-roadmap-plan/SKILL.md
    - skills/strict-roadmap-propose/SKILL.md
    - skills/strict-roadmap-recommend/SKILL.md
    - skills/strict-roadmap-sync/SKILL.md
    - README.md
    - RTK.md
  tests:
    - test/run.ts
---

# Strict YAML Artifact Schemas

### Requirement: yaml-artifact-schema-coverage
The system MUST define strict YAML schemas for main specs, delta specs, change proposals, change designs, task lists, question lists, spec indexes, roadmap indexes, roadmap milestones, and planned change entries.

#### Scenario: required artifact families are covered
- GIVEN the strict workflow artifact contract is reviewed
- WHEN each required artifact family is checked
- THEN every required artifact family has a YAML schema definition

### Requirement: yaml-schema-field-contracts
The system MUST define required fields, optional fields, enum values, relationship fields, stable identifiers, uniqueness scopes, matching rules, and minimal valid examples for each strict YAML artifact schema.

#### Scenario: schema fields are reviewable
- GIVEN a strict YAML artifact schema
- WHEN a human or script reviews the schema contract
- THEN the required fields, optional fields, enum values, relationships, stable identifiers, and minimal valid example are identifiable without relying on unstated convention

### Requirement: yaml-schema-example-coverage
The system MUST provide at least one minimal valid YAML example for each required artifact family.

#### Scenario: artifact examples cover the contract
- GIVEN strict YAML artifact schema examples are reviewed
- WHEN the required artifact families are compared with the available examples
- THEN main specs, delta specs, change proposals, change designs, task lists, question lists, spec indexes, roadmap indexes, roadmap milestones, and planned change entries each have at least one minimal valid YAML example

### Requirement: yaml-main-spec-file-model
The system MUST define strict YAML main spec files as YAML documents with structured schema identity, stable spec identity, human-readable title, file-level mappings, and requirement collections.

#### Scenario: main spec top-level fields are structured
- GIVEN a strict YAML main spec file is reviewed
- WHEN its top-level data is inspected
- THEN the schema identity is available as a structured field
- AND the stable spec identifier is available as a structured field
- AND the human-readable title is available as a structured field
- AND implementation and test mappings are available as structured file-level fields
- AND requirements are available as a structured collection

### Requirement: yaml-main-spec-requirement-model
The system MUST represent each strict YAML main spec requirement with a stable identifier, RFC 2119 strength enum, observable behavior statement, and zero or more structured scenarios.

#### Scenario: main spec requirement fields are structured
- GIVEN a strict YAML main spec requirement is reviewed
- WHEN its requirement data is inspected
- THEN the requirement identifier is available as a structured field
- AND the RFC 2119 strength is available as a structured field with a valid MUST, SHOULD, or MAY value
- AND the observable behavior statement is available as a structured field
- AND scenarios are available as a structured collection

#### Scenario: requirement strength values are constrained
- GIVEN a strict YAML main spec requirement is validated
- WHEN the requirement strength is checked
- THEN MUST, SHOULD, and MAY are accepted values
- AND other strength values can be reported as deterministic validation failures

### Requirement: yaml-scenario-step-model
The system MUST represent strict YAML scenarios with stable scenario identifiers and ordered structured step entries that preserve GIVEN, WHEN, THEN, and AND semantics without relying on Markdown bullet formatting.

#### Scenario: scenario steps are machine-readable
- GIVEN a strict YAML scenario is reviewed
- WHEN its steps are inspected
- THEN the scenario identifier is available as a structured field
- AND each step has a structured step kind with a valid GIVEN, WHEN, THEN, or AND value
- AND each step has structured step text
- AND the step order is preserved

### Requirement: yaml-requirement-and-scenario-identifiers
The system MUST require stable identifiers for strict YAML specs, requirements, and scenarios that can be validated for uniqueness within their owning scope.

#### Scenario: spec identifiers are stable
- GIVEN a strict YAML main spec file is renamed or moved
- WHEN archive or validation behavior matches the spec to known workflow state
- THEN the stable spec identifier remains available without deriving identity from the file path alone

#### Scenario: duplicate requirement identifiers can be rejected
- GIVEN a strict YAML spec file repeats a requirement identifier
- WHEN validation is run against the spec and delta model
- THEN the duplicate requirement identifier can be reported as a deterministic validation failure

#### Scenario: duplicate scenario identifiers can be rejected
- GIVEN a strict YAML requirement repeats a scenario identifier within that requirement
- WHEN validation is run against the spec and delta model
- THEN the duplicate scenario identifier can be reported as a deterministic validation failure

### Requirement: yaml-spec-file-mapping-model
The system MUST represent implementation and test mappings for strict YAML spec files as structured file-level fields containing normalized repo-relative file path collections.

#### Scenario: mappings stay outside requirement prose
- GIVEN a strict YAML spec file is reviewed
- WHEN implementation and test mappings are inspected
- THEN the mappings are available in structured file-level fields
- AND the mappings are not embedded in requirement or scenario prose

#### Scenario: mapping paths are repo-relative
- GIVEN a strict YAML spec mapping is validated
- WHEN each implementation or test path is checked
- THEN normalized repo-relative paths are accepted
- AND absolute paths or parent-directory traversal paths can be reported as deterministic validation failures

### Requirement: yaml-main-spec-minimal-example
The system MUST provide a minimal valid YAML main spec example that includes schema identity, stable spec identity, title, mapping fields, one requirement, one scenario, and ordered scenario steps.

#### Scenario: main spec example is complete enough to validate
- GIVEN the strict YAML main spec contract is reviewed
- WHEN its minimal valid example is inspected
- THEN every required top-level main spec field is present
- AND every required requirement field is present
- AND every required scenario field is present

#### Scenario: main spec example demonstrates enum and mapping values
- GIVEN the strict YAML main spec example is inspected
- WHEN requirement strength, scenario step kinds, and mapping fields are reviewed
- THEN the example demonstrates a valid MUST, SHOULD, or MAY requirement strength
- AND the example demonstrates valid GIVEN, WHEN, THEN, and optional AND step kinds
- AND the example demonstrates implementation and test mapping fields as repo-relative path collections

### Requirement: yaml-delta-operation-model
The system MUST represent strict YAML delta specs with structured schema identity, target spec identity, and explicit ADDED, MODIFIED, and REMOVED operation collections instead of Markdown section headings.

#### Scenario: delta operation groups are structured
- GIVEN a strict YAML delta spec is reviewed
- WHEN the requested spec changes are inspected
- THEN the schema identity is available as a structured field
- AND the target spec identity is available as a structured field
- AND added requirements are available through a structured ADDED collection
- AND modified requirements are available through a structured MODIFIED collection
- AND removed requirements are available through a structured REMOVED collection

#### Scenario: empty operation groups remain explicit
- GIVEN a strict YAML delta spec has no entries for one operation kind
- WHEN the operation groups are inspected
- THEN the empty operation kind remains identifiable without relying on an omitted Markdown heading

### Requirement: yaml-delta-stable-matching
The system MUST require strict YAML delta modifications and removals to target existing requirements by stable requirement identifier.

#### Scenario: added requirements carry stable identifiers
- GIVEN a strict YAML delta spec adds a requirement
- WHEN the added requirement is inspected
- THEN the added requirement includes the same stable requirement fields required by a main spec requirement

#### Scenario: modified requirements target stable identifiers
- GIVEN a strict YAML delta spec modifies a requirement
- WHEN the modification target is inspected
- THEN the target existing requirement is identified by stable requirement identifier
- AND the replacement requirement data is available as structured fields

#### Scenario: removed requirements target stable identifiers
- GIVEN a strict YAML delta spec removes a requirement
- WHEN the removal target is inspected
- THEN the target existing requirement is identified by stable requirement identifier

### Requirement: yaml-delta-merge-conflict-rules
The system MUST define deterministic merge conflict rules for archive behavior so that delta merge outcomes are predictable without manual resolution.

#### Scenario: exclusive active target is enforced at verify time
- GIVEN two active changes each have a delta that targets the same requirement ID with MODIFIED or REMOVED
- WHEN verify is run against either active change
- THEN the duplicate active target is reported as a deterministic validation failure
- AND archive is blocked until the conflict is resolved

#### Scenario: modified entry with missing target is treated as added
- GIVEN a MODIFIED delta entry targets a requirement ID that does not exist in the main spec at archive time
- WHEN archive merge is executed
- THEN the entry is treated as ADDED in the merge output
- AND the outcome is recorded in the archive merge report

#### Scenario: removed entry with missing target is skipped
- GIVEN a REMOVED delta entry targets a requirement ID that does not exist in the main spec at archive time
- WHEN archive merge is executed
- THEN the entry is silently skipped
- AND the skipped removal is recorded in the archive merge report

### Requirement: yaml-delta-removal-reason
The system MUST require each strict YAML removed requirement delta to include a structured removal reason.

#### Scenario: removal rationale is reviewable
- GIVEN a strict YAML delta spec removes a requirement
- WHEN the removal entry is reviewed
- THEN the reason for removal is available as a structured field

### Requirement: yaml-delta-minimal-example
The system MUST provide a minimal valid YAML delta spec example that includes schema identity, target spec identity, and explicit ADDED, MODIFIED, and REMOVED operation collections.

#### Scenario: delta spec example is complete enough to validate
- GIVEN the strict YAML delta spec contract is reviewed
- WHEN its minimal valid example is inspected
- THEN every required top-level delta spec field is present
- AND each delta operation collection is represented as structured YAML data
- AND modification and removal entries demonstrate stable requirement identifier matching

#### Scenario: delta spec example demonstrates operation payloads
- GIVEN the strict YAML delta spec example is inspected
- WHEN ADDED, MODIFIED, and REMOVED entries are reviewed
- THEN the added entry demonstrates the required main spec requirement fields
- AND the modified entry demonstrates a target requirement identifier and replacement requirement fields
- AND the removed entry demonstrates a target requirement identifier and removal reason

### Requirement: yaml-concrete-schema-file-coverage
The system MUST provide concrete YAML schema files for main specs, delta specs, change proposals, change designs, task lists, question lists, spec indexes, roadmap indexes, roadmap milestones, and planned change entries.

#### Scenario: schema files cover every required artifact family
- GIVEN the strict workflow schema files are reviewed
- WHEN the required artifact families are compared with the available schema files
- THEN every required artifact family has at least one concrete YAML schema file

### Requirement: yaml-concrete-schema-file-identity
The system MUST require each concrete YAML schema file to expose structured artifact type and schema version fields.

#### Scenario: schema file identity is machine-readable
- GIVEN a concrete YAML schema file is inspected
- WHEN its identity fields are reviewed
- THEN the artifact type is available as a structured field
- AND the schema version is available as a structured field

### Requirement: yaml-concrete-schema-file-contract
The system MUST require concrete YAML schema files to define required fields, optional fields, enum values, relationship fields, stable identifier fields, uniqueness scopes, and supported top-level shapes as structured YAML data.

#### Scenario: schema file contract is structured
- GIVEN a concrete YAML schema file is inspected
- WHEN its validation contract is reviewed
- THEN required fields are available as structured data
- AND optional fields are available as structured data
- AND enum values are available as structured data
- AND relationship fields are available as structured data
- AND stable identifier and uniqueness rules are available as structured data
- AND supported top-level shapes are available as structured data

### Requirement: yaml-concrete-example-file-coverage
The system MUST provide minimal valid YAML example files for main specs, delta specs, change proposals, change designs, task lists, question lists, spec indexes, roadmap indexes, roadmap milestones, and planned change entries.

#### Scenario: example files cover every required artifact family
- GIVEN the strict workflow example files are reviewed
- WHEN the required artifact families are compared with the available example files
- THEN every required artifact family has at least one minimal valid YAML example file

### Requirement: yaml-example-schema-association
The system MUST make each minimal valid YAML example file associated with the concrete schema file or artifact type it demonstrates.

#### Scenario: examples identify their schema target
- GIVEN a minimal valid YAML example file is inspected
- WHEN its schema association is reviewed
- THEN the target schema file or target artifact type is identifiable through structured YAML data or repository-defined file organization

### Requirement: yaml-schema-and-example-parseability
The system MUST require concrete schema files and minimal valid example files to be parseable as YAML documents without relying on Markdown headings, frontmatter, list indentation, or prose-only conventions.

#### Scenario: schema files are parseable YAML
- GIVEN a concrete schema file is loaded by a YAML parser
- WHEN the file is syntactically valid
- THEN the schema contract is available through structured YAML fields

#### Scenario: example files are parseable YAML
- GIVEN a minimal valid example file is loaded by a YAML parser
- WHEN the file is syntactically valid
- THEN the example artifact data is available through structured YAML fields

### Requirement: strict-schema-file-organization
The system MUST store repository-bundled strict workflow schema files under `templates/strict-spec-driven/schemas/` and minimal valid example files under `templates/strict-spec-driven/examples/`, separate from `.strict-spec-driven/` workflow state.

#### Scenario: schema and example directories are discoverable
- GIVEN the strict workflow repository files are reviewed
- WHEN concrete schema and example locations are checked
- THEN schema files are available under `templates/strict-spec-driven/schemas/`
- AND minimal valid example files are available under `templates/strict-spec-driven/examples/`
- AND `.strict-spec-driven/` is not used to store repository-bundled schema or example assets

### Requirement: strict-schema-example-file-naming
The system MUST name schema and example files so each required artifact family has a corresponding schema file and example file with matching artifact identity.

#### Scenario: artifact family file pairs are identifiable
- GIVEN the strict workflow schema and example directories are reviewed
- WHEN an artifact family is checked
- THEN a schema file for that artifact family is identifiable
- AND an example file for that artifact family is identifiable
- AND the schema and example expose matching artifact type identity through structured YAML fields

### Requirement: yaml-schema-dialect-is-machine-readable
The system MUST represent concrete schema file validation rules through machine-readable nested fields rather than prose-only shape descriptions.

#### Scenario: nested fields are inspectable
- GIVEN a concrete schema file is reviewed
- WHEN a nested artifact field is checked
- THEN the field type is available through structured YAML data
- AND required status is available through structured YAML data
- AND enum, const, item, uniqueness, reference, and additional-field rules are available through structured YAML data where they apply

### Requirement: yaml-artifact-schema-identity-consistency
The system MUST make every strict YAML artifact example identify the schema ID of the schema file it demonstrates.

#### Scenario: examples match schema identity
- GIVEN a concrete schema file and its primary example are reviewed
- WHEN their identity fields are compared
- THEN the example `schema` value matches the schema file `schema_id`
- AND the example `artifact_type` value matches the schema file `artifact_type`

### Requirement: yaml-minimal-and-coverage-example-separation
The system MUST keep minimal valid examples separate from richer coverage examples when coverage data would introduce optional operations or blocking workflow state.

#### Scenario: minimal examples remain minimal
- GIVEN a strict YAML artifact family has optional operations or blocking workflow state
- WHEN its primary minimal example is inspected
- THEN the primary example avoids optional operations and blocking workflow state
- AND richer coverage examples are identified separately when needed

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

### Requirement: strict-roadmap-skill-command-contract
The system MUST provide strict roadmap skill packages for `plan`, `milestone`,
`recommend`, `propose`, and `sync` with explicit command mappings that
reference the strict roadmap command(s) and shared strict change commands those
skills depend on.

#### Scenario: roadmap skills expose concrete strict commands
- GIVEN a strict roadmap `SKILL.md` file is reviewed
- WHEN its `## This Skill's Commands` section is inspected
- THEN the command mapping identifies the specific strict command entry or
  entries the skill uses
- AND the command mapping is not limited to generic placeholder commands

### Requirement: strict-roadmap-skill-guidance-contract
The system MUST ensure strict roadmap skill packages describe
`.strict-spec-driven/roadmap/` YAML artifacts, canonical milestone ordering,
declared and derived roadmap status rules, and the prompt-vs-script split used
by the strict workflow.

#### Scenario: roadmap skills reference strict roadmap artifacts
- GIVEN a strict roadmap skill prompt is reviewed
- WHEN its prerequisites and workflow guidance are inspected
- THEN the skill describes `.strict-spec-driven/roadmap/` YAML artifacts and the
  roadmap files it reads or writes
- AND the skill does not fall back to generic or legacy roadmap instructions
  where strict behavior is required

#### Scenario: roadmap skills preserve deterministic mechanics in scripts
- GIVEN a strict roadmap skill prompt is reviewed
- WHEN its workflow steps are inspected
- THEN deterministic validation, status derivation, index regeneration, and
  proposal scaffolding remain delegated to strict CLI commands
- AND the prompt guidance remains focused on recommendation, planning judgment,
  editing, and user checkpoints

### Requirement: strict-roadmap-proposal-handoff-contract
The system MUST ensure roadmap recommendation and roadmap proposal-handoff
behavior convert exactly one planned change into a normal strict change
scaffold without duplicating roadmap-only planning metadata inside the change
artifacts.

#### Scenario: roadmap recommendation hands off one planned change to strict propose
- GIVEN a roadmap milestone includes a planned change entry
- WHEN the strict roadmap recommendation flow is accepted and the proposal
  handoff runs
- THEN a normal strict change scaffold is created for that planned change
- AND the change artifacts describe proposal scope for that one change rather
  than copying the full milestone plan

#### Scenario: roadmap proposal handoff preserves canonical planned change identity
- GIVEN a planned change already exists as a single roadmap item under one
  milestone
- WHEN the roadmap proposal handoff creates the strict change scaffold
- THEN the resulting change uses the planned change name as its change identity
- AND the roadmap artifact remains the canonical home of milestone-level
  planning metadata

### Requirement: yaml-task-testing-gates
The system MUST represent validation and unit test task gates in task-list artifacts through structured fields.

#### Scenario: testing gates are machine-readable
- GIVEN a strict YAML task-list artifact is reviewed
- WHEN testing gates are inspected
- THEN the validation task reference is available as structured YAML data
- AND the unit test task reference is available as structured YAML data
- AND testing tasks expose explicit runnable command fields

### Requirement: structured-yaml-semantics
The system MUST represent workflow artifact meaning through structured YAML fields rather than Markdown headings, frontmatter, list indentation, or free-form prose conventions.

#### Scenario: artifact meaning is structured
- GIVEN a strict YAML workflow artifact
- WHEN its workflow meaning is inspected
- THEN the meaning is available through named YAML fields
- AND the meaning does not depend on Markdown section titles or list formatting

### Requirement: deterministic-schema-validation
The system MUST define strict YAML artifact schemas and validation diagnostics precisely enough for scripts to report missing required fields, invalid enum values, invalid references, malformed YAML, duplicate stable identifiers, and unsupported artifact shapes with artifact-path and field-path context.

#### Scenario: invalid artifacts can be rejected
- GIVEN a strict YAML workflow artifact with a schema violation
- WHEN validation is run against the artifact contract
- THEN the violation can be reported as a deterministic validation failure

#### Scenario: duplicate identifiers can be rejected
- GIVEN a strict YAML workflow artifact repeats a stable identifier where uniqueness is required
- WHEN validation is run against the artifact contract
- THEN the duplicate identifier can be reported as a deterministic validation failure

#### Scenario: diagnostics include actionable location context
- GIVEN validation reports an artifact contract failure
- WHEN diagnostics are emitted
- THEN each diagnostic identifies the artifact path and field path
- AND each diagnostic includes expected-versus-actual details when validator data provides those values

### Requirement: schema-contract-preserves-reference-semantics
The system MUST preserve the reference workflow semantics from `../auto-spec-driven` unless the YAML schema contract explicitly requires a deliberate difference.

#### Scenario: reference behavior remains the baseline
- GIVEN a strict YAML artifact schema is compared with the corresponding reference workflow artifact
- WHEN a behavior difference exists
- THEN the difference is documented as a deliberate YAML contract decision

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

### Requirement: command-surface-boundaries
The system MUST distinguish skill names, slash commands, CLI entrypoints, CLI subcommands, and installer-facing names as separate command naming surfaces.

#### Scenario: command naming surfaces are reviewable
- GIVEN the strict workflow naming contract is reviewed
- WHEN public command names are categorized
- THEN skill names, slash commands, CLI entrypoints, CLI subcommands, and installer-facing names are each identifiable as separate naming surfaces

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

### Requirement: cli-naming-remains-separate
The system MUST distinguish skill and slash-command prefix rules from CLI entrypoint, CLI subcommand, and installer-facing naming rules, and MUST apply each rule only to its own naming surface.

#### Scenario: CLI naming is not implied by skill prefixes
- GIVEN the strict workflow naming contract is reviewed
- WHEN CLI entrypoint, CLI subcommand, or installer-facing names are considered
- THEN they are not treated as automatically defined by the `strict-spec-*` or `strict-roadmap-*` skill and slash-command prefixes
- AND each naming surface is checked against its own strict naming rule

### Requirement: yaml-schema-registry-location
The system MUST define a strict YAML schema registry under `templates/strict-spec-driven/schemas/` that lets validators, generators, migration tooling, and skills discover supported strict workflow artifact schemas.

#### Scenario: registry location is discoverable
- GIVEN strict workflow tooling needs to discover supported schemas
- WHEN the schema registry location is checked
- THEN the registry location is identified under `templates/strict-spec-driven/schemas/`
- AND the registry is separate from roadmap, proposal, and archived change artifacts

#### Scenario: registry is structured YAML
- GIVEN the strict schema registry file is loaded
- WHEN the registry is syntactically valid
- THEN registry identity and schema entries are available through structured YAML fields
- AND registry meaning does not depend on Markdown headings, frontmatter, or prose-only conventions

### Requirement: yaml-schema-registry-entry-model
The system MUST represent each schema registry entry with structured schema ID, schema version, artifact type, artifact name, schema file path, primary example file path, and compatibility metadata.

#### Scenario: registry entries expose schema identity
- GIVEN a strict YAML schema registry entry is reviewed
- WHEN its fields are inspected
- THEN the schema ID is available as structured YAML data
- AND the schema version is available as structured YAML data
- AND the artifact type and artifact name are available as structured YAML data
- AND the schema and primary example file paths are available as structured YAML data

#### Scenario: registry entries expose compatibility data
- GIVEN a strict YAML schema registry entry is reviewed
- WHEN compatibility behavior is inspected
- THEN compatibility metadata is available as structured YAML data
- AND tooling can determine whether the entry is current, deprecated, or superseded without relying on prose-only notes

### Requirement: yaml-schema-registry-file-coverage
The system MUST list every supported strict workflow artifact schema in the strict YAML schema registry.

#### Scenario: supported schemas are registered
- GIVEN the strict YAML schema registry is reviewed
- WHEN the concrete schema files for supported artifact families are compared with registry entries
- THEN every supported artifact schema has a registry entry
- AND each registry entry points to a parseable concrete schema file
- AND each registry entry points to a parseable primary example file

### Requirement: yaml-schema-id-stability
The system MUST treat schema IDs as stable semantic identifiers for strict workflow artifact schemas rather than deriving identity only from file paths.

#### Scenario: schema identity survives file organization changes
- GIVEN a strict YAML schema file is moved or reorganized
- WHEN the schema ID remains unchanged
- THEN tooling can still identify the artifact schema by stable semantic identity

### Requirement: yaml-schema-version-compatibility
The system MUST define schema version compatibility rules that distinguish compatible contract clarifications from incompatible artifact shape changes.

#### Scenario: compatible schema changes are identifiable
- GIVEN a strict YAML schema changes without removing required semantics or changing existing field meanings
- WHEN compatibility is evaluated
- THEN the change can be identified as compatible according to the versioning contract

#### Scenario: incompatible schema changes require an explicit version boundary
- GIVEN a strict YAML schema change removes required fields, changes enum meaning, changes identifier matching, or changes artifact relationships
- WHEN compatibility is evaluated
- THEN the change requires an explicit incompatible version boundary

### Requirement: yaml-artifact-type-registry
The system MUST define artifact type names and artifact names as registry-controlled values for all strict workflow artifact families.

#### Scenario: artifact type names are not ad hoc
- GIVEN a strict YAML artifact is validated
- WHEN its artifact type and artifact name are checked
- THEN the values can be matched to registry-controlled values
- AND unsupported artifact type names can be reported as deterministic validation failures

### Requirement: yaml-migration-artifact-role-mapping
The system MUST define migration mapping rules from supported legacy `.spec-driven/` Markdown artifact roles to strict `.strict-spec-driven/` YAML artifact types.

#### Scenario: supported legacy artifact roles map to strict artifact types
- GIVEN migration tooling reads a supported legacy `.spec-driven/` Markdown artifact
- WHEN the artifact role is identified
- THEN the corresponding strict YAML artifact type is determined from the migration compatibility contract
- AND the generated artifact uses a registry-controlled schema ID and artifact type

#### Scenario: core legacy artifact roles are supported
- GIVEN migration tooling reads supported legacy `.spec-driven/` Markdown workflow state
- WHEN main specs, delta specs, proposals, designs, tasks, questions, spec indexes, roadmap indexes, roadmap milestones, or planned change entries are identified by role
- THEN each supported role maps to the corresponding strict YAML artifact type defined by the registry

#### Scenario: migration mappings are machine-readable
- GIVEN the strict YAML schema registry is reviewed
- WHEN migration role mappings are inspected
- THEN each supported legacy role is available as structured YAML data
- AND each supported legacy role identifies a registry-controlled strict artifact type
- AND each supported legacy role identifies a registry-controlled schema ID

### Requirement: yaml-migration-relationship-preservation
The system MUST require migration behavior to preserve supported workflow relationships when converting legacy `.spec-driven/` Markdown artifacts into strict YAML artifacts.

#### Scenario: migration preserves change relationships
- GIVEN a legacy change contains proposal, design, task, question, and delta spec artifacts
- WHEN migration converts the change to strict YAML
- THEN the generated strict artifacts preserve the change name relationship
- AND delta specs remain associated with their target main spec identities

#### Scenario: migration preserves roadmap relationships
- GIVEN a legacy roadmap milestone contains planned change entries
- WHEN migration converts the roadmap to strict YAML
- THEN planned change entries remain associated with their owning milestone
- AND archived or active change state can still be reconciled by change name

### Requirement: yaml-migration-unsupported-shape-reporting
The system MUST require migration tooling to report unsupported legacy Markdown shapes through structured warnings and manual follow-up entries rather than silently dropping or guessing artifact semantics.

#### Scenario: unsupported legacy shape is reported
- GIVEN migration tooling encounters a legacy Markdown artifact shape that cannot be mapped deterministically
- WHEN migration reports the result
- THEN the unsupported shape is recorded as a structured warning
- AND the report identifies the source artifact path
- AND the report identifies the manual follow-up needed

#### Scenario: unsupported-shape warning fields are registered
- GIVEN the strict YAML schema registry is reviewed
- WHEN unsupported-shape reporting rules are inspected
- THEN the required warning fields are available as structured YAML data
- AND the manual follow-up field is available as structured YAML data

### Requirement: yaml-migration-compatibility-boundary
The system MUST define migration compatibility as legacy-input support rather than treating legacy `.spec-driven/` Markdown artifacts as valid strict workflow target artifacts.

#### Scenario: legacy artifacts remain migration input only
- GIVEN a repository contains legacy `.spec-driven/` Markdown workflow artifacts
- WHEN strict workflow validation and migration compatibility rules are applied
- THEN those artifacts are accepted only as migration input
- AND generated strict workflow target artifacts still use `.strict-spec-driven/` YAML formats

### Requirement: yaml-migration-report-envelope
The system MUST define a structured migration report model for strict migration
runs that records converted artifacts, initialized scaffold artifacts, skipped
artifacts, warnings, errors, and manual follow-up items, while preserving
source-artifact references for legacy inputs that were converted, skipped, or
deferred.

#### Scenario: migration report preserves actionable source context for legacy inputs
- GIVEN migration tooling converts supported legacy `.spec-driven/` artifacts
- WHEN the migration report is reviewed
- THEN each converted legacy artifact entry identifies the relevant source
  artifact path
- AND each skipped artifact entry identifies the relevant source artifact path
- AND each warning or error identifies the source artifact path that triggered
  the outcome

#### Scenario: migration report records initialized strict scaffold assets
- GIVEN migration tooling initializes required strict scaffold artifacts during a
  migration run
- WHEN the migration report is reviewed
- THEN each initialized scaffold artifact entry identifies its strict target
  path
- AND the entry does not need to invent a legacy source-artifact mapping when
  the scaffold asset came from bundled strict templates

#### Scenario: migration report captures manual follow-up items
- GIVEN migration tooling encounters an unsupported or ambiguous legacy Markdown
  shape
- WHEN the migration report is emitted
- THEN the report records a manual follow-up item for that source artifact
- AND the follow-up item explains what could not be converted deterministically

### Requirement: yaml-migrated-core-spec-preservation
The system MUST preserve strict workflow identity, ordering, and mapping data
when legacy Markdown main specs and delta specs are converted into strict YAML
artifacts.

#### Scenario: migrated main specs preserve stable identifiers and mappings
- GIVEN migration tooling converts a legacy Markdown main spec
- WHEN the generated strict YAML spec artifact is inspected
- THEN the migrated artifact preserves the stable spec, requirement, and
  scenario identifiers represented by the legacy workflow state
- AND implementation and test mappings remain represented as structured
  file-level data rather than requirement prose
- AND scenario ordering remains recoverable from the strict YAML artifact data

#### Scenario: migrated delta specs preserve operation intent
- GIVEN migration tooling converts a legacy Markdown delta spec
- WHEN the generated strict YAML delta artifact is inspected
- THEN added, modified, and removed requirement operations remain represented
  through the strict YAML delta structure
- AND any preserved requirement identifiers remain reviewable through structured
  YAML fields

### Requirement: yaml-migrated-change-artifact-state-preservation
The system MUST preserve active and archived change state when legacy Markdown
proposal, design, tasks, and questions artifacts are converted into strict YAML
change artifacts.

#### Scenario: migrated active changes preserve task and question state
- GIVEN migration tooling converts an active legacy change directory
- WHEN the generated strict YAML change artifacts are inspected
- THEN proposal, design, tasks, and questions content remains represented in
  the corresponding strict artifact families
- AND completed versus pending task state remains reviewable through structured
  YAML data
- AND open versus resolved question state remains reviewable through structured
  YAML data

#### Scenario: migrated archived changes preserve archive-date behavior
- GIVEN migration tooling converts an archived legacy change directory with a
  date-prefixed folder name
- WHEN the generated strict archived change output is inspected
- THEN the archive-date prefix remains preserved in the migrated strict archive
  location or archived change identity
- AND the migrated archived change remains distinguishable from active strict
  changes without reconstructing that state from Markdown headings

### Requirement: strict-skill-packaging-layout-contract
The system MUST provide strict skill packaging surfaces for both
`strict-spec-*` and `strict-roadmap-*` families with installer-facing metadata
that uses strict namespace names in non-migration contexts.

#### Scenario: strict skill families are packaged with strict naming
- GIVEN strict workflow skill packaging metadata is reviewed
- WHEN spec workflow and roadmap workflow skill entries are checked
- THEN skill package names use `strict-spec-*` and `strict-roadmap-*` families
- AND legacy `spec-driven-*` and `roadmap-*` names are not treated as default
  strict package names outside explicit migration compatibility behavior
- AND marketplace skill entries match strict skill directory names

### Requirement: strict-skill-packaging-validation-contract
The system MUST validate strict skill packages for required metadata fields,
declared command references, stale legacy-name references, and bundled symlink
assumptions.

#### Scenario: valid strict skill package passes validation
- GIVEN a strict skill package includes required frontmatter metadata and
  command references
- AND package symlinks resolve to expected bundled script and template targets
- WHEN skill packaging validation runs
- THEN no validation error is emitted

#### Scenario: stale naming or broken symlink fails validation
- GIVEN a strict skill package uses stale legacy naming references or a broken
  bundled symlink target
- WHEN skill packaging validation runs
- THEN validation fails deterministically
- AND diagnostics identify the package path and failing field or link target

### Requirement: strict-core-skill-command-contract
The system MUST provide strict core lifecycle skill packages for `init`,
`propose`, `apply`, `verify`, `review`, `archive`, `auto`, `modify`, and
`cancel` with explicit command mappings that reference the strict bundled CLI
subcommands those skills depend on.

#### Scenario: core skills expose concrete strict commands
- GIVEN a strict core lifecycle `SKILL.md` file is reviewed
- WHEN its `## This Skill's Commands` section is inspected
- THEN the command mapping identifies the specific strict bundled CLI command
  entry or entries the skill uses
- AND the command mapping is not limited to a generic placeholder command

### Requirement: strict-core-skill-guidance-contract
The system MUST ensure strict core lifecycle skill packages describe
`.strict-spec-driven/` YAML workflow artifacts and preserve the split where
scripts handle deterministic mechanics while skill prompts handle planning and
judgment.

#### Scenario: core skills reference strict workflow artifacts
- GIVEN a strict core lifecycle `SKILL.md` file is reviewed
- WHEN its prerequisites and workflow instructions are inspected
- THEN the skill describes `.strict-spec-driven/` YAML workflow artifacts rather
  than legacy or generic workflow state

#### Scenario: core skills preserve prompt-vs-script responsibilities
- GIVEN a strict core lifecycle skill prompt is reviewed
- WHEN its workflow guidance is inspected
- THEN deterministic parsing, validation, scaffolding, and merge behavior remain
  delegated to the strict CLI commands
- AND the prompt guidance remains focused on planning, editing, review, and user
  decision checkpoints

### Requirement: strict-planning-skill-command-contract
The system MUST provide strict planning and documentation skill packages for
`brainstorm`, `simple-task`, `spec-edit`, `sync-specs`, and
`resync-code-mapping` with explicit command mappings that reference the strict
bundled CLI subcommands those skills depend on.

#### Scenario: planning skills expose concrete strict commands
- GIVEN a strict planning or documentation `SKILL.md` file is reviewed
- WHEN its `## This Skill's Commands` section is inspected
- THEN the command mapping identifies the specific strict bundled CLI command
  entry or entries the skill uses
- AND the command mapping is not limited to a generic placeholder command

### Requirement: strict-planning-skill-guidance-contract
The system MUST ensure strict planning and documentation skill packages describe
`.strict-spec-driven/` YAML workflow artifacts and preserve the intended
boundaries between brainstorming, simple tasks, direct main-spec edits,
repository spec synchronization, and mapping repair.

#### Scenario: planning skills reference strict workflow artifacts
- GIVEN a strict planning or documentation `SKILL.md` file is reviewed
- WHEN its prerequisites and workflow instructions are inspected
- THEN the skill describes `.strict-spec-driven/` YAML workflow artifacts rather
  than legacy or packaging-only placeholder state

#### Scenario: planning skills preserve workflow ownership boundaries
- GIVEN the strict planning and documentation skill prompts are reviewed
- WHEN their workflow guidance is inspected
- THEN direct main-spec editing remains owned by `strict-spec-spec-edit`
- AND repository drift synchronization remains owned by `strict-spec-sync-specs`
- AND mapping repair remains owned by `strict-spec-resync-code-mapping`
- AND the prompts do not require a separate `strict-spec-spec-content` package
  to make those workflows usable

### Requirement: strict-migration-skill-command-contract
The system MUST provide a strict migration skill package for `migrate` with
explicit command mappings that reference the strict bundled CLI commands used
for migration execution and post-migration validation.

#### Scenario: migration skill exposes concrete strict commands
- GIVEN the strict migration `SKILL.md` file is reviewed
- WHEN its `## This Skill's Commands` section is inspected
- THEN the command mapping includes
  `node {{SKILL_DIR}}/scripts/strict-spec-driven.js migrate`
- AND the command mapping includes strict validation or inspection commands
  needed after migration
- AND the command mapping is not limited to a generic placeholder command

### Requirement: strict-migration-skill-guidance-contract
The system MUST ensure the strict migration skill describes
`.strict-spec-driven/` YAML workflow artifacts, treats `.spec-driven/` as legacy
migration input, and guides operators through structured report review and
manual follow-up without inventing missing data.

#### Scenario: migration skill describes the correct source and target state
- GIVEN the strict migration skill prompt is reviewed
- WHEN its prerequisites and workflow instructions are inspected
- THEN the skill treats `.spec-driven/` as migration input
- AND the skill treats `.strict-spec-driven/` as the strict YAML target state
- AND the prompt does not describe legacy Markdown workflow state as the desired
  end state

#### Scenario: migration skill preserves report-review and manual-follow-up boundaries
- GIVEN a migration run leaves warnings, errors, or manual follow-up items
- WHEN the strict migration skill guidance is inspected
- THEN the skill directs the operator to review structured report output
- AND the skill preserves manual follow-up as an explicit human review step
- AND the prompt does not claim unsupported structures were silently converted

### Requirement: self-hosted-repository-guidance-prefers-strict-surfaces
The system MUST require a self-hosted repository's guidance to describe
`.strict-spec-driven/`, `strict-spec-*`, and `strict-roadmap-*` as the default
workflow surfaces while limiting `.spec-driven/` and legacy names to bootstrap
or migration context.

#### Scenario: repository guidance prefers strict workflow state after self-hosting
- GIVEN a repository has adopted `.strict-spec-driven/` workflow state
- WHEN its workflow guidance is reviewed
- THEN `.strict-spec-driven/` is identified as the preferred active workflow
  directory
- AND `.spec-driven/` is identified only as preserved bootstrap or migration
  input
- AND the two directories are not presented as equivalent active targets

#### Scenario: repository guidance prefers strict command families after self-hosting
- GIVEN a repository has adopted self-hosted strict workflow state
- WHEN its workflow names are reviewed
- THEN `strict-spec-*` and `strict-roadmap-*` are presented as the default skill
  and slash-command families
- AND legacy names appear only in bootstrap, migration, or historical context
