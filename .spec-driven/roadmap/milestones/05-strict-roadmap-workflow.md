# 05 Strict Roadmap Workflow

## Goal
Port roadmap planning, milestone, recommendation, proposal, and sync workflows to strict YAML under the `strict-roadmap-*` prefix.

## In Scope
- Rename roadmap skills and commands from `roadmap-*` to `strict-roadmap-*`.
- Create or update roadmap CLI subcommands, roadmap skill packages, YAML roadmap templates, validation routines, sync/recommendation logic, installer metadata, and tests.
- Define and enforce YAML roadmap index and milestone schemas.
- Port roadmap verification, status, recommendation, proposal, milestone refinement, and sync behavior to `.strict-spec-driven/roadmap/`.
- Preserve milestone size limits, planned change status rules, declared milestone statuses, active/archive change detection, and derived completion semantics.
- Keep roadmap ordering explicit in the YAML index and preserve two-digit milestone ordering when files are generated or renamed.
- Ensure roadmap-propose turns one planned change into a normal strict change scaffold without duplicating planning metadata.

## Out of Scope
- Core spec workflow migration.
- Legacy Markdown migration tool.
- Non-roadmap skill renaming.
- Multi-repository planning, parallel milestone execution, deployment planning, or release trains.

## Done Criteria
- Roadmap skills and scripts use the `strict-roadmap-*` prefix.
- Roadmap artifacts are YAML files under `.strict-spec-driven/roadmap/`.
- Verification enforces index entries, missing milestone references, milestone schema, required sections or fields, status enums, planned change entry shape, size limits, duplicate planned changes, and completion derivation.
- Sync reconciles planned change statuses and milestone statuses from active and archived strict changes without manual completion toggles.
- Recommendation can identify the next planned change from milestone order, dependency state, and current active changes.
- Tests cover roadmap planning, index generation, validation failures, status output, recommendation, proposal scaffolding, archive reconciliation, and sync behavior.

## Planned Changes
- `rename-roadmap-skills-to-strict-roadmap` - Declared: planned - create strict roadmap skill directories and `SKILL.md` metadata for roadmap-plan, roadmap-milestone, roadmap-recommend, roadmap-propose, and roadmap-sync equivalents under the `strict-roadmap-*` prefix.
- `define-yaml-roadmap-schema` - Declared: planned - update concrete roadmap schema files and examples for roadmap index and milestone YAML with ordered IDs, status, scope, criteria, risks, dependencies, notes, and planned changes.
- `port-roadmap-cli-commands` - Declared: planned - implement roadmap validation, status, index regeneration, sync, and archive reconciliation subcommands that read and write `.strict-spec-driven/roadmap/` YAML files.
- `port-roadmap-recommend-and-propose` - Declared: planned - implement recommendation and roadmap-to-change proposal handoff so strict roadmap planned changes create strict YAML change scaffolds without duplicating metadata.
- `update-roadmap-skills-for-yaml` - Declared: planned - rewrite roadmap `SKILL.md` instructions to operate on YAML roadmap artifacts, strict command names, numbered milestone files, and single-line planned change entries.
- `update-installation-for-strict-roadmap-skills` - Declared: planned - update installer metadata, validation scripts, and tests so strict roadmap skills install and validate consistently with strict spec skills.

## Dependencies
- `01-yaml-contracts-and-naming` must establish prefix and artifact naming rules.
- `02-strict-cli-foundation` must provide YAML validation utilities.
- `03-core-yaml-workflow` must expose active and archived change state in a form roadmap sync can rely on.
- No dependency on `04-strict-spec-skills`; M04 and M05 can proceed in parallel once M03 is complete.

## Risks
- Roadmap migration could conflict with core change archive semantics if planned change references are not stable.
- The renamed roadmap commands could be confused with legacy roadmap skills unless installation clearly separates them.
- Sorting milestone files alphabetically could break intended roadmap order unless the index owns ordering and numbered filenames are validated.
- Derived completion could be wrong if archived change directory names are not normalized consistently after date prefixes are added.

## Status
- Declared: proposed

## Notes
- This milestone should keep roadmap files as structured data while preserving the concise milestone boundaries from the reference workflow.
- Each roadmap workflow change must produce strict roadmap skill files, CLI behavior, YAML templates, validation scripts, or tests; do not satisfy these items with spec text alone.
- Reference roadmap validation requires canonical milestone sections, declared statuses, one-line planned change entries, at most 10 planned changes per milestone, and index entries that match milestone files. The strict schema should encode those checks directly.
- Reference archive reconciliation updates planned change and milestone statuses after archive. The strict workflow should keep that behavior and make it observable through validation or status output.
