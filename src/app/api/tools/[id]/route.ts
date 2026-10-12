import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import {
  mapToolRow,
  mapToolUsageRow,
  normalizeInvoicedPeriods,
  toggleInvoicedPeriod,
} from "@/lib/tools";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureTables();
    const { id } = await params;
    const body = await req.json();

    const { rows: existingRows } = await sql`
      SELECT * FROM tool_subscriptions WHERE id = ${id}
    `;
    if (!existingRows[0]) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const existing = existingRows[0];

    let periods = normalizeInvoicedPeriods(existing.invoiced_periods);
    if (Array.isArray(body.invoiced_periods)) {
      periods = normalizeInvoicedPeriods(body.invoiced_periods);
    } else if (typeof body.toggle_period === "string" && body.toggle_period) {
      periods = toggleInvoicedPeriod(periods, body.toggle_period);
    }

    const costType =
      body.cost_type === undefined
        ? null
        : body.cost_type === "usage" || body.cost_type === "hybrid"
          ? body.cost_type
          : "fixed";

    const { rows } = await sql`
      UPDATE tool_subscriptions SET
        name = COALESCE(${body.name?.trim() ?? null}, name),
        vendor = ${
          body.vendor !== undefined
            ? body.vendor?.trim() || null
            : existing.vendor
        },
        category = COALESCE(${body.category ?? null}, category),
        cost_type = COALESCE(${costType}, cost_type),
        billing_frequency = COALESCE(${body.billing_frequency ?? null}, billing_frequency),
        our_cost = COALESCE(${
          body.our_cost !== undefined ? Number(body.our_cost) : null
        }, our_cost),
        currency = COALESCE(${body.currency?.trim() ?? null}, currency),
        status = COALESCE(${body.status ?? null}, status),
        start_date = ${
          body.start_date !== undefined
            ? body.start_date || null
            : existing.start_date
        },
        end_date = ${
          body.end_date !== undefined ? body.end_date || null : existing.end_date
        },
        bill_to_company_id = ${
          body.bill_to_company_id !== undefined
            ? body.bill_to_company_id || null
            : existing.bill_to_company_id
        },
        pass_through = COALESCE(${
          typeof body.pass_through === "boolean" ? body.pass_through : null
        }, pass_through),
        notes = ${
          body.notes !== undefined
            ? body.notes?.trim() || null
            : existing.notes
        },
        login_url = ${
          body.login_url !== undefined
            ? body.login_url?.trim() || null
            : existing.login_url
        },
        invoiced_periods = ${JSON.stringify(periods)}::jsonb,
        updated_at = now()
      WHERE id = ${id}
      RETURNING *
    `;

    let billToName: string | null = null;
    if (rows[0].bill_to_company_id) {
      const { rows: companies } = await sql`
        SELECT name FROM companies WHERE id = ${rows[0].bill_to_company_id}
      `;
      billToName = companies[0]?.name ? String(companies[0].name) : null;
    }

    const { rows: usageRows } = await sql`
      SELECT * FROM tool_usage_entries
      WHERE tool_id = ${id}
      ORDER BY month DESC
    `;

    return NextResponse.json({
      ...mapToolRow({ ...rows[0], bill_to_company_name: billToName }),
      usage: usageRows.map(mapToolUsageRow),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureTables();
    const { id } = await params;
    await sql`DELETE FROM tool_subscriptions WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
