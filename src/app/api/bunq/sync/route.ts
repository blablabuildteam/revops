import { NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth";
import { bunqConfigStatus, BunqError } from "@/lib/bunq/client";
import { applyBunqPaymentsToDeals, syncBunqPayments } from "@/lib/bunq/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const user = await resolveSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = bunqConfigStatus();
  if (!config.configured) {
    return NextResponse.json(
      { error: "Missing BUNQ_API_KEY — create one in the bunq app under Developers → API keys" },
      { status: 503 },
    );
  }

  try {
    const result = await syncBunqPayments();
    const applied = await applyBunqPaymentsToDeals();
    return NextResponse.json({ ...result, ...applied });
  } catch (err) {
    console.error("Bunq sync failed", err);
    if (err instanceof BunqError) {
      return NextResponse.json(
        { error: err.message, detail: err.body },
        { status: err.status >= 400 && err.status < 600 ? err.status : 502 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}
