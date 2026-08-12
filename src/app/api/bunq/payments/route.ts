import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth";
import { getBunqPaymentTotals, isClientRevenuePayment, listBunqPayments } from "@/lib/bunq/sync";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await resolveSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const unmatched = req.nextUrl.searchParams.get("unmatched") === "1";
  const revenueOnly = req.nextUrl.searchParams.get("revenue") !== "0";
  const [payments, totals] = await Promise.all([
    listBunqPayments({ limit: 300 }),
    getBunqPaymentTotals(),
  ]);

  let filtered = payments;
  if (revenueOnly) {
    filtered = filtered.filter(
      (p) =>
        p.matched_confidence !== "internal" &&
        isClientRevenuePayment({
          counterparty_name: p.counterparty_name,
          description: p.description,
          account_name: p.account_name,
        }),
    );
  }
  if (unmatched) {
    filtered = filtered.filter((p) => !p.finance_deal_id);
  }

  return NextResponse.json({
    payments: filtered,
    totals,
  });
}
