import { sql } from "@/lib/db";
import { parseProjectLeads } from "@/lib/types";
import {
  assigneeMatchesPerson,
  openSlackDm,
  postSlackMessage,
  slackConfigured,
  slackMentionsForAssignees,
  teamSlackMembers,
} from "@/lib/slack";

export type DueReminderKind = "eve" | "morning";

export type DueReminderItem = {
  item_type: "task" | "todo";
  id: string;
  title: string;
  due_date: string;
  project_id: string | null;
  project_name: string | null;
  company_name: string | null;
  slack_channel_id: string | null;
  assignees: Array<{ name?: string | null; email?: string | null }>;
};

type DueTaskRow = {
  id: string;
  title: string;
  due_date: string;
  assignee: string | null;
  project_id: string;
  project_name: string;
  company_name: string | null;
  slack_channel_id: string | null;
};

type DueTodoRow = {
  id: string;
  title: string;
  due_date: string;
  project_id: string | null;
  project_name: string | null;
  company_name: string | null;
  slack_channel_id: string | null;
  assignees: unknown;
};

const TIME_ZONE = "Europe/Amsterdam";
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function amsterdamParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    hour: Number(read("hour")),
    date: `${read("year")}-${read("month")}-${read("day")}`,
  };
}

function addCalendarDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

function weekdayUtc(isoDate: string): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function isWeekend(isoDate: string): boolean {
  const day = weekdayUtc(isoDate);
  return day === 0 || day === 6;
}

function weekdayName(isoDate: string): string {
  return WEEKDAYS[weekdayUtc(isoDate)] ?? isoDate;
}

/** Last weekday before a due date, skipping Sat/Sun. Friday covers Sat–Mon. */
function eveDueUntil(today: string): string | null {
  if (isWeekend(today)) return null;
  let cursor = addCalendarDays(today, 1);
  while (isWeekend(cursor)) {
    cursor = addCalendarDays(cursor, 1);
  }
  return cursor;
}

export function dueReminderKindAt(now = new Date()): DueReminderKind | null {
  const { hour, date } = amsterdamParts(now);
  if (hour === 11) return "morning";
  if (hour === 16 && !isWeekend(date)) return "eve";
  return null;
}

