import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: project_id } = await params;
  try {
    await ensureTables();
    const { title, description, milestone_id, parent_id, assignee, due_date, url, created_by, position } = await req.json();
    const isClient = created_by === "client";

    let resolvedMilestoneId = milestone_id ?? null;
    if (parent_id) {
      const { rows: parentRows } = await sql`SELECT milestone_id FROM tasks WHERE id = ${parent_id} AND project_id = ${project_id}`;
      if (!parentRows[0]) {
        return NextResponse.json({ error: "Parent task not found" }, { status: 400 });
      }
      resolvedMilestoneId = parentRows[0].milestone_id;
    }

    const { rows } = await sql`
      INSERT INTO tasks (project_id, milestone_id, parent_id, title, description, assignee, due_date, url, created_by, approved, position)
      VALUES (
        ${project_id}, ${resolvedMilestoneId}, ${parent_id ?? null}, ${title}, ${description ?? null},
        ${assignee ?? null}, ${due_date ?? null}, ${url ?? null}, ${created_by ?? "team"},
        ${!isClient}, ${position ?? 0}
      )
      RETURNING *
    `;
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
