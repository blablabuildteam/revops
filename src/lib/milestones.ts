import { sql } from "@vercel/postgres";
import { DEFAULT_PROJECT_MILESTONES, DEFAULT_PHASE_COLORS } from "@/lib/types";

export async function ensureDefaultMilestones(projectId: string) {
  for (let i = 0; i < DEFAULT_PROJECT_MILESTONES.length; i++) {
    const name = DEFAULT_PROJECT_MILESTONES[i];
    await sql`
      INSERT INTO milestones (project_id, name, position, status, color)
      VALUES (${projectId}, ${name}, ${i}, 'pending', ${DEFAULT_PHASE_COLORS[name]})
    `;
  }
}

/** Idempotent: adds any missing standard phases to existing projects. */
export async function backfillMissingStandardPhases() {
  for (let i = 0; i < DEFAULT_PROJECT_MILESTONES.length; i++) {
    const name = DEFAULT_PROJECT_MILESTONES[i];
    const color = DEFAULT_PHASE_COLORS[name];

    await sql`
      INSERT INTO milestones (project_id, name, position, status, color)
      SELECT p.id, ${name}, ${i}, 'pending', ${color}
      FROM projects p
      WHERE NOT EXISTS (
        SELECT 1 FROM milestones m
        WHERE m.project_id = p.id AND m.name = ${name}
      )
    `;
  }

  await ensureBacklogPhaseOrder();
}

/**
 * Idempotent: places Backlog after On Hold and before Done on every board.
 * Preserves relative order of all other phases (including custom ones).
 */
export async function ensureBacklogPhaseOrder() {
  const { rows: projects } = await sql`
    SELECT DISTINCT project_id AS id
    FROM milestones
    WHERE name = 'Backlog'
  `;

  for (const { id: projectId } of projects) {
    const { rows: milestones } = await sql`
      SELECT id, name, position
      FROM milestones
      WHERE project_id = ${projectId}
      ORDER BY position ASC, created_at ASC
    `;

    const backlogIdx = milestones.findIndex((m) => m.name === "Backlog");
    if (backlogIdx < 0) continue;

    const withoutBacklog = milestones.filter((m) => m.name !== "Backlog");
    const onHoldIdx = withoutBacklog.findIndex((m) => m.name === "On Hold");
    const doneIdx = withoutBacklog.findIndex((m) => m.name === "Done");

    let insertAt: number | null = null;
    if (onHoldIdx >= 0 && doneIdx > onHoldIdx) {
      insertAt = onHoldIdx + 1;
    } else if (doneIdx >= 0) {
      insertAt = doneIdx;
    } else if (onHoldIdx >= 0) {
      insertAt = onHoldIdx + 1;
    }

    if (insertAt === null || backlogIdx === insertAt) continue;

    const reordered = [
      ...withoutBacklog.slice(0, insertAt),
      milestones[backlogIdx]!,
      ...withoutBacklog.slice(insertAt),
    ];

    for (let i = 0; i < reordered.length; i++) {
      if (reordered[i]!.position === i) continue;
      await sql`UPDATE milestones SET position = ${i} WHERE id = ${reordered[i]!.id}`;
    }
  }
}
