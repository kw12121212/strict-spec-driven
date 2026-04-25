---
mapping:
  implementation:
    - package.json
    - install.sh
    - tsconfig.json
    - src/converters/roadmap.ts
    - src/migrate.ts
    - src/strict-spec-cli.ts
    - src/roadmap.ts
    - src/archive.ts
    - src/scaffold.ts
    - src/validation.ts
    - src/yaml.ts
    - src/apply.ts
    - src/verify.ts
    - src/review.ts
    - src/skills.ts
    - skills/strict-spec-ship/SKILL.md
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
    - test/support/harness.ts
    - test/suites/entrypoint-and-skills.ts
    - test/suites/foundation-and-fixtures.ts
    - test/suites/change-lifecycle.ts
    - test/suites/roadmap-and-migration.ts
    - test/suites/operations.ts
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

### Requirement: cli-build-bundles-templates
The system MUST copy the `templates/` directory into `dist/templates/` as part of the build step so compiled scripts can resolve scaffold and schema assets without depending on the source tree.

#### Scenario: templates appear in dist after build
- GIVEN the TypeScript sources compile successfully
- WHEN `bun run build` completes
- THEN `dist/templates/strict-spec-driven/scaffold/` contains all required scaffold template assets
- AND `dist/templates/strict-spec-driven/schemas/` contains all schema and registry assets

### Requirement: cli-template-resolution-from-dist
The system MUST resolve bundled template directories relative to `import.meta.url` so that compiled scripts in `dist/` find templates under `dist/templates/` without depending on the source tree.

#### Scenario: compiled scripts find scaffold templates
- GIVEN `dist/` contains compiled JS and `dist/templates/` contains copied template assets
- WHEN a compiled script resolves a scaffold template path
- THEN the template is found under `dist/templates/strict-spec-driven/scaffold/`

#### Scenario: compiled scripts find schema assets
- GIVEN `dist/` contains compiled JS and `dist/templates/` contains copied template assets
- WHEN a compiled script resolves a schema path
- THEN the schema is found under `dist/templates/strict-spec-driven/schemas/`

### Requirement: cli-template-resolution-fallback
The system MUST fall back to `../templates/` relative to the module file when `dist/templates/` does not exist, so template resolution works during development before the copy step runs.

#### Scenario: source-tree fallback when dist templates missing
- GIVEN `dist/templates/` does not exist
- WHEN a script resolves a bundled template path
- THEN the template is found under `../templates/strict-spec-driven/` relative to the module file

### Requirement: cli-init-works-from-dist-only
The system MUST allow `strict-spec-driven init` to create scaffold files correctly when run from the compiled `dist/` output without the source tree present.

#### Scenario: init succeeds from dist-only environment
- GIVEN only the `dist/` directory exists with compiled JS and bundled templates
- WHEN `strict-spec-driven init` is executed
- THEN it creates `.strict-spec-driven/` with all required scaffold artifacts

### Requirement: cli-propose-works-from-dist-only
The system MUST allow `strict-spec-driven propose` to create change scaffolds correctly when run from the compiled `dist/` output without the source tree present.

#### Scenario: propose succeeds from dist-only environment
- GIVEN only the `dist/` directory exists with compiled JS and bundled templates
- WHEN `strict-spec-driven propose <name>` is executed
- THEN it creates the change directory with all planning artifacts

### Requirement: cli-apply-reads-tasks-yaml
The system MUST provide an `apply` subcommand that reads `tasks.yaml` from a named active strict change directory under `.strict-spec-driven/changes/<name>/`.

#### Scenario: apply locates tasks for an existing change
- GIVEN `.strict-spec-driven/changes/<name>/tasks.yaml` exists with at least one pending task
- WHEN `strict-spec-driven apply <name>` is executed
- THEN the command reads and parses the tasks artifact from the change directory

#### Scenario: apply rejects missing change
- GIVEN `.strict-spec-driven/changes/<name>/` does not exist
- WHEN `strict-spec-driven apply <name>` is executed
- THEN the command exits non-zero
- AND an error message is written to stderr indicating the change was not found

### Requirement: cli-apply-completes-next-pending-task
The system MUST complete exactly one pending task per `apply` invocation by locating the first task with `status: pending` across all task sections, setting its status to `complete`, and writing the updated `tasks.yaml` back to disk.

#### Scenario: apply completes first pending task
- GIVEN a strict change has `tasks.yaml` with multiple pending tasks across sections
- WHEN `strict-spec-driven apply <name>` is executed
- THEN the first task with `status: pending` across sections is set to `complete`
- AND the updated `tasks.yaml` is written back to the change directory
- AND no other task statuses are modified

#### Scenario: apply preserves tasks yaml structure
- GIVEN a strict change has `tasks.yaml` with sections, task fields, and testing gates
- WHEN `strict-spec-driven apply <name>` is executed
- THEN the `tasks.yaml` sections, task identifiers, task text, commands, and testing gates remain unchanged
- AND only the target task `status` field is modified

### Requirement: cli-apply-rejects-all-complete
The system MUST exit non-zero when no pending tasks remain in the change.

#### Scenario: apply rejects when all tasks complete
- GIVEN a strict change has `tasks.yaml` with all tasks having `status: complete`
- WHEN `strict-spec-driven apply <name>` is executed
- THEN the command exits non-zero
- AND an error message is written to stderr indicating no pending tasks remain

### Requirement: cli-apply-emits-task-status-json
The system MUST emit a deterministic JSON object to stdout describing the completed task and remaining task summary.

