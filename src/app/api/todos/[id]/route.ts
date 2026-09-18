import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import {
  fetchTodo,
  replaceTodoAssignees,
  resolveAssigneeIds,
} from "@/lib/todos";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureTables();
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

    if ("assignee_ids" in body) {
      await replaceTodoAssignees(id, await resolveAssigneeIds(body.assignee_ids));
    } else if ("assignee_id" in body) {
      await replaceTodoAssignees(
        id,
        await resolveAssigneeIds(assignee_id ? [assignee_id] : []),
      );
    }

    const todo = await fetchTodo(id);
    if (!todo) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(todo);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureTables();
  const { id } = await params;
  await sql`DELETE FROM todos WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
