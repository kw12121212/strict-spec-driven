# bind-domain-refactors-to-real-todo-project-regression

## What

Add regression test coverage that exercises roadmap, skill-validation, and migration commands against the shared todo-project fixture in a copied-project workspace, proving the domain module decomposition from milestone 08 preserves observable behavior.

## Why

Milestone 08 split `src/roadmap.ts`, `src/skills.ts`, and `src/migrate.ts` into focused modules. The existing test suite covers each domain through isolated fixtures and some copied-project scenarios (sections 17b and 18a), but does not yet exercise skill-validation or the full post-migration lifecycle (verify, list, review, archive) against the real todo-project fixture. This change closes that gap so the decomposition is validated against a repeatable project context.

## Scope

- Add copied-project regression scenarios that exercise `validate-skills`, `roadmap-status`, `roadmap-sync`, `migrate`, and the post-migration change lifecycle (`verify`, `list`, `review`, `archive`) against the todo-project fixture.
- Verify that diagnostic ordering remains stable and report collections remain deterministic across repeated copied-project runs.
- Confirm the committed todo-project fixture baseline is never modified by any test scenario.

## Unchanged Behavior

- Roadmap, skill-validation, and migration command outputs and diagnostics must remain identical to pre-decomposition behavior.
- The todo-project fixture under `test/fixtures/projects/todo-app/` must not be modified.
- Existing test sections (17b, 18a) must continue to pass.
