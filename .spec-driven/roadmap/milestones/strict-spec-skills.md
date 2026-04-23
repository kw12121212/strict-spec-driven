# Strict Spec Skills

## Goal
Rename and update the spec workflow skills so agents operate on strict YAML artifacts and `strict-spec-*` commands.

## In Scope
- Rename spec workflow skills from `spec-driven-*` to `strict-spec-*`.
- Update skill instructions to read and write `.strict-spec-driven/` YAML artifacts.
- Keep skills in Markdown `SKILL.md` packaging while changing their artifact contracts.
- Update installation and validation behavior for the renamed skill family.

## Out of Scope
- Roadmap skill renaming.
- Legacy project migration tooling.
- Changing the Agent Skills package format.

## Done Criteria
- Core spec workflow skills exist under the `strict-spec-*` prefix.
- Skill instructions no longer direct agents to create Markdown artifacts for strict workflows.
- Skill command snippets reference the strict CLI names and `.strict-spec-driven/`.
- Skill validation catches stale `spec-driven-*` command references where strict names are required.

## Planned Changes
- `rename-spec-skills-to-strict-spec` - Declared: planned - rename core spec workflow skills and metadata from `spec-driven-*` to `strict-spec-*`.
- `update-core-skills-for-yaml-artifacts` - Declared: planned - update init, propose, apply, verify, review, archive, auto, modify, cancel, simple-task, and spec-edit instructions for YAML artifacts.
- `update-installation-for-strict-spec-skills` - Declared: planned - update install and validation logic so strict spec skills can be installed and checked consistently.
- `add-stale-reference-validation` - Declared: planned - fail validation when strict skills retain obsolete `.spec-driven/` or `spec-driven-*` instructions outside migration contexts.

## Dependencies
- `core-yaml-workflow` should define the command behavior the skills call.

## Risks
- Renaming skills without strong validation could leave mixed old and new command names in prompts.
- Skills may become inaccurate if CLI command behavior changes faster than skill instructions.

## Status
- Declared: proposed

## Notes
- `SKILL.md` remains Markdown because Agent Skills packaging depends on it.
