import type { Task } from "@/lib/types";

export type TaskBoardSortKey = "title" | "priority" | "assignee" | "due_date";

export const PRIORITY_RANK: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function compareNullableString(a: string, b: string, sortAsc: boolean): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const cmp = a.localeCompare(b);
  return sortAsc ? cmp : -cmp;
}

export function compareTasks(
  a: Task,
  b: Task,
  sortKey: TaskBoardSortKey = "priority",
  sortAsc = true,
): number {
  if (sortKey === "title") {
    const cmp = compareNullableString(
      (a.title ?? "").toLowerCase(),
      (b.title ?? "").toLowerCase(),
      sortAsc,
    );
    if (cmp !== 0) return cmp;
  } else if (sortKey === "priority") {
    const pa = PRIORITY_RANK[a.priority ?? "low"] ?? 2;
    const pb = PRIORITY_RANK[b.priority ?? "low"] ?? 2;
    if (pa !== pb) return sortAsc ? pa - pb : pb - pa;
  } else if (sortKey === "assignee") {
    const cmp = compareNullableString(
      (a.assignee ?? "").toLowerCase(),
      (b.assignee ?? "").toLowerCase(),
      sortAsc,
    );
    if (cmp !== 0) return cmp;
  } else if (sortKey === "due_date") {
    const cmp = compareNullableString(a.due_date ?? "", b.due_date ?? "", sortAsc);
    if (cmp !== 0) return cmp;
  }

  return a.position - b.position || a.created_at.localeCompare(b.created_at);
}

/** Default matches historical board order: high → low priority, then position. */
export function sortTasks(
  tasks: Task[],
  sortKey: TaskBoardSortKey = "priority",
  sortAsc = true,
): Task[] {
  return [...tasks].sort((a, b) => compareTasks(a, b, sortKey, sortAsc));
}
