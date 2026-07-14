import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import { DEFAULT_PROJECT_MILESTONES, DEFAULT_PHASE_COLORS } from "@/lib/types";

export async function GET() {
  try {
    await ensureTables();
    const { rows } = await sql`
      SELECT
        p.*,
        json_build_object('id', c.id, 'name', c.name, 'industry', c.industry) AS company,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.approved = true) AS task_count,
        (SELECT COUNT(*) FROM tasks t
          INNER JOIN milestones m ON m.id = t.milestone_id
          WHERE t.project_id = p.id AND t.approved = true AND LOWER(m.name) = 'done') AS done_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.created_by = 'client' AND t.approved = false) AS pending_requests
      FROM projects p
      LEFT JOIN companies c ON c.id = p.company_id
      ORDER BY p.updated_at DESC
    `;
    return NextResponse.json(rows);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTables();
    const body = await req.json();
    const {
      name, description, company_id, opportunity_id,
      status, client_name, client_email, start_date, end_date,
    } = body;

    const { rows } = await sql`
      INSERT INTO projects (name, description, company_id, opportunity_id, status, client_name, client_email, start_date, end_date)
      VALUES (
        ${name}, ${description ?? null}, ${company_id ?? null}, ${opportunity_id ?? null},
        ${status ?? "active"}, ${client_name ?? null}, ${client_email ?? null},
        ${start_date ?? null}, ${end_date ?? null}
      )
      RETURNING *
    `;

    const project = rows[0];

    for (let i = 0; i < DEFAULT_PROJECT_MILESTONES.length; i++) {
      const name = DEFAULT_PROJECT_MILESTONES[i];
      await sql`
        INSERT INTO milestones (project_id, name, position, status, color)
        VALUES (${project.id}, ${name}, ${i}, 'pending', ${DEFAULT_PHASE_COLORS[name]})
      `;
    }

    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
