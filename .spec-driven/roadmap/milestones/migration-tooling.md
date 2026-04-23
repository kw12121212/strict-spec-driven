# Migration Tooling

## Goal
Provide a migration command and skill that convert legacy `.spec-driven/` Markdown artifacts into `.strict-spec-driven/` YAML artifacts.

## In Scope
- Add a migration script that reads `.spec-driven/` and writes `.strict-spec-driven/`.
- Convert all `.spec-driven/**` workflow Markdown artifacts to YAML formats where the legacy structure is supported.
- Add a dedicated migration skill for agent-assisted conversion and review.
- Report unsupported or ambiguous Markdown structures without silently inventing data.

## Out of Scope
- Maintaining Markdown artifacts as a first-class format after migration.
- Auto-fixing product code unrelated to workflow artifacts.
- Guaranteeing perfect migration for arbitrary hand-written Markdown that does not match supported patterns.
- Converting repository documentation or skill packaging files such as `README.md`, `AGENTS.md`, `RTK.md`, or `SKILL.md`.

## Done Criteria
- A migration command can convert all supported `.spec-driven/**` legacy workflow Markdown artifacts, including specs, changes, roadmap files, tasks, questions, indexes, and archived changes, into strict YAML.
- A migration skill guides agents through preflight checks, migration execution, review, and follow-up fixes.
- The migration report lists converted files, skipped files, warnings, and manual follow-up items.
- Tests cover full migration, partial migration, malformed Markdown, and idempotent reruns.

## Planned Changes
- `implement-spec-to-strict-migrate-command` - Declared: planned - add a command that migrates `.spec-driven/` projects into `.strict-spec-driven/` YAML scaffold and artifacts.
- `add-strict-spec-migrate-skill` - Declared: planned - create a migration skill that runs preflight checks, invokes the migration script, and guides manual review.
- `convert-workflow-markdown-artifacts-to-yaml` - Declared: planned - implement converters for all supported `.spec-driven/**` workflow Markdown artifacts, including proposal, design, tasks, questions, specs, roadmap, indexes, active changes, and archived changes.
- `add-migration-tests-and-reporting` - Declared: planned - test successful and ambiguous migrations and emit actionable migration reports.

## Dependencies
- `core-yaml-workflow` and `strict-roadmap-workflow` must define the target YAML formats.
- `strict-spec-skills` should establish naming conventions before adding the migration skill.

## Risks
- Free-form Markdown may not map cleanly to structured YAML without manual review.
- A migration that overwrites `.strict-spec-driven/` without safeguards could destroy prior strict workflow data.

## Status
- Declared: proposed

## Notes
- The migration must preserve legacy `.spec-driven/` by default and write into `.strict-spec-driven/`.
- Any Markdown artifact that cannot be confidently converted should be reported as a manual follow-up rather than guessed.
- Repository documentation and `SKILL.md` packaging files are outside this migration command unless a later change explicitly defines a separate documentation migration.
