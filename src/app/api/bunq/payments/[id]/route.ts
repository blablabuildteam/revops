import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth";
import { BunqError } from "@/lib/bunq/client";
import { linkBunqPaymentToDeal } from "@/lib/bunq/sync";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await resolveSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const paymentId = Number(id);
  if (!Number.isFinite(paymentId) || paymentId <= 0) {
    return NextResponse.json({ error: "Invalid payment id" }, { status: 400 });
  }

  let body: { finance_deal_id?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const dealId =
    body.finance_deal_id === null || body.finance_deal_id === ""
      ? null
      : typeof body.finance_deal_id === "string"
        ? body.finance_deal_id
        : undefined;

  if (dealId === undefined) {
    return NextResponse.json(
      { error: "finance_deal_id required (string or null)" },
      { status: 400 },
    );
  }

  try {
    const result = await linkBunqPaymentToDeal(paymentId, dealId);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Bunq payment link failed", err);
    if (err instanceof BunqError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Link failed";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