#### Scenario: apply output is parseable json
- GIVEN `strict-spec-driven apply <name>` completes a task successfully
- WHEN command stdout is parsed as JSON
- THEN the JSON includes the completed task section name, task id, and task text
- AND the JSON includes the total task count and remaining pending count

#### Scenario: apply status output is deterministic
- GIVEN the same change tasks state is applied twice in sequence
- WHEN each JSON output is compared
- THEN each output reflects only the task completed in that invocation

### Requirement: cli-verify-reads-active-change-artifacts
The system MUST provide a `verify` subcommand that reads all planning artifacts (proposal.yaml, design.yaml, tasks.yaml, questions.yaml) and any delta spec files under `specs/` from a named active strict change directory under `.strict-spec-driven/changes/<name>/`.

#### Scenario: verify locates artifacts for an existing change
- GIVEN `.strict-spec-driven/changes/<name>/` exists with planning artifacts
- WHEN `strict-spec-driven verify <name>` is executed
- THEN the command reads and parses each planning artifact from the change directory

#### Scenario: verify rejects missing change
- GIVEN `.strict-spec-driven/changes/<name>/` does not exist
- WHEN `strict-spec-driven verify <name>` is executed
- THEN the command exits non-zero
- AND an error message is written to stderr indicating the change was not found

### Requirement: cli-verify-validates-artifacts-against-schemas
The system MUST validate each change planning artifact against its registered strict YAML schema and include any schema violations in the verification diagnostics.

#### Scenario: valid artifacts produce no schema diagnostics
- GIVEN a strict change has valid proposal.yaml, design.yaml, tasks.yaml, and questions.yaml
- WHEN `strict-spec-driven verify <name>` is executed
- THEN no schema validation diagnostics are emitted for those artifacts

#### Scenario: invalid artifact produces schema diagnostics
- GIVEN a strict change has a tasks.yaml missing a required field
- WHEN `strict-spec-driven verify <name>` is executed
- THEN a schema validation diagnostic is emitted identifying the artifact path and field path

### Requirement: cli-verify-checks-task-completion
The system MUST report a verification diagnostic when any task in the change has a status other than `complete`.

#### Scenario: all tasks complete produces no task diagnostics
- GIVEN a strict change has tasks.yaml with all tasks having `status: complete`
- WHEN `strict-spec-driven verify <name>` is executed
- THEN no task-completion diagnostics are emitted

#### Scenario: pending task produces diagnostic
- GIVEN a strict change has tasks.yaml with at least one task having `status: pending`
- WHEN `strict-spec-driven verify <name>` is executed
- THEN a diagnostic is emitted identifying the incomplete task

### Requirement: cli-verify-checks-open-questions
The system MUST report a verification diagnostic when the questions artifact contains any open questions.

#### Scenario: no open questions produces no question diagnostics
- GIVEN a strict change has questions.yaml with an empty `open` list
- WHEN `strict-spec-driven verify <name>` is executed
- THEN no open-question diagnostics are emitted

#### Scenario: open questions produce diagnostics
- GIVEN a strict change has questions.yaml with at least one entry in the `open` list
- WHEN `strict-spec-driven verify <name>` is executed
- THEN a diagnostic is emitted for each open question

### Requirement: cli-verify-validates-testing-gates
The system MUST validate that `tasks.yaml` testing gates reference existing task IDs within the Testing section and report a diagnostic when a referenced task ID is missing or outside the Testing section.

#### Scenario: valid testing gates produce no diagnostics
- GIVEN a strict change has tasks.yaml where `testing_gates.validation_task` and `testing_gates.unit_test_task` reference existing task IDs in the Testing section
- WHEN `strict-spec-driven verify <name>` is executed
- THEN no testing-gate diagnostics are emitted

#### Scenario: missing testing gate target produces diagnostic
- GIVEN a strict change has tasks.yaml where `testing_gates.validation_task` references a task ID that does not exist in the Testing section
- WHEN `strict-spec-driven verify <name>` is executed
- THEN a diagnostic is emitted identifying the invalid testing gate reference

### Requirement: cli-verify-validates-delta-specs
The system MUST validate each YAML file under the change `specs/` directory against the registered delta-spec schema and include any violations in the verification diagnostics.

#### Scenario: valid delta specs produce no diagnostics
- GIVEN a strict change has delta spec files under `specs/` that conform to the delta-spec schema
- WHEN `strict-spec-driven verify <name>` is executed
- THEN no delta-spec diagnostics are emitted

#### Scenario: malformed delta spec produces diagnostics
- GIVEN a strict change has a delta spec file under `specs/` that violates the delta-spec schema
- WHEN `strict-spec-driven verify <name>` is executed
- THEN a diagnostic is emitted identifying the delta spec path and violation

### Requirement: cli-verify-enforces-exclusive-active-targets
The system MUST report a verification diagnostic when two or more active changes have delta specs that target the same requirement ID with MODIFIED or REMOVED operations.

#### Scenario: no target overlap produces no conflict diagnostics
- GIVEN active changes have delta specs with disjoint MODIFIED and REMOVED target_requirement values
- WHEN `strict-spec-driven verify <name>` is executed
- THEN no exclusive-active-target diagnostics are emitted

#### Scenario: overlapping targets produce conflict diagnostics
- GIVEN two active changes each have a delta spec with a MODIFIED entry targeting the same requirement ID
- WHEN `strict-spec-driven verify <name>` is executed
- THEN a diagnostic is emitted identifying the conflicting requirement ID and the competing change names

