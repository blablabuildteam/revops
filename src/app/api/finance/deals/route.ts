import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import { formatFinanceDealRow, normalizeDateParam, normalizeDealPayments, normalizePaymentSchedule } from "@/lib/format";

function sumPayments(payments: { amount: number }[]) {
  return payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
}

export async function GET(req: NextRequest) {
  try {
    await ensureTables();
    const opportunityId = req.nextUrl.searchParams.get("opportunity_id");

    const { rows } = opportunityId
      ? await sql`
          SELECT * FROM finance_deals
          WHERE opportunity_id = ${opportunityId}
          ORDER BY created_at DESC
        `
      : await sql`
          SELECT * FROM finance_deals
          ORDER BY created_at DESC
        `;

    return NextResponse.json(rows.map((row) => formatFinanceDealRow(row)));
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
      opportunity_id,
      project_id,
      company_id,
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

    if (!company_name || !project_name || !deal_type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (opportunity_id) {
      const { rows: existing } = await sql`
        SELECT id FROM finance_deals WHERE opportunity_id = ${opportunity_id} LIMIT 1
      `;
      if (existing.length > 0) {
        return NextResponse.json(
          { error: "A finance deal already exists for this opportunity" },
          { status: 409 }
        );
      }
    }

    const normalizedPayments = normalizeDealPayments(payments);
    const amountPaid = sumPayments(normalizedPayments);

    const { rows } = await sql`
      INSERT INTO finance_deals (
        opportunity_id, project_id, company_id, company_name, project_name,
        deal_type, total_deal_value, start_date, end_date,
        payment_schedule, monthly_fee, monthly_revshare, amount_paid, payments
      ) VALUES (
        ${opportunity_id ?? null}, ${project_id ?? null}, ${company_id ?? null},
        ${company_name}, ${project_name}, ${deal_type},
        ${total_deal_value ?? 0},
        ${normalizeDateParam(start_date)},
        ${normalizeDateParam(end_date)},
        ${JSON.stringify(normalizePaymentSchedule(payment_schedule))},
        ${monthly_fee ?? 0}, ${monthly_revshare ?? 0}, ${amountPaid},
        ${JSON.stringify(normalizedPayments)}
      )
      RETURNING *
    `;

    return NextResponse.json(formatFinanceDealRow(rows[0]), { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
