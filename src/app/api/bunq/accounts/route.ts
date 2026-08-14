import { NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth";
import {
  bunqConfigStatus,
  getBunqIncomeTaxSavings,
  listBunqAccountBalances,
} from "@/lib/bunq/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await resolveSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = bunqConfigStatus();
  if (!config.configured) {
    return NextResponse.json({
      accounts: [],
      incomeTaxSavings: null,
      error: "Bunq not configured",
    });
  }

  try {
    const [accounts, incomeTaxSavings] = await Promise.all([
      listBunqAccountBalances(),
      getBunqIncomeTaxSavings(),
    ]);
    return NextResponse.json({ accounts, incomeTaxSavings });
  } catch (err) {
    return NextResponse.json(
      {
        accounts: [],
        incomeTaxSavings: null,
        error: err instanceof Error ? err.message : "Failed to load Bunq accounts",
      },
      { status: 502 },
    );
  }
}
