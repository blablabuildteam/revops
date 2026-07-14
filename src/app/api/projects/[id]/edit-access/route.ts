import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await ensureTables();

    const { rows: existing } = await sql`
      SELECT edit_token FROM projects WHERE id = ${id}
    `;
    if (!existing[0]) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing[0].edit_token) {
      return NextResponse.json({ edit_token: existing[0].edit_token });
    }

    const { rows } = await sql`
      UPDATE projects SET
        edit_token = encode(gen_random_bytes(16), 'hex'),
        updated_at = now()
      WHERE id = ${id}
      RETURNING edit_token
    `;
    return NextResponse.json({ edit_token: rows[0].edit_token });
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
    await ensureTables();
    const { rows } = await sql`
      UPDATE projects SET edit_token = NULL, updated_at = now()
      WHERE id = ${id}
      RETURNING id
    `;
    if (!rows[0]) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
