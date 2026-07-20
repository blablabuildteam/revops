import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";

// Public endpoint — returns project for client view (no financial data)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    await ensureTables();
    const { rows: projectRows } = await sql`
      SELECT p.id, p.name, p.description, p.status, p.share_token,
             p.client_name, p.start_date, p.end_date,
             json_build_object('id', c.id, 'name', c.name) AS company
      FROM projects p
      LEFT JOIN companies c ON c.id = p.company_id
      WHERE p.share_token = ${token}
    `;
    if (!projectRows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const project = projectRows[0];

    const { rows: milestones } = await sql`
      SELECT * FROM milestones WHERE project_id = ${project.id} ORDER BY position, created_at
    `;

    // Client sees: approved tasks + their own pending requests
    const { rows: tasks } = await sql`
      SELECT id, project_id, milestone_id, title, description, status,
             created_by, approved, assignee, due_date, created_at
      FROM tasks
      WHERE project_id = ${project.id}
        AND (approved = true OR created_by = 'client')
      ORDER BY
        CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
        position,
        created_at
    `;

    project.milestones = milestones.map((m) => ({
      ...m,
      tasks: tasks.filter((t) => t.milestone_id === m.id),
    }));
    project.unassigned_tasks = tasks.filter((t) => !t.milestone_id);

    return NextResponse.json(project);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

// Client submits a task request
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    await ensureTables();
    const { rows: projectRows } = await sql`
      SELECT id FROM projects WHERE share_token = ${token}
    `;
    if (!projectRows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const project_id = projectRows[0].id;
    const { title, description, milestone_id } = await req.json();

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const { rows } = await sql`
      INSERT INTO tasks (project_id, milestone_id, title, description, created_by, approved)
      VALUES (${project_id}, ${milestone_id ?? null}, ${title.trim()}, ${description ?? null}, 'client', false)
      RETURNING id, title, description, status, created_by, approved, created_at
    `;
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
