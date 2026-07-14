import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import { resolveEditToken } from "@/lib/edit-token";

interface MilestonePayload {
  id?: string;
  name: string;
  color?: string | null;
  position: number;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    await ensureTables();
    const project = await resolveEditToken(token);
    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { milestones } = (await req.json()) as { milestones: MilestonePayload[] };
    const projectId = project.id;

    const { rows: existing } = await sql`
      SELECT id FROM milestones WHERE project_id = ${projectId}
    `;
    const existingIds = new Set(existing.map((r) => r.id));
    const incomingIds = new Set(milestones.filter((m) => m.id).map((m) => m.id));

    const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
    for (const deleteId of toDelete) {
      await sql`DELETE FROM milestones WHERE id = ${deleteId} AND project_id = ${projectId}`;
    }

    const results = [];
    for (const m of milestones) {
      if (m.id && existingIds.has(m.id)) {
        const { rows } = await sql`
          UPDATE milestones SET
            name = ${m.name},
            color = ${m.color ?? null},
            position = ${m.position},
            updated_at = now()
          WHERE id = ${m.id} AND project_id = ${projectId}
          RETURNING *
        `;
        if (rows[0]) results.push(rows[0]);
      } else {
        const { rows } = await sql`
          INSERT INTO milestones (project_id, name, color, position)
          VALUES (${projectId}, ${m.name}, ${m.color ?? null}, ${m.position})
          RETURNING *
        `;
        results.push(rows[0]);
      }
    }

    return NextResponse.json(results);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
