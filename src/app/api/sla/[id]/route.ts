import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import { slaInvoicePeriod } from "@/lib/sla";
import type { SlaBillingFrequency } from "@/lib/types";

function mapRow(row: Record<string, unknown>) {
  const frequency = (row.billing_frequency as SlaBillingFrequency) ?? "monthly";
  const currentPeriod = slaInvoicePeriod(frequency);
  const storedPeriod = (row.invoice_period as string | null) ?? null;
  const storedInvoiced = Boolean(row.invoiced);
  return {
    ...row,
    monthly_amount: Number(row.monthly_amount) || 0,
    invoiced: storedInvoiced && storedPeriod === currentPeriod,
    current_period: currentPeriod,
  };
}

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

    const period = slaInvoicePeriod(frequency);
    let invoiced = existing.invoiced;
    let invoicePeriod = existing.invoice_period;

    if (typeof body.invoiced === "boolean") {
      invoiced = body.invoiced;
      invoicePeriod = body.invoiced ? period : null;
    }

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
        invoiced = ${Boolean(invoiced)},
        invoice_period = ${invoicePeriod},
        updated_at = now()
      WHERE id = ${id}
      RETURNING *
    `;
    return NextResponse.json(mapRow(rows[0]));
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
