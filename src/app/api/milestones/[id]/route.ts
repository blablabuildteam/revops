import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { name, description, status, due_date, position } = await req.json();
    const { rows } = await sql`
      UPDATE milestones SET
        name = COALESCE(${name ?? null}, name),
        description = ${description ?? null},
        status = COALESCE(${status ?? null}, status),
        due_date = ${due_date ?? null},
        position = COALESCE(${position ?? null}, position),
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
    await sql`DELETE FROM milestones WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
