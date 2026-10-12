import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import { mapToolUsageRow } from "@/lib/tools";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureTables();
    const { id: toolId } = await params;
    const body = await req.json();

    const { rows: tools } = await sql`
      SELECT id FROM tool_subscriptions WHERE id = ${toolId}
    `;
    if (!tools[0]) {
      return NextResponse.json({ error: "Tool not found" }, { status: 404 });
    }

    const month = String(body.month ?? "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: "month must be YYYY-MM" },
        { status: 400 },
      );
    }

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json(
        { error: "amount must be >= 0" },
        { status: 400 },
      );
    }

    const { rows } = await sql`
      INSERT INTO tool_usage_entries (tool_id, month, amount, notes)
      VALUES (
        ${toolId},
        ${month},
        ${amount},
        ${body.notes?.trim() || null}
      )
      ON CONFLICT (tool_id, month) DO UPDATE SET
        amount = EXCLUDED.amount,
        notes = EXCLUDED.notes,
        updated_at = now()
      RETURNING *
    `;

    return NextResponse.json(mapToolUsageRow(rows[0]));
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureTables();
    const { id: toolId } = await params;
    const month = req.nextUrl.searchParams.get("month")?.slice(0, 7);
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: "month query param required (YYYY-MM)" },
        { status: 400 },
      );
    }
    await sql`
      DELETE FROM tool_usage_entries
      WHERE tool_id = ${toolId} AND month = ${month}
    `;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
