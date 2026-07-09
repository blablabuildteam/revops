import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";

export async function GET() {
  try {
    await ensureTables();
    const { rows } = await sql`SELECT * FROM companies ORDER BY name`;
    return NextResponse.json(rows);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTables();
    const { name, industry, website, country, retainer_type, retainer_amount, commission_pct } = await req.json();
    const { rows } = await sql`
      INSERT INTO companies (name, industry, website, country, retainer_type, retainer_amount, commission_pct)
      VALUES (
        ${name}, ${industry ?? null}, ${website ?? null}, ${country ?? "NL"},
        ${retainer_type ?? "none"}, ${retainer_amount ?? 0}, ${commission_pct ?? 0}
      )
      RETURNING *
    `;
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
