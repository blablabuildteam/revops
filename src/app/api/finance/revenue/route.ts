import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";

// GET ?month=2026-07 — returns all revenue entries for a month
export async function GET(req: NextRequest) {
  await ensureTables();
  const month = req.nextUrl.searchParams.get("month");
  const monthDate = month ? `${month}-01` : new Date().toISOString().slice(0, 7) + "-01";

  const { rows } = await sql`
    SELECT mr.*, c.name AS company_name, c.industry
    FROM monthly_revenue mr
    JOIN companies c ON c.id = mr.company_id
    WHERE date_trunc('month', mr.month) = date_trunc('month', ${monthDate}::date)
    ORDER BY c.name
  `;
  return NextResponse.json(rows);
}

// POST — upsert a revenue entry for a company/month
export async function POST(req: NextRequest) {
  await ensureTables();
  const { company_id, month, amount, notes } = await req.json();
  const monthDate = `${month}-01`;

  const { rows } = await sql`
    INSERT INTO monthly_revenue (company_id, month, amount, notes)
    VALUES (${company_id}, ${monthDate}::date, ${amount}, ${notes ?? null})
    ON CONFLICT (company_id, month)
    DO UPDATE SET amount = EXCLUDED.amount, notes = EXCLUDED.notes, updated_at = now()
    RETURNING *
  `;
  return NextResponse.json(rows[0]);
}
