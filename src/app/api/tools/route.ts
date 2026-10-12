import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import { mapToolRow, mapToolUsageRow } from "@/lib/tools";

export async function GET() {
  try {
    await ensureTables();
    const { rows } = await sql`
      SELECT t.*, c.name AS bill_to_company_name
      FROM tool_subscriptions t
      LEFT JOIN companies c ON c.id = t.bill_to_company_id
      ORDER BY
        CASE t.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,
        COALESCE(c.name, ''),
        t.name
    `;
    const tools = rows.map(mapToolRow);

    const { rows: usageRows } = await sql`
      SELECT * FROM tool_usage_entries
      ORDER BY month DESC, created_at DESC
    `;
    const usage = usageRows.map(mapToolUsageRow);
    const byTool = new Map<string, typeof usage>();
    for (const entry of usage) {
      const list = byTool.get(entry.tool_id) ?? [];
      list.push(entry);
      byTool.set(entry.tool_id, list);
    }

    return NextResponse.json(
      tools.map((t) => ({
        ...t,
        usage: byTool.get(t.id) ?? [],
      })),
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTables();
    const body = await req.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const costType =
      body.cost_type === "usage" || body.cost_type === "hybrid"
        ? body.cost_type
        : "fixed";
    const category = [
      "software",
      "ai",
      "hosting",
      "design",
      "comms",
      "other",
    ].includes(body.category)
      ? body.category
      : "other";
    const passThrough =
      body.pass_through === false || body.pass_through === "false"
        ? false
        : true;

    const { rows } = await sql`
      INSERT INTO tool_subscriptions (
        name, vendor, category, cost_type, billing_frequency, our_cost,
        currency, status, start_date, end_date, bill_to_company_id,
        pass_through, notes, login_url
      ) VALUES (
        ${body.name.trim()},
        ${body.vendor?.trim() || null},
        ${category},
        ${costType},
        ${body.billing_frequency === "yearly" ? "yearly" : "monthly"},
        ${Number(body.our_cost) || 0},
        ${body.currency?.trim() || "EUR"},
        ${
          body.status === "paused" || body.status === "ended"
            ? body.status
            : "active"
        },
        ${body.start_date || null},
        ${body.end_date || null},
        ${body.bill_to_company_id || null},
        ${passThrough},
        ${body.notes?.trim() || null},
        ${body.login_url?.trim() || null}
      )
      RETURNING *
    `;

    let billToName: string | null = null;
    if (rows[0].bill_to_company_id) {
      const { rows: companies } = await sql`
        SELECT name FROM companies WHERE id = ${rows[0].bill_to_company_id}
      `;
      billToName = companies[0]?.name ? String(companies[0].name) : null;
    }

    return NextResponse.json(
      {
        ...mapToolRow({ ...rows[0], bill_to_company_name: billToName }),
        usage: [],
      },
      { status: 201 },
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
