import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import {
  mapRetainerRow,
  normalizeInvoicedPeriods,
  toggleInvoicedPeriod,
} from "@/lib/retainers";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureTables();
    const { id } = await params;
    const body = await req.json();

    const { rows: existingRows } = await sql`
      SELECT * FROM retainer_agreements WHERE id = ${id}
    `;
    if (!existingRows[0]) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const existing = existingRows[0];

    let periods = normalizeInvoicedPeriods(existing.invoiced_periods);
    if (Array.isArray(body.invoiced_periods)) {
      periods = normalizeInvoicedPeriods(body.invoiced_periods);
    } else if (typeof body.toggle_period === "string" && body.toggle_period) {
      periods = toggleInvoicedPeriod(periods, body.toggle_period);
    }

    const hourBucketsJson =
      body.hour_buckets !== undefined
        ? JSON.stringify(body.hour_buckets)
        : JSON.stringify(existing.hour_buckets ?? []);

    const { rows } = await sql`
      UPDATE retainer_agreements SET
        client_name = COALESCE(${body.client_name?.trim() ?? null}, client_name),
        company_id = ${body.company_id !== undefined ? body.company_id : existing.company_id},
        status = COALESCE(${body.status ?? null}, status),
        hours_cadence = COALESCE(${body.hours_cadence ?? null}, hours_cadence),
        hours_included = COALESCE(${body.hours_included !== undefined ? Number(body.hours_included) : null}, hours_included),
        billing_model = COALESCE(${body.billing_model ?? null}, billing_model),
        hourly_rate = COALESCE(${body.hourly_rate !== undefined ? Number(body.hourly_rate) : null}, hourly_rate),
        monthly_fee = COALESCE(${body.monthly_fee !== undefined ? Number(body.monthly_fee) : null}, monthly_fee),
        start_date = COALESCE(${body.start_date ?? null}, start_date),
        period_anchor = COALESCE(${body.period_anchor ?? null}, period_anchor),
        flex_hours = COALESCE(${typeof body.flex_hours === "boolean" ? body.flex_hours : null}, flex_hours),
        notes = ${body.notes !== undefined ? (body.notes?.trim() || null) : existing.notes},
        invoiced_periods = ${JSON.stringify(periods)}::jsonb,
        hour_buckets = ${hourBucketsJson}::jsonb,
        linked_repos = ${
          body.linked_repos !== undefined
            ? JSON.stringify(body.linked_repos)
            : JSON.stringify(existing.linked_repos ?? [])
        }::jsonb,
        updated_at = now()
      WHERE id = ${id}
      RETURNING *
    `;
    return NextResponse.json(mapRetainerRow(rows[0]));
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureTables();
    const { id } = await params;
    await sql`DELETE FROM retainer_agreements WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