### Requirement: cli-verify-emits-deterministic-json-output
The system MUST emit a deterministic JSON object to stdout containing `valid`, `diagnostics`, `changeName`, `totalTasks`, `completeTasks`, `remainingPending`, and `openQuestionCount`.

#### Scenario: verify output is parseable json
- GIVEN `strict-spec-driven verify <name>` completes
- WHEN command stdout is parsed as JSON
- THEN the JSON includes `valid` as a boolean
- AND the JSON includes `diagnostics` as an array
- AND the JSON includes `changeName`, `totalTasks`, `completeTasks`, `remainingPending`, and `openQuestionCount`

#### Scenario: verify exits non-zero when invalid
- GIVEN a strict change has verification diagnostics
- WHEN `strict-spec-driven verify <name>` is executed
- THEN the command exits with a non-zero exit code

#### Scenario: verify exits zero when valid
- GIVEN a strict change has no verification diagnostics
- WHEN `strict-spec-driven verify <name>` is executed
- THEN the command exits with exit code zero

### Requirement: cli-verify-works-from-dist-only
The system MUST allow `strict-spec-driven verify` to validate change artifacts correctly when run from the compiled `dist/` output without the source tree present.

#### Scenario: verify succeeds from dist-only environment
- GIVEN only the `dist/` directory exists with compiled JS and bundled templates
- WHEN `strict-spec-driven verify <name>` is executed against an active change
- THEN it validates the change and emits correct diagnostics

### Requirement: cli-roadmap-status-reports-strict-roadmap-state
The system MUST provide a `roadmap-status` subcommand that validates
`.strict-spec-driven/roadmap/` artifacts and reports milestone and planned
change state using strict roadmap declared-status rules and derived completion
semantics.

#### Scenario: roadmap-status reports ordered milestone state
- GIVEN a valid strict roadmap exists under `.strict-spec-driven/roadmap/`
- WHEN `strict-spec-driven roadmap-status` is executed
- THEN the output includes milestone entries in roadmap order
- AND each milestone reports its declared status and derived status
- AND each planned change reports its declared roadmap status and workflow-backed state

#### Scenario: roadmap-status rejects invalid roadmap artifacts
- GIVEN a strict roadmap artifact violates the roadmap contract
- WHEN `strict-spec-driven roadmap-status` is executed
- THEN the command exits non-zero
- AND the diagnostics identify the invalid artifact and field context

### Requirement: cli-roadmap-sync-reconciles-strict-roadmap-state
The system MUST provide a `roadmap-sync` subcommand that regenerates or repairs
strict roadmap index state and reconciles milestone and planned change
completion against active and archived strict changes without inventing new
roadmap items.

#### Scenario: roadmap-sync regenerates canonical roadmap index state
- GIVEN strict roadmap milestone files exist under
  `.strict-spec-driven/roadmap/milestones/`
- WHEN `strict-spec-driven roadmap-sync` is executed
- THEN the roadmap index reflects the canonical milestone ordering and file paths
- AND milestone entries keep their declared status values within the strict roadmap enums

#### Scenario: roadmap-sync reconciles planned change completion from workflow state
- GIVEN a roadmap planned change has moved into archived strict change state
- WHEN `strict-spec-driven roadmap-sync` is executed
- THEN the planned change is reconciled as complete in roadmap state
- AND no duplicate planned change entry is created
- AND unrelated milestone notes and scope content remain unchanged

### Requirement: cli-roadmap-validation-and-skill-smoke-coverage
The system MUST include automated checks that exercise strict roadmap command
behavior and strict roadmap skill content for both aligned and failing states.

#### Scenario: automated checks accept aligned roadmap workflow surfaces
- GIVEN strict roadmap commands and `strict-roadmap-*` skill packages are aligned
  with `.strict-spec-driven/roadmap/`
- WHEN repository automated checks are executed
- THEN the roadmap workflow checks pass

#### Scenario: automated checks reject placeholder or stale roadmap surfaces
- GIVEN a strict roadmap skill keeps a generic placeholder command block or a
  roadmap command ignores strict roadmap status rules
- WHEN repository automated checks are executed
- THEN the roadmap workflow checks fail
- AND diagnostics identify the failing skill or roadmap surface deterministically

### Requirement: cli-verify-spec-mappings-subcommand
The system MUST provide a `verify-spec-mappings` subcommand for strict
spec-mapping audits.

#### Scenario: verify-spec-mappings runs from repository state
- GIVEN `.spec-driven/specs/` contains one or more main spec files
- WHEN `strict-spec-driven verify-spec-mappings` is executed
- THEN the command runs mapping audits against available spec mapping fields
- AND command output is emitted as parseable JSON

#### Scenario: verify-spec-mappings reports missing specs directory
- GIVEN `.spec-driven/specs/` does not exist
- WHEN `strict-spec-driven verify-spec-mappings` is executed
- THEN the command exits non-zero
- AND a diagnostic explains that spec mapping inputs are unavailable

### Requirement: cli-verify-spec-mappings-audits-mapping-coverage
The system MUST audit mapping coverage across main spec mapping fields and
report diagnostics when mapping coverage is incomplete.

#### Scenario: mapped implementation and tests produce no coverage diagnostics
- GIVEN each main spec has mapping frontmatter with non-empty implementation and
  test path collections
- WHEN `strict-spec-driven verify-spec-mappings` is executed
- THEN mapping-coverage diagnostics are not emitted

