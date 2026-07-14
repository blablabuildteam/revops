import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import { resolveEditToken } from "@/lib/edit-token";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    await ensureTables();
    const project = await resolveEditToken(token);
    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { rows: milestones } = await sql`
      SELECT * FROM milestones WHERE project_id = ${project.id} ORDER BY position, created_at
    `;

    const { rows: tasks } = await sql`
      SELECT
        t.*,
        COALESCE(cc.count, 0)::int AS comment_count,
        EXISTS (
          SELECT 1 FROM task_attachments ta WHERE ta.task_id = t.id
        ) AS has_attachments
      FROM tasks t
      LEFT JOIN (
        SELECT task_id, COUNT(*)::int AS count
        FROM task_comments
        GROUP BY task_id
      ) cc ON cc.task_id = t.id
      WHERE t.project_id = ${project.id}
      ORDER BY t.position, t.created_at
    `;

    const payload = {
      ...project,
      milestones: milestones.map((m) => ({
        ...m,
        tasks: tasks.filter((t) => t.milestone_id === m.id),
      })),
      unassigned_tasks: tasks.filter((t) => !t.milestone_id),
    };

    return NextResponse.json(payload);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
