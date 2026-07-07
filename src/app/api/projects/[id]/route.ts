import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await ensureTables();
    const { rows: projectRows } = await sql`
      SELECT p.*, json_build_object('id', c.id, 'name', c.name) AS company
      FROM projects p
      LEFT JOIN companies c ON c.id = p.company_id
      WHERE p.id = ${id}
    `;
    if (!projectRows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const project = projectRows[0];

    const { rows: milestones } = await sql`
      SELECT * FROM milestones WHERE project_id = ${id} ORDER BY position, created_at
    `;

    const { rows: tasks } = await sql`
      SELECT * FROM tasks WHERE project_id = ${id} ORDER BY position, created_at
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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await ensureTables();
    const body = await req.json();
    const {
      name, description, company_id, opportunity_id,
      status, client_name, client_email, start_date, end_date,
    } = body;

    const { rows } = await sql`
      UPDATE projects SET
        name = COALESCE(${name ?? null}, name),
        description = ${description ?? null},
        company_id = ${company_id ?? null},
        opportunity_id = ${opportunity_id ?? null},
        status = COALESCE(${status ?? null}, status),
        client_name = ${client_name ?? null},
        client_email = ${client_email ?? null},
        start_date = ${start_date ?? null},
        end_date = ${end_date ?? null},
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
    await sql`DELETE FROM projects WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
