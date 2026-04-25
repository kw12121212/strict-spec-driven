# 06 Operations And Documentation

## Goal
Finish the operational polish that sits outside the core workflow loop so the strict workflow is installable, maintainable, shippable, and documented for normal use.

## In Scope
- Port maintenance and ship workflows to strict YAML artifacts where needed.
- Implement install and uninstall scripts plus operational smoke tests for strict skill packaging.
- Write public workflow documentation for setup, commands, roadmap usage, artifact locations, schemas, examples, and migration boundaries.
- Keep packaged skill behavior, documentation examples, and operational commands aligned with the self-hosted strict workflow.
- Port package scripts and validation commands needed to build, test, validate, install, and uninstall the strict workflow.
- Keep English and Chinese user documentation aligned when both are provided.

## Out of Scope
- Core lifecycle command migration.
- Roadmap workflow porting and skill renaming.
- Legacy Markdown migration tooling and the repository self-hosting cutover.
- Publishing release automation beyond local installation, validation, and documented manual ship steps.

## Done Criteria
- Maintenance can seed, verify, and archive strict YAML maintenance changes from configured checks.
- Ship guidance can verify an archived strict change, inspect roadmap state, create a focused git commit, and hand off push with documented commands.
- Installation scripts can install and uninstall strict skills globally or into a project without mixing legacy and strict command names.
- Each skill directory has working `scripts` and `templates` symlinks whose relative paths resolve to `dist/scripts/` and `dist/templates/` from the source repo.
- Installation and uninstallation work for strict skills with smoke tests covering symlink resolution and legacy-name safeguards.
- Public documentation accurately describes strict commands, `.strict-spec-driven/`, YAML artifact locations, schema and example assets, migration boundaries, and self-hosting status.
- Documentation examples use strict command names and YAML filenames only outside explicit legacy or migration sections.

## Planned Changes
- `port-maintenance-workflow-to-yaml` - Declared: complete - implement strict `run-maintenance` behavior, maintenance config YAML, generated maintenance change artifacts, archive flow, and tests.
- `port-ship-workflow-to-strict` - Declared: complete - implement strict ship behavior that verifies archived changes, inspects roadmap status, creates a focused git commit, and documents the push handoff.
- `ship-strict-installation-and-packaging` - Declared: complete - add install and uninstall scripts for global and project-local strict skill installation with legacy-name safeguards and working relative symlink expectations, plus install, uninstall, and packaged skill smoke tests covering bundled scripts, bundled templates, symlink resolution, and failure diagnostics.
- `write-strict-user-documentation` - Declared: planned - add README, QUICKSTART, ROADMAP_GUIDE, and Chinese equivalents that explain strict setup, commands, artifacts, schema and example files, and migration boundaries.

## Dependencies
- `03-core-strict-workflow` must expose active and archived strict changes for maintenance and ship behavior.
- `04-strict-workflow-skills-and-roadmap` must define the strict skill families and roadmap surfaces that installation and user documentation describe.
- `05-migration-and-self-hosting` should establish the validated self-hosted workflow state before public documentation is treated as final.

## Risks
- Installation scripts could mix strict and legacy skills if command names and target directories are not validated.
- Documentation could advertise strict commands or packaging assumptions before the self-hosted workflow proves they are stable.
- Maintenance automation could create noisy or misleading changes if configured checks and safe auto-fix behavior are not explicit.

## Status
- Declared: proposed

## Notes
- This milestone stays deliberately last because it is operational polish, not a blocker for proving the strict workflow architecture.
- Repository guidance changes needed for self-hosting live in milestone 05; this milestone focuses on public docs and reusable operational surfaces.
- Reference surfaces still include `install.sh`, `validate-skills.ts`, `skill-schema.yaml`, maintenance and ship workflows, plus `README`, `QUICKSTART`, and `ROADMAP_GUIDE`; operational work here should leave behind scripts, tests, or docs rather than pure spec text.
- Installation uses `npx skills add <local-dir>`, which registers the skill directory in place. The source repo therefore needs `scripts -> ../../dist/scripts` and `templates -> ../../dist/templates` relative symlinks that remain valid without copying files or dereferencing symlinks.
- Change-creation guardrail: `ship-strict-installation-and-packaging` owns end-user install or uninstall scripts, packaging expectations, and smoke tests, but repo-local skill directory structure and validation rules remain owned by milestone 04.
- Change-creation guardrail: `write-strict-user-documentation` should follow already validated strict workflow names, paths, and commands; it should not invent new workflow behavior or move migration-policy decisions out of milestone 05.
- Change-creation guardrail: `port-ship-workflow-to-strict` assumes archived strict changes and roadmap state already exist, and it should stay focused on ship-time verification, commit creation, and push handoff rather than becoming a generic git automation bucket.
- Change-creation guardrail: `port-maintenance-workflow-to-yaml` stays limited to configured repository checks, generated maintenance changes, and archive flow; unrelated repository automation belongs outside this roadmap.



