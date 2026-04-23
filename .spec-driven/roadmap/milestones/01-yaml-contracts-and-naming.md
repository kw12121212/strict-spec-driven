# 01 YAML Contracts And Naming

## Goal
Define the strict YAML artifact contracts and naming model before migrating CLI behavior or skills from the reference project.

## In Scope
- Define schema families for main specs, delta specs, change proposals, designs, tasks, questions, spec indexes, roadmap indexes, roadmap milestones, and planned change entries.
- Define field-level contracts for required fields, optional fields, enum values, relationship references, stable IDs, and minimal valid examples.
- Translate reference Markdown semantics from `../auto-spec-driven` into structured YAML fields instead of Markdown headings, list indentation, frontmatter, or prose-only conventions.
- Establish `.strict-spec-driven/` as the product workflow directory that replaces `.spec-driven/` for strict workflow state.
- Establish `strict-spec-*` as the renamed prefix for spec workflow skills and slash commands.
- Establish `strict-roadmap-*` as the renamed prefix for roadmap workflow skills and slash commands.
- Define the CLI naming model separately from skill and slash-command names, including whether the entrypoint remains `spec-driven` or becomes a strict-specific binary.
- Define which Markdown files are packaging or repository-documentation exceptions and which workflow artifacts must become YAML.
- Preserve reference workflow semantics from `../auto-spec-driven` unless strict YAML structure requires a deliberate change.

## Out of Scope
- Implementing the full CLI migration.
- Rewriting all skills.
- Converting existing user projects from Markdown to YAML.
- Choosing the final runtime parser or validation library beyond requiring structured YAML parsing and deterministic validation behavior.

## Done Criteria
- YAML schemas are documented with required fields, optional fields, enum values, relationship fields, stable identifiers, and examples.
- Artifact examples cover at least one valid main spec, delta spec, proposal, design, task list, question list, spec index, roadmap index, milestone, and planned change entry.
- The directory rename from `.spec-driven/` to `.strict-spec-driven/` is explicit in the contract.
- Skill, slash-command, and CLI command naming rules are explicit and non-overlapping.
- Markdown exceptions are documented, including `SKILL.md` as an Agent Skills packaging requirement and repository docs such as `README.md`, `AGENTS.md`, and `RTK.md`.
- Main spec, delta spec, change artifact, roadmap, task, and question formats are defined well enough for scripts to validate missing required fields, invalid enums, invalid references, malformed YAML, duplicate IDs, and unsupported shapes.
- Any deliberate difference from `../auto-spec-driven` is recorded as a YAML-contract decision rather than an accidental workflow change.

## Planned Changes
- `define-yaml-artifact-schemas` - Declared: complete - define strict YAML schemas for specs, proposals, designs, tasks, questions, indexes, roadmap milestones, planned change entries, and validation-ready examples.
- `define-strict-directory-and-prefixes` - Declared: planned - define `.strict-spec-driven/` as the workflow directory and rename skill and command families to `strict-spec-*` and `strict-roadmap-*`.
- `define-command-naming-model` - Declared: planned - distinguish skill names, slash commands, CLI entrypoints, CLI subcommands, and installer-facing names so strict naming is applied consistently.
- `define-markdown-exception-policy` - Declared: planned - document which Markdown files remain allowed for packaging or repository documentation and require all generated or consumed workflow artifacts to be YAML.
- `define-yaml-spec-and-delta-model` - Declared: planned - translate RFC 2119 requirements, scenarios, mappings, and ADDED/MODIFIED/REMOVED deltas into structured YAML fields with stable requirement and scenario identifiers.
- `define-migration-compatibility-contract` - Declared: planned - specify how legacy `.spec-driven/` Markdown artifacts map into strict YAML files without changing workflow intent.

## Dependencies
- The reference behavior in `../auto-spec-driven` must remain available for comparison.
- The active `define-yaml-artifact-schemas` change should stay aligned with this milestone and remain planning-only until the CLI foundation exists.

## Risks
- Overly flexible YAML schemas could recreate the ambiguity of Markdown conventions.
- Overly rigid schemas could make ordinary spec edits difficult for AI agents and humans.
- If frontmatter and body semantics are copied directly into YAML string fields, validators will still depend on Markdown-era parsing assumptions.
- Ambiguous naming between skills, slash commands, CLI entrypoints, and subcommands could make installation and prompt validation brittle.

## Status
- Declared: proposed

## Notes
- This milestone should finish before large implementation work begins.
- The roadmap is currently stored under the bootstrap `.spec-driven/roadmap/` directory because migration tooling does not exist yet; the target product directory is `.strict-spec-driven/`.
- `SKILL.md` remains Markdown only as a packaging container; strict workflow artifacts generated or consumed by skills must be YAML.
- Reference artifacts to compare include `template/config.yaml`, `template/specs/README.md`, change artifact templates created by `propose`, roadmap milestone sections validated by `verify-roadmap`, and spec mapping frontmatter validated by `verify-spec-mappings`.