#### Scenario: missing mapping coverage produces diagnostics
- GIVEN a main spec omits mapping frontmatter or has an empty implementation or
  test mapping collection
- WHEN `strict-spec-driven verify-spec-mappings` is executed
- THEN a diagnostic is emitted identifying the spec path and missing coverage

### Requirement: cli-verify-spec-mappings-audits-unmapped-evidence
The system MUST audit unmapped repository evidence by reporting implementation
or test files that are not referenced by any spec mapping entry.

#### Scenario: fully mapped repository evidence produces no unmapped diagnostics
- GIVEN relevant implementation and test files are each referenced by at least
  one spec mapping entry
- WHEN `strict-spec-driven verify-spec-mappings` is executed
- THEN unmapped-evidence diagnostics are not emitted

#### Scenario: unmapped evidence produces diagnostics
- GIVEN at least one relevant implementation or test file is not referenced by
  any spec mapping entry
- WHEN `strict-spec-driven verify-spec-mappings` is executed
- THEN a diagnostic is emitted identifying each unmapped file path

### Requirement: cli-verify-spec-mappings-emits-deterministic-json-output
The system MUST emit deterministic JSON output for mapping audit results,
including validity, diagnostics, and mapping summary counts.

#### Scenario: output is parseable JSON
- GIVEN `strict-spec-driven verify-spec-mappings` completes
- WHEN command stdout is parsed as JSON
- THEN the JSON includes `valid` as a boolean
- AND the JSON includes `diagnostics` as an array
- AND the JSON includes summary counts for mapped and unmapped evidence

#### Scenario: exit status reflects diagnostic validity
- GIVEN mapping diagnostics are present
- WHEN `strict-spec-driven verify-spec-mappings` is executed
- THEN the command exits non-zero

#### Scenario: successful audit exits zero
- GIVEN no mapping diagnostics are present
- WHEN `strict-spec-driven verify-spec-mappings` is executed
- THEN the command exits with exit code zero

### Requirement: cli-archive-reads-active-change-artifacts
The system MUST provide an `archive` subcommand that reads planning artifacts and delta specs from a named active strict change directory under `.strict-spec-driven/changes/<name>/`.

#### Scenario: archive locates artifacts for an existing change
- GIVEN `.strict-spec-driven/changes/<name>/` exists with proposal, design, tasks, questions, and delta spec files
- WHEN `strict-spec-driven archive <name>` is executed
- THEN the command reads the change artifacts needed for archive processing

#### Scenario: archive rejects missing change
- GIVEN `.strict-spec-driven/changes/<name>/` does not exist
- WHEN `strict-spec-driven archive <name>` is executed
- THEN the command exits non-zero
- AND an error message is written to stderr indicating the change was not found

### Requirement: cli-archive-requires-verified-change-state
The system MUST block archive when the named active change has incomplete tasks, open questions, or validation diagnostics.

#### Scenario: archive rejects incomplete or unresolved change state
- GIVEN a strict change has at least one pending task or at least one open question
- WHEN `strict-spec-driven archive <name>` is executed
- THEN the command exits non-zero
- AND the change remains in the active changes directory

#### Scenario: archive rejects schema-invalid change artifacts
- GIVEN a strict change contains an artifact that fails strict schema validation
- WHEN `strict-spec-driven archive <name>` is executed
- THEN the command exits non-zero
- AND the archive move is not performed

### Requirement: cli-archive-merges-delta-specs-into-main-specs
The system MUST merge delta specs from the archived change into their corresponding main strict specs using stable requirement identifiers and explicit ADDED, MODIFIED, and REMOVED operations.

#### Scenario: archive applies added and modified operations
- GIVEN a strict change includes delta specs with ADDED and MODIFIED entries targeting existing strict main specs
- WHEN `strict-spec-driven archive <name>` is executed
- THEN ADDED requirements are appended to the target specs
- AND MODIFIED requirements replace the targeted requirements by stable requirement identifier

#### Scenario: archive applies removed operations
- GIVEN a strict change includes delta specs with REMOVED entries targeting existing requirements
- WHEN `strict-spec-driven archive <name>` is executed
- THEN targeted requirements are removed from the target main specs

### Requirement: cli-archive-applies-missing-target-merge-rules
The system MUST apply deterministic missing-target merge rules during archive processing.

#### Scenario: missing modified target is treated as added
- GIVEN a delta MODIFIED entry targets a requirement ID missing from the target main spec at archive time
- WHEN `strict-spec-driven archive <name>` is executed
- THEN the replacement requirement is merged as an added requirement
- AND the fallback outcome is recorded in the archive merge report

#### Scenario: missing removed target is skipped
- GIVEN a delta REMOVED entry targets a requirement ID missing from the target main spec at archive time
- WHEN `strict-spec-driven archive <name>` is executed
- THEN the removal is skipped
- AND the skipped removal is recorded in the archive merge report

### Requirement: cli-archive-moves-change-to-date-prefixed-archive
The system MUST move a successfully archived change from the active changes directory to `.strict-spec-driven/changes/archive/<YYYY-MM-DD>-<name>/` using local date naming.

#### Scenario: successful archive move uses date-prefixed destination
- GIVEN `strict-spec-driven archive <name>` completes merge successfully
- WHEN archive move behavior is evaluated
- THEN the active change directory is removed from `.strict-spec-driven/changes/`
- AND the change is present at `.strict-spec-driven/changes/archive/<YYYY-MM-DD>-<name>/`

