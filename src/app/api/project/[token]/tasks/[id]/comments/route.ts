import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import { resolveSessionUser } from "@/lib/auth";
import { resolveEditToken, assertTaskInEditProject } from "@/lib/edit-token";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params;
  try {
    await ensureTables();
    const project = await resolveEditToken(token);
    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!(await assertTaskInEditProject(id, project.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { rows } = await sql`
      SELECT id, task_id, author_user_id, author_name, body, created_at
      FROM task_comments
      WHERE task_id = ${id}
      ORDER BY created_at ASC
    `;
    return NextResponse.json(rows);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params;
  try {
    await ensureTables();
    const project = await resolveEditToken(token);
    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!(await assertTaskInEditProject(id, project.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const user = await resolveSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { body } = await req.json();
    const text = typeof body === "string" ? body.trim() : "";
    if (!text) {
      return NextResponse.json({ error: "Comment is required" }, { status: 400 });
    }

    const { rows } = await sql`
      INSERT INTO task_comments (task_id, author_user_id, author_name, body)
      VALUES (${id}, ${user.id}, ${user.name}, ${text})
      RETURNING id, task_id, author_user_id, author_name, body, created_at
    `;
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
