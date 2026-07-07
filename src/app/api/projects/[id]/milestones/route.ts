import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: project_id } = await params;
  try {
    await ensureTables();
    const { name, description, due_date, position } = await req.json();
    const { rows } = await sql`
      INSERT INTO milestones (project_id, name, description, due_date, position)
      VALUES (${project_id}, ${name}, ${description ?? null}, ${due_date ?? null}, ${position ?? 0})
      RETURNING *
    `;
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
