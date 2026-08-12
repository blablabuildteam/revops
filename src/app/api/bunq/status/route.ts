import { NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth";
import { ensureTables } from "@/lib/db";
import { bunqConfigStatus, testBunqConnection } from "@/lib/bunq/client";
import { ensureBunqPaymentsTable, getBunqPaymentTotals } from "@/lib/bunq/sync";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await resolveSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = bunqConfigStatus();
  await ensureTables();
  await ensureBunqPaymentsTable();
  const totals = await getBunqPaymentTotals();

  let connection: { ok: boolean; accounts?: number; error?: string } | null = null;
  if (config.configured) {
    connection = await testBunqConnection();
  }

  return NextResponse.json({ ...config, connection, totals });
}
