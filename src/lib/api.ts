import { Company, NewOpportunity, Opportunity, Project, Milestone, Task } from "./types";

const base = "/api";

async function req<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Request failed");
  }
  return res.json();
}

export function getOpportunities(): Promise<Opportunity[]> {
  return req("/opportunities");
}

export function getOpportunity(id: string): Promise<Opportunity> {
  return req(`/opportunities/${id}`);
}

export function createOpportunity(opp: NewOpportunity): Promise<Opportunity> {
  return req("/opportunities", { method: "POST", body: JSON.stringify(opp) });
}

export function updateOpportunity(
  id: string,
  updates: Partial<NewOpportunity>
): Promise<Opportunity> {
  return req(`/opportunities/${id}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
}

export function deleteOpportunity(id: string): Promise<void> {
  return req(`/opportunities/${id}`, { method: "DELETE" });
}

export function getCompanies(): Promise<Company[]> {
  return req("/companies");
}

export function createCompany(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  company: any
): Promise<Company> {
  return req("/companies", { method: "POST", body: JSON.stringify(company) });
}

// Projects
export function getProjects(): Promise<(Project & { task_count: number; done_count: number; pending_requests: number })[]> {
  return req("/projects");
}

export function getProject(id: string): Promise<Project> {
  return req(`/projects/${id}`);
}

export function createProject(data: Partial<Project>): Promise<Project> {
  return req("/projects", { method: "POST", body: JSON.stringify(data) });
}

export function updateProject(id: string, data: Partial<Project>): Promise<Project> {
  return req(`/projects/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export function deleteProject(id: string): Promise<void> {
  return req(`/projects/${id}`, { method: "DELETE" });
}

// Milestones
export function createMilestone(projectId: string, data: Partial<Milestone>): Promise<Milestone> {
  return req(`/projects/${projectId}/milestones`, { method: "POST", body: JSON.stringify(data) });
}

export function updateMilestone(id: string, data: Partial<Milestone>): Promise<Milestone> {
  return req(`/milestones/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export function deleteMilestone(id: string): Promise<void> {
  return req(`/milestones/${id}`, { method: "DELETE" });
}

// Tasks
export function createTask(projectId: string, data: Partial<Task>): Promise<Task> {
  return req(`/projects/${projectId}/tasks`, { method: "POST", body: JSON.stringify(data) });
}

export function updateTask(id: string, data: Partial<Task>): Promise<Task> {
  return req(`/tasks/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export function deleteTask(id: string): Promise<void> {
  return req(`/tasks/${id}`, { method: "DELETE" });
}

// Public client view
export function getPublicProject(token: string): Promise<Project> {
  return req(`/project/${token}`);
}

export function submitClientTask(token: string, data: { title: string; description?: string; milestone_id?: string }): Promise<Task> {
  return req(`/project/${token}`, { method: "POST", body: JSON.stringify(data) });
}
