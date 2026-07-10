import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";

const asNull = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  return String(v);
};

export async function GET() {
  try {
    await ensureTables();
    const { rows } = await sql`
      SELECT
        o.*,
        o.expected_value * o.probability / 100 AS weighted_value,
        json_build_object(
          'id', c.id,
          'name', c.name,
          'industry', c.industry,
          'website', c.website,
          'country', c.country
        ) AS company
      FROM opportunities o
      LEFT JOIN companies c ON c.id = o.company_id
      ORDER BY o.updated_at DESC
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
    const body = await req.json();
    const {
      name, description, company_id, type, stage, probability,
      expected_value, actual_value, currency, sentiment,
      proposal_status, proposal_url, owner, close_date, start_date, end_date, notes, tags,
    } = body;

    const { rows } = await sql`
      INSERT INTO opportunities (
        name, description, company_id, type, stage, probability,
        expected_value, actual_value, currency, sentiment,
        proposal_status, proposal_url, owner, close_date, start_date, end_date, notes, tags
      ) VALUES (
        ${name}, ${asNull(description)}, ${asNull(company_id)},
        ${type}, ${stage}, ${probability},
        ${expected_value}, ${actual_value}, ${currency}, ${sentiment},
        ${asNull(proposal_status)}, ${asNull(proposal_url)}, ${asNull(owner)},
        ${asNull(close_date)}, ${asNull(start_date)}, ${asNull(end_date)}, ${asNull(notes)}, ${tags ?? null}
      )
      RETURNING *,
        expected_value * probability / 100 AS weighted_value
    `;

    const opp = rows[0];

    if (opp.company_id) {
      const { rows: companyRows } = await sql`
        SELECT * FROM companies WHERE id = ${opp.company_id}
      `;
      opp.company = companyRows[0] ?? null;
    } else {
      opp.company = null;
    }

    return NextResponse.json(opp, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
