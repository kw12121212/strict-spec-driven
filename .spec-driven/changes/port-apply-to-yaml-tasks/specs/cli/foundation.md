---
mapping:
  implementation:
    - src/apply.ts
    - src/strict-spec-cli.ts
  tests:
    - test/run.ts
---

## ADDED Requirements

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
