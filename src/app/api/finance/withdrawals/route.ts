import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";

export async function POST(req: NextRequest) {
  await ensureTables();
  const { month, amount, person, notes } = await req.json();
  const { rows } = await sql`
    INSERT INTO salary_withdrawals (month, amount, person, notes)
    VALUES (${month + "-01"}::date, ${amount}, ${person}, ${notes ?? null})
    RETURNING *
  `;
  return NextResponse.json(rows[0], { status: 201 });
}

export async function GET(req: NextRequest) {
  await ensureTables();
  const month = req.nextUrl.searchParams.get("month");
  const monthDate = month ? `${month}-01` : new Date().toISOString().slice(0, 7) + "-01";
  const { rows } = await sql`
    SELECT * FROM salary_withdrawals
    WHERE date_trunc('month', month) = date_trunc('month', ${monthDate}::date)
    ORDER BY created_at DESC
  `;
  return NextResponse.json(rows);
}
