import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import {
  mapSlaRow,
  normalizeInvoicedPeriods,
  slaInvoicePeriod,
  toggleSlaPeriod,
} from "@/lib/sla";
import type { SlaBillingFrequency } from "@/lib/types";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureTables();
    const { id } = await params;
    const body = await req.json();

    const { rows: existingRows } = await sql`
      SELECT * FROM sla_agreements WHERE id = ${id}
    `;
    if (!existingRows[0]) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const existing = existingRows[0];

    const frequency: SlaBillingFrequency =
      body.billing_frequency === "quarterly" || body.billing_frequency === "monthly"
        ? body.billing_frequency
        : (existing.billing_frequency as SlaBillingFrequency);

    const currentPeriod = slaInvoicePeriod(frequency);
    let periods = normalizeInvoicedPeriods(existing.invoiced_periods);
    if (
      Boolean(existing.invoiced) &&
      typeof existing.invoice_period === "string" &&
      existing.invoice_period &&
      !periods.includes(existing.invoice_period)
    ) {
      periods = [...periods, existing.invoice_period];
    }

    if (Array.isArray(body.invoiced_periods)) {
      periods = normalizeInvoicedPeriods(body.invoiced_periods);
    } else if (typeof body.toggle_period === "string" && body.toggle_period) {
      periods = toggleSlaPeriod(periods, body.toggle_period);
    } else if (typeof body.invoiced === "boolean") {
      const set = new Set(periods);
      if (body.invoiced) set.add(currentPeriod);
      else set.delete(currentPeriod);
      periods = [...set].sort();
    }

    const startDate =
      body.start_date !== undefined
        ? body.start_date || null
        : existing.start_date;

    const { rows } = await sql`
      UPDATE sla_agreements SET
        client_name = COALESCE(${body.client_name?.trim() ?? null}, client_name),
        company_id = ${body.company_id !== undefined ? body.company_id : existing.company_id},
        domain = ${body.domain !== undefined ? (body.domain?.trim() || null) : existing.domain},
        monthly_amount = COALESCE(${body.monthly_amount !== undefined ? Number(body.monthly_amount) : null}, monthly_amount),
        billing_frequency = ${frequency},
        invoice_via = ${body.invoice_via !== undefined ? (body.invoice_via?.trim() || null) : existing.invoice_via},
        status = COALESCE(${body.status ?? null}, status),
        notes = ${body.notes !== undefined ? (body.notes?.trim() || null) : existing.notes},
        start_date = ${startDate},
        invoiced_periods = ${JSON.stringify(periods)}::jsonb,
        invoiced = ${periods.includes(currentPeriod)},
        invoice_period = ${periods.includes(currentPeriod) ? currentPeriod : null},
        updated_at = now()
      WHERE id = ${id}
      RETURNING *
    `;
    return NextResponse.json(mapSlaRow(rows[0]));
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
    await sql`DELETE FROM sla_agreements WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
