import { NextRequest, NextResponse } from "next/server";
import { ensureTables, sql } from "@/lib/db";
import { syncAccountManagementEntries } from "@/lib/retainer-account-mgmt";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization");
  if (secret && auth === `Bearer ${secret}`) return true;
  if (
    !secret &&
    process.env.VERCEL &&
    (req.headers.get("user-agent") ?? "").startsWith("vercel-cron/")
  ) {
    return true;
  }
  return false;
}

/**
 * Keeps a server instance and the database connection warm between visits,
 * and logs the weekly retainer account-management hours.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  await ensureTables();
  await sql`SELECT 1`;
  await syncAccountManagementEntries();
  return NextResponse.json({ ok: true, ms: Date.now() - started });
}
