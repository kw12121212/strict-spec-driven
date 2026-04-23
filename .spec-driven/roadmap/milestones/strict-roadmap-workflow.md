# Strict Roadmap Workflow

## Goal
Port roadmap planning, milestone, recommendation, proposal, and sync workflows to strict YAML under the `strict-roadmap-*` prefix.

## In Scope
- Rename roadmap skills and commands from `roadmap-*` to `strict-roadmap-*`.
- Define and enforce YAML roadmap index and milestone schemas.
- Port roadmap verification and sync behavior to `.strict-spec-driven/roadmap/`.
- Preserve milestone size limits, planned change status rules, and derived completion semantics.

## Out of Scope
- Core spec workflow migration.
- Legacy Markdown migration tool.
- Non-roadmap skill renaming.

## Done Criteria
- Roadmap skills and scripts use the `strict-roadmap-*` prefix.
- Roadmap artifacts are YAML files under `.strict-spec-driven/roadmap/`.
- Verification enforces milestone schema, planned change status enums, size limits, and completion derivation.
- Tests cover roadmap planning, validation failures, and sync behavior.

## Planned Changes
- `rename-roadmap-skills-to-strict-roadmap` - Declared: planned - rename roadmap-plan, roadmap-milestone, roadmap-recommend, roadmap-propose, and roadmap-sync to the strict roadmap prefix.
- `define-yaml-roadmap-schema` - Declared: planned - define roadmap index and milestone YAML schemas with status, scope, criteria, risks, dependencies, and planned changes.
- `port-roadmap-cli-commands` - Declared: planned - update roadmap validation and sync scripts to read and write `.strict-spec-driven/roadmap/` YAML files.
- `update-roadmap-skills-for-yaml` - Declared: planned - rewrite roadmap skill instructions to operate on YAML roadmap artifacts and strict command names.

## Dependencies
- `yaml-contracts-and-naming` must establish prefix and artifact naming rules.
- `strict-cli-foundation` must provide YAML validation utilities.

## Risks
- Roadmap migration could conflict with core change archive semantics if planned change references are not stable.
- The renamed roadmap commands could be confused with legacy roadmap skills unless installation clearly separates them.

## Status
- Declared: proposed

## Notes
- This milestone should keep roadmap files as structured data while preserving the concise milestone boundaries from the reference workflow.
