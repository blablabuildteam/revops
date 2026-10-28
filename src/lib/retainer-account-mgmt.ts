import { sql } from "@/lib/db";
import { toDateInputValue } from "@/lib/format";
import { addDays, mapRetainerRow, weekStartFromDateOnly } from "@/lib/retainers";

export const ACCOUNT_MGMT_SOURCE = "account_mgmt";
const ACCOUNT_MGMT_ACTIVITY = "Account management";

/** Monday of the current week in NL time (servers run in UTC). */
function currentWeekStart(): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
  }).format(new Date());
  return weekStartFromDateOnly(today);
}

/**
 * Logs the weekly account-management hours for every week not yet covered,
 * up to and including the current week. Weeks while paused/ended are skipped
 * (not backfilled on resume), and deleted auto-entries are not recreated.
 */
export async function syncAccountManagementEntries(): Promise<void> {
  try {
    await logMissingWeeks();
  } catch (err) {
    // Never let the auto-log break loading retainers.
    console.error("Account management auto-log failed", err);
  }
}

async function logMissingWeeks(): Promise<void> {
  const currentWeek = currentWeekStart();
  const { rows } = await sql`
    SELECT * FROM retainer_agreements
    WHERE account_mgmt_hours > 0
      AND account_mgmt_logged_through IS NOT NULL
      AND account_mgmt_logged_through < ${currentWeek}
  `;

  for (const row of rows) {
    const retainer = mapRetainerRow(row);
    const loggingActive =
      retainer.status !== "paused" && retainer.status !== "ended";
    let week = addDays(
      toDateInputValue(row.account_mgmt_logged_through as string | Date),
      7,
    );
    while (week <= currentWeek) {
      const weekEnd = addDays(week, 6);
      if (loggingActive && retainer.start_date <= weekEnd) {
        const workDate = retainer.start_date > week ? retainer.start_date : week;
        await sql`
          INSERT INTO retainer_time_entries (
            retainer_id, week_start, hours, activity, work_date, source
          ) VALUES (
            ${retainer.id},
            ${week},
            ${retainer.account_mgmt_hours},
            ${ACCOUNT_MGMT_ACTIVITY},
            ${workDate},
            ${ACCOUNT_MGMT_SOURCE}
          )
          ON CONFLICT (retainer_id, week_start) WHERE source = 'account_mgmt'
          DO NOTHING
        `;
      }
      week = addDays(week, 7);
    }
    await sql`
      UPDATE retainer_agreements
      SET account_mgmt_logged_through = ${currentWeek}
      WHERE id = ${retainer.id}
    `;
  }
}

/**
 * Applies a new weekly value: turning it on starts with the current week,
 * a change rewrites this week's auto-entry, and 0 turns it off.
 */
export async function setAccountManagementHours(
  retainerId: string,
  hours: number,
): Promise<void> {
  const currentWeek = currentWeekStart();
  if (hours > 0) {
    await sql`
      UPDATE retainer_agreements SET
        account_mgmt_hours = ${hours},
        account_mgmt_logged_through = COALESCE(
          account_mgmt_logged_through, ${addDays(currentWeek, -7)}::date
        ),
        updated_at = now()
      WHERE id = ${retainerId}
    `;
    await sql`
      UPDATE retainer_time_entries SET hours = ${hours}, updated_at = now()
      WHERE retainer_id = ${retainerId}
        AND week_start = ${currentWeek}
        AND source = ${ACCOUNT_MGMT_SOURCE}
    `;
  } else {
    await sql`
      UPDATE retainer_agreements SET
        account_mgmt_hours = 0,
        account_mgmt_logged_through = NULL,
        updated_at = now()
      WHERE id = ${retainerId}
    `;
    await sql`
      DELETE FROM retainer_time_entries
      WHERE retainer_id = ${retainerId}
        AND week_start = ${currentWeek}
        AND source = ${ACCOUNT_MGMT_SOURCE}
    `;
  }
  await syncAccountManagementEntries();
}
