import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";

const asNull = (v: unknown) => (v === "" || v == null ? null : v);

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

    const { rows: existing } = await sql`
      SELECT * FROM opportunities WHERE id = ${id}
    `;
    if (!existing[0]) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const current = existing[0];
    const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
    const val = <T>(key: string, fallback: T): T =>
      has(key) ? ((body[key] as T) ?? fallback) : fallback;

    await sql`
      UPDATE opportunities SET
        name = ${val("name", current.name)},
        description = ${val("description", current.description)},
        company_id = ${val("company_id", current.company_id)},
        type = ${val("type", current.type)},
        stage = ${val("stage", current.stage)},
        probability = ${val("probability", current.probability)},
        expected_value = ${val("expected_value", current.expected_value)},
        actual_value = ${val("actual_value", current.actual_value)},
        currency = ${val("currency", current.currency)},
        sentiment = ${val("sentiment", current.sentiment)},
        proposal_status = ${val("proposal_status", current.proposal_status)},
        proposal_url = ${val("proposal_url", current.proposal_url)},
        owner = ${val("owner", current.owner)},
        close_date = ${asNull(has("close_date") ? body.close_date : current.close_date)},
        start_date = ${asNull(has("start_date") ? body.start_date : current.start_date)},
        end_date = ${asNull(has("end_date") ? body.end_date : current.end_date)},
        notes = ${val("notes", current.notes)},
        tags = ${val("tags", current.tags)},
        updated_at = now()
      WHERE id = ${id}
    `;

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
      WHERE o.id = ${id}
    `;

    if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(rows[0]);
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
