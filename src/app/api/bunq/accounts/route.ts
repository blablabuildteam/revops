import { NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth";
import {
  bunqConfigStatus,
  listBunqAccountBalances,
  type BunqAccountBalance,
} from "@/lib/bunq/client";

export const dynamic = "force-dynamic";

function pickPot(
  accounts: BunqAccountBalance[],
  pot: BunqAccountBalance["pot"],
  exactNames: string[],
): BunqAccountBalance | null {
  const exact = accounts.find((a) =>
    exactNames.includes(a.name.toLowerCase().trim()),
  );
  if (exact) return exact;
  return accounts.find((a) => a.pot === pot) ?? null;
}

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
      salarySavings: null,
      vatSavings: null,
      error: "Bunq not configured",
    });
  }

  try {
    const accounts = await listBunqAccountBalances();
    return NextResponse.json({
      accounts,
      incomeTaxSavings: pickPot(accounts, "ib", ["ib"]),
      salarySavings: pickPot(accounts, "salaris", ["salaris"]),
      vatSavings: pickPot(accounts, "btw", ["btw"]),
    });
  } catch (err) {
    return NextResponse.json(
      {
        accounts: [],
        incomeTaxSavings: null,
        salarySavings: null,
        vatSavings: null,
        error: err instanceof Error ? err.message : "Failed to load Bunq accounts",
      },
      { status: 502 },
    );
  }
}
