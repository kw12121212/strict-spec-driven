---
mapping:
  implementation:
    - src/todos.ts
  tests:
    - test/todos.test.ts
---

## ADDED Requirements

### Requirement: assign-due-dates
The system MUST allow todo items to record an optional due date.

#### Scenario: save a due date
- GIVEN a user creates or updates a todo item
- WHEN the user provides a due date
- THEN the item stores the due date
- AND later list views expose the same due date
