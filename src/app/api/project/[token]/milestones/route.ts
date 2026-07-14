import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import { resolveEditToken } from "@/lib/edit-token";

export async function POST(
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

    const { name, description, position, color } = await req.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const { rows } = await sql`
      INSERT INTO milestones (project_id, name, description, position, color)
      VALUES (
        ${project.id}, ${name.trim()}, ${description ?? null},
        ${position ?? 0}, ${color ?? null}
      )
      RETURNING *
    `;
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
