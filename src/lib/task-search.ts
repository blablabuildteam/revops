/** Case-insensitive substring match across task-related text fields. */

export function normalizeTaskSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function matchesTaskSearch(
  query: string,
  ...fields: Array<string | null | undefined>
): boolean {
  const q = normalizeTaskSearchQuery(query);
  if (!q) return true;
  return fields.some((field) => field?.toLowerCase().includes(q));
}

export function taskMatchesSearch(
  task: {
    title?: string | null;
    description?: string | null;
    assignee?: string | null;
  },
  query: string,
): boolean {
  return matchesTaskSearch(query, task.title, task.description, task.assignee);
}

/**
 * Filter tasks by search text. When a subtask matches, its parent is kept;
 * when a parent matches, its subtasks are kept so the board hierarchy stays intact.
 */
export function filterTasksBySearch<
  T extends {
    id: string;
    parent_id?: string | null;
    title?: string | null;
    description?: string | null;
    assignee?: string | null;
  },
>(tasks: T[], query: string): T[] {
  if (!normalizeTaskSearchQuery(query)) return tasks;

  const matchedIds = new Set<string>();
  for (const task of tasks) {
    if (taskMatchesSearch(task, query)) matchedIds.add(task.id);
  }

  for (const task of tasks) {
    if (matchedIds.has(task.id) && task.parent_id) {
      matchedIds.add(task.parent_id);
    }
  }

  for (const task of tasks) {
    if (task.parent_id && matchedIds.has(task.parent_id)) {
      matchedIds.add(task.id);
    }
  }

  return tasks.filter((task) => matchedIds.has(task.id));
}
