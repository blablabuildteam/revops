import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import { mapRetainerRow, mapTimeEntryRow, toPublicRetainer } from "@/lib/retainers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    await ensureTables();
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { rows } = await sql`
      SELECT * FROM retainer_agreements WHERE share_token = ${token}
    `;
    if (!rows[0]) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const retainer = mapRetainerRow(rows[0]);
    const { rows: entryRows } = await sql`
      SELECT * FROM retainer_time_entries
      WHERE retainer_id = ${retainer.id}
      ORDER BY week_start DESC, created_at DESC
    `;

    return NextResponse.json(
      toPublicRetainer({
        ...retainer,
        entries: entryRows.map(mapTimeEntryRow),
      }),
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
