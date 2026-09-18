export type TodoAssignee = {
  id: string;
  name: string;
  email?: string;
  avatar_url?: string | null;
};

export function formatAssigneeNames(
  assignees: Array<{ name?: string | null }>,
): string {
  return assignees
    .map((a) => a.name?.trim())
    .filter((name): name is string => Boolean(name))
    .join(" + ");
}

export function todoAssigneeIds(
  todo: {
    assignee_ids?: string[] | null;
    assignees?: Array<{ id?: string | null }> | null;
    assignee_id?: string | null;
  },
): string[] {
  if (Array.isArray(todo.assignee_ids)) {
    return [...new Set(todo.assignee_ids.filter(Boolean))];
  }
  const fromList = (todo.assignees ?? [])
    .map((a) => a.id)
    .filter((id): id is string => Boolean(id));
  if (fromList.length > 0) return [...new Set(fromList)];
  return todo.assignee_id ? [todo.assignee_id] : [];
}
