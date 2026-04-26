# Design: bind-cli-refactors-to-real-todo-project-regression

## Approach

Add new named `createCopiedProjectWorkspace("todo-app")` workspace instances in three existing test suites. Each workspace is declared at suite scope and reused across scenario assertions within its section, consistent with the pattern already used in `change-lifecycle.ts`, `roadmap-and-migration.ts`, and `foundation-and-fixtures.ts`.

For each command group:
- **change-lifecycle.ts**: add a section that runs `list`, `modify <name>`, `cancel <name>`, and `modify <archive-dir>` (archive-lookup) against a copied workspace that already has the todo-app's active and archived change state
- **roadmap-and-migration.ts**: add a section that runs `roadmap-status` and `roadmap-sync` against a copied workspace and asserts JSON output validity and milestone reporting
- **operations.ts**: add a section that runs `verify-spec-mappings` against a copied workspace and asserts JSON output and exit code

All assertions target observable behavior: exit codes, presence of required JSON fields, and key output strings. No assertions are made about internal module paths or call chains.

## Key Decisions

- **Add to existing suites, not a new file**: The scenario content is directly related to what each existing suite already covers; adding sections keeps the numbered section sequence intact and avoids a new orchestration entry.
- **Declare workspace at suite scope**: Consistent with existing `copiedProject*` workspace declarations, avoids repeated copy-and-cleanup overhead within a section.
- **Assert observable contracts only**: Scenario assertions check exit code and JSON fields (e.g. `valid`, `changes`, `milestones`), not internal implementation paths, so the tests remain stable as modules evolve.

## Alternatives Considered

- **New `cli-surface-regression.ts` suite**: Would give the decomposition an explicit acceptance gate but adds suite orchestration overhead and splits logically related scenarios from their command families.
- **Add to `foundation-and-fixtures.ts`**: That suite already has some todo-app workspace scenarios but focuses on fixture shape validation, not command-surface behavior.
