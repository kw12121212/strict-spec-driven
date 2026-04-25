# add-due-dates

## What

Add support for an optional due date on todo items and expose that due date in
later list views.

## Why

The todo project needs one realistic active change so future CLI, roadmap, and
migration scenarios can exercise proposal, list, modify, and verify workflows
against committed repository state.

## Scope

In scope:
- Extend the todo item model with an optional due date field.
- Surface the due date in later list views.
- Update tests for the added planning field.

Out of scope:
- Tag filtering or other unrelated planning features.
- Any changes outside the todo domain.

## Unchanged Behavior

- Existing todo creation and completion behavior remains available.
- Todo items without due dates remain valid.
