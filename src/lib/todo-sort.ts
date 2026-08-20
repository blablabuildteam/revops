import { PRIORITY_RANK, STATUS_RANK, type TaskBoardSortKey } from "@/lib/task-sort";

export type TodoSortKey = "smart" | "priority" | "due_date" | "title" | "created";

export const TODO_SORT_LABELS: Record<TodoSortKey, string> = {
  smart: "In progress first",
  priority: "Priority",
  due_date: "Due date",
  title: "Name",
  created: "Newest",
};

export type SortableTodo = {
  title?: string;
  status?: string;
  priority?: string;
  due_date?: string | null;
  created_at?: string;
};

function priorityRank(value?: string) {
  return PRIORITY_RANK[value ?? "low"] ?? 3;
}

function statusRank(value?: string) {
  return STATUS_RANK[value ?? "open"] ?? 1;
}

/** Undated items sort last rather than first, whichever direction we're going. */
function compareDueDate(a?: string | null, b?: string | null) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

function compareCreatedDesc(a?: string, b?: string) {
  return (b ?? "").localeCompare(a ?? "");
}

export function compareTodos<T extends SortableTodo>(a: T, b: T, key: TodoSortKey): number {
  if (key === "smart") {
    const statusCmp = statusRank(a.status) - statusRank(b.status);
    if (statusCmp !== 0) return statusCmp;
    const priorityCmp = priorityRank(a.priority) - priorityRank(b.priority);
    if (priorityCmp !== 0) return priorityCmp;
    const dueCmp = compareDueDate(a.due_date, b.due_date);
    if (dueCmp !== 0) return dueCmp;
    return compareCreatedDesc(a.created_at, b.created_at);
  }

  if (key === "priority") {
    const priorityCmp = priorityRank(a.priority) - priorityRank(b.priority);
    if (priorityCmp !== 0) return priorityCmp;
    return compareDueDate(a.due_date, b.due_date);
  }

  if (key === "due_date") {
    const dueCmp = compareDueDate(a.due_date, b.due_date);
    if (dueCmp !== 0) return dueCmp;
    return priorityRank(a.priority) - priorityRank(b.priority);
  }

  if (key === "title") {
    return (a.title ?? "").localeCompare(b.title ?? "", undefined, { sensitivity: "base" });
  }

  return compareCreatedDesc(a.created_at, b.created_at);
}

export function sortTodos<T extends SortableTodo>(todos: T[], key: TodoSortKey = "smart"): T[] {
  return [...todos].sort((a, b) => compareTodos(a, b, key));
}

/**
 * Board rows are already grouped by phase, so status ordering is meaningless
 * there — anything without a board equivalent falls back to priority.
 */
export function todoSortToBoardSortKey(key: TodoSortKey): TaskBoardSortKey {
  if (key === "due_date") return "due_date";
  if (key === "title") return "title";
  return "priority";
}
