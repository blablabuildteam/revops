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

export async function GET() {
  try {
    await ensureTables();
    const { rows } = await sql`
      SELECT * FROM sla_agreements
      ORDER BY
        CASE status
          WHEN 'active' THEN 0
          WHEN 'upcoming' THEN 1
          WHEN 'paused' THEN 2
          ELSE 3
        END,
        client_name ASC,
        domain ASC NULLS LAST
    `;
    return NextResponse.json(rows.map(mapRow));
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTables();
    const body = await req.json();
    const {
      client_name,
      company_id,
      domain,
      monthly_amount,
      billing_frequency,
      invoice_via,
      status,
      notes,
      invoiced,
    } = body;

    if (!client_name?.trim()) {
      return NextResponse.json({ error: "client_name is required" }, { status: 400 });
    }

    const frequency: SlaBillingFrequency =
      billing_frequency === "quarterly" ? "quarterly" : "monthly";
    const period = slaInvoicePeriod(frequency);

    const { rows } = await sql`
      INSERT INTO sla_agreements (
        client_name, company_id, domain, monthly_amount,
        billing_frequency, invoice_via, status, notes,
        invoiced, invoice_period
      ) VALUES (
        ${client_name.trim()},
        ${company_id ?? null},
        ${domain?.trim() || null},
        ${Number(monthly_amount) || 0},
        ${frequency},
        ${invoice_via?.trim() || null},
        ${status ?? "active"},
        ${notes?.trim() || null},
        ${Boolean(invoiced)},
        ${invoiced ? period : null}
      )
      RETURNING *
    `;
    return NextResponse.json(mapRow(rows[0]), { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