#### Scenario: archive destination collisions use deterministic suffixes
- GIVEN `.strict-spec-driven/changes/archive/<YYYY-MM-DD>-<name>/` already exists
- WHEN `strict-spec-driven archive <name>` completes merge successfully
- THEN the archived change uses the next available destination suffix
- AND the existing archive directory is preserved

### Requirement: cli-archive-regenerates-spec-index-after-merge
The system MUST regenerate strict specs index artifacts after archive merge writes updated main strict specs.

#### Scenario: specs index reflects merged spec state
- GIVEN archive merges one or more delta specs into main strict specs
- WHEN `strict-spec-driven archive <name>` completes
- THEN the strict specs index is regenerated from the resulting spec state
- AND index entries remain aligned with the available main strict spec files

### Requirement: cli-archive-emits-deterministic-json-output
The system MUST emit deterministic JSON to stdout describing archive validity, merge outcomes, and archive destination details.

#### Scenario: archive output is parseable json
- GIVEN `strict-spec-driven archive <name>` completes
- WHEN command stdout is parsed as JSON
- THEN the output includes archive validity state
- AND the output includes merged, skipped, and conflict/fallback outcome summaries when present
- AND the output includes the archive destination path

### Requirement: cli-list-reports-active-and-archived-strict-changes
The system MUST provide a `list` subcommand that reports active and archived
strict changes from `.strict-spec-driven/changes/`.

#### Scenario: list reports active changes
- GIVEN one or more active strict change directories exist under
  `.strict-spec-driven/changes/`
- WHEN `strict-spec-driven list` is executed
- THEN the command output includes active change names
- AND each active change includes a status summary derived from strict planning
  artifacts

#### Scenario: list reports archived changes
- GIVEN one or more archived strict change directories exist under
  `.strict-spec-driven/changes/archive/`
- WHEN `strict-spec-driven list` is executed
- THEN the command output includes archived directory names

#### Scenario: list handles empty state
- GIVEN no active and no archived strict changes exist
- WHEN `strict-spec-driven list` is executed
- THEN the command reports that no changes are present

### Requirement: cli-modify-reports-strict-artifact-paths
The system MUST provide a `modify` subcommand that reports editable strict
artifact paths for the selected change.

#### Scenario: modify with no argument lists active changes
- GIVEN one or more active strict changes exist
- WHEN `strict-spec-driven modify` is executed without a change target
- THEN the command lists active changes with status summaries

#### Scenario: modify reports active change artifacts
- GIVEN `.strict-spec-driven/changes/<name>/` exists
- WHEN `strict-spec-driven modify <name>` is executed
- THEN the command output lists `proposal.yaml`, `design.yaml`, `tasks.yaml`,
  `questions.yaml`, and the `specs/` delta spec paths for that change

#### Scenario: modify reports archived change artifacts by exact directory name
- GIVEN `.strict-spec-driven/changes/archive/<archive-dir>/` exists
- WHEN `strict-spec-driven modify <archive-dir>` is executed with the exact
  archive directory name
- THEN the command output lists the strict planning artifact and delta spec
  paths for the archived change

#### Scenario: modify rejects archived bare-name ambiguity
- GIVEN archived changes exist whose directories use `YYYY-MM-DD-<name>`
- WHEN `strict-spec-driven modify <name>` is executed without the date prefix
- THEN the command exits non-zero
- AND the error explains that archived targets require exact archive directory
  names

### Requirement: cli-cancel-removes-active-strict-changes-only
The system MUST provide a `cancel` subcommand that removes active strict changes
and rejects archived change targets.

#### Scenario: cancel removes an active change
- GIVEN `.strict-spec-driven/changes/<name>/` exists
- WHEN `strict-spec-driven cancel <name>` is executed
- THEN the active change directory is removed
- AND command output confirms cancellation

#### Scenario: cancel rejects archived target
- GIVEN `.strict-spec-driven/changes/archive/<archive-dir>/` exists
- WHEN `strict-spec-driven cancel <archive-dir>` is executed
- THEN the command exits non-zero
- AND the archived directory remains unchanged
- AND the error explains that cancel is limited to active changes

### Requirement: cli-review-reads-active-change-artifacts
The system MUST provide a `review` subcommand that reads all strict YAML change artifacts (proposal.yaml, design.yaml, tasks.yaml, questions.yaml, and any delta spec files under `specs/`) from a named active change directory under `.strict-spec-driven/changes/<name>/`.

#### Scenario: review locates artifacts for an existing change
- GIVEN `.strict-spec-driven/changes/<name>/` exists with planning artifacts
- WHEN `strict-spec-driven review <name>` is executed
- THEN the command reads and parses each planning artifact from the change directory

#### Scenario: review rejects missing change
- GIVEN `.strict-spec-driven/changes/<name>/` does not exist
- WHEN `strict-spec-driven review <name>` is executed
- THEN the command exits non-zero
- AND an error message is written to stderr indicating the change was not found

### Requirement: cli-review-reports-code-quality-findings
The system MUST report advisory code-quality findings across `requirement-quality`, `mapping-coverage`, `delta-coherence`, and `proposal-clarity` categories without duplicating or replacing verify lifecycle gates.

#### Scenario: review findings are advisory only
- GIVEN a strict change has verify diagnostics
- WHEN `strict-spec-driven review <name>` is executed
- THEN review finding output is separate from verify diagnostic output
- AND verify lifecycle gates are not re-evaluated as review findings

