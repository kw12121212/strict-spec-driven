---
mapping:
  implementation:
    - src/verify.ts
    - src/strict-spec-cli.ts
  tests:
    - test/run.ts
---

## ADDED Requirements

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
