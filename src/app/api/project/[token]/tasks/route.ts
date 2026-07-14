import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import { resolveEditToken } from "@/lib/edit-token";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    await ensureTables();
    const project = await resolveEditToken(token);
    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const {
      title, description, milestone_id, parent_id, assignee, due_date, url, priority, position,
    } = await req.json();

    let resolvedMilestoneId = milestone_id ?? null;
    if (parent_id) {
      const { rows: parentRows } = await sql`
        SELECT milestone_id FROM tasks WHERE id = ${parent_id} AND project_id = ${project.id}
      `;
      if (!parentRows[0]) {
        return NextResponse.json({ error: "Parent task not found" }, { status: 400 });
      }
      resolvedMilestoneId = parentRows[0].milestone_id;
    }

    const { rows } = await sql`
      INSERT INTO tasks (
        project_id, milestone_id, parent_id, title, description, assignee, due_date, url,
        created_by, approved, priority, position
      )
      VALUES (
        ${project.id}, ${resolvedMilestoneId}, ${parent_id ?? null}, ${title}, ${description ?? null},
        ${assignee ?? null}, ${due_date ?? null}, ${url ?? null}, 'external', true,
        ${priority ?? "low"}, ${position ?? 0}
      )
      RETURNING *
    `;
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
