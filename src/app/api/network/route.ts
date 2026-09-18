import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";

export async function GET() {
  try {
    await ensureTables();
    const { rows } = await sql`
      SELECT * FROM network_contacts
      ORDER BY
        CASE status WHEN 'active' THEN 0 WHEN 'dormant' THEN 1 ELSE 2 END,
        name
    `;
    return NextResponse.json(rows);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTables();
    const {
      name,
      email,
      phone,
      company,
      role,
      linkedin_url,
      notes,
      tags,
      last_contacted,
      status,
    } = await req.json();

    const { rows } = await sql`
      INSERT INTO network_contacts (
        name, email, phone, company, role, linkedin_url,
        notes, tags, last_contacted, status
      )
      VALUES (
        ${name},
        ${email ?? null},
        ${phone ?? null},
        ${company ?? null},
        ${role ?? null},
        ${linkedin_url ?? null},
        ${notes ?? null},
        ${tags ?? []},
        ${last_contacted ?? null},
        ${status ?? "active"}
      )
      RETURNING *
    `;
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
