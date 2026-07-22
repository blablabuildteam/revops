import {
  Allocation,
  Company,
  FinanceDeal,
  NewFinanceDeal,
  UpdateFinanceDeal,
  NewOpportunity,
  Opportunity,
  Project,
  Milestone,
  Task,
  TaskComment,
  TaskAttachment,
} from "./types";
import {
  cachedFetch,
  cacheKeys,
  getCached,
  invalidateCache,
  invalidateCachePrefix,
  setCached,
} from "./query-cache";

function invalidateFinanceCaches() {
  invalidateCache(cacheKeys.financeDeals());
  invalidateCachePrefix("finance-summary:");
}

const base = "/api";

async function req<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json" },
    redirect: "manual",
    ...options,
  });

  if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
    throw new Error("Session expired. Please log in again.");
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      res.ok ? "Unexpected response from server" : `Request failed (${res.status})`
    );
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Request failed");
  }
  return res.json();
}

export type ProjectWithStats = Project & {
  task_count: number;
  done_count: number;
  pending_requests: number;
};

export type ApiUser = {
  id: string;
  email: string;
  name: string;
  avatar_url?: string | null;
};

export function getOpportunities(): Promise<Opportunity[]> {
  return cachedFetch(cacheKeys.opportunities, () => req("/opportunities"));
}

export function getOpportunity(id: string): Promise<Opportunity> {
  return req(`/opportunities/${id}`);
}

export function createOpportunity(opp: NewOpportunity): Promise<Opportunity> {
  return req<Opportunity>("/opportunities", {
    method: "POST",
    body: JSON.stringify(opp),
  }).then((created) => {
    invalidateCache(cacheKeys.opportunities);
    return created;
  });
}

export function updateOpportunity(
  id: string,
  updates: Partial<NewOpportunity>
): Promise<Opportunity> {
  return req<Opportunity>(`/opportunities/${id}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  }).then((updated) => {
    invalidateCache(cacheKeys.opportunities);
    return updated;
  });
}

export function deleteOpportunity(id: string): Promise<void> {
  return req<void>(`/opportunities/${id}`, { method: "DELETE" }).then(() => {
    invalidateCache(cacheKeys.opportunities);
  });
}

export function getCompanies(): Promise<Company[]> {
  return cachedFetch(cacheKeys.companies, () => req("/companies"));
}

export function createCompany(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  company: any
): Promise<Company> {
  return req<Company>("/companies", {
    method: "POST",
    body: JSON.stringify(company),
  }).then((created) => {
    invalidateCache(cacheKeys.companies);
    return created;
  });
}

export function getProjects(): Promise<ProjectWithStats[]> {
  return cachedFetch(cacheKeys.projects, () => req("/projects"));
}

export function getProject(id: string): Promise<Project> {
  return cachedFetch(cacheKeys.project(id), () => req(`/projects/${id}`));
}

function invalidateProjectDetail(projectId?: string | null) {
  if (projectId) invalidateCache(cacheKeys.project(projectId));
  else invalidateCachePrefix("project:");
}

export function createProject(data: Partial<Project>): Promise<Project> {
  return req<Project>("/projects", {
    method: "POST",
    body: JSON.stringify(data),
  }).then((created) => {
    invalidateCache(cacheKeys.projects);
    return created;
  });
}

export function updateProject(id: string, data: Partial<Project>): Promise<Project> {
  return req<Project>(`/projects/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  }).then((updated) => {
    invalidateCache(cacheKeys.projects);
    invalidateProjectDetail(id);
    return updated;
  });
}

export function deleteProject(id: string): Promise<void> {
  return req<void>(`/projects/${id}`, { method: "DELETE" }).then(() => {
    invalidateCache(cacheKeys.projects);
    invalidateProjectDetail(id);
  });
}

export function getUsers(): Promise<ApiUser[]> {
  return cachedFetch(cacheKeys.users, () => req("/users"));
}

// Milestones
export function createMilestone(projectId: string, data: Partial<Milestone>): Promise<Milestone> {
  return req<Milestone>(`/projects/${projectId}/milestones`, {
    method: "POST",
    body: JSON.stringify(data),
  }).then((created) => {
    invalidateProjectDetail(projectId);
    return created;
  });
}

