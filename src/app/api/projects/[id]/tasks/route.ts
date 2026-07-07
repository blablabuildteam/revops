import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: project_id } = await params;
  try {
    await ensureTables();
    const { title, description, milestone_id, assignee, due_date, created_by, position } = await req.json();
    const isClient = created_by === "client";
    const { rows } = await sql`
      INSERT INTO tasks (project_id, milestone_id, title, description, assignee, due_date, created_by, approved, position)
      VALUES (
        ${project_id}, ${milestone_id ?? null}, ${title}, ${description ?? null},
        ${assignee ?? null}, ${due_date ?? null}, ${created_by ?? "team"},
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
