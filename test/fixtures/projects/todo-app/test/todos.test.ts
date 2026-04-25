import test from "node:test";
import assert from "node:assert/strict";

import { completeTodo, createTodo, listTodos } from "../src/index.js";

test("createTodo creates an incomplete item", () => {
  const item = createTodo("todo-1", "Write fixture docs");

  assert.equal(item.id, "todo-1");
  assert.equal(item.title, "Write fixture docs");
  assert.equal(item.completed, false);
});

test("completeTodo marks an item complete", () => {
  const item = createTodo("todo-2", "Add project fixture");
  const updated = completeTodo(item);

  assert.equal(updated.completed, true);
});

test("listTodos returns a stable shallow copy", () => {
  const item = createTodo("todo-3", "Review roadmap");
  const items = [item];
  const listed = listTodos(items);

  assert.deepEqual(listed, items);
  assert.notEqual(listed, items);
});
