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
    const { name, industry, website, country } = await req.json();
    const { rows } = await sql`
      INSERT INTO companies (name, industry, website, country)
      VALUES (${name}, ${industry ?? null}, ${website ?? null}, ${country ?? "NL"})
      RETURNING *
    `;
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
