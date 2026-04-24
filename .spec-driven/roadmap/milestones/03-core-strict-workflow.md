# 03 Core Strict Workflow

## Goal
Finish the strict workflow lifecycle under `.strict-spec-driven/` so active changes can move from propose through archive with deterministic YAML validation, reporting, and merge behavior.

## In Scope
- Port the core lifecycle commands for propose, apply, verify, archive, list, modify, cancel, review, and spec-mapping validation where needed.
- Implement or update strict YAML templates, merge utilities, validation routines, and tests for the lifecycle.
- Use YAML artifacts for proposals, designs, tasks, questions, specs, deltas, and indexes instead of Markdown-generated workflow state.
- Preserve reference lifecycle semantics: propose creates a change directory, apply reports task state, verify reports JSON diagnostics, archive moves completed changes into date-prefixed archive directories, and cancel removes active changes.
- Merge YAML delta specs back into main YAML specs during archive using stable requirement, scenario, and mapping identifiers.
- Enforce task completion, unresolved question handling, explicit runnable lint or validation tasks, explicit runnable unit test tasks, spec validation gates, mapping coverage, and active versus archived change state.
- Regenerate specs indexes from structured YAML metadata rather than Markdown headings.

## Out of Scope
- Roadmap-specific command migration.
- Legacy Markdown migration.
- Installation packaging and user-facing documentation outside the core lifecycle.
- Maintenance automation and ship behavior beyond what the core lifecycle exposes.

## Done Criteria
- A normal strict workflow can run from propose through archive using only YAML artifacts under `.strict-spec-driven/`.
- Verification blocks invalid schemas, incomplete tasks, unresolved questions, missing explicit lint or validation tasks, missing explicit unit test tasks, invalid mappings, malformed deltas, and unsupported delta operations.
- Archive merges YAML deltas into main YAML specs deterministically, preserves stable identifiers, and regenerates specs indexes.
- Modify can locate active changes and print the relevant artifact paths for editing.
- List can report active and archived changes from `.strict-spec-driven/changes/`.
- List, modify, cancel, review, and spec-mapping validation work against active and archived strict changes with automated test coverage.
- Tests cover happy path, incomplete tasks, unresolved questions, invalid mappings, malformed deltas, archive conflicts, and cancel behavior.

## Planned Changes
- `port-propose-to-yaml` - Declared: complete - implement the `propose` subcommand to generate `.strict-spec-driven/changes/<name>/proposal.yaml`, `design.yaml`, `tasks.yaml`, `questions.yaml`, and mirrored YAML delta spec directories from strict templates.
- `port-apply-to-yaml-tasks` - Declared: complete - implement the `apply` subcommand to read and update `tasks.yaml`, preserve one-task-at-a-time completion semantics, and emit machine-readable task status JSON.
- `port-verify-to-yaml` - Declared: complete - implement the `verify` subcommand to validate YAML artifacts, task status, open questions, explicit test commands, mappings, delta operations, and spec alignment with actionable diagnostics.
- `port-archive-to-yaml-merge` - Declared: complete - implement archive merge utilities that apply YAML delta specs to main YAML specs, regenerate specs indexes, move completed changes into date-prefixed archive directories, and preserve stable identifiers.
- `port-list-modify-cancel-to-yaml` - Declared: complete - implement `list`, `modify`, and `cancel` subcommands for active and archived `.strict-spec-driven/changes/` YAML artifacts, including path output for agent editing.
- `port-review-to-yaml` - Declared: complete - implement review support that reads strict YAML proposals, designs, tasks, questions, deltas, mappings, and verification evidence and reports code-quality findings.
- `port-spec-mapping-validation-commands` - Declared: complete - implement `verify-spec-mappings`, mapping coverage audits, and unmapped evidence audits against structured YAML spec mapping fields.

## Dependencies
- `01-yaml-contracts-and-naming` must define stable identifiers and delta operation semantics before archive merge is implemented.
- `02-strict-cli-foundation` must provide the validation layer, strict scaffold, and bundled templates.

## Risks
- Delta merge behavior may become ambiguous if YAML artifacts do not preserve stable requirement and scenario identifiers end to end.
- Verification could miss behavior drift if mapping validation is not enforced consistently across strict commands.
- Archive and list behavior can break later roadmap sync if active and archived change names are not normalized exactly once.

## Status
- Declared: complete

## Notes
- `propose`, `apply`, and `verify` are already archived from this milestone; the remaining work is to close the lifecycle loop and the supporting validation surface.
- Keeping this milestone separate makes the dependency chain explicit for every later skill, roadmap, migration, and self-hosting milestone.
- Every planned change in this milestone must leave behind runnable CLI behavior and tests, not only updated requirements.
- Reference validation currently checks testing tasks for explicit lint or validation and unit test commands; the strict workflow should preserve that quality gate in structured task entries.
- Reference archive behavior uses local dates for archive directory names and reconciles roadmap after archive; the core strict archive should expose enough state for the roadmap milestone to preserve that behavior.
- Change-creation guardrail: `port-archive-to-yaml-merge` owns delta merge semantics, archive directory naming, archive move behavior, and specs index regeneration, but it does not own roadmap CLI UX or Markdown migration conversion.
- Change-creation guardrail: `port-list-modify-cancel-to-yaml` owns active or archived change discovery and artifact path output; review findings stay in `port-review-to-yaml`, and mapping audits stay in `port-spec-mapping-validation-commands`.
- Change-creation guardrail: `port-review-to-yaml` should consume strict artifacts and verification evidence to report review findings, but it should not silently redefine verify gates that belong to `port-verify-to-yaml`.
