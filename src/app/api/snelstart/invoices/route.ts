import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth";
import { listSnelstartInvoices, getSnelstartInvoiceTotals } from "@/lib/snelstart/sync";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await resolveSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const openOnly = req.nextUrl.searchParams.get("open") === "1";
  const [invoices, totals] = await Promise.all([
    listSnelstartInvoices({ openOnly, limit: 300 }),
    getSnelstartInvoiceTotals(),
  ]);

  return NextResponse.json({ invoices, totals });
}
