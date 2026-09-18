import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import { resolveSessionUser } from "@/lib/auth";
import {
  fetchTodo,
  listTodos,
  replaceTodoAssignees,
  resolveAssigneeIds,
} from "@/lib/todos";

export async function GET(req: NextRequest) {
  try {
    await ensureTables();
    const { searchParams } = req.nextUrl;
    const assignee = searchParams.get("assignee") || null;
    const status = searchParams.get("status") || null;
    const company = searchParams.get("company") || null;

    const rows = await listTodos({ assignee, status, company });
    return NextResponse.json(rows);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTables();
    const user = await resolveSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      title,
      description,
      status,
      priority,
      assignee_id,
      assignee_ids,
      company_id,
      project_id,
      due_date,
    } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const resolvedAssignees = Array.isArray(assignee_ids)
      ? await resolveAssigneeIds(assignee_ids)
      : assignee_id === null
        ? []
        : await resolveAssigneeIds([assignee_id || user.id]);
    const resolvedStatus =
      status === "backlog" || status === "in_progress" || status === "done"
        ? status
        : "open";

    const { rows } = await sql`
      INSERT INTO todos (
        title, description, status, priority, assignee_id, company_id, project_id, due_date, created_by
      )
      VALUES (
        ${title.trim()},
        ${description?.trim() || null},
        ${resolvedStatus},
        ${priority ?? "low"},
        ${resolvedAssignees[0] ?? null},
        ${company_id ?? null},
        ${project_id ?? null},
        ${due_date ?? null},
        ${user.id}
      )
      RETURNING id
    `;

    await replaceTodoAssignees(rows[0].id, resolvedAssignees);

    const todo = await fetchTodo(rows[0].id);
    return NextResponse.json(todo, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
