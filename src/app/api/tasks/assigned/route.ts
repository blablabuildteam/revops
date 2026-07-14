import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import { resolveSessionUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    await ensureTables();
    const user = await resolveSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const assigneeName = searchParams.get("assignee_name") || null;
    const status = searchParams.get("status") || null;

    const { rows } = await sql`
      SELECT
        t.id, t.title, t.description, t.status, t.assignee,
        t.due_date, t.priority, t.position, t.created_at, t.updated_at,
        t.project_id, t.milestone_id, t.parent_id, t.approved, t.url,
        t.created_by,
        p.name AS project_name,
        c.name AS company_name,
        c.id AS company_id,
        c.logo_url AS company_logo_url,
        m.name AS milestone_name,
        m.color AS milestone_color
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      LEFT JOIN companies c ON c.id = p.company_id
      LEFT JOIN milestones m ON m.id = t.milestone_id
      WHERE
        t.approved = true
        AND (COALESCE(${assigneeName}, '') = '' OR t.assignee = ${assigneeName})
        AND (
          COALESCE(${status}, '') = ''
          OR (${status} = 'active' AND (m.name IS NULL OR LOWER(m.name) != 'done'))
          OR (${status} = 'done' AND LOWER(m.name) = 'done')
          OR (${status} NOT IN ('active', 'done') AND t.status = ${status})
        )
      ORDER BY
        p.name ASC,
        m.position ASC NULLS LAST,
        t.position ASC,
        t.due_date ASC NULLS LAST,
        t.created_at ASC
    `;
    return NextResponse.json(rows);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
