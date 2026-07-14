import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import { resolveSessionUser } from "@/lib/auth";
import { resolveEditToken, assertTaskInEditProject } from "@/lib/edit-token";
import { storeFile } from "@/lib/blob-storage";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

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
      SELECT id, task_id, file_name, file_url, file_size, content_type,
             uploaded_by_user_id, uploaded_by_name, created_at
      FROM task_attachments
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

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "file";
    const fileUrl = await storeFile(`tasks/${id}/${safeName}`, file);

    const { rows } = await sql`
      INSERT INTO task_attachments (
        task_id, file_name, file_url, file_size, content_type,
        uploaded_by_user_id, uploaded_by_name
      )
      VALUES (
        ${id}, ${file.name}, ${fileUrl}, ${file.size},
        ${file.type || "application/octet-stream"},
        ${user.id}, ${user.name}
      )
      RETURNING id, task_id, file_name, file_url, file_size, content_type,
                uploaded_by_user_id, uploaded_by_name, created_at
    `;
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