function parseJsonAssignees(value: unknown): Array<{ name?: string | null; email?: string | null }> {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function loadDueItems(
  kind: DueReminderKind,
  now = new Date(),
  options: { requireChannel?: boolean } = {},
): Promise<DueReminderItem[]> {
  const today = amsterdamParts(now).date;
  const requireChannel = Boolean(options.requireChannel);
  let fromDate: string;
  let untilDate: string;

  if (kind === "morning") {
    fromDate = today;
    untilDate = today;
  } else {
    const until = eveDueUntil(today);
    if (!until) return [];
    fromDate = addCalendarDays(today, 1);
    untilDate = until;
  }

  const tasks = await sql`
    SELECT
      t.id,
      t.title,
      t.due_date::text AS due_date,
      t.assignee,
      p.id AS project_id,
      p.name AS project_name,
      c.name AS company_name,
      p.slack_channel_id
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    LEFT JOIN companies c ON c.id = p.company_id
    LEFT JOIN milestones m ON m.id = t.milestone_id
    WHERE t.due_date >= ${fromDate}
      AND t.due_date <= ${untilDate}
      AND t.status IS DISTINCT FROM 'done'
      AND LOWER(COALESCE(m.name, '')) <> 'done'
      AND p.status NOT IN ('completed', 'cancelled')
      AND (${!requireChannel} OR p.slack_channel_id IS NOT NULL)
      AND NULLIF(BTRIM(COALESCE(t.assignee, '')), '') IS NOT NULL
  `;

  const todos = await sql`
    SELECT
      t.id,
      t.title,
      t.due_date::text AS due_date,
      p.id AS project_id,
      p.name AS project_name,
      c.name AS company_name,
      p.slack_channel_id,
      COALESCE((
        SELECT json_agg(json_build_object('name', u.name, 'email', u.email))
        FROM (
          SELECT ta.user_id FROM todo_assignees ta WHERE ta.todo_id = t.id
          UNION
          SELECT t.assignee_id WHERE t.assignee_id IS NOT NULL
        ) ids
        JOIN users u ON u.id = ids.user_id
      ), '[]'::json) AS assignees
    FROM todos t
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN companies c ON c.id = COALESCE(t.company_id, p.company_id)
    WHERE t.due_date >= ${fromDate}
      AND t.due_date <= ${untilDate}
      AND t.status NOT IN ('done', 'backlog')
      AND (p.id IS NULL OR p.status NOT IN ('completed', 'cancelled'))
      AND (${!requireChannel} OR p.slack_channel_id IS NOT NULL)
  `;

  const items: DueReminderItem[] = [
    ...(tasks.rows as DueTaskRow[]).map((row) => ({
      item_type: "task" as const,
      id: row.id,
      title: row.title,
      due_date: row.due_date,
      project_id: row.project_id,
      project_name: row.project_name,
      company_name: row.company_name,
      slack_channel_id: row.slack_channel_id,
      assignees: parseProjectLeads(row.assignee).map((name) => ({ name })),
    })),
    ...(todos.rows as DueTodoRow[]).map((row) => ({
      item_type: "todo" as const,
      id: row.id,
      title: row.title,
      due_date: row.due_date,
      project_id: row.project_id,
      project_name: row.project_name,
      company_name: row.company_name,
      slack_channel_id: row.slack_channel_id,
      assignees: parseJsonAssignees(row.assignees),
    })),
  ];

  return items.filter((item) => item.assignees.length > 0);
}

function workspaceOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.replace(/^https?:\/\//, "");
  if (prod) return `https://${prod}`;
  return "https://workspace.blablabuild.com";
}

function slackLink(href: string, label: string): string {
  const safe = label
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, " ");
  return `<${href}|${safe}>`;
}

function ticketUrl(item: DueReminderItem): string {
  const origin = workspaceOrigin();
  if (item.item_type === "todo" || !item.project_id) return `${origin}/todos?todo=${item.id}`;
  return `${origin}/projects/${item.project_id}?task=${item.id}`;
}

function upcomingLabel(dueDate: string, today: string): string {
  if (dueDate === addCalendarDays(today, 1)) return "tomorrow";
  return weekdayName(dueDate);
}

function reminderText(
  item: DueReminderItem,
  kind: DueReminderKind,
  mentions: string[],
  today: string,
): string {
  const who = mentions.join(" ");
  const title = slackLink(ticketUrl(item), item.title);
  const headline =
    kind === "eve"
      ? `${who} Upcoming ${upcomingLabel(item.due_date, today)}: ${title}`
      : `${who} Due today: ${title}`;
  return headline;
}

function personalDigestText(kind: DueReminderKind, items: DueReminderItem[], today: string): string {
  const heading = kind === "morning" ? "*Due today*" : "*Coming up*";
  const lines = items.map((item) => {
    const project = [item.company_name, item.project_name].filter(Boolean).join(" · ");
    const title = slackLink(ticketUrl(item), item.title);
    const when = kind === "eve" ? upcomingLabel(item.due_date, today) : null;
    const bits = [when, project].filter(Boolean).join(" · ");
    return bits ? `• ${title} — ${bits}` : `• ${title}`;
  });
  return `${heading}\n${lines.join("\n")}`;
}

async function claimNotification(
  itemType: string,
  itemId: string,
  kind: DueReminderKind,
  dueDate: string,
  destination: string,
): Promise<boolean> {
  const result = await sql`
    INSERT INTO slack_due_notifications (item_type, item_id, kind, due_date, destination)
    VALUES (${itemType}, ${itemId}, ${kind}, ${dueDate}, ${destination})
    ON CONFLICT DO NOTHING
    RETURNING item_id
  `;
  return result.rows.length > 0;
}

