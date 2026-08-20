import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import { ensureDefaultMilestones } from "@/lib/milestones";
import { applyDeadlineDefaultPriorities, applyDeadlineDefaultPriority } from "@/lib/project-deadline-priority";

export async function GET() {
  try {
    await ensureTables();
    const { rows } = await sql`
      SELECT
        p.*,
        json_build_object('id', c.id, 'name', c.name, 'industry', c.industry, 'logo_url', c.logo_url) AS company,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.approved = true) AS task_count,
        (SELECT COUNT(*) FROM tasks t
          INNER JOIN milestones m ON m.id = t.milestone_id
          WHERE t.project_id = p.id AND t.approved = true AND LOWER(m.name) = 'done') AS done_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.created_by = 'client' AND t.approved = false) AS pending_requests
      FROM projects p
      LEFT JOIN companies c ON c.id = p.company_id
      ORDER BY
        CASE p.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        CASE p.status WHEN 'active' THEN 0 WHEN 'on_hold' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,
        p.name
    `;
    return NextResponse.json(await applyDeadlineDefaultPriorities(rows));
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
      status, priority, client_name, client_email, start_date, end_date, lead,
    } = body;
    const createdPriority = priority ?? "low";
    const priorityManual = createdPriority !== "low";

    const { rows } = await sql`
      INSERT INTO projects (name, description, company_id, opportunity_id, status, priority, priority_manual, client_name, client_email, start_date, end_date, lead)
      VALUES (
        ${name}, ${description ?? null}, ${company_id ?? null}, ${opportunity_id ?? null},
        ${status ?? "active"}, ${createdPriority}, ${priorityManual}, ${client_name ?? null}, ${client_email ?? null},
        ${start_date ?? null}, ${end_date ?? null}, ${lead || null}
      )
      RETURNING *
    `;

    const project = await applyDeadlineDefaultPriority(rows[0]);
    await ensureDefaultMilestones(project.id);

    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
