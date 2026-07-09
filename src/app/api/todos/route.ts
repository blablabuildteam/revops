import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    await ensureTables();
    const { searchParams } = req.nextUrl;
    const assignee = searchParams.get("assignee") || null;
    const status = searchParams.get("status") || null;

    const { rows } = await sql`
      SELECT
        t.*,
        u.name AS assignee_name, u.email AS assignee_email,
        c.name AS company_name,
        p.name AS project_name
      FROM todos t
      LEFT JOIN users u ON u.id = t.assignee_id
      LEFT JOIN companies c ON c.id = t.company_id
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE
        (COALESCE(${assignee}, '') = '' OR u.id::text = ${assignee})
        AND (COALESCE(${status}, '') = '' OR t.status = ${status})
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
  await ensureTables();
  const session = await getSession();
  const body = await req.json();
  const { title, description, priority, assignee_id, company_id, project_id, due_date } = body;

  const { rows } = await sql`
    INSERT INTO todos (title, description, priority, assignee_id, company_id, project_id, due_date, created_by)
    VALUES (
      ${title}, ${description ?? null}, ${priority ?? "medium"},
      ${assignee_id ?? null}, ${company_id ?? null}, ${project_id ?? null},
      ${due_date ?? null}, ${session?.id ?? null}
    )
    RETURNING *
  `;
  return NextResponse.json(rows[0], { status: 201 });
}
