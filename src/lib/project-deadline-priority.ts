import { sql } from "@/lib/db";
import { shouldApplyDeadlineDefaultPriority } from "@/lib/project-status";

type DeadlinePriorityProject = {
  id: string;
  status: string;
  priority?: string | null;
  priority_manual?: boolean | null;
  start_date?: string | null;
  end_date?: string | null;
};

export async function applyDeadlineDefaultPriority<T extends DeadlinePriorityProject>(
  project: T,
): Promise<T> {
  if (!shouldApplyDeadlineDefaultPriority(project)) return project;

  const { rows } = await sql`
    UPDATE projects
    SET priority = 'medium', updated_at = now()
    WHERE id = ${project.id}
      AND COALESCE(priority_manual, false) = false
      AND COALESCE(priority, 'low') = 'low'
    RETURNING id
  `;

  if (rows.length === 0) return project;
  return { ...project, priority: "medium" };
}

export async function applyDeadlineDefaultPriorities<T extends DeadlinePriorityProject>(
  projects: T[],
): Promise<T[]> {
  const needed = projects.filter((project) => shouldApplyDeadlineDefaultPriority(project));
  if (needed.length === 0) return projects;

  await Promise.all(needed.map((project) => applyDeadlineDefaultPriority(project)));
  const ids = new Set(needed.map((project) => project.id));
  return projects.map((project) =>
    ids.has(project.id) ? { ...project, priority: "medium" } : project,
  );
}
