import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json();

    const { rows: existingRows } = await sql`SELECT * FROM tasks WHERE id = ${id}`;
    if (!existingRows[0]) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const current = existingRows[0];
    const title = "title" in body ? body.title : current.title;
    const description = "description" in body ? body.description : current.description;
    const status = "status" in body ? body.status : current.status;
    const project_id = "project_id" in body ? body.project_id : current.project_id;
    let milestone_id = "milestone_id" in body ? body.milestone_id : current.milestone_id;
    const parent_id = "parent_id" in body ? body.parent_id : current.parent_id;
    const assignee = "assignee" in body ? body.assignee : current.assignee;
    const due_date = "due_date" in body ? body.due_date : current.due_date;
    const url = "url" in body ? body.url : current.url;
    const approved = "approved" in body ? body.approved : current.approved;
    const position = "position" in body ? body.position : current.position;

    if (project_id !== current.project_id) {
      if (milestone_id) {
        const { rows: milestoneRows } = await sql`
          SELECT id FROM milestones WHERE id = ${milestone_id} AND project_id = ${project_id}
        `;
        if (!milestoneRows[0]) milestone_id = null;
      }
    }

    const { rows } = await sql`
      UPDATE tasks SET
        title = ${title},
        description = ${description},
        status = ${status},
        project_id = ${project_id},
        milestone_id = ${milestone_id},
        parent_id = ${parent_id},
        assignee = ${assignee},
        due_date = ${due_date},
        url = ${url},
        approved = ${approved},
        position = ${position},
        updated_at = now()
      WHERE id = ${id}
      RETURNING *
    `;
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await sql`DELETE FROM tasks WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
