import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { title, description, status, priority, assignee_id, company_id, project_id, due_date } = await req.json();

  const { rows } = await sql`
    UPDATE todos SET
      title = COALESCE(${title ?? null}, title),
      description = ${description ?? null},
      status = COALESCE(${status ?? null}, status),
      priority = COALESCE(${priority ?? null}, priority),
      assignee_id = ${assignee_id ?? null},
      company_id = ${company_id ?? null},
      project_id = ${project_id ?? null},
      due_date = ${due_date ?? null},
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return NextResponse.json(rows[0]);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await sql`DELETE FROM todos WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
