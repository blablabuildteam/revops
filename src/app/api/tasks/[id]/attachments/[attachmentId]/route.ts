import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import { resolveSessionUser } from "@/lib/auth";
import { deleteStoredFile } from "@/lib/blob-storage";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const { id, attachmentId } = await params;
  try {
    await ensureTables();
    const user = await resolveSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { rows } = await sql`
      SELECT id, file_url FROM task_attachments
      WHERE id = ${attachmentId} AND task_id = ${id}
    `;
    if (!rows[0]) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await deleteStoredFile(rows[0].file_url as string);
    await sql`DELETE FROM task_attachments WHERE id = ${attachmentId}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
