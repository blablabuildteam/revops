import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import { mapTimeEntryRow } from "@/lib/retainers";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ entryId: string }> },
) {
  try {
    await ensureTables();
    const { entryId } = await params;
    const body = await req.json();

    const { rows: existingRows } = await sql`
      SELECT * FROM retainer_time_entries WHERE id = ${entryId}
    `;
    if (!existingRows[0]) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const existing = existingRows[0];

    const hours =
      body.hours !== undefined ? Number(body.hours) : Number(existing.hours);
    if (!Number.isFinite(hours) || hours < 0) {
      return NextResponse.json({ error: "hours must be >= 0" }, { status: 400 });
    }

    const { rows } = await sql`
      UPDATE retainer_time_entries SET
        week_start = COALESCE(${body.week_start ? String(body.week_start).slice(0, 10) : null}, week_start),
        hours = ${hours},
        activity = COALESCE(${body.activity?.trim() ?? null}, activity),
        logged_by = ${body.logged_by !== undefined ? (body.logged_by?.trim() || null) : existing.logged_by},
        work_date = ${body.work_date !== undefined ? (body.work_date ? String(body.work_date).slice(0, 10) : null) : existing.work_date},
        updated_at = now()
      WHERE id = ${entryId}
      RETURNING *
    `;
    return NextResponse.json(mapTimeEntryRow(rows[0]));
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ entryId: string }> },
) {
  try {
    await ensureTables();
    const { entryId } = await params;
    await sql`DELETE FROM retainer_time_entries WHERE id = ${entryId}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
