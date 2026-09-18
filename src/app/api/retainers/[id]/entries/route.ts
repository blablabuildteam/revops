import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import { parseLocalDate } from "@/lib/format";
import { mapTimeEntryRow, weekStartOf } from "@/lib/retainers";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureTables();
    const { id: retainerId } = await params;
    const body = await req.json();

    const { rows: retainers } = await sql`
      SELECT id FROM retainer_agreements WHERE id = ${retainerId}
    `;
    if (!retainers[0]) {
      return NextResponse.json({ error: "Retainer not found" }, { status: 404 });
    }

    const hours = Number(body.hours);
    if (!Number.isFinite(hours) || hours < 0) {
      return NextResponse.json({ error: "hours must be >= 0" }, { status: 400 });
    }
    if (!body.activity?.trim()) {
      return NextResponse.json({ error: "activity is required" }, { status: 400 });
    }

    const workDate = body.work_date
      ? String(body.work_date).slice(0, 10)
      : null;
    const parsedWork = workDate ? parseLocalDate(workDate) : null;
    const weekStart = parsedWork
      ? weekStartOf(parsedWork)
      : body.week_start
        ? String(body.week_start).slice(0, 10)
        : weekStartOf();

    const { rows } = await sql`
      INSERT INTO retainer_time_entries (
        retainer_id, week_start, hours, activity, category, logged_by, work_date
      ) VALUES (
        ${retainerId},
        ${weekStart},
        ${hours},
        ${body.activity.trim()},
        ${body.category?.trim() || null},
        ${body.logged_by?.trim() || null},
        ${workDate}
      )
      RETURNING *
    `;
    return NextResponse.json(mapTimeEntryRow(rows[0]), { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
