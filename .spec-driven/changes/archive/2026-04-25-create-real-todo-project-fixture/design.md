# Design: create-real-todo-project-fixture

## Approach

Create one repository-contained fixture that is realistic enough to exercise the
strict workflow meaningfully, but still small enough to keep committed fixture
maintenance cheap. The fixture should include the minimum repository structure
needed for later tests to copy it into temporary workspaces and run CLI,
roadmap, and migration flows against it.

The fixture content should be chosen for breadth rather than application
complexity: a small todo-style codebase, package metadata, and strict workflow
artifacts that represent normal project state. This change should stop at
creating the committed baseline; later changes can add the copy/reset harness,
scenario orchestration, and broader suite decomposition on top of it.

## Key Decisions

- Use a single committed todo-project fixture first, not multiple project
  variants, so later regression work has one canonical baseline.
- Keep the fixture pre-seeded with realistic workflow state instead of building
  it dynamically in tests, because the committed baseline is the dependency
  other roadmap items need.
- Treat this as regression infrastructure, so `changes/<name>/specs/` can remain
  empty unless implementation reveals a genuine observable behavior change that
  belongs in the main specs.

## Alternatives Considered

- Start with `add-repeatable-project-copy-and-reset-harness` first. Rejected
  because the harness needs a committed baseline project to copy.
- Start milestone 07 CLI decomposition first. Rejected because it begins
  refactors before the shared project-level safety fixture exists.
- Expand this change to include the full scenario suite. Rejected because that
  would collapse several planned milestone-09 changes into one proposal and make
  scope control weaker.
