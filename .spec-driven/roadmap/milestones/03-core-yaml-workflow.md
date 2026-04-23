# 03 Core YAML Workflow

## Goal
Port the main spec-driven lifecycle to strict YAML artifacts under `.strict-spec-driven/`.

## In Scope
- Port propose, apply, verify, review, archive, list, modify, and cancel behavior where needed for the core lifecycle.
- Use YAML artifacts for proposals, designs, tasks, questions, specs, deltas, and indexes.
- Preserve reference lifecycle semantics: propose creates a change directory, apply reports task state, verify reports JSON diagnostics, archive moves completed changes into date-prefixed archive directories, and cancel removes active changes.
- Merge YAML delta specs back into main YAML specs during archive using stable requirement, scenario, and mapping identifiers.
- Enforce task completion, unresolved question handling, explicit runnable test tasks, spec validation gates, mapping coverage, and active/archive state.
- Regenerate specs indexes from YAML metadata rather than Markdown headings.

## Out of Scope
- Roadmap-specific command migration.
- Legacy Markdown migration.
- Full installation packaging.
- Maintenance automation and ship behavior beyond preserving compatibility with their future strict ports.

## Done Criteria
- A normal strict workflow can run from propose through archive using YAML files.
- Verification blocks invalid YAML schemas, incomplete tasks, unresolved questions, missing explicit lint or validation tasks, missing explicit unit test tasks, invalid mappings, malformed deltas, and unsupported delta operations.
- Archive merges YAML deltas into main YAML specs deterministically and updates specs indexes without losing requirement or scenario IDs.
- Modify can locate active changes and print the relevant artifact paths for editing.
- List can report active and archived changes from `.strict-spec-driven/changes/`.
- Tests cover happy path, incomplete tasks, unresolved questions, invalid mappings, malformed deltas, archive conflicts, and cancel behavior.

## Planned Changes
- `port-propose-to-yaml` - Declared: planned - create strict YAML proposal, design, tasks, questions, and delta spec directories from a kebab-case change name.
- `port-apply-to-yaml-tasks` - Declared: planned - read and update `tasks.yaml` while preserving one-task-at-a-time completion semantics and machine-readable task status output.
- `port-verify-to-yaml` - Declared: planned - validate YAML artifacts, task status, open questions, explicit test commands, mappings, delta operations, and spec alignment.
- `port-archive-to-yaml-merge` - Declared: planned - merge YAML delta specs into main YAML specs, update specs indexes, and archive completed changes under date-prefixed directories.
- `port-core-utility-commands` - Declared: planned - update list, modify, cancel, and review support for `.strict-spec-driven/` YAML artifacts.

## Dependencies
- `02-strict-cli-foundation` must provide the validation layer and strict scaffold.
- `01-yaml-contracts-and-naming` must define stable IDs and delta operation semantics before archive merge is implemented.

## Risks
- Delta merge behavior may become ambiguous if the YAML schema does not identify requirements and scenarios with stable IDs.
- Verification could miss behavior drift if YAML mappings are not enforced consistently.
- Replacing Markdown frontmatter with YAML artifacts could accidentally weaken mapping validation unless implementation and test paths remain explicit structured fields.
- Archive and list behavior can break roadmap sync later if active and archived change names are not normalized exactly once.

## Status
- Declared: proposed

## Notes
- This milestone should keep the first working loop narrow before adding roadmap and migration features.
- Reference validation currently checks testing tasks for explicit lint or validation and unit test commands; the strict workflow should preserve that quality gate in structured task entries.
- Reference archive behavior uses local dates for archive directory names and reconciles roadmap after archive; the core strict archive should expose enough state for the roadmap milestone to preserve that behavior.
