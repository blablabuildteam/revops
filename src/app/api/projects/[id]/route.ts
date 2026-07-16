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
      SELECT p.*, json_build_object('id', c.id, 'name', c.name, 'logo_url', c.logo_url) AS company
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
      SELECT
        t.*,
        COALESCE(cc.count, 0)::int AS comment_count,
        EXISTS (
          SELECT 1 FROM task_attachments ta WHERE ta.task_id = t.id
        ) AS has_attachments
      FROM tasks t
      LEFT JOIN (
        SELECT task_id, COUNT(*)::int AS count
        FROM task_comments
        GROUP BY task_id
      ) cc ON cc.task_id = t.id
      WHERE t.project_id = ${id}
      ORDER BY t.position, t.created_at
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

    // Only touch fields present in the body so partial updates (e.g. rename)
    // do not wipe description, company, dates, or other columns.
    const { rows } = await sql`
      UPDATE projects SET
        name = CASE WHEN ${"name" in body} THEN ${name ?? null} ELSE name END,
        description = CASE WHEN ${"description" in body} THEN ${description ?? null} ELSE description END,
        company_id = CASE WHEN ${"company_id" in body} THEN ${company_id ?? null} ELSE company_id END,
        opportunity_id = CASE WHEN ${"opportunity_id" in body} THEN ${opportunity_id ?? null} ELSE opportunity_id END,
        status = CASE WHEN ${"status" in body} THEN ${status ?? null} ELSE status END,
        client_name = CASE WHEN ${"client_name" in body} THEN ${client_name ?? null} ELSE client_name END,
        client_email = CASE WHEN ${"client_email" in body} THEN ${client_email ?? null} ELSE client_email END,
        start_date = CASE WHEN ${"start_date" in body} THEN ${start_date ?? null} ELSE start_date END,
        end_date = CASE WHEN ${"end_date" in body} THEN ${end_date ?? null} ELSE end_date END,
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
