import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await ensureTables();
    const { rows } = await sql`
      SELECT o.*, o.expected_value * o.probability / 100 AS weighted_value,
        json_build_object('id', c.id, 'name', c.name, 'industry', c.industry,
          'website', c.website, 'country', c.country) AS company
      FROM opportunities o
      LEFT JOIN companies c ON c.id = o.company_id
      WHERE o.id = ${id}
    `;
    if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
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
    const {
      name, description, company_id, type, stage, probability,
      expected_value, actual_value, currency, sentiment,
      proposal_status, proposal_url, owner, close_date, notes, tags,
    } = body;

    const { rows } = await sql`
      UPDATE opportunities SET
        name = COALESCE(${name ?? null}, name),
        description = ${description ?? null},
        company_id = ${company_id ?? null},
        type = COALESCE(${type ?? null}, type),
        stage = COALESCE(${stage ?? null}, stage),
        probability = COALESCE(${probability ?? null}, probability),
        expected_value = COALESCE(${expected_value ?? null}, expected_value),
        actual_value = COALESCE(${actual_value ?? null}, actual_value),
        currency = COALESCE(${currency ?? null}, currency),
        sentiment = COALESCE(${sentiment ?? null}, sentiment),
        proposal_status = ${proposal_status ?? null},
        proposal_url = ${proposal_url ?? null},
        owner = ${owner ?? null},
        close_date = ${close_date ?? null},
        notes = ${notes ?? null},
        tags = ${tags ?? null},
        updated_at = now()
      WHERE id = ${id}
      RETURNING *, expected_value * probability / 100 AS weighted_value
    `;

    if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const opp = rows[0];
    if (opp.company_id) {
      const { rows: companyRows } = await sql`SELECT * FROM companies WHERE id = ${opp.company_id}`;
      opp.company = companyRows[0] ?? null;
    } else {
      opp.company = null;
    }

    return NextResponse.json(opp);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await ensureTables();
    await sql`DELETE FROM opportunities WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
