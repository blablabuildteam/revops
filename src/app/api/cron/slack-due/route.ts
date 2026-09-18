import { NextRequest, NextResponse } from "next/server";
import { ensureTables } from "@/lib/db";
import {
  dueReminderKindAt,
  runDueReminders,
  type DueReminderKind,
} from "@/lib/slack-due-reminders";

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

function parseKind(value: string | null): DueReminderKind | null {
  if (value === "eve" || value === "morning") return value;
  return null;
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get("dry") === "1";
  const kind =
    parseKind(req.nextUrl.searchParams.get("slot")) ?? dueReminderKindAt();

  if (!kind) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "outside_reminder_hours",
    });
  }

  try {
    await ensureTables();
    const result = await runDueReminders(kind, { dryRun });
    console.info("Slack due reminders", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Due reminder failed" },
      { status: 500 },
    );
  }
}
