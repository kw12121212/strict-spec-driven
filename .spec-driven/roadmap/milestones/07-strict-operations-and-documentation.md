# 07 Strict Operations And Documentation

## Goal
Finish the strict workflow operational surfaces that sit outside the core spec and roadmap loops, including maintenance, ship, installation, validation, and user-facing documentation.

## In Scope
- Port the maintenance workflow from configured repository checks to strict YAML maintenance changes.
- Create operational CLI commands, installation scripts, validation scripts, skill packages, README/guide documents, and tests for the strict workflow.
- Port the ship workflow for archived strict changes, roadmap status review, git commit creation, and push handoff.
- Implement strict installation and uninstallation scripts for global and project-local skill installs.
- Port package scripts and skill validation commands needed to build, test, validate, install, and uninstall the strict workflow.
- Write strict workflow documentation for setup, quick start, roadmap usage, command naming, YAML artifact locations, and migration boundaries.
- Keep English and Chinese user documentation aligned when both are provided.

## Out of Scope
- Core propose/apply/verify/archive implementation.
- Roadmap command migration.
- Legacy Markdown artifact conversion.
- Self-hosting this repository's workflow state.
- Publishing release automation beyond local install, validation, and documented manual shipping.

## Done Criteria
- Maintenance can seed, verify, and archive strict YAML maintenance changes from configured checks without using Markdown artifacts.
- Ship guidance can verify an archived strict change, inspect roadmap status, create a focused git commit, and push using documented commands.
- Installation scripts can install and uninstall strict skills globally or into a project without mixing legacy and strict command names.
- Each skill directory has working `scripts` and `templates` symlinks whose relative paths resolve to `dist/scripts/` and `dist/templates/` from the source repo.
- Skill validation runs against strict skill packages and reports stale references, invalid frontmatter, missing command sections, bad command references, broken symlinks, and bundled script issues.
- README, QUICKSTART, ROADMAP_GUIDE, and their Chinese counterparts describe strict commands, `.strict-spec-driven/`, YAML artifacts, installation, migration boundaries, and self-hosting status accurately.
- Documentation examples use strict command names and YAML filenames only outside explicit legacy or migration sections.

## Planned Changes
- `port-maintenance-workflow-to-yaml` - Declared: planned - implement strict `run-maintenance` behavior, maintenance config YAML, generated maintenance change artifacts, task completion, verification, archive flow, and tests.
- `port-ship-workflow-to-strict` - Declared: planned - implement `strict-spec-driven ship` as a CLI subcommand that verifies an archived change, inspects roadmap status, creates a focused git commit, and hands off push with documented commands and verification tests.
- `implement-strict-installation-scripts` - Declared: planned - add install and uninstall scripts for global and project-local strict skill installation and legacy-name safeguards. Installation uses `npx skills add <local-dir>` which registers the skill directory in-place; symlinks inside the directory (`scripts -> ../../dist/scripts`, `templates -> ../../dist/templates`) use relative paths that resolve correctly from their original location, so no file copying or symlink dereferencing is needed.
- `port-strict-skill-validation-suite` - Declared: planned - port skill-schema validation source and validate-skills tests for strict skill frontmatter, command snippets, bundled scripts, and stale references. Add validation that every skill directory has working `scripts` and `templates` symlinks pointing to the required scaffold and change-template assets.
- `write-strict-user-documentation` - Declared: planned - add README, QUICKSTART, ROADMAP_GUIDE, and Chinese equivalents that explain strict setup, commands, artifacts, schema/example files, and migration boundaries.
- `document-strict-agent-guidance` - Declared: planned - update AGENTS and RTK guidance for contributors and agents using strict commands, YAML artifacts, validation commands, and reference-project comparison.

## Dependencies
- `02-strict-cli-foundation` must provide build and test scripts.
- `03-core-yaml-workflow` must support active and archived strict changes.
- `04-strict-spec-skills` and `05-strict-roadmap-workflow` must define the strict skill families before installer and validation behavior is finalized.
- `06-migration-tooling` must define legacy boundary language used by public documentation.

## Risks
- Installation scripts could mix strict and legacy skills if command names and target directories are not validated.
- If the source repo is moved or the `dist/` directory is cleaned after `npx skills add`, symlinks will dangle and skills will break at runtime.
- Documentation could advertise strict commands before the implementation is usable.
- Ship guidance could encourage commits before verification and roadmap reconciliation are complete.
- Maintenance automation could create noisy changes if configured checks or safe auto-fix behavior are not explicit.

## Status
- Declared: proposed

## Notes
- Reference surfaces include `install.sh`, `validate-skills.ts`, `skill-schema.yaml`, `spec-driven-maintenance`, `spec-driven-ship`, README, QUICKSTART, and ROADMAP_GUIDE.
- Operational planned changes must create scripts, skills, validation tests, or user-facing docs; pure spec updates are not enough for this milestone.
- This milestone keeps operational polish separate from the first strict lifecycle implementation so self-hosting starts from documented, installable workflows.
- **Skill package structure**: installation uses `npx skills add <local-dir>` which registers the skill directory in-place without copying files. In the source repo each `skills/<name>/` has `scripts -> ../../dist/scripts` and `templates -> ../../dist/templates` relative symlinks created by the M02 build step. These symlinks resolve correctly because the directory structure is preserved at the source location. The reference project uses the same pattern with `scripts -> ../../dist/scripts`; the strict project adds `templates` following the same convention.
