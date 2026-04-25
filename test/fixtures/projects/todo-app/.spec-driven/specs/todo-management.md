---
mapping:
  implementation:
    - src/index.ts
    - src/todos.ts
  tests:
    - test/todos.test.ts
---

# Todo Management

### Requirement: manage-todo-items
The system MUST allow users to create todo items and list saved items.

#### Scenario: create and list items
- GIVEN a user starts with an empty todo list
- WHEN the user adds a todo item with a title
- THEN the item is stored
- AND later list views include the saved item

### Requirement: complete-todo-items
The system MUST allow users to mark saved todo items as complete.

#### Scenario: mark an item complete
- GIVEN a saved todo item exists
- WHEN the user marks the item complete
- THEN subsequent list views report the item as complete
