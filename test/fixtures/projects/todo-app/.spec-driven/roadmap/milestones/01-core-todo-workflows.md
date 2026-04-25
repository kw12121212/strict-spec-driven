# 01 Core Todo Workflows

## Goal
Expand the compact todo application with richer planning features while keeping
the current creation, listing, and completion behavior stable.

## In Scope
- Add roadmap-backed product changes for the todo app.
- Keep the fixture realistic enough for CLI, roadmap, and migration scenarios.

## Out of Scope
- Splitting the fixture into multiple sample applications.
- Adding production infrastructure outside the todo domain.

## Done Criteria
- The fixture contains roadmap state that future tests can inspect with
  `roadmap-status` and `roadmap-sync`.
- At least one planned change is ready to exercise active-change workflows.

## Planned Changes
- `add-due-dates` - Declared: planned - allow todo items to store an optional due date and surface it in list views.
- `add-tag-filtering` - Declared: planned - allow todo lists to be filtered by one or more tags.

## Dependencies
- Core todo creation and completion behavior remains the baseline.

## Risks
- The fixture can become noisy if it starts representing too many scenarios at once.

## Status
- Declared: proposed

## Notes
- Keep the fixture compact while still representing a normal `.spec-driven/`
  repository.
