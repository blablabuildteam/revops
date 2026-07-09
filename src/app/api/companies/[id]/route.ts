import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { name, industry, website, country, retainer_type, retainer_amount, commission_pct } = await req.json();

  const { rows } = await sql`
    UPDATE companies SET
      name = COALESCE(${name ?? null}, name),
      industry = ${industry ?? null},
      website = ${website ?? null},
      country = COALESCE(${country ?? null}, country),
      retainer_type = COALESCE(${retainer_type ?? null}, retainer_type),
      retainer_amount = COALESCE(${retainer_amount ?? null}, retainer_amount),
      commission_pct = COALESCE(${commission_pct ?? null}, commission_pct),
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return NextResponse.json(rows[0]);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await sql`DELETE FROM companies WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
