import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { rows } = await sql`SELECT * FROM network_contacts WHERE id = ${id}`;
  if (rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(rows[0]);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
    UPDATE network_contacts SET
      name = COALESCE(${name ?? null}, name),
      email = ${email ?? null},
      phone = ${phone ?? null},
      company = ${company ?? null},
      role = ${role ?? null},
      linkedin_url = ${linkedin_url ?? null},
      notes = ${notes ?? null},
      tags = COALESCE(${tags ?? null}, tags),
      last_contacted = ${last_contacted ?? null},
      status = COALESCE(${status ?? null}, status),
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  if (rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(rows[0]);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await sql`DELETE FROM network_contacts WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
