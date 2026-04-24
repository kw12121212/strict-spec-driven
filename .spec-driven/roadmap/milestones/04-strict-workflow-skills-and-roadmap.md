# 04 Strict Workflow Skills And Roadmap

## Goal
Unify the agent-facing skill surface and the roadmap workflow around the strict YAML lifecycle so planning, execution, and recommendation all operate on the same command set and artifact contracts.

## In Scope
- Rename and update spec and roadmap skills to the `strict-spec-*` and `strict-roadmap-*` families.
- Port roadmap schemas, CLI commands, recommendation flow, proposal handoff, installation metadata, and validation checks for the strict workflow.
- Update `SKILL.md` packages so they read and write `.strict-spec-driven/` YAML artifacts while preserving Markdown packaging requirements.
- Keep installation, symlink layout, and stale-reference validation consistent across both skill families.
- Preserve reference skill responsibilities: agents handle planning, judgment, editing, review, and archive-merge decisions while scripts handle deterministic filesystem and validation mechanics.
- Preserve roadmap size limits, planned change status rules, declared milestone statuses, active and archived change detection, derived completion semantics, and explicit two-digit milestone ordering.
- Ensure roadmap proposal handoff turns one planned change into a normal strict change scaffold without duplicating planning metadata.

## Out of Scope
- Finishing the core lifecycle commands that milestone 03 still owns.
- Legacy Markdown migration tooling.
- Public documentation, maintenance automation, and ship behavior.
- Repository self-hosting of the migrated strict workflow state.

## Done Criteria
- Core `strict-spec-*` and `strict-roadmap-*` skills exist with correct command names, YAML artifact references, and bundled script assumptions.
- Roadmap artifacts and commands operate from `.strict-spec-driven/roadmap/` with validation, recommendation, proposal handoff, and reconciliation behavior.
- Installation and validation catch stale `.spec-driven/`, `spec-driven-*`, `roadmap-*`, and Markdown-artifact references where strict names are required outside explicit migration contexts.
- Roadmap verification enforces index entries, missing milestone references, milestone schema, status enums, planned change entry shape, duplicate planned changes, completion derivation, one-line planned change formatting, and the at-most-10-planned-changes limit.
- Skill schema validation covers frontmatter metadata, required command sections, symlink or bundled-script assumptions, explicit command references, and stale-reference detection.
- Skill and roadmap behavior are covered by automated validation and smoke tests rather than prompt text alone.

## Planned Changes
- `port-strict-skill-packaging-and-validation` - Declared: complete - create strict spec and strict roadmap skill directories and `SKILL.md` metadata, remove legacy install names, update installer scripts and marketplace metadata, enforce `scripts -> ../../dist/scripts` and `templates -> ../../dist/templates` symlink behavior, and port validation for frontmatter, command references, stale legacy names, bundled script assumptions, and broken symlinks.
- `update-core-spec-skills-for-yaml` - Declared: complete - update init, propose, apply, verify, review, archive, auto, modify, and cancel skill instructions to use `.strict-spec-driven/` and YAML change artifacts.
- `update-planning-and-spec-content-skills-for-yaml` - Declared: complete - update brainstorm, simple-task, spec-content, spec-edit, sync-specs, and mapping repair skills to edit strict YAML specs and deltas through structured fields.
- `define-yaml-roadmap-schema` - Declared: complete - finalize concrete YAML roadmap index and milestone schemas plus examples covering ordering, status, scope, criteria, dependencies, risks, notes, and planned change entries.
- `port-strict-roadmap-workflow` - Declared: complete - implement roadmap validation, status, index regeneration, sync, and archive reconciliation commands for `.strict-spec-driven/roadmap/`, add recommendation and roadmap-to-change proposal handoff without duplicating planning metadata, and rewrite roadmap plan, milestone, recommend, propose, and sync skills for YAML roadmap artifacts, strict command names, numbered milestone files, and single-line planned change entries.

## Dependencies
- `03-core-strict-workflow` should define the command behavior that strict skills and roadmap automation call.
- `02-strict-cli-foundation` must expose stable compiled script paths and bundled template resolution for skill snippets.
- `01-yaml-contracts-and-naming` must remain the source of truth for strict naming and artifact rules.

## Risks
- Renaming skills without strong validation could leave mixed legacy and strict command names in prompts or installer metadata.
- Roadmap commands and skill instructions could drift apart if both are updated without shared validation coverage.
- Installation or symlink mistakes could make strict skills appear present while failing at runtime.

## Status
- Declared: complete

## Notes
- This merger is intentional: spec skills and roadmap workflow are both thin layers over the same strict CLI and the same install and validation surfaces.
- Combining these tracks removes cross-milestone coordination overhead without creating an oversized milestone.
- `SKILL.md` remains Markdown because Agent Skills packaging depends on it; only generated or maintained workflow artifacts move to YAML.
- This milestone closes the `scripts -> ../../dist/scripts` and `templates -> ../../dist/templates` symlink requirement that milestone 02 explicitly deferred.
- Reference skill validation uses YAML frontmatter parsing and Markdown AST checks, while reference roadmap validation expects canonical milestone sections, declared statuses, one-line planned change entries, and index entries that match milestone files; the strict validator should keep those checks observable.
- Change-creation guardrail: `port-strict-skill-packaging-and-validation` owns skill directories, metadata, installer or marketplace metadata, symlink layout, and validation coverage for strict skill packages, but end-user install or uninstall scripts and packaged smoke tests stay in milestone 06.
- Change-creation guardrail: `update-core-spec-skills-for-yaml` is limited to init, propose, apply, verify, review, archive, auto, modify, and cancel skills; brainstorm, simple-task, spec-content, spec-edit, sync-specs, and mapping repair stay in `update-planning-and-spec-content-skills-for-yaml`.
- Change-creation guardrail: `define-yaml-roadmap-schema` must land concrete schema and example assets plus validation-facing contracts before command behavior expands; CLI and skill execution logic belongs to `port-strict-roadmap-workflow`.
- Change-creation guardrail: `port-strict-roadmap-workflow` may combine roadmap CLI commands, recommendation or proposal handoff, and roadmap skills only when they share the same roadmap artifact contract; if work splits later, keep recommendation and roadmap-propose behavior grouped with roadmap state reconciliation rather than with generic skill packaging.