async function releaseNotification(
  itemType: string,
  itemId: string,
  kind: DueReminderKind,
  dueDate: string,
  destination: string,
): Promise<void> {
  await sql`
    DELETE FROM slack_due_notifications
    WHERE item_type = ${itemType}
      AND item_id = ${itemId}
      AND kind = ${kind}
      AND due_date = ${dueDate}
      AND destination = ${destination}
  `;
}

type ReminderPreview = { id: string; title: string; channel: string; text: string };

async function sendChannelReminders(
  kind: DueReminderKind,
  options: { dryRun?: boolean; now?: Date },
): Promise<{ sent: number; skipped: number; items: ReminderPreview[] }> {
  const today = amsterdamParts(options.now).date;
  const items = await loadDueItems(kind, options.now, { requireChannel: true });
  const preview: ReminderPreview[] = [];
  let sent = 0;
  let skipped = 0;

  for (const item of items) {
    if (!item.slack_channel_id) {
      skipped += 1;
      continue;
    }
    const mentions = await slackMentionsForAssignees(item.assignees);
    if (mentions.length === 0) {
      skipped += 1;
      continue;
    }
    const text = reminderText(item, kind, mentions, today);
    preview.push({
      id: item.id,
      title: item.title,
      channel: item.slack_channel_id,
      text,
    });
    if (options.dryRun) continue;

    const claimed = await claimNotification(item.item_type, item.id, kind, item.due_date, "channel");
    if (!claimed) {
      skipped += 1;
      continue;
    }
    try {
      await postSlackMessage(item.slack_channel_id, text);
      sent += 1;
    } catch (err) {
      await releaseNotification(item.item_type, item.id, kind, item.due_date, "channel");
      console.error("Slack due reminder failed", item.id, err);
      skipped += 1;
    }
  }

  return { sent, skipped, items: preview };
}

async function sendPersonalReminders(
  kind: DueReminderKind,
  options: { dryRun?: boolean; now?: Date },
): Promise<{ sent: number; skipped: number; items: ReminderPreview[] }> {
  const today = amsterdamParts(options.now).date;
  const items = await loadDueItems(kind, options.now);
  const people = await teamSlackMembers();
  const preview: ReminderPreview[] = [];
  let sent = 0;
  let skipped = 0;

  for (const person of people) {
    const mine = items.filter((item) => assigneeMatchesPerson(item.assignees, person));
    if (mine.length === 0) {
      skipped += 1;
      continue;
    }
    const text = personalDigestText(kind, mine, today);
    preview.push({
      id: person.slackId,
      title: `${person.name} (${mine.length})`,
      channel: `dm:${person.name}`,
      text,
    });
    if (options.dryRun) continue;

    const claimed = await claimNotification("digest", person.slackId, kind, today, "dm");
    if (!claimed) {
      skipped += 1;
      continue;
    }
    try {
      const dm = await openSlackDm(person.slackId);
      await postSlackMessage(dm, text);
      sent += 1;
    } catch (err) {
      await releaseNotification("digest", person.slackId, kind, today, "dm");
      console.error("Slack personal reminder failed", person.name, err);
      skipped += 1;
    }
  }

  return { sent, skipped, items: preview };
}

export async function runDueReminders(
  kind: DueReminderKind,
  options: { dryRun?: boolean; now?: Date } = {},
): Promise<{
  kind: DueReminderKind;
  sent: number;
  skipped: number;
  dryRun: boolean;
  configured: boolean;
  items: ReminderPreview[];
}> {
  if (!slackConfigured()) {
    return {
      kind,
      sent: 0,
      skipped: 0,
      dryRun: Boolean(options.dryRun),
      items: [],
      configured: false,
    };
  }

  const channel = await sendChannelReminders(kind, options);
  const personal = await sendPersonalReminders(kind, options);

  return {
    kind,
    sent: options.dryRun ? 0 : channel.sent + personal.sent,
    skipped: channel.skipped + personal.skipped,
    dryRun: Boolean(options.dryRun),
    configured: true,
    items: [...channel.items, ...personal.items],
  };
}
