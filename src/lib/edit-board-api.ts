import { Milestone, Project, Task, TaskComment } from "./types";

const base = "/api";

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(res.ok ? "Unexpected response from server" : `Request failed (${res.status})`);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Request failed");
  }
  return res.json();
}

export type EditBoardProject = Project & {
  milestones: (Milestone & { tasks: Task[] })[];
  unassigned_tasks: Task[];
};

export function getEditBoardProject(token: string): Promise<EditBoardProject> {
  return req(`/project/${token}/board`);
}

export function createEditBoardTask(
  token: string,
  data: Partial<Task>,
): Promise<Task> {
  return req(`/project/${token}/tasks`, { method: "POST", body: JSON.stringify(data) });
}

export function updateEditBoardTask(
  token: string,
  taskId: string,
  data: Partial<Task>,
): Promise<Task> {
  return req(`/project/${token}/tasks/${taskId}`, { method: "PUT", body: JSON.stringify(data) });
}

export function deleteEditBoardTask(token: string, taskId: string): Promise<void> {
  return req(`/project/${token}/tasks/${taskId}`, { method: "DELETE" });
}

export function createEditBoardMilestone(
  token: string,
  data: Partial<Milestone>,
): Promise<Milestone> {
  return req(`/project/${token}/milestones`, { method: "POST", body: JSON.stringify(data) });
}

export function batchUpdateEditBoardMilestones(
  token: string,
  milestones: { id?: string; name: string; color?: string | null; position: number }[],
): Promise<Milestone[]> {
  return req(`/project/${token}/milestones/batch`, {
    method: "PUT",
    body: JSON.stringify({ milestones }),
  });
}

export function grantEditAccess(projectId: string): Promise<{ edit_token: string }> {
  return req(`/projects/${projectId}/edit-access`, { method: "POST" });
}

export function revokeEditAccess(projectId: string): Promise<void> {
  return req(`/projects/${projectId}/edit-access`, { method: "DELETE" });
}

export function getEditBoardTaskComments(token: string, taskId: string): Promise<TaskComment[]> {
  return req(`/project/${token}/tasks/${taskId}/comments`);
}

export function createEditBoardTaskComment(
  token: string,
  taskId: string,
  body: string,
): Promise<TaskComment> {
  return req(`/project/${token}/tasks/${taskId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}
