import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import { resolveSessionUser } from "@/lib/auth";

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

export async function GET(req: NextRequest) {
  try {
    await ensureTables();
    const { searchParams } = req.nextUrl;
    const assignee = searchParams.get("assignee") || null;
    const status = searchParams.get("status") || null;
    const company = searchParams.get("company") || null;

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
      WHERE
        (COALESCE(${assignee}, '') = '' OR u.id::text = ${assignee})
        AND (COALESCE(${status}, '') = '' OR t.status = ${status})
        AND (COALESCE(${company}, '') = '' OR t.company_id::text = ${company})
      ORDER BY
        CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
        t.due_date ASC NULLS LAST,
        t.created_at DESC
    `;
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
      priority,
      assignee_id,
      company_id,
      project_id,
      due_date,
    } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const resolvedAssignee =
      assignee_id === null ? null : (assignee_id || user.id);

    const { rows } = await sql`
      INSERT INTO todos (
        title, description, priority, assignee_id, company_id, project_id, due_date, created_by
      )
      VALUES (
        ${title.trim()},
        ${description?.trim() || null},
        ${priority ?? "low"},
        ${resolvedAssignee},
        ${company_id ?? null},
        ${project_id ?? null},
        ${due_date ?? null},
        ${user.id}
      )
      RETURNING id
    `;

    const todo = await fetchTodo(rows[0].id);
    return NextResponse.json(todo, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
