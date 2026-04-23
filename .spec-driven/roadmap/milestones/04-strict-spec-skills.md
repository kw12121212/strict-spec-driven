# 04 Strict Spec Skills

## Goal
Rename and update the spec workflow skills so agents operate on strict YAML artifacts and `strict-spec-*` commands.

## In Scope
- Rename spec workflow skills from `spec-driven-*` to `strict-spec-*`.
- Update skill instructions to read and write `.strict-spec-driven/` YAML artifacts.
- Keep skills in Markdown `SKILL.md` packaging while changing their artifact contracts.
- Update command snippets in skills to call the strict CLI commands and verify exact command names before execution.
- Update installation and validation behavior for the renamed skill family.
- Preserve reference skill responsibilities: agents handle planning, judgment, editing, review, and archive merge decisions while scripts handle deterministic filesystem and validation mechanics.

## Out of Scope
- Roadmap skill renaming.
- Legacy project migration tooling.
- Changing the Agent Skills package format.
- Rewriting the reference workflow into a non-skill interface.

## Done Criteria
- Core spec workflow skills exist under the `strict-spec-*` prefix.
- Skill instructions no longer direct agents to create Markdown artifacts for strict workflows.
- Skill command snippets reference the strict CLI names, `.strict-spec-driven/`, and YAML filenames such as `proposal.yaml`, `design.yaml`, `tasks.yaml`, and `questions.yaml`.
- Skill validation catches stale `spec-driven-*`, `.spec-driven/`, and Markdown-artifact references where strict names are required outside migration contexts.
- Skill schema validation covers frontmatter metadata, required command sections, symlink or bundled-script assumptions, and explicit command references.
- Core skills cover init, propose, apply, verify, review, archive, auto, modify, cancel, simple-task, spec-edit, sync-specs, and mapping maintenance equivalents.

## Planned Changes
- `rename-spec-skills-to-strict-spec` - Declared: planned - rename core spec workflow skills and metadata from `spec-driven-*` to `strict-spec-*` while preserving Agent Skills frontmatter requirements.
- `update-core-skills-for-yaml-artifacts` - Declared: planned - update init, propose, apply, verify, review, archive, auto, modify, cancel, simple-task, spec-edit, sync-specs, and mapping instructions for YAML artifacts.
- `update-installation-for-strict-spec-skills` - Declared: planned - update install and validation logic so strict spec skills can be installed, symlinked, and checked consistently across supported agent CLIs.
- `add-stale-reference-validation` - Declared: planned - fail validation when strict skills retain obsolete `.spec-driven/`, `spec-driven-*`, or Markdown artifact instructions outside migration contexts.

## Dependencies
- `03-core-yaml-workflow` should define the command behavior the skills call.
- `02-strict-cli-foundation` must expose a stable compiled script path or installable command for skill snippets.

## Risks
- Renaming skills without strong validation could leave mixed old and new command names in prompts.
- Skills may become inaccurate if CLI command behavior changes faster than skill instructions.
- Overzealous stale-reference validation could reject legitimate references inside migration or compatibility instructions.
- If installation still points to reference skill stores or command names, strict and legacy workflows could be mixed in one project.

## Status
- Declared: proposed

## Notes
- `SKILL.md` remains Markdown because Agent Skills packaging depends on it.
- Reference skill validation uses YAML frontmatter parsing and Markdown AST checks; the strict validator should keep package-level Markdown validation while validating strict artifact references in the body.
- The reference project installs copied skills into an agent store and symlinks CLI-specific directories; strict installation can reuse that topology with strict names.
