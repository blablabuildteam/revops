import type { Task } from "@/lib/types";

export type TaskBoardSortKey = "title" | "priority" | "assignee" | "due_date" | "status";

export const PRIORITY_RANK: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/** Work in flight ranks above work not started, which ranks above finished work. */
export const STATUS_RANK: Record<string, number> = {
  in_progress: 0,
  open: 1,
  done: 2,
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
  } else if (sortKey === "status") {
    const sa = STATUS_RANK[a.status ?? "open"] ?? 1;
    const sb = STATUS_RANK[b.status ?? "open"] ?? 1;
    if (sa !== sb) return sortAsc ? sa - sb : sb - sa;
    const pa = PRIORITY_RANK[a.priority ?? "low"] ?? 2;
    const pb = PRIORITY_RANK[b.priority ?? "low"] ?? 2;
    if (pa !== pb) return pa - pb;
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
