# Design: bind-domain-refactors-to-real-todo-project-regression

## Approach

Add new test sections to `test/suites/roadmap-and-migration.ts` (and `test/suites/entrypoint-and-skills.ts` if skill-validation coverage needs a copied-project context) that use the existing `createCopiedProjectWorkspace("todo-app")` harness. Each section will:

1. Copy the todo-project fixture into a temp workspace.
2. Run migrate to produce strict workflow state.
3. Exercise `validate-skills`, `roadmap-status`, `roadmap-sync`, `verify`, `list`, `review`, and `archive` against the migrated workspace.
4. Assert deterministic outputs, report shapes, and diagnostic ordering.
5. Run each scenario twice to confirm repeatability.
6. Assert the committed fixture baseline is unchanged on disk.

This approach reuses the existing harness and fixture rather than introducing new test infrastructure.

## Key Decisions

- Reuse `createCopiedProjectWorkspace` rather than creating a new fixture or test helper, since the copy-and-cleanup pattern already exists and is proven in sections 17b and 18a.
- Add scenarios to existing test suite files rather than creating a new suite file, to keep the regression surface consolidated where domain coverage already lives.
- Focus on post-migration command sequences (verify, list, review, archive) since sections 17b and 18a already cover roadmap and migrate flows.

## Alternatives Considered

- Creating a separate `test/suites/todo-project-regression.ts` suite file: rejected because the scenarios are domain-specific extensions of existing test sections rather than a new cross-cutting concern.
- Adding more artifact families to the todo-project fixture: rejected because the current fixture is already sufficient to exercise the decomposed modules.
