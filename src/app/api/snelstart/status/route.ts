import { NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth";
import { snelstartConfigStatus, testSnelstartConnection } from "@/lib/snelstart/client";
import { getSnelstartInvoiceTotals, ensureSnelstartTables } from "@/lib/snelstart/sync";
import { ensureTables } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await resolveSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = snelstartConfigStatus();
  await ensureTables();
  await ensureSnelstartTables();
  const totals = await getSnelstartInvoiceTotals();

  let connection: { ok: boolean; error?: string } | null = null;
  if (config.configured) {
    connection = await testSnelstartConnection();
  }

  return NextResponse.json({
    ...config,
    connection,
    totals,
  });
}
