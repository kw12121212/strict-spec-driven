# YAML Contracts And Naming

## Goal
Define the strict YAML artifact contracts and naming model before migrating CLI behavior or skills from the reference project.

## In Scope
- Define YAML schemas for specs, change artifacts, roadmap artifacts, indexes, questions, and tasks.
- Establish `.strict-spec-driven/` as the product workflow directory that replaces `.spec-driven/`.
- Establish `strict-spec-*` as the renamed prefix for spec workflow skills and slash commands.
- Establish `strict-roadmap-*` as the renamed prefix for roadmap workflow skills and slash commands.
- Define the CLI naming model separately from skill and slash-command names.
- Define which Markdown files are packaging or repository-documentation exceptions and which workflow artifacts must become YAML.
- Preserve reference workflow semantics from `../auto-spec-driven` unless strict YAML structure requires a deliberate change.

## Out of Scope
- Implementing the full CLI migration.
- Rewriting all skills.
- Converting existing user projects from Markdown to YAML.

## Done Criteria
- YAML schemas are documented with required fields, optional fields, enum values, and examples.
- The directory rename from `.spec-driven/` to `.strict-spec-driven/` is explicit in the contract.
- Skill, slash-command, and CLI command naming rules are explicit and non-overlapping.
- Markdown exceptions are documented, including `SKILL.md` as an Agent Skills packaging requirement and repository docs such as `README.md`, `AGENTS.md`, and `RTK.md`.
- Main spec, delta spec, change artifact, roadmap, task, and question formats are defined well enough for scripts to validate.

## Planned Changes
- `define-yaml-artifact-schemas` - Declared: planned - define strict YAML schemas for specs, proposals, designs, tasks, questions, indexes, and roadmap milestones.
- `define-strict-directory-and-prefixes` - Declared: planned - define `.strict-spec-driven/` as the workflow directory and rename skill and command families to `strict-spec-*` and `strict-roadmap-*`.
- `define-command-naming-model` - Declared: planned - distinguish skill names, slash commands, CLI entrypoints, and CLI subcommands so strict naming is applied consistently.
- `define-markdown-exception-policy` - Declared: planned - document which Markdown files remain allowed for packaging or repository documentation and require all workflow artifacts to be YAML.
- `define-yaml-spec-and-delta-model` - Declared: planned - translate RFC 2119 requirements, scenarios, mappings, and ADDED/MODIFIED/REMOVED deltas into structured YAML fields.
- `define-migration-compatibility-contract` - Declared: planned - specify how legacy `.spec-driven/` Markdown artifacts map into strict YAML files without changing workflow intent.

## Dependencies
- The reference behavior in `../auto-spec-driven` must remain available for comparison.

## Risks
- Overly flexible YAML schemas could recreate the ambiguity of Markdown conventions.
- Overly rigid schemas could make ordinary spec edits difficult for AI agents and humans.

## Status
- Declared: proposed

## Notes
- This milestone should finish before large implementation work begins.
- The roadmap is currently stored under the bootstrap `.spec-driven/roadmap/` directory because migration tooling does not exist yet; the target product directory is `.strict-spec-driven/`.
- `SKILL.md` remains Markdown only as a packaging container; strict workflow artifacts generated or consumed by skills must be YAML.
