import { sql, ensureTables } from "@/lib/db";

export type EditTokenProject = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  edit_token: string;
};

export async function resolveEditToken(token: string): Promise<EditTokenProject | null> {
  await ensureTables();
  const { rows } = await sql`
    SELECT id, name, description, status, edit_token
    FROM projects
    WHERE edit_token = ${token}
  `;
  return (rows[0] as EditTokenProject | undefined) ?? null;
}

export async function assertTaskInEditProject(taskId: string, projectId: string): Promise<boolean> {
  const { rows } = await sql`
    SELECT id FROM tasks WHERE id = ${taskId} AND project_id = ${projectId}
  `;
  return rows.length > 0;
}

export async function assertMilestoneInEditProject(milestoneId: string, projectId: string): Promise<boolean> {
  const { rows } = await sql`
    SELECT id FROM milestones WHERE id = ${milestoneId} AND project_id = ${projectId}
  `;
  return rows.length > 0;
}

/** Edit-board viewers are outside the team: never send triage drafts, plans or agent PR details. */
export function withoutAgentFields<T extends Record<string, unknown>>(task: T) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { intake, triage, triage_status, agent_branch, pr_url, preview_url, legacy_backfilled, ...rest } = task;
  return rest;
}
