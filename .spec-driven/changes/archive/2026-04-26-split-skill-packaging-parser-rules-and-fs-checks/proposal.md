# split-skill-packaging-parser-rules-and-fs-checks

## What

Extract the five distinct validation responsibilities concentrated in `src/skills.ts` (986 lines) into focused modules under `src/skills/`, leaving `src/skills.ts` as a thin orchestrator that imports and delegates to those modules.

The five extracted modules are:
- `src/skills/model.ts` — shared types, constants, and the `makeDiagnostic` factory
- `src/skills/frontmatter.ts` — frontmatter field parsing and legacy reference validation
- `src/skills/content.ts` — skill-content expectation checks and command-section validation
- `src/skills/fs-checks.ts` — symlink validation and marketplace metadata validation
- `src/skills/diagnostics.ts` — diagnostic sorting and aggregation

## Why

`src/skills.ts` is the next monolithic domain file remaining after the roadmap split completed in `split-roadmap-load-validate-derive-sync`. At 986 lines it mixes five unrelated validation concerns in one file, making each independently hard to locate, reason about, or extend without risk of unintended coupling. The decomposition pattern established for `src/roadmap/` (model → shared → load → validate → status → sync) applies here and keeps the same external behavior while reducing coordination burden.

## Scope

**In scope:**
- Create `src/skills/` directory with five focused modules
- Reduce `src/skills.ts` to a thin orchestrator that re-exports the public API and delegates all logic to the new modules
- Update imports in any files that import from `src/skills.ts` if the internal structure changes require it
- Add or update test coverage to confirm that `validate-skills` CLI output and diagnostic ordering remain identical before and after the split

**Out of scope:**
- Changing any observable `validate-skills` command output, diagnostic messages, or diagnostic ordering
- Altering skill packaging rules, content expectation rules, or marketplace metadata requirements
- Refactoring `src/migrate.ts` or any other domain file (those are separate planned changes)

## Unchanged Behavior

- `validate-skills` CLI output structure and exit codes must be byte-identical before and after
- Diagnostic ordering produced by skill validation must remain deterministic and match pre-split ordering
- All existing test scenarios in `test/suites/entrypoint-and-skills.ts` must continue to pass without modification to their assertions
