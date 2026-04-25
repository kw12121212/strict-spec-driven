export type TodoItem = {
  id: string;
  title: string;
  completed: boolean;
};

export function createTodo(id: string, title: string): TodoItem {
  return {
    id,
    title,
    completed: false,
  };
}

export function completeTodo(item: TodoItem): TodoItem {
  return {
    ...item,
    completed: true,
  };
}

export function listTodos(items: TodoItem[]): TodoItem[] {
  return [...items];
}