export function updateMilestone(id: string, data: Partial<Milestone>): Promise<Milestone> {
  return req<Milestone>(`/milestones/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  }).then((updated) => {
    invalidateProjectDetail(updated.project_id);
    return updated;
  });
}

export function deleteMilestone(id: string): Promise<void> {
  return req(`/milestones/${id}`, { method: "DELETE" }).then(() => {
    invalidateProjectDetail();
  });
}

export function batchUpdateMilestones(
  projectId: string,
  milestones: { id?: string; name: string; color?: string | null; position: number }[]
): Promise<Milestone[]> {
  return req<Milestone[]>(`/projects/${projectId}/milestones/batch`, {
    method: "PUT",
    body: JSON.stringify({ milestones }),
  }).then((updated) => {
    invalidateProjectDetail(projectId);
    return updated;
  });
}

// Tasks
export function createTask(projectId: string, data: Partial<Task>): Promise<Task> {
  return req<Task>(`/projects/${projectId}/tasks`, {
    method: "POST",
    body: JSON.stringify(data),
  }).then((created) => {
    invalidateCache(cacheKeys.projects);
    invalidateProjectDetail(projectId);
    return created;
  });
}

export function updateTask(id: string, data: Partial<Task>): Promise<Task> {
  return req<Task>(`/tasks/${id}`, { method: "PUT", body: JSON.stringify(data) }).then(
    (updated) => {
      invalidateProjectDetail(updated.project_id);
      return updated;
    },
  );
}

export function deleteTask(id: string): Promise<void> {
  return req(`/tasks/${id}`, { method: "DELETE" }).then(() => {
    invalidateCache(cacheKeys.projects);
    invalidateProjectDetail();
  });
}

export function getTaskComments(taskId: string) {
  return req<TaskComment[]>(`/tasks/${taskId}/comments`);
}

export function createTaskComment(taskId: string, body: string) {
  return req<TaskComment>(`/tasks/${taskId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function getTaskAttachments(taskId: string) {
  return req<TaskAttachment[]>(`/tasks/${taskId}/attachments`);
}

export async function uploadTaskAttachment(taskId: string, file: File): Promise<TaskAttachment> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${base}/tasks/${taskId}/attachments`, {
    method: "POST",
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "Upload failed");
  }
  return data;
}

export async function deleteTaskAttachment(taskId: string, attachmentId: string): Promise<void> {
  const res = await fetch(`${base}/tasks/${taskId}/attachments/${attachmentId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(data.error ?? "Delete failed");
  }
}

// Public client view
export function getPublicProject(token: string): Promise<Project> {
  return req(`/project/${token}`);
}

export function submitClientTask(token: string, data: { title: string; description?: string; milestone_id?: string }): Promise<Task> {
  return req(`/project/${token}`, { method: "POST", body: JSON.stringify(data) });
}

// Allocations
export type AllocationEntry = {
  person: string;
  target_type: Allocation["target_type"];
  target_id: string;
  week: string;
  percentage: number;
};

export function getAllocations(): Promise<Allocation[]> {
  return cachedFetch(cacheKeys.allocations, () => req("/allocations"));
}

export function saveAllocations(entries: AllocationEntry[]): Promise<Allocation[]> {
  return req<Allocation[]>("/allocations", {
    method: "PUT",
    body: JSON.stringify({ entries }),
  }).then((result) => {
    // Replace cache with the full list — don't invalidate (that wipes UI to empty)
    setCached(cacheKeys.allocations, result);
    return result;
  });
}

// Finance deals
export function getFinanceDeals(opportunityId?: string): Promise<FinanceDeal[]> {
  const query = opportunityId ? `?opportunity_id=${opportunityId}` : "";
  return cachedFetch(cacheKeys.financeDeals(opportunityId), () =>
    req(`/finance/deals${query}`)
  );
}

export function getFinanceDeal(id: string): Promise<FinanceDeal> {
  return req(`/finance/deals/${id}`);
}

export function createFinanceDeal(data: NewFinanceDeal): Promise<FinanceDeal> {
  return req<FinanceDeal>("/finance/deals", {
    method: "POST",
    body: JSON.stringify(data),
  }).then((created) => {
    invalidateFinanceCaches();
    return created;
  });
}

export function updateFinanceDeal(id: string, data: UpdateFinanceDeal): Promise<FinanceDeal> {
  return req<FinanceDeal>(`/finance/deals/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  }).then((updated) => {
    invalidateFinanceCaches();
    return updated;
  });
}

export function deleteFinanceDeal(id: string): Promise<void> {
  return req<void>(`/finance/deals/${id}`, { method: "DELETE" }).then(() => {
    invalidateFinanceCaches();
  });
}

export function getFinanceSummary<T = unknown>(month: string): Promise<T> {
  return cachedFetch(cacheKeys.financeSummary(month), () =>
    req<T>(`/finance/summary?month=${month}`)
  );
}

/** Optimistically patch a cached opportunities list after local edits. */
export function patchCachedOpportunity(id: string, updates: Partial<Opportunity>) {
  const list = getCached<Opportunity[]>(cacheKeys.opportunities);
  if (!list) return;
  setCached(
    cacheKeys.opportunities,
    list.map((o) => (o.id === id ? { ...o, ...updates } : o))
  );
}
