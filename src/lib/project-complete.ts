import { sql } from "@/lib/db";
import { DEFAULT_PHASE_COLORS } from "@/lib/types";

/** Ensure a Done phase exists, then move every task in the project into it. */
export async function markProjectTasksDone(projectId: string) {
  const { rows: doneRows } = await sql`
    SELECT id FROM milestones
    WHERE project_id = ${projectId} AND LOWER(name) = 'done'
    ORDER BY position
    LIMIT 1
  `;

  let doneId = doneRows[0]?.id as string | undefined;
  if (!doneId) {
    const { rows: posRows } = await sql`
      SELECT COALESCE(MAX(position), -1) + 1 AS next_pos
      FROM milestones WHERE project_id = ${projectId}
    `;
    const { rows: created } = await sql`
      INSERT INTO milestones (project_id, name, position, status, color)
      VALUES (
        ${projectId},
        'Done',
        ${posRows[0]?.next_pos ?? 0},
        'pending',
        ${DEFAULT_PHASE_COLORS.Done}
      )
      RETURNING id
    `;
    doneId = created[0]?.id as string | undefined;
  }

  if (!doneId) return;

  await sql`
    UPDATE tasks
    SET
      milestone_id = ${doneId},
      status = 'done',
      approved = true,
      updated_at = now()
    WHERE project_id = ${projectId}
      AND (
        milestone_id IS DISTINCT FROM ${doneId}
        OR status IS DISTINCT FROM 'done'
        OR approved = false
      )
  `;
}
