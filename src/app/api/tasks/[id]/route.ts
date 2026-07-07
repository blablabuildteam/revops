import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { title, description, status, milestone_id, assignee, due_date, approved } = await req.json();
    const { rows } = await sql`
      UPDATE tasks SET
        title = COALESCE(${title ?? null}, title),
        description = ${description ?? null},
        status = COALESCE(${status ?? null}, status),
        milestone_id = ${milestone_id ?? null},
        assignee = ${assignee ?? null},
        due_date = ${due_date ?? null},
        approved = COALESCE(${approved ?? null}, approved),
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
