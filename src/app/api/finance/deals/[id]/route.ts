import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import {
  formatFinanceDealRow,
  normalizeDateParam,
  normalizeDealPayments,
  normalizePaymentSchedule,
} from "@/lib/format";

function sumPayments(payments: { amount: number }[]) {
  return payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await ensureTables();
    const { rows } = await sql`SELECT * FROM finance_deals WHERE id = ${id}`;
    if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(formatFinanceDealRow(rows[0]));
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Database error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await ensureTables();
    const body = await req.json();
    const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);

    const { rows: existing } = await sql`SELECT * FROM finance_deals WHERE id = ${id}`;
    if (!existing[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const current = existing[0];

    const {
      company_name,
      project_name,
      deal_type,
      total_deal_value,
      start_date,
      end_date,
      payment_schedule,
      monthly_fee,
      monthly_revshare,
      payments,
    } = body;

    const startDateValue = has("start_date")
      ? normalizeDateParam(start_date)
      : normalizeDateParam(current.start_date as string | Date | null);
    const endDateValue = has("end_date")
      ? normalizeDateParam(end_date)
      : normalizeDateParam(current.end_date as string | Date | null);

    const normalizedPayments = has("payments")
      ? normalizeDealPayments(payments)
      : normalizeDealPayments(current.payments);
    const amountPaid = sumPayments(normalizedPayments);

    const normalizedSchedule = has("payment_schedule")
      ? normalizePaymentSchedule(payment_schedule)
      : normalizePaymentSchedule(current.payment_schedule);

    const { rows } = await sql`
      UPDATE finance_deals SET
        company_name = COALESCE(${company_name ?? null}, company_name),
        project_name = COALESCE(${project_name ?? null}, project_name),
        deal_type = COALESCE(${deal_type ?? null}, deal_type),
        total_deal_value = COALESCE(${total_deal_value ?? null}, total_deal_value),
        start_date = ${startDateValue},
        end_date = ${endDateValue},
        payment_schedule = ${JSON.stringify(normalizedSchedule)},
        monthly_fee = COALESCE(${monthly_fee ?? null}, monthly_fee),
        monthly_revshare = COALESCE(${monthly_revshare ?? null}, monthly_revshare),
        payments = ${JSON.stringify(normalizedPayments)},
        amount_paid = ${amountPaid},
        updated_at = now()
      WHERE id = ${id}
      RETURNING *
    `;

    return NextResponse.json(formatFinanceDealRow(rows[0]));
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Database error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await ensureTables();
    await sql`DELETE FROM finance_deals WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Database error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
