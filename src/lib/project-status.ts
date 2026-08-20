import { parseLocalDate } from "@/lib/format";
import {
  PROJECT_STATUS_LABELS,
  type ProjectStatus,
} from "@/lib/types";

export type ProjectSchedulePhase = "starting" | "active" | "reaching_deadline" | "overdue";

export type ProjectStatusChoice =
  | "starting"
  | "active"
  | "reaching_deadline"
  | "on_hold"
  | "completed"
  | "cancelled";

export const PROJECT_STATUS_CHOICES: ProjectStatusChoice[] = [
  "starting",
  "active",
  "reaching_deadline",
  "on_hold",
  "completed",
  "cancelled",
];

export const PROJECT_STATUS_CHOICE_LABELS: Record<ProjectStatusChoice, string> = {
  starting: "Starting",
  active: "Active",
  reaching_deadline: "Reaching deadline",
  on_hold: "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STARTING_PROGRESS = 0.2;
const DEADLINE_PROGRESS = 0.8;
const WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function projectSchedulePhase(
  start?: string | null,
  end?: string | null,
  now = new Date(),
): ProjectSchedulePhase {
  const startDate = parseLocalDate(start);
  const endDate = parseLocalDate(end);
  const today = startOfDay(now);
  const startMs = startDate ? startOfDay(startDate) : null;
  const endMs = endDate ? startOfDay(endDate) : null;

  if (endMs != null && today > endMs) return "overdue";
  if (startMs != null && today < startMs) return "starting";

  if (startMs != null && endMs != null && endMs > startMs) {
    const progress = (today - startMs) / (endMs - startMs);
    if (progress >= DEADLINE_PROGRESS) return "reaching_deadline";
    if (progress <= STARTING_PROGRESS) return "starting";
    return "active";
  }

  if (endMs != null && (endMs - today) / DAY_MS <= WINDOW_DAYS) {
    return "reaching_deadline";
  }

  if (startMs != null && (today - startMs) / DAY_MS <= WINDOW_DAYS) {
    return "starting";
  }

  return "active";
}

/** 0–100 through the project calendar, or null when start/end are missing. */
export function projectScheduleProgress(
  start?: string | null,
  end?: string | null,
  now = new Date(),
): number | null {
  const startDate = parseLocalDate(start);
  const endDate = parseLocalDate(end);
  if (!startDate || !endDate) return null;

  const startMs = startOfDay(startDate);
  const endMs = startOfDay(endDate);
  if (endMs <= startMs) return startOfDay(now) >= endMs ? 100 : 0;

  const todayMs = startOfDay(now);
  return Math.min(100, Math.max(0, Math.round(((todayMs - startMs) / (endMs - startMs)) * 100)));
}

export function isManualProjectStatus(status: ProjectStatus) {
  return status === "on_hold" || status === "completed" || status === "cancelled";
}

/** Current menu value — date-derived unless the project is manually paused or closed. */
export function projectStatusChoice(
  status: ProjectStatus,
  start?: string | null,
  end?: string | null,
  now = new Date(),
): ProjectStatusChoice {
  if (isManualProjectStatus(status)) return status;
  const phase = projectSchedulePhase(start, end, now);
  return phase === "overdue" ? "reaching_deadline" : phase;
}

export function projectStatusLabel(
  status: ProjectStatus,
  start?: string | null,
  end?: string | null,
  now = new Date(),
): string {
  if (isManualProjectStatus(status)) return PROJECT_STATUS_LABELS[status];
  const phase = projectSchedulePhase(start, end, now);
  if (phase === "overdue") return "Overdue";
  return PROJECT_STATUS_CHOICE_LABELS[phase];
}

export type ProjectStatusTone = ProjectStatusChoice | "overdue";

export function projectStatusTone(
  status: ProjectStatus,
  start?: string | null,
  end?: string | null,
  now = new Date(),
): ProjectStatusTone {
  if (isManualProjectStatus(status)) return status;
  return projectSchedulePhase(start, end, now);
}

export function isDeadlinePhase(phase: ProjectSchedulePhase) {
  return phase === "reaching_deadline" || phase === "overdue";
}

/** Auto-raise default (low) priority to medium when the project is at/near its end. */
export function shouldApplyDeadlineDefaultPriority(project: {
  status: string;
  priority?: string | null;
  priority_manual?: boolean | null;
  start_date?: string | null;
  end_date?: string | null;
}): boolean {
  if (project.priority_manual) return false;
  if (isManualProjectStatus(project.status as ProjectStatus)) return false;
  if ((project.priority ?? "low") !== "low") return false;
  return isDeadlinePhase(projectSchedulePhase(project.start_date, project.end_date));
}

/** Date-based choices resume the project; On Hold / closed statuses are stored as-is. */
export function storedProjectStatus(choice: ProjectStatusChoice): ProjectStatus {
  if (choice === "starting" || choice === "active" || choice === "reaching_deadline") {
    return "active";
  }
  return choice;
}
