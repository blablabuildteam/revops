import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";

// GET ?month=2026-07 — returns revenue entries merged with retainer defaults
export async function GET(req: NextRequest) {
  await ensureTables();
  const month = req.nextUrl.searchParams.get("month");
  const monthDate = month ? `${month}-01` : new Date().toISOString().slice(0, 7) + "-01";

  // Get all companies with retainer info
  const { rows: companies } = await sql`
    SELECT id, name, industry, retainer_type, retainer_amount, commission_pct
    FROM companies ORDER BY name
  `;

  // Get saved revenue entries for this month
  const { rows: saved } = await sql`
    SELECT mr.*, c.name AS company_name, c.industry,
      c.retainer_type, c.retainer_amount, c.commission_pct
    FROM monthly_revenue mr
    JOIN companies c ON c.id = mr.company_id
    WHERE date_trunc('month', mr.month) = date_trunc('month', ${monthDate}::date)
    ORDER BY c.name
  `;

  const savedMap = new Map(saved.map((r) => [r.company_id, r]));

  // Merge: saved entries override retainer defaults
  const result = companies.map((c) => {
    const existing = savedMap.get(c.id);
    if (existing) return existing;

    // Auto-suggest from retainer
    const suggestedAmount =
      c.retainer_type === "fixed" ? Number(c.retainer_amount) : 0;

    return {
      company_id: c.id,
      company_name: c.name,
      industry: c.industry,
      retainer_type: c.retainer_type,
      retainer_amount: c.retainer_amount,
      commission_pct: c.commission_pct,
      amount: suggestedAmount,
      notes: null,
      month: monthDate,
      id: null, // not yet saved
    };
  });

  return NextResponse.json(result);
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
