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
}
