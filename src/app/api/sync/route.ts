import { NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import { fingerprint, joinFingerprints } from "@/lib/live-sync";

export const dynamic = "force-dynamic";

function noStore(data: unknown) {
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
    },
  });
}

export async function GET() {
  try {
    await ensureTables();
    const { rows } = await sql`
      SELECT
        (SELECT COUNT(*)::int FROM opportunities) AS opportunities_count,
        (SELECT COALESCE(EXTRACT(EPOCH FROM MAX(updated_at)), 0) FROM opportunities) AS opportunities_updated,
        (SELECT COUNT(*)::int FROM finance_deals) AS deals_count,
        (SELECT COALESCE(EXTRACT(EPOCH FROM MAX(updated_at)), 0) FROM finance_deals) AS deals_updated,
        (SELECT COUNT(*)::int FROM projects) AS projects_count,
        (SELECT COALESCE(EXTRACT(EPOCH FROM MAX(updated_at)), 0) FROM projects) AS projects_updated,
        (SELECT COUNT(*)::int FROM tasks) AS tasks_count,
        (SELECT COALESCE(EXTRACT(EPOCH FROM MAX(updated_at)), 0) FROM tasks) AS tasks_updated,
        (SELECT COUNT(*)::int FROM milestones) AS milestones_count,
        (SELECT COALESCE(EXTRACT(EPOCH FROM MAX(updated_at)), 0) FROM milestones) AS milestones_updated
    `;
    const row = rows[0] ?? {};
    return noStore({
      opportunities: joinFingerprints(
        fingerprint(row.opportunities_count, row.opportunities_updated),
        fingerprint(row.deals_count, row.deals_updated),
      ),
      projects: joinFingerprints(
        fingerprint(row.projects_count, row.projects_updated),
        fingerprint(row.tasks_count, row.tasks_updated),
        fingerprint(row.milestones_count, row.milestones_updated),
      ),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
