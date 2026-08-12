import { NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth";
import { snelstartConfigStatus, SnelstartError } from "@/lib/snelstart/client";
import { syncSnelstartInvoices } from "@/lib/snelstart/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const user = await resolveSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = snelstartConfigStatus();
  if (!config.configured) {
    return NextResponse.json(
      {
        error: !config.hasSubscriptionKey
          ? "Missing SNELSTART_SUBSCRIPTION_KEY"
          : "Missing SNELSTART_CLIENT_KEY (maatwerksleutel from SnelStart Web → Koppelingen → Maatwerk)",
      },
      { status: 503 },
    );
  }

  try {
    const result = await syncSnelstartInvoices();
    return NextResponse.json(result);
  } catch (err) {
    console.error("SnelStart sync failed", err);
    if (err instanceof SnelstartError) {
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
