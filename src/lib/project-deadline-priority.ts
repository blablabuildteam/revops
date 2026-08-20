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

function asDeadlineProject(project: unknown): DeadlinePriorityProject | null {
  if (!project || typeof project !== "object") return null;
  const row = project as Record<string, unknown>;
  if (typeof row.id !== "string") return null;
  return row as DeadlinePriorityProject;
}

export async function applyDeadlineDefaultPriority<T>(
  project: T,
): Promise<T> {
  const row = asDeadlineProject(project);
  if (!row || !shouldApplyDeadlineDefaultPriority(row)) return project;

  const { rows } = await sql`
    UPDATE projects
    SET priority = 'medium', updated_at = now()
    WHERE id = ${row.id}
      AND COALESCE(priority_manual, false) = false
      AND COALESCE(priority, 'low') = 'low'
    RETURNING id
  `;

  if (rows.length === 0) return project;
  return { ...project, priority: "medium" };
}

export async function applyDeadlineDefaultPriorities<T>(
  projects: T[],
): Promise<T[]> {
  const needed = projects.filter((project) => {
    const row = asDeadlineProject(project);
    return row ? shouldApplyDeadlineDefaultPriority(row) : false;
  });
  if (needed.length === 0) return projects;

  await Promise.all(needed.map((project) => applyDeadlineDefaultPriority(project)));
  const ids = new Set(
    needed
      .map((project) => asDeadlineProject(project)?.id)
      .filter((id): id is string => Boolean(id)),
  );
  return projects.map((project) => {
    const id = asDeadlineProject(project)?.id;
    return id && ids.has(id) ? { ...project, priority: "medium" } : project;
  });
}
