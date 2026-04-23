# Core YAML Workflow

## Goal
Port the main spec-driven lifecycle to strict YAML artifacts under `.strict-spec-driven/`.

## In Scope
- Port propose, apply, verify, review, archive, list, modify, and cancel behavior where needed for the core lifecycle.
- Use YAML artifacts for proposals, designs, tasks, questions, specs, deltas, and indexes.
- Merge YAML delta specs back into main YAML specs during archive.
- Enforce task completion, unresolved question handling, and spec validation gates.

## Out of Scope
- Roadmap-specific command migration.
- Legacy Markdown migration.
- Full installation packaging.

## Done Criteria
- A normal strict workflow can run from propose through archive using YAML files.
- Verification blocks invalid YAML schemas, incomplete tasks, unresolved questions, and malformed deltas.
- Archive merges YAML deltas into main YAML specs deterministically.
- Tests cover happy path and representative validation failures.

## Planned Changes
- `port-propose-to-yaml` - Declared: planned - create strict YAML change artifacts and delta spec files from a change name.
- `port-apply-to-yaml-tasks` - Declared: planned - read and update `tasks.yaml` while preserving one-task-at-a-time completion semantics.
- `port-verify-to-yaml` - Declared: planned - validate YAML artifacts, task status, questions, mappings, and spec alignment.
- `port-archive-to-yaml-merge` - Declared: planned - merge YAML delta specs into main YAML specs and archive completed changes.
- `port-core-utility-commands` - Declared: planned - update list, modify, cancel, and review support for `.strict-spec-driven/` YAML artifacts.

## Dependencies
- `strict-cli-foundation` must provide the validation layer and strict scaffold.

## Risks
- Delta merge behavior may become ambiguous if the YAML schema does not identify requirements and scenarios with stable IDs.
- Verification could miss behavior drift if YAML mappings are not enforced consistently.

## Status
- Declared: proposed

## Notes
- This milestone should keep the first working loop narrow before adding roadmap and migration features.
