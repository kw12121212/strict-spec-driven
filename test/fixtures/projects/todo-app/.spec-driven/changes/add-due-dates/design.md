# Design: add-due-dates

## Approach

Extend the todo item shape with an optional due date and thread the value
through the domain helpers so later list views can expose it without changing
existing creation and completion semantics.

## Key Decisions

- Keep due dates optional so existing todo items remain valid.
- Reuse the current todo domain files instead of introducing new fixture-only
  abstractions.

## Alternatives Considered

- Add tag filtering first. Rejected because due dates provide a simpler seeded
  active change for future workflow tests.
