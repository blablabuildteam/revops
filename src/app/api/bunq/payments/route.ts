import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth";
import { getBunqPaymentTotals, listBunqPayments } from "@/lib/bunq/sync";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await resolveSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const unmatched = req.nextUrl.searchParams.get("unmatched") === "1";
  const [payments, totals] = await Promise.all([
    listBunqPayments({ limit: 300 }),
    getBunqPaymentTotals(),
  ]);

  return NextResponse.json({
    payments: unmatched ? payments.filter((p) => !p.finance_deal_id) : payments,
    totals,
  });
}
