import { sql } from "@/lib/db";
import { parseProjectLeads } from "@/lib/types";
import {
  postSlackMessage,
  slackConfigured,
  slackMentionsForAssignees,
} from "@/lib/slack";

export type DueReminderKind = "eve" | "morning";

export type DueReminderItem = {
  item_type: "task" | "todo";
  id: string;
  title: string;
  due_date: string;
  project_id: string;
  project_name: string;
  company_name: string | null;
  slack_channel_id: string;
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
  slack_channel_id: string;
};

type DueTodoRow = {
  id: string;
  title: string;
  due_date: string;
  project_id: string;
  project_name: string;
  company_name: string | null;
  slack_channel_id: string;
  assignees: unknown;
};

const TIME_ZONE = "Europe/Amsterdam";

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

export function dueReminderKindAt(now = new Date()): DueReminderKind | null {
  const { hour } = amsterdamParts(now);
  if (hour === 16) return "eve";
  if (hour === 11) return "morning";
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

async function loadDueItems(kind: DueReminderKind, now = new Date()): Promise<DueReminderItem[]> {
  const today = amsterdamParts(now).date;
  const targetDate = kind === "eve" ? addCalendarDays(today, 1) : today;

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
    WHERE t.due_date = ${targetDate}
      AND t.status IS DISTINCT FROM 'done'
      AND LOWER(COALESCE(m.name, '')) <> 'done'
      AND p.status NOT IN ('completed', 'cancelled')
      AND p.slack_channel_id IS NOT NULL
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
    JOIN projects p ON p.id = t.project_id
    LEFT JOIN companies c ON c.id = COALESCE(t.company_id, p.company_id)
    WHERE t.due_date = ${targetDate}
      AND t.status NOT IN ('done', 'backlog')
      AND p.status NOT IN ('completed', 'cancelled')
      AND p.slack_channel_id IS NOT NULL
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

function reminderText(item: DueReminderItem, kind: DueReminderKind, mentions: string[]): string {
  const who = mentions.join(" ");
  const headline =
    kind === "eve"
      ? `${who} Upcoming tomorrow: *${item.title}*`
      : `${who} Due today: *${item.title}*`;
  const project = [item.company_name, item.project_name].filter(Boolean).join(" · ");
  return `${headline}\n${project}`;
}

async function claimNotification(
  item: DueReminderItem,
  kind: DueReminderKind,
): Promise<boolean> {
  const result = await sql`
    INSERT INTO slack_due_notifications (item_type, item_id, kind, due_date)
    VALUES (${item.item_type}, ${item.id}, ${kind}, ${item.due_date})
    ON CONFLICT DO NOTHING
    RETURNING item_id
  `;
  return result.rows.length > 0;
}

async function releaseNotification(item: DueReminderItem, kind: DueReminderKind): Promise<void> {
  await sql`
    DELETE FROM slack_due_notifications
    WHERE item_type = ${item.item_type}
      AND item_id = ${item.id}
      AND kind = ${kind}
      AND due_date = ${item.due_date}
  `;
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
  items: Array<{ id: string; title: string; channel: string; text: string }>;
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

  const items = await loadDueItems(kind, options.now);
  const preview: Array<{ id: string; title: string; channel: string; text: string }> = [];
  let sent = 0;
  let skipped = 0;

  for (const item of items) {
    const mentions = await slackMentionsForAssignees(item.assignees);
    if (mentions.length === 0) {
      skipped += 1;
      continue;
    }
    const text = reminderText(item, kind, mentions);
    preview.push({
      id: item.id,
      title: item.title,
      channel: item.slack_channel_id,
      text,
    });
    if (options.dryRun) continue;

    const claimed = await claimNotification(item, kind);
    if (!claimed) {
      skipped += 1;
      continue;
    }
    try {
      await postSlackMessage(item.slack_channel_id, text);
      sent += 1;
    } catch (err) {
      await releaseNotification(item, kind);
      console.error("Slack due reminder failed", item.id, err);
      skipped += 1;
    }
  }

  return {
    kind,
    sent: options.dryRun ? 0 : sent,
    skipped,
    dryRun: Boolean(options.dryRun),
    configured: true,
    items: preview,
  };
}
