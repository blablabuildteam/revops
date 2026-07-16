import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

async function fetchTodo(id: string) {
  const { rows } = await sql`
    SELECT
      t.*,
      u.name AS assignee_name, u.email AS assignee_email,
      c.name AS company_name, c.logo_url AS company_logo_url,
      p.name AS project_name,
      pc.name AS project_company_name, pc.logo_url AS project_company_logo_url
    FROM todos t
    LEFT JOIN users u ON u.id = t.assignee_id
    LEFT JOIN companies c ON c.id = t.company_id
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN companies pc ON pc.id = p.company_id
    WHERE t.id = ${id}
  `;
  return rows[0] ?? null;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { title, description, status, priority, assignee_id, company_id, project_id, due_date } = body;

  // Only touch fields present in the body so partial updates (status/priority)
  // do not wipe assignee, dates, or other columns.
  await sql`
    UPDATE todos SET
      title = CASE WHEN ${"title" in body} THEN ${title ?? null} ELSE title END,
      description = CASE WHEN ${"description" in body} THEN ${description ?? null} ELSE description END,
      status = CASE WHEN ${"status" in body} THEN ${status ?? null} ELSE status END,
      priority = CASE WHEN ${"priority" in body} THEN ${priority ?? null} ELSE priority END,
      assignee_id = CASE WHEN ${"assignee_id" in body} THEN ${assignee_id ?? null} ELSE assignee_id END,
      company_id = CASE WHEN ${"company_id" in body} THEN ${company_id ?? null} ELSE company_id END,
      project_id = CASE WHEN ${"project_id" in body} THEN ${project_id ?? null} ELSE project_id END,
      due_date = CASE WHEN ${"due_date" in body} THEN ${due_date ?? null} ELSE due_date END,
      updated_at = now()
    WHERE id = ${id}
  `;

  const todo = await fetchTodo(id);
  if (!todo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(todo);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await sql`DELETE FROM todos WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
