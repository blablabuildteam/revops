import { projectScheduleProgress, projectStatusTone } from "@/lib/project-status";
import { PRIORITY_RANK } from "@/lib/task-sort";
import type { ProjectStatus } from "@/lib/types";

export type ProjectSortKey =
  | "priority"
  | "name"
  | "status"
  | "lead"
  | "progress"
  | "start_date"
  | "end_date"
  | "updated";

export const PROJECT_SORT_LABELS: Record<ProjectSortKey, string> = {
  priority: "Priority",
  name: "Name",
  status: "Status",
  lead: "Lead",
  progress: "Progress",
  start_date: "Start date",
  end_date: "End date",
  updated: "Recently updated",
};

export const PROJECT_SORT_OPTIONS: ProjectSortKey[] = [
  "priority",
  "name",
  "lead",
  "progress",
  "start_date",
  "end_date",
  "updated",
];

export const PROJECT_SORT_DEFAULT_ASC: Record<ProjectSortKey, boolean> = {
  priority: true,
  name: true,
  status: true,
  lead: true,
  progress: false,
  start_date: true,
  end_date: true,
  updated: false,
};

const DISPLAY_STATUS_RANK: Record<string, number> = {
  starting: 0,
  active: 1,
  reaching_deadline: 2,
  overdue: 3,
  on_hold: 4,
  completed: 5,
  cancelled: 6,
};

export type SortableProject = {
  name?: string;
  status?: string;
  priority?: string;
  lead?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  updated_at?: string;
};

function priorityRank(value?: string) {
  return PRIORITY_RANK[value ?? "low"] ?? 3;
}

function statusRank(project: SortableProject) {
  const tone = projectStatusTone(
    (project.status ?? "active") as ProjectStatus,
    project.start_date,
    project.end_date,
  );
  return DISPLAY_STATUS_RANK[tone] ?? 4;
}

function compareNullableDate(a?: string | null, b?: string | null) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

function compareProgress(a: SortableProject, b: SortableProject) {
  const pa = projectScheduleProgress(a.start_date, a.end_date);
  const pb = projectScheduleProgress(b.start_date, b.end_date);
  if (pa == null && pb == null) return 0;
  if (pa == null) return 1;
  if (pb == null) return -1;
  return pa - pb;
}

export function compareProjects<T extends SortableProject>(
  a: T,
  b: T,
  key: ProjectSortKey,
): number {
  if (key === "name") {
    return (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" });
  }

  if (key === "status") {
    const statusCmp = statusRank(a) - statusRank(b);
    if (statusCmp !== 0) return statusCmp;
    return priorityRank(a.priority) - priorityRank(b.priority);
  }

  if (key === "lead") {
    if (!a.lead && !b.lead) return 0;
    if (!a.lead) return 1;
    if (!b.lead) return -1;
    const leadCmp = a.lead.localeCompare(b.lead, undefined, { sensitivity: "base" });
    if (leadCmp !== 0) return leadCmp;
    return priorityRank(a.priority) - priorityRank(b.priority);
  }

  if (key === "progress") {
    const progressCmp = compareProgress(a, b);
    if (progressCmp !== 0) return progressCmp;
    return compareNullableDate(a.end_date, b.end_date);
  }

  if (key === "start_date") {
    const dateCmp = compareNullableDate(a.start_date, b.start_date);
    if (dateCmp !== 0) return dateCmp;
    return priorityRank(a.priority) - priorityRank(b.priority);
  }

  if (key === "end_date") {
    const dateCmp = compareNullableDate(a.end_date, b.end_date);
    if (dateCmp !== 0) return dateCmp;
    return priorityRank(a.priority) - priorityRank(b.priority);
  }

  if (key === "updated") {
    return (a.updated_at ?? "").localeCompare(b.updated_at ?? "");
  }

  const priorityCmp = priorityRank(a.priority) - priorityRank(b.priority);
  if (priorityCmp !== 0) return priorityCmp;
  const statusCmp = statusRank(a) - statusRank(b);
  if (statusCmp !== 0) return statusCmp;
  return (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" });
}

export function sortProjects<T extends SortableProject>(
  projects: T[],
  key: ProjectSortKey = "priority",
  sortAsc = PROJECT_SORT_DEFAULT_ASC[key],
): T[] {
  return [...projects].sort((a, b) => {
    const cmp = compareProjects(a, b, key);
    return sortAsc ? cmp : -cmp;
  });
}
