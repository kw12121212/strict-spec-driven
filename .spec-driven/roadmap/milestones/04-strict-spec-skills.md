# 04 Strict Spec Skills

## Goal
Rename and update the spec workflow skills so agents operate on strict YAML artifacts and `strict-spec-*` commands.

## In Scope
- Rename spec workflow skills from `spec-driven-*` to `strict-spec-*`.
- Create or update concrete `SKILL.md` packages, command snippets, bundled script references, installer metadata, and skill validation tests for strict spec workflows.
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
- Core skills cover init, propose, apply, verify, review, archive, auto, modify, cancel, brainstorm, simple-task, spec-content, spec-edit, sync-specs, and mapping maintenance equivalents.

## Planned Changes
- `rename-spec-skills-to-strict-spec` - Declared: planned - create strict spec skill directories and `SKILL.md` metadata for `strict-spec-*` equivalents while preserving Agent Skills frontmatter requirements and removing legacy install names.
- `update-core-skills-for-yaml-artifacts` - Declared: planned - update init, propose, apply, verify, review, archive, auto, modify, and cancel `SKILL.md` instructions to read/write `proposal.yaml`, `design.yaml`, `tasks.yaml`, `questions.yaml`, YAML specs, and strict CLI commands.
- `update-planning-and-spec-content-skills-for-yaml` - Declared: planned - update brainstorm, simple-task, spec-content, spec-edit, sync-specs, and mapping repair skills to edit strict YAML specs and deltas through structured fields.
- `update-installation-for-strict-spec-skills` - Declared: planned - update installer scripts, marketplace metadata, symlink behavior, and validation checks so strict spec skills install consistently across supported agent CLIs.
- `port-spec-skill-schema-validation` - Declared: planned - port skill schema validation scripts and tests for strict spec `SKILL.md` frontmatter, command sections, command references, bundled script assumptions, and required workflow text.
- `add-stale-reference-validation` - Declared: planned - add validation tests that fail when strict skills retain obsolete `.spec-driven/`, `spec-driven-*`, or Markdown artifact instructions outside explicit migration contexts.

## Dependencies
- `03-core-yaml-workflow` should define the command behavior the skills call.
- `02-strict-cli-foundation` must expose a stable compiled script path or installable command for skill snippets.
- No dependency on `05-strict-roadmap-workflow`; M04 and M05 can proceed in parallel once M03 is complete.

## Risks
- Renaming skills without strong validation could leave mixed old and new command names in prompts.
- Skills may become inaccurate if CLI command behavior changes faster than skill instructions.
- Overzealous stale-reference validation could reject legitimate references inside migration or compatibility instructions.
- If installation still points to reference skill stores or command names, strict and legacy workflows could be mixed in one project.

## Status
- Declared: proposed

## Notes
- `SKILL.md` remains Markdown because Agent Skills packaging depends on it.
- Planned changes here must modify actual skill packages, installer metadata, validation scripts, or tests; pure contract wording belongs in earlier milestones.
- Reference skill validation uses YAML frontmatter parsing and Markdown AST checks; the strict validator should keep package-level Markdown validation while validating strict artifact references in the body.
- The reference project installs copied skills into an agent store and symlinks CLI-specific directories; strict installation can reuse that topology with strict names.