#### Scenario: review reports findings in structured categories
- GIVEN a strict change has reviewable artifacts
- WHEN `strict-spec-driven review <name>` is executed
- THEN each finding includes a fixed category string, message, and optional path

### Requirement: cli-review-emits-deterministic-json-output
The system MUST emit a deterministic JSON object to stdout containing `valid`, `changeName`, `findings`, and `findingCount`.

#### Scenario: review output is parseable json
- GIVEN `strict-spec-driven review <name>` completes
- WHEN command stdout is parsed as JSON
- THEN the JSON includes `valid` as a boolean
- AND the JSON includes `changeName` as a string
- AND the JSON includes `findings` as an array
- AND the JSON includes `findingCount` as a number

#### Scenario: review exits zero when findings are advisory
- GIVEN a strict change has code-quality findings but no input errors
- WHEN `strict-spec-driven review <name>` is executed
- THEN the command exits with exit code zero

#### Scenario: review exits non-zero on input error
- GIVEN the named change directory does not exist or an artifact is unparseable
- WHEN `strict-spec-driven review <name>` is executed
- THEN the command exits with a non-zero exit code

### Requirement: cli-skill-packaging-validation-smoke-coverage
The system MUST include automated checks that exercise strict skill packaging
validation behavior for both passing and failing package states.

#### Scenario: packaging checks confirm valid strict package state
- GIVEN strict skill packages satisfy metadata, command reference, and symlink
  assumptions
- WHEN repository automated checks are executed
- THEN strict skill packaging checks pass

#### Scenario: packaging checks report deterministic diagnostics for invalid state
- GIVEN a strict skill package has stale naming, missing required metadata, or
  broken symlink assumptions
- WHEN repository automated checks are executed
- THEN strict skill packaging checks fail
- AND diagnostics remain machine-readable and path-specific

#### Scenario: validate-skills command emits machine-readable results
- GIVEN strict skill packaging validation is executed through CLI
- WHEN `strict-spec-driven validate-skills` runs
- THEN command output is parseable JSON
- AND output includes validity, deterministic diagnostics, and summary counts

### Requirement: cli-installation-and-packaging-smoke-coverage
The system MUST include automated checks that exercise strict skill
installation and uninstallation surfaces together with packaged skill layout
expectations.

#### Scenario: install smoke checks confirm packaged strict skills remain usable
- GIVEN strict skill packages expose the expected bundled `scripts` and
  `templates` symlinks
- WHEN repository automated install smoke checks are executed
- THEN install registration succeeds for the selected scope
- AND the packaged strict skills keep resolving bundled scripts and templates
  through the registered source-repository layout

#### Scenario: uninstall smoke checks remove strict registration cleanly
- GIVEN strict skills were registered through the repository install surface
- WHEN repository automated uninstall smoke checks are executed
- THEN the registered strict skills are removed for the selected scope
- AND the smoke checks do not require manual cleanup of copied package files

#### Scenario: install smoke checks report deterministic diagnostics for invalid package state
- GIVEN a strict skill package has broken bundled symlinks or stale legacy
  install naming assumptions
- WHEN repository automated install or packaging smoke checks are executed
- THEN the checks fail
- AND diagnostics remain machine-readable and path-specific

### Requirement: cli-core-skill-content-validation-smoke-coverage
The system MUST include automated checks that exercise strict core lifecycle
skill content for both passing and failing states, not only package-shape
validation.

#### Scenario: automated checks accept aligned core skill content
- GIVEN the strict core lifecycle skills contain explicit strict command
  mappings and `.strict-spec-driven/` workflow guidance
- WHEN repository automated checks are executed
- THEN the core skill content checks pass

#### Scenario: automated checks reject placeholder core skill content
- GIVEN a strict core lifecycle skill keeps a generic placeholder command block
  or omits required strict workflow guidance
- WHEN repository automated checks are executed
- THEN the core skill content checks fail
- AND diagnostics identify the failing skill package deterministically

### Requirement: cli-planning-skill-content-validation-smoke-coverage
The system MUST include automated checks that exercise strict planning and
documentation skill content for both passing and failing states, not only
package-shape validation.

#### Scenario: automated checks accept aligned planning skill content
- GIVEN the strict planning and documentation skills contain explicit strict
  command mappings and `.strict-spec-driven/` workflow guidance
- WHEN repository automated checks are executed
- THEN the planning skill content checks pass

#### Scenario: automated checks reject placeholder planning skill content
- GIVEN a strict planning or documentation skill keeps a generic placeholder
  command block or omits required strict workflow guidance
- WHEN repository automated checks are executed
- THEN the planning skill content checks fail
- AND diagnostics identify the failing skill package deterministically

### Requirement: cli-migration-skill-content-validation-smoke-coverage
The system MUST include automated checks that exercise strict migration skill
content for both passing and failing states, not only generic package-shape
validation.

#### Scenario: automated checks accept aligned migration skill content
- GIVEN the strict migration skill contains explicit strict command mappings and
  `.strict-spec-driven/` migration guidance
- WHEN repository automated checks are executed
- THEN the migration skill content checks pass

#### Scenario: automated checks reject placeholder migration skill content
- GIVEN the strict migration skill keeps a generic placeholder command block or
  omits required migration guidance
- WHEN repository automated checks are executed
- THEN the migration skill content checks fail
- AND diagnostics identify the failing skill package deterministically

