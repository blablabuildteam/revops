import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import { mapRetainerRow, mapTimeEntryRow } from "@/lib/retainers";

export async function GET() {
  try {
    await ensureTables();
    const { rows } = await sql`
      SELECT * FROM retainer_agreements
      ORDER BY
        CASE status
          WHEN 'active' THEN 0
          WHEN 'upcoming' THEN 1
          WHEN 'paused' THEN 2
          ELSE 3
        END,
        start_date ASC,
        client_name ASC
    `;
    const retainers = rows.map(mapRetainerRow);

    const { rows: entryRows } = await sql`
      SELECT * FROM retainer_time_entries
      ORDER BY week_start DESC, created_at DESC
    `;
    const entries = entryRows.map(mapTimeEntryRow);
    const byRetainer = new Map<string, typeof entries>();
    for (const entry of entries) {
      const list = byRetainer.get(entry.retainer_id) ?? [];
      list.push(entry);
      byRetainer.set(entry.retainer_id, list);
    }

    return NextResponse.json(
      retainers.map((r) => ({
        ...r,
        entries: byRetainer.get(r.id) ?? [],
      })),
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTables();
    const body = await req.json();
    if (!body.client_name?.trim()) {
      return NextResponse.json({ error: "client_name is required" }, { status: 400 });
    }
    if (!body.start_date) {
      return NextResponse.json({ error: "start_date is required" }, { status: 400 });
    }

    const { rows } = await sql`
      INSERT INTO retainer_agreements (
        client_name, company_id, status, hours_cadence, hours_included,
        billing_model, hourly_rate, monthly_fee, start_date, notes
      ) VALUES (
        ${body.client_name.trim()},
        ${body.company_id ?? null},
        ${body.status ?? "upcoming"},
        ${body.hours_cadence === "monthly" ? "monthly" : "weekly"},
        ${Number(body.hours_included) || 0},
        ${body.billing_model === "fixed_monthly" ? "fixed_monthly" : "hourly"},
        ${Number(body.hourly_rate) || 0},
        ${Number(body.monthly_fee) || 0},
        ${body.start_date},
        ${body.notes?.trim() || null}
      )
      RETURNING *
    `;
    return NextResponse.json(
      { ...mapRetainerRow(rows[0]), entries: [] },
      { status: 201 },
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
