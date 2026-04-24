# 05 Migration And Self Hosting

## Goal
Deliver a safe migration path from bootstrap `.spec-driven/` Markdown artifacts to `.strict-spec-driven/` YAML artifacts, then immediately prove the result by self-hosting this repository on the migrated strict workflow.

## In Scope
- Implement migration commands, conversion modules, reports, fixtures, tests, and a migration skill for supported legacy workflow artifacts.
- Convert specs, deltas, change artifacts, roadmap artifacts, config, and indexes from supported Markdown structures into strict YAML.
- Run the migration against this repository, validate the generated strict state, and update repository guidance once self-hosting succeeds.
- Record an explicit bootstrap retirement decision for the old `.spec-driven/` directory after the strict state is proven usable.
- Report unsupported or ambiguous Markdown structures without silently inventing data.
- Preserve legacy `.spec-driven/` by default and avoid overwriting existing `.strict-spec-driven/` state unless an explicit safe rerun policy permits it.
- Emit migration reports with converted files, skipped files, warnings, errors, manual follow-up items, and references to source artifacts.

## Out of Scope
- Maintaining Markdown workflow artifacts as a first-class format after migration.
- Public installation polish, ship workflow, and maintenance automation.
- Converting packaging Markdown such as `SKILL.md` or unrelated repository documentation outside the self-hosting cutover.
- Reworking roadmap boundaries solely because the bootstrap roadmap began in Markdown.
- Auto-fixing product code unrelated to workflow artifacts.
- Migrating old `openspec/` projects unless a separate compatibility contract includes that legacy path.

## Done Criteria
- A migration command can convert all supported `.spec-driven/**` workflow artifacts into `.strict-spec-driven/` YAML with actionable reports, overwrite protection, and schema validation.
- A migration skill can guide preflight checks, migration execution, report review, validation, and manual follow-up.
- Tests cover full migration, partial migration, malformed Markdown, unsupported structures, stale strict targets, archive date prefixes, roadmap planned changes, spec mapping frontmatter, and idempotent reruns.
- Migration validates generated YAML before reporting success and leaves source Markdown artifacts untouched by default.
- Ambiguous migration cases are represented as manual follow-up items rather than guessed YAML fields.
- This repository has a valid self-hosted `.strict-spec-driven/` state that passes strict validation and preserves roadmap order, active changes, archived history, and spec identity.
- Repository guidance clearly states the strict workflow preference and the chosen retirement or preservation policy for bootstrap `.spec-driven/`.

## Planned Changes
- `implement-spec-to-strict-migrate-command` - Declared: complete - implement a `migrate` subcommand that reads `.spec-driven/`, writes `.strict-spec-driven/`, performs preflight checks, enforces overwrite protection, and emits a structured migration report.
- `add-strict-spec-migrate-skill` - Declared: planned - create a strict migration skill package that runs preflight checks, invokes migration, reviews reports, validates generated YAML, and guides manual follow-up.
- `convert-core-workflow-artifacts-to-yaml` - Declared: planned - implement conversion modules and fixtures for main specs, delta specs, requirement scenarios, operation sections, mapping frontmatter, and active and archived proposal, design, tasks, and questions artifacts so strict YAML spec and change directories preserve status, stable identifiers, and archive dates.
- `convert-roadmap-and-project-state-to-yaml` - Declared: planned - implement conversion modules and validation tests for roadmap indexes, milestone files, statuses, dependencies, risks, notes, planned change entries, config, specs indexes, roadmap indexes, and generated scaffold metadata into strict YAML project state files.
- `add-migration-tests-and-reporting` - Declared: planned - add automated tests and report snapshots for successful migrations, ambiguous migrations, malformed Markdown, archive directories, roadmap status derivation, idempotent reruns, and actionable migration reports.
- `self-host-repo-on-strict-workflow` - Declared: planned - run the migration against this repository's bootstrap roadmap, specs, config, active changes, and archived changes, validate and fix the resulting strict state for schema, reference, roadmap, and semantic issues, then update repository guidance to prefer strict workflow names and document whether bootstrap `.spec-driven/` is preserved, archived, or removed.

## Dependencies
- `03-core-strict-workflow` must support the full propose through archive lifecycle before the repository can self-host on strict commands.
- `04-strict-workflow-skills-and-roadmap` should provide usable strict skills and roadmap behavior before migration becomes the default workflow surface.
- `01-yaml-contracts-and-naming` must define how unsupported or ambiguous Markdown structures become warnings, notes, or manual follow-up items.

## Risks
- Free-form Markdown may not map cleanly to structured YAML without manual review, especially for hand-edited roadmap or archived-change artifacts.
- A migration that overwrites existing `.strict-spec-driven/` state without safeguards could destroy valid strict workflow data.
- Treating migration and self-hosting as separate milestones can create a false finish state where tooling exists but no real repository proves it works.

## Status
- Declared: proposed

## Notes
- This merger is intentional: migration is not complete until the repository can actually run on the generated strict state.
- The current repository has archived bootstrap changes but no active changes, which lowers the cost of doing the self-hosting cutover as soon as migration tooling is ready.
- Migration planned changes must produce executable converter code, fixtures, reports, validation hooks, tests, or migration skill instructions; they are not satisfied by schema wording alone.
- Any Markdown artifact that cannot be confidently converted should be reported as a manual follow-up rather than guessed.
- Supported source patterns should be derived from reference templates, reference CLI generated artifacts, and canonical roadmap milestone sections rather than arbitrary Markdown parsing.
- Bootstrap-period archived changes under `.spec-driven/changes/archive/` are first-class migration fixtures and should be used to validate archive date prefix handling and roadmap reconciliation.
- Change-creation guardrail: `implement-spec-to-strict-migrate-command` owns orchestration, preflight checks, overwrite policy, and the structured migration report envelope; artifact-specific parsing and field mapping stay in the conversion changes.
- Change-creation guardrail: `convert-core-workflow-artifacts-to-yaml` owns spec, delta, proposal, design, task, and question conversion where stable identifiers, statuses, and archive date rules overlap; it should not absorb roadmap, config, or index conversion.
- Change-creation guardrail: `convert-roadmap-and-project-state-to-yaml` owns roadmap milestones, roadmap indexes, config, specs indexes, and scaffold metadata, but it does not own self-host cutover or public guidance updates.
- Change-creation guardrail: `self-host-repo-on-strict-workflow` starts only after migration command and converter coverage are credible, and it is not complete until migrated files, validation evidence, guidance updates, and the exact bootstrap retirement decision all exist together.