### Requirement: cli-migrate-converts-bootstrap-workflow-state
The system MUST provide a `migrate` subcommand that reads legacy `.spec-driven/` workflow state and migrates supported bootstrap config, main specs, delta specs, active and archived change artifacts, roadmap index, roadmap milestones, and the specs index into strict YAML output under `.strict-spec-driven/`, initializes any remaining required strict scaffold assets, and reports only unsupported or ambiguous legacy artifacts as manual follow-up items.

#### Scenario: migrate converts legacy specs and change artifacts into strict workflow state
- GIVEN legacy main specs, delta specs, and active or archived changes exist
  under `.spec-driven/`
- AND no unsafe strict target conflict blocks execution
- WHEN `strict-spec-driven migrate` is executed
- THEN the command writes strict YAML spec and change artifacts under
  `.strict-spec-driven/`
- AND the command updates the strict spec index to reference the migrated main
  spec outputs
- AND the migrated artifacts preserve the stable identifiers, mappings, task
  state, question state, and archive-date behavior required by the strict
  workflow
- AND the source `.spec-driven/` artifacts remain unchanged

### Requirement: cli-migrate-converts-roadmap-and-project-state
The system MUST convert legacy `.spec-driven/roadmap/` Markdown artifacts and the legacy specs index into strict YAML equivalents during a `migrate` run, writing results under `.strict-spec-driven/roadmap/` and the strict specs index path.

#### Scenario: migrate converts roadmap index and milestones
- GIVEN legacy `roadmap/INDEX.md` and one or more `roadmap/milestones/*.md` files exist under `.spec-driven/`
- WHEN `strict-spec-driven migrate` is executed
- THEN the roadmap index is written as a strict YAML artifact under `.strict-spec-driven/roadmap/`
- AND each milestone file is converted to a strict YAML milestone artifact preserving goal, scope, done criteria, dependencies, risks, notes, status, and planned change entries
- AND the converted artifacts appear in the migration report as converted entries

#### Scenario: migrate converts specs index
- GIVEN a legacy `specs/INDEX.md` exists under `.spec-driven/`
- WHEN `strict-spec-driven migrate` is executed
- THEN the specs index is written as a strict YAML artifact under `.strict-spec-driven/specs/`
- AND the converted artifact appears in the migration report as a converted entry

#### Scenario: unsupported roadmap Markdown shape becomes manual follow-up
- GIVEN a legacy roadmap artifact has a Markdown structure that cannot be deterministically mapped to strict YAML fields
- WHEN `strict-spec-driven migrate` is executed
- THEN the artifact appears in the migration report as a manual follow-up item
- AND no strict YAML output is invented for that artifact

### Requirement: cli-migrate-enforces-preflight-and-overwrite-protection
The system MUST reject migration runs that cannot proceed safely and report the
blocking preflight or overwrite-protection reason deterministically.

#### Scenario: migrate rejects unsafe strict target overwrite
- GIVEN `.strict-spec-driven/` already contains conflicting workflow state
- AND no explicit safe rerun policy allows overwriting that state
- WHEN `strict-spec-driven migrate` is executed
- THEN the command exits non-zero
- AND the result identifies the overwrite-protection conflict
- AND existing strict target files are left unchanged

#### Scenario: migrate rejects missing legacy source state
- GIVEN supported legacy workflow artifacts are not present under `.spec-driven/`
- WHEN `strict-spec-driven migrate` is executed
- THEN the command exits non-zero
- AND the result identifies the missing bootstrap source state

### Requirement: cli-migrate-emits-structured-report-output
The system MUST emit a structured migration report for each migration run so
the operator can review converted core workflow artifacts, remaining deferred
artifacts, failures, warnings, and manual follow-up items.

#### Scenario: migrate report distinguishes converted core workflow artifacts from deferred artifacts
- GIVEN `strict-spec-driven migrate` converts supported core workflow artifacts
  while roadmap or project-state converters are still pending
- WHEN the migration result is inspected
- THEN converted spec and change artifacts appear in converted entries with
  their strict target paths
- AND unsupported roadmap or project-state artifacts remain identifiable
  through skipped entries or manual follow-up items with source references

### Requirement: cli-migrate-force-rerun
The system MUST allow `strict-spec-driven migrate` to rerun into an existing non-empty `.strict-spec-driven/` directory only when the operator explicitly passes `--force` or `-f`.

#### Scenario: rerun without force stays blocked
- GIVEN `strict-spec-driven migrate` already populated `.strict-spec-driven/`
- WHEN the operator runs `strict-spec-driven migrate` again without `--force`
- THEN the command exits non-zero
- AND the result identifies the strict target conflict

#### Scenario: rerun with force reuses the same structured output
- GIVEN `strict-spec-driven migrate` already populated `.strict-spec-driven/`
- WHEN the operator runs `strict-spec-driven migrate --force`
- THEN the command exits zero
- AND the result matches the structured migration report from the initial successful run

#### Scenario: short force flag reruns migration
- GIVEN `strict-spec-driven migrate` already populated `.strict-spec-driven/`
- WHEN the operator runs `strict-spec-driven migrate -f`
- THEN the command exits zero
- AND the result matches the structured migration report from the initial successful run

### Requirement: cli-migrate-report-collections-are-always-arrays
The system MUST emit `converted`, `skipped`, `warnings`, `errors`, and `manualFollowUp` as top-level array fields in every migration report, including successful, partial, and blocked runs.

#### Scenario: successful migration keeps warning collections explicit
- GIVEN a migration run converts all supported artifacts without deferred legacy spec files
- WHEN the migration report is inspected
- THEN `warnings` is present as an array
- AND `manualFollowUp` is present as an array

