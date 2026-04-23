# 06 Migration Tooling

## Goal
Provide a migration command and skill that convert legacy `.spec-driven/` Markdown artifacts into `.strict-spec-driven/` YAML artifacts.

## In Scope
- Add a migration script that reads `.spec-driven/` and writes `.strict-spec-driven/`.
- Convert all `.spec-driven/**` workflow Markdown artifacts to YAML formats where the legacy structure is supported.
- Add a dedicated migration skill for agent-assisted conversion and review.
- Report unsupported or ambiguous Markdown structures without silently inventing data.
- Preserve legacy `.spec-driven/` by default and avoid overwriting existing `.strict-spec-driven/` state unless an explicit safe rerun policy permits it.
- Convert active changes, archived changes, specs, delta specs, config, roadmap indexes, roadmap milestones, tasks, questions, and spec indexes when their Markdown structure matches supported reference patterns.
- Emit a migration report with converted files, skipped files, warnings, errors, manual follow-up items, and references to source artifacts.

## Out of Scope
- Maintaining Markdown artifacts as a first-class format after migration.
- Auto-fixing product code unrelated to workflow artifacts.
- Guaranteeing perfect migration for arbitrary hand-written Markdown that does not match supported patterns.
- Converting repository documentation or skill packaging files such as `README.md`, `AGENTS.md`, `RTK.md`, or `SKILL.md`.
- Migrating old `openspec/` projects unless a separate compatibility contract includes that legacy path.

## Done Criteria
- A migration command can convert all supported `.spec-driven/**` legacy workflow Markdown artifacts, including specs, changes, roadmap files, tasks, questions, indexes, and archived changes, into strict YAML.
- A migration skill guides agents through preflight checks, migration execution, review, and follow-up fixes.
- The migration report lists converted files, skipped files, warnings, and manual follow-up items.
- Tests cover full migration, partial migration, malformed Markdown, unsupported structures, stale strict targets, archive date prefixes, roadmap planned changes, spec mapping frontmatter, and idempotent reruns.
- Migration validates generated YAML before reporting success and leaves source Markdown artifacts untouched by default.
- Ambiguous migration cases are represented as manual follow-ups rather than guessed YAML fields.

## Planned Changes
- `implement-spec-to-strict-migrate-command` - Declared: planned - add a command that migrates `.spec-driven/` projects into `.strict-spec-driven/` YAML scaffold and artifacts with preflight checks and overwrite protection.
- `add-strict-spec-migrate-skill` - Declared: planned - create a migration skill that runs preflight checks, invokes the migration script, reviews reports, validates generated YAML, and guides manual follow-up.
- `convert-workflow-markdown-artifacts-to-yaml` - Declared: planned - implement converters for all supported `.spec-driven/**` workflow Markdown artifacts, including proposal, design, tasks, questions, specs, roadmap, indexes, active changes, archived changes, and mapping frontmatter.
- `add-migration-tests-and-reporting` - Declared: planned - test successful migrations, ambiguous migrations, malformed Markdown, archive directories, roadmap status derivation, idempotent reruns, and actionable migration reports.

## Dependencies
- `03-core-yaml-workflow` and `05-strict-roadmap-workflow` must define the target YAML formats.
- `04-strict-spec-skills` should establish naming conventions before adding the migration skill.
- `01-yaml-contracts-and-naming` must define how unsupported Markdown sections are represented in warnings or notes.

## Risks
- Free-form Markdown may not map cleanly to structured YAML without manual review.
- A migration that overwrites `.strict-spec-driven/` without safeguards could destroy prior strict workflow data.
- If migration validates only syntax and not schema, users could receive YAML files that strict commands cannot maintain.
- Reference migration behavior currently covers different legacy paths; strict migration scope must avoid conflating old OpenSpec migration with `.spec-driven/` to `.strict-spec-driven/`.

## Status
- Declared: proposed

## Notes
- The migration must preserve legacy `.spec-driven/` by default and write into `.strict-spec-driven/`.
- Any Markdown artifact that cannot be confidently converted should be reported as a manual follow-up rather than guessed.
- Repository documentation and `SKILL.md` packaging files are outside this migration command unless a later change explicitly defines a separate documentation migration.
- Supported source patterns should be derived from reference templates, reference CLI generated artifacts, and canonical roadmap milestone sections rather than arbitrary Markdown parsing.
