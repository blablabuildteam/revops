/**
 * One-off ClickUp → RevOps project board importer.
 *
 * Pulls title, description, priority, comments, and attachments
 * (task-level + comment-level) into an existing project board.
 *
 * Setup (add to .env.local, do not commit secrets):
 *   CLICKUP_API_TOKEN=pk_...
 *   CLICKUP_SPACE_URL=https://app.clickup.com/.../v/s/...   (or CLICKUP_SPACE_ID)
 *   IMPORT_PROJECT_ID=<uuid of target RevOps project>
 *
 * Also needs your existing DB URL (POSTGRES_URL / DATABASE_URL) and ideally
 * BLOB_READ_WRITE_TOKEN for attachment uploads.
 *
 * Usage:
 *   npm run import:clickup              # dry-run (fetch + report only)
 *   npm run import:clickup -- --apply   # write to the database
 *   npm run import:clickup -- --apply --limit=20
 *   npm run import:clickup -- --list-only   # only discover lists, no tasks
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { put } from "@vercel/blob";
import { sql } from "@vercel/postgres";

const CLICKUP_API = "https://api.clickup.com/api/v2";
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

type TaskPriority = "low" | "medium" | "high";
type TaskStatus = "open" | "in_progress" | "done";

type ClickUpPriority = { id: string; priority: string; color: string } | null;

type ClickUpAttachment = {
  id: string;
  title?: string;
  url: string;
  extension?: string;
  size?: number;
  mimetype?: string;
  date?: string;
};

type ClickUpUser = {
  id: number;
  username: string;
  email?: string;
};

type ClickUpTask = {
  id: string;
  name: string;
  description?: string;
  text_content?: string;
  markdown_description?: string;
  status: { status: string; type: string };
  priority: ClickUpPriority;
  due_date?: string | null;
  url: string;
  parent?: string | null;
  assignees?: ClickUpUser[];
  attachments?: ClickUpAttachment[];
  list: { id: string; name: string };
};

type ClickUpComment = {
  id: string;
  comment_text?: string;
  date: string;
  user?: ClickUpUser;
  attachments?: ClickUpAttachment[];
  reply_count?: number;
};

type MilestoneRow = { id: string; name: string; position: number };

type Args = {
  apply: boolean;
  limit: number | null;
  listOnly: boolean;
};

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function parseArgs(argv: string[]): Args {
  let apply = false;
  let limit: number | null = null;
  let listOnly = false;
  for (const arg of argv) {
    if (arg === "--apply") apply = true;
    else if (arg === "--list-only") listOnly = true;
    else if (arg.startsWith("--limit=")) {
      const n = Number(arg.slice("--limit=".length));
      if (!Number.isFinite(n) || n < 1) throw new Error(`Invalid --limit: ${arg}`);
      limit = Math.floor(n);
    }
  }
  return { apply, limit, listOnly };
}

function parseSpaceId(input: string): string {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);
    // .../v/s/{spaceId} or .../v/o/s/{spaceId}
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === "s" && parts[i + 1] && /^\d+$/.test(parts[i + 1])) {
        return parts[i + 1];
      }
    }
    // .../space/{spaceId}
    const spaceIdx = parts.indexOf("space");
    if (spaceIdx !== -1 && parts[spaceIdx + 1] && /^\d+$/.test(parts[spaceIdx + 1])) {
      return parts[spaceIdx + 1];
    }
  } catch {
    // not a URL
  }

  throw new Error(
    `Could not parse ClickUp space id from "${input}". Pass a space URL or numeric CLICKUP_SPACE_ID.`,
  );
}

async function clickupFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${CLICKUP_API}${path}`, {
    headers: {
      Authorization: token,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ClickUp ${path} → ${res.status}: ${body.slice(0, 400)}`);
  }
  return res.json() as Promise<T>;
}

function mapPriority(priority: ClickUpPriority): TaskPriority {
  if (!priority) return "low";
  const id = String(priority.id);
  // ClickUp: 1 urgent, 2 high, 3 normal, 4 low
  if (id === "1" || id === "2") return "high";
  if (id === "3") return "medium";
  return "low";
}

function mapStatusToMilestoneName(
  statusName: string,
  statusType: string,
  milestoneNames: string[],
): string {
  const normalized = statusName.trim().toLowerCase();
  const byName = milestoneNames.find((m) => m.toLowerCase() === normalized);
  if (byName) return byName;

  if (statusType === "closed" || normalized.includes("done") || normalized.includes("complete")) {
    return milestoneNames.includes("Done") ? "Done" : milestoneNames[milestoneNames.length - 1]!;
  }
  if (normalized.includes("hold") || normalized.includes("blocked") || normalized.includes("waiting")) {
    return milestoneNames.includes("On Hold") ? "On Hold" : "Open";
  }
  if (normalized.includes("progress") || normalized.includes("doing") || normalized.includes("active")) {
    return milestoneNames.includes("In Progress") ? "In Progress" : "Open";
  }
  if (normalized.includes("next") || normalized.includes("ready") || normalized.includes("todo")) {
    return milestoneNames.includes("Up Next")
      ? "Up Next"
      : milestoneNames.includes("Open")
        ? "Open"
        : milestoneNames[0]!;
  }
  if (normalized.includes("backlog")) {
    return milestoneNames.includes("Backlog") ? "Backlog" : milestoneNames[0]!;
  }

  return milestoneNames.includes("Open") ? "Open" : milestoneNames[0]!;
}

function mapTaskStatus(statusType: string, milestoneName: string): TaskStatus {
  if (statusType === "closed" || milestoneName === "Done") return "done";
  if (milestoneName === "In Progress") return "in_progress";
  return "open";
}

function taskDescription(task: ClickUpTask): string | null {
  const md = task.markdown_description?.trim();
  if (md) return md;
  const text = task.text_content?.trim() || task.description?.trim();
  return text || null;
}

function formatDueDate(ms: string | null | undefined): string | null {
  if (!ms) return null;
  const d = new Date(Number(ms));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function commentBody(comment: ClickUpComment): string {
  const text = (comment.comment_text || "").trim();
  return text || "(empty comment)";
}

function attachmentFileName(att: ClickUpAttachment, index: number): string {
  const title = (att.title || "").trim();
  if (title) return title.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const ext = att.extension ? `.${att.extension.replace(/^\./, "")}` : "";
  return `attachment-${index + 1}${ext}`;
}

async function downloadAttachment(
  att: ClickUpAttachment,
  token: string,
): Promise<{ buffer: Buffer; contentType: string; fileName: string } | null> {
  const res = await fetch(att.url, {
    headers: { Authorization: token },
    redirect: "follow",
  });
  if (!res.ok) {
    console.warn(`  ! attachment download failed (${res.status}): ${att.title || att.url}`);
    return null;
  }
  const arrayBuffer = await res.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_ATTACHMENT_BYTES) {
    console.warn(
      `  ! skipping attachment >10MB (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)}MB): ${att.title || att.id}`,
    );
    return null;
  }
  const contentType =
    att.mimetype || res.headers.get("content-type") || "application/octet-stream";
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType,
    fileName: attachmentFileName(att, 0),
  };
}

async function storeAttachment(
  taskId: string,
  fileName: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_") || "file";
  const path = `tasks/${taskId}/${safeName}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(path, buffer, {
      access: "public",
      addRandomSuffix: true,
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return blob.url;
  }

  console.warn("  ! BLOB_READ_WRITE_TOKEN missing — storing attachment as data URI");
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

async function getSpaceLists(spaceId: string, token: string) {
  const lists: { id: string; name: string; folder: string | null }[] = [];

  const folderless = await clickupFetch<{ lists: { id: string; name: string }[] }>(
    `/space/${spaceId}/list?archived=false`,
    token,
  );
  for (const list of folderless.lists || []) {
    lists.push({ id: list.id, name: list.name, folder: null });
  }

  const folders = await clickupFetch<{
    folders: { id: string; name: string; lists: { id: string; name: string }[] }[];
  }>(`/space/${spaceId}/folder?archived=false`, token);

  for (const folder of folders.folders || []) {
    for (const list of folder.lists || []) {
      lists.push({ id: list.id, name: list.name, folder: folder.name });
    }
  }

  return lists;
}

async function getListTasks(listId: string, token: string): Promise<ClickUpTask[]> {
  const tasks: ClickUpTask[] = [];
  let page = 0;
  for (;;) {
    const data = await clickupFetch<{ tasks: ClickUpTask[]; last_page?: boolean }>(
      `/list/${listId}/task?page=${page}&include_closed=true&subtasks=true&include_markdown_description=true`,
      token,
    );
    tasks.push(...(data.tasks || []));
    if (data.last_page === true || !data.tasks?.length) break;
    page += 1;
    if (page > 100) break;
  }
  return tasks;
}

async function getTaskComments(taskId: string, token: string): Promise<ClickUpComment[]> {
  const data = await clickupFetch<{ comments: ClickUpComment[] }>(
    `/task/${taskId}/comment`,
    token,
  );
  return data.comments || [];
}

async function getTaskDetail(taskId: string, token: string): Promise<ClickUpTask> {
  return clickupFetch<ClickUpTask>(
    `/task/${taskId}?include_markdown_description=true`,
    token,
  );
}

function collectAttachments(
  task: ClickUpTask,
  comments: ClickUpComment[],
): ClickUpAttachment[] {
  const byId = new Map<string, ClickUpAttachment>();
  for (const att of task.attachments || []) {
    if (att?.id && att.url) byId.set(att.id, att);
  }
  for (const comment of comments) {
    for (const att of comment.attachments || []) {
      if (att?.id && att.url) byId.set(att.id, att);
    }
  }
  return Array.from(byId.values());
}

async function main() {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  loadEnvFile(resolve(process.cwd(), ".env"));

  const args = parseArgs(process.argv.slice(2));
  const token = process.env.CLICKUP_API_TOKEN?.trim();
  const spaceInput =
    process.env.CLICKUP_SPACE_URL?.trim() || process.env.CLICKUP_SPACE_ID?.trim();
  const projectId = process.env.IMPORT_PROJECT_ID?.trim();

  if (!token) {
    throw new Error("Missing CLICKUP_API_TOKEN in env / .env.local");
  }
  if (!spaceInput) {
    throw new Error("Missing CLICKUP_SPACE_URL or CLICKUP_SPACE_ID in env / .env.local");
  }
  if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
    throw new Error("Missing POSTGRES_URL (or DATABASE_URL) for the RevOps database");
  }
  // @vercel/postgres reads POSTGRES_URL
  if (!process.env.POSTGRES_URL && process.env.DATABASE_URL) {
    process.env.POSTGRES_URL = process.env.DATABASE_URL;
  }

  const spaceId = parseSpaceId(spaceInput);
  console.log(`ClickUp space: ${spaceId}`);
  console.log(`Mode: ${args.apply ? "APPLY (writes enabled)" : "DRY-RUN (no writes)"}`);

  const lists = await getSpaceLists(spaceId, token);
  console.log(`Found ${lists.length} list(s):`);
  for (const list of lists) {
    const loc = list.folder ? `${list.folder} / ${list.name}` : list.name;
    console.log(`  - ${loc} (${list.id})`);
  }

  if (args.listOnly) {
    console.log("\n--list-only: stopping before task fetch.");
    return;
  }

  if (!projectId) {
    throw new Error("Missing IMPORT_PROJECT_ID (target RevOps project UUID)");
  }

  const { rows: projectRows } = await sql`
    SELECT id, name FROM projects WHERE id = ${projectId}
  `;
  if (!projectRows[0]) {
    throw new Error(`Project not found: ${projectId}`);
  }
  console.log(`Target project: ${projectRows[0].name} (${projectId})`);

  const { rows: milestoneRows } = await sql`
    SELECT id, name, position FROM milestones
    WHERE project_id = ${projectId}
    ORDER BY position ASC
  `;
  if (milestoneRows.length === 0) {
    throw new Error("Target project has no milestones/columns. Open the board once to seed phases.");
  }
  const milestones = milestoneRows as MilestoneRow[];
  const milestoneByName = new Map(milestones.map((m) => [m.name, m]));
  const milestoneNames = milestones.map((m) => m.name);

  const allTasks: ClickUpTask[] = [];
  for (const list of lists) {
    const tasks = await getListTasks(list.id, token);
    console.log(`  list ${list.name}: ${tasks.length} task(s)`);
    allTasks.push(...tasks);
  }

  // Deduplicate (subtasks can appear in multiple fetches)
  const unique = new Map<string, ClickUpTask>();
  for (const task of allTasks) unique.set(task.id, task);
  let tasks = Array.from(unique.values());

  // Parents before children
  tasks.sort((a, b) => {
    if (!a.parent && b.parent) return -1;
    if (a.parent && !b.parent) return 1;
    return 0;
  });

  if (args.limit != null) {
    tasks = tasks.slice(0, args.limit);
    console.log(`Limiting to first ${args.limit} task(s)`);
  }

  console.log(`\nProcessing ${tasks.length} unique task(s)...\n`);

  const clickupToLocal = new Map<string, string>();
  let imported = 0;
  let skipped = 0;
  let commentsImported = 0;
  let attachmentsImported = 0;
  let attachmentFailures = 0;

  for (const summary of tasks) {
    const detail = await getTaskDetail(summary.id, token);
    const comments = await getTaskComments(summary.id, token);
    const attachments = collectAttachments(detail, comments);
    const description = taskDescription(detail);
    const priority = mapPriority(detail.priority);
    const milestoneName = mapStatusToMilestoneName(
      detail.status.status,
      detail.status.type,
      milestoneNames,
    );
    const milestone = milestoneByName.get(milestoneName) ?? milestones[0]!;
    const status = mapTaskStatus(detail.status.type, milestone.name);
    const assignee = detail.assignees?.[0]?.username ?? null;
    const dueDate = formatDueDate(detail.due_date);
    const parentLocalId = detail.parent ? clickupToLocal.get(detail.parent) ?? null : null;

    console.log(`• ${detail.name}`);
    console.log(
      `  status=${detail.status.status} → ${milestone.name} | priority=${priority} | comments=${comments.length} | files=${attachments.length}`,
    );

    if (!args.apply) {
      imported += 1;
      commentsImported += comments.length;
      attachmentsImported += attachments.length;
      continue;
    }

    const { rows: existing } = await sql`
      SELECT id FROM tasks WHERE project_id = ${projectId} AND url = ${detail.url} LIMIT 1
    `;
    if (existing[0]) {
      console.log(`  skip (already imported as ${existing[0].id})`);
      clickupToLocal.set(detail.id, existing[0].id as string);
      skipped += 1;
      continue;
    }

    const { rows: inserted } = await sql`
      INSERT INTO tasks (
        project_id, milestone_id, parent_id, title, description,
        status, assignee, due_date, url, created_by, approved, priority, position
      )
      VALUES (
        ${projectId},
        ${milestone.id},
        ${parentLocalId},
        ${detail.name},
        ${description},
        ${status},
        ${assignee},
        ${dueDate},
        ${detail.url},
        ${"team"},
        ${true},
        ${priority},
        ${imported}
      )
      RETURNING id
    `;
    const localTaskId = inserted[0]!.id as string;
    clickupToLocal.set(detail.id, localTaskId);
    imported += 1;

    for (const comment of [...comments].reverse()) {
      // ClickUp returns newest-first; store oldest-first for natural reading order
      const author = comment.user?.username || "ClickUp";
      const body = commentBody(comment);
      const createdAt = new Date(Number(comment.date)).toISOString();
      await sql`
        INSERT INTO task_comments (task_id, author_user_id, author_name, body, created_at)
        VALUES (${localTaskId}, ${null}, ${author}, ${body}, ${createdAt})
      `;
      commentsImported += 1;
    }

    let fileIndex = 0;
    for (const att of attachments) {
      fileIndex += 1;
      const downloaded = await downloadAttachment(att, token);
      if (!downloaded) {
        attachmentFailures += 1;
        continue;
      }
      const fileName =
        attachmentFileName(att, fileIndex - 1) || downloaded.fileName;
      try {
        const fileUrl = await storeAttachment(
          localTaskId,
          fileName,
          downloaded.buffer,
          downloaded.contentType,
        );
        await sql`
          INSERT INTO task_attachments (
            task_id, file_name, file_url, file_size, content_type,
            uploaded_by_user_id, uploaded_by_name
          )
          VALUES (
            ${localTaskId},
            ${fileName},
            ${fileUrl},
            ${downloaded.buffer.byteLength},
            ${downloaded.contentType},
            ${null},
            ${"ClickUp import"}
          )
        `;
        attachmentsImported += 1;
      } catch (err) {
        attachmentFailures += 1;
        console.warn(
          `  ! failed to store attachment ${fileName}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  console.log("\nDone.");
  console.log(`  tasks:        ${imported} processed${skipped ? `, ${skipped} skipped (already present)` : ""}`);
  console.log(`  comments:     ${commentsImported}`);
  console.log(`  attachments:  ${attachmentsImported}${attachmentFailures ? ` (${attachmentFailures} failed/skipped)` : ""}`);
  if (!args.apply) {
    console.log("\nDry-run only. Re-run with --apply to write into the project board.");
  }
}

main().catch((err) => {
  console.error("\nImport failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