#### Scenario: partial migration keeps deferred collections explicit
- GIVEN a migration run converts supported artifacts while deferring ambiguous legacy spec files
- WHEN the migration report is inspected
- THEN `skipped` is present as an array
- AND `warnings` is present as an array
- AND `manualFollowUp` is present as an array

#### Scenario: blocked migration keeps report collections explicit
- GIVEN a migration run is blocked before conversion completes
- WHEN the migration report is inspected
- THEN `converted` is present as an array
- AND `skipped` is present as an array
- AND `warnings` is present as an array
- AND `errors` is present as an array
- AND `manualFollowUp` is present as an array

### Requirement: cli-migrate-supports-repository-self-hosting
The system MUST allow a repository's actual bootstrap `.spec-driven/` workflow
state to be migrated into `.strict-spec-driven/` output that is usable as the
repository's active strict workflow state without rewriting the preserved
bootstrap source artifacts.

#### Scenario: self-host cutover migrates repository workflow state
- GIVEN a repository contains bootstrap specs, roadmap artifacts, and archived
  or active changes under `.spec-driven/`
- WHEN `strict-spec-driven migrate` is executed for the repository cutover
- THEN the command writes corresponding strict YAML workflow state under
  `.strict-spec-driven/`
- AND the migrated output preserves the identities and relationships needed by
  strict workflow commands
- AND the source `.spec-driven/` artifacts remain unchanged

#### Scenario: self-host cutover normalizes blank legacy mappings
- GIVEN a legacy archived delta leaves `mapping.implementation` or
  `mapping.tests` blank in Markdown frontmatter
- WHEN `strict-spec-driven migrate` is executed for the repository cutover
- THEN the migrated strict delta keeps those mapping fields as empty structured
  path collections
- AND the change is not deferred only because the legacy mapping fields were
  blank

#### Scenario: roadmap-status accepts migrated roadmap index paths
- GIVEN `strict-spec-driven migrate` has produced strict roadmap state for the
  repository cutover
- WHEN `strict-spec-driven roadmap-status` reads the migrated strict roadmap
- THEN migrated milestone paths resolve without reference diagnostics
- AND roadmap status validation succeeds against the migrated roadmap index

### Requirement: cli-ship-reads-archived-change
The system MUST provide a `ship` subcommand that resolves a named archived change under `.strict-spec-driven/changes/archive/` and reads its proposal summary, supporting both exact archive directory names and bare change names expanded via date-prefix matching.

#### Scenario: ship resolves exact archive directory name
- GIVEN `.strict-spec-driven/changes/archive/<YYYY-MM-DD>-<name>/` exists
- WHEN `strict-spec-driven ship <YYYY-MM-DD>-<name>` is executed
- THEN the command reads the archived change artifacts from that directory

#### Scenario: ship expands bare name to date-prefixed archive directory
- GIVEN `.strict-spec-driven/changes/archive/<YYYY-MM-DD>-<name>/` exists
- WHEN `strict-spec-driven ship <name>` is executed with the bare change name
- THEN the command resolves the archived directory by date-prefix expansion and reads its artifacts

#### Scenario: ship reports ambiguity when multiple date-prefixed matches exist
- GIVEN multiple archive directories matching `*-<name>` exist under `.strict-spec-driven/changes/archive/`
- WHEN `strict-spec-driven ship <name>` is executed with the bare name
- THEN the command exits non-zero
- AND the error message lists the matching archive directories and asks the operator to specify the full archive directory name

#### Scenario: ship rejects missing archived change
- GIVEN no matching archived directory exists for the given name
- WHEN `strict-spec-driven ship <name>` is executed
- THEN the command exits non-zero
- AND an error message is written to stderr indicating the archived change was not found

### Requirement: cli-ship-emits-deterministic-json-output
The system MUST emit a deterministic JSON object to stdout from the `ship` subcommand containing `changeName`, `archivePath`, `proposalSummary`, and `roadmapSnapshot`.

#### Scenario: ship output is parseable JSON
- GIVEN `strict-spec-driven ship <name>` resolves a valid archived change
- WHEN command stdout is parsed as JSON
- THEN the JSON includes `changeName` as a string
- AND the JSON includes `archivePath` as the resolved archive directory path
- AND the JSON includes `proposalSummary` derived from the archived `proposal.yaml`
- AND the JSON includes `roadmapSnapshot` reflecting current roadmap milestone and planned change state

#### Scenario: ship exits zero for a valid archived change
- GIVEN a named archived change exists and its artifacts are readable
- WHEN `strict-spec-driven ship <name>` is executed
- THEN the command exits with exit code zero

### Requirement: cli-ship-skill-content-validation-smoke-coverage
The system MUST include automated checks that exercise strict ship skill content for both passing and failing states, not only package-shape validation.

#### Scenario: automated checks accept aligned ship skill content
- GIVEN `strict-spec-ship/SKILL.md` contains an explicit `ship` command reference and `.strict-spec-driven/` workflow guidance
- WHEN repository automated checks are executed
- THEN the ship skill content checks pass

#### Scenario: automated checks reject placeholder ship skill content
- GIVEN `strict-spec-ship/SKILL.md` retains a generic placeholder command block or omits `.strict-spec-driven/` workflow guidance
- WHEN repository automated checks are executed
- THEN the ship skill content checks fail
- AND diagnostics identify the failing skill package deterministically
