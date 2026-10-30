import { NextRequest, NextResponse, after } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import { storeFile } from "@/lib/blob-storage";
import { logEvent } from "@/lib/agent-events";
import { dispatchAgentRun } from "@/lib/agent-dispatch";
import { cleanIntake, intakeDescription, type IntakeKind } from "@/lib/ticket-intake";

const MAX_SCREENSHOT_SIZE = 10 * 1024 * 1024;

// Public endpoint — returns project for client view (no financial data)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    await ensureTables();
    const { rows: projectRows } = await sql`
      SELECT p.id, p.name, p.description, p.status, p.share_token,
             p.client_name, p.start_date, p.end_date, p.ai_mode,
             json_build_object('id', c.id, 'name', c.name) AS company
      FROM projects p
      LEFT JOIN companies c ON c.id = p.company_id
      WHERE p.share_token = ${token}
    `;
    if (!projectRows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const project = projectRows[0];

    const { rows: milestones } = await sql`
      SELECT * FROM milestones WHERE project_id = ${project.id} ORDER BY position, created_at
    `;

    // Client sees: approved tasks + their own pending requests
    const { rows: tasks } = await sql`
      SELECT id, project_id, milestone_id, title, description, status,
             created_by, entered_by, approved, assignee, due_date, created_at, ticket_type
      FROM tasks
      WHERE project_id = ${project.id}
        AND (approved = true OR created_by = 'client')
      ORDER BY
        CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        position,
        created_at
    `;

    project.milestones = milestones.map((m) => ({
      ...m,
      tasks: tasks.filter((t) => t.milestone_id === m.id),
    }));
    project.unassigned_tasks = tasks.filter((t) => !t.milestone_id);

    return NextResponse.json(project);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

// Client submits a task request
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    await ensureTables();
    const { rows: projectRows } = await sql`
      SELECT id, client_name, ai_mode FROM projects WHERE share_token = ${token}
    `;
    if (!projectRows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const project_id = projectRows[0].id;
    const clientName = (projectRows[0].client_name as string | null)?.trim() || "Client";

    if (projectRows[0].ai_mode) {
      return createAiTicket(req, project_id, clientName);
    }

    const { title, description, milestone_id } = await req.json();

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const { rows } = await sql`
      INSERT INTO tasks (project_id, milestone_id, title, description, created_by, entered_by, approved)
      VALUES (${project_id}, ${milestone_id ?? null}, ${title.trim()}, ${description ?? null}, 'client', ${clientName}, false)
      RETURNING id, title, description, status, created_by, entered_by, approved, created_at
    `;
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

/**
 * AI-mode intake: typed fields (JSON, or multipart with a "payload" JSON part
 * and an optional "screenshot" image). Starts triage once the ticket is stored.
 */
async function createAiTicket(req: NextRequest, projectId: string, clientName: string) {
  let body: Record<string, unknown>;
  let screenshot: File | null = null;
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData();
    body = JSON.parse(String(form.get("payload") ?? "{}"));
    const file = form.get("screenshot");
    if (file instanceof File && file.size > 0) screenshot = file;
  } else {
    body = await req.json();
  }

  const kind = body.ticket_type;
  if (kind !== "bug" && kind !== "feature") {
    return NextResponse.json({ error: "Choose what kind of request this is" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  const { intake, missing } = cleanIntake(kind as IntakeKind, body.intake);
  if (missing) return NextResponse.json({ error: `Please fill in: ${missing}` }, { status: 400 });
  if (screenshot) {
    if (!screenshot.type.startsWith("image/")) {
      return NextResponse.json({ error: "Screenshot must be an image" }, { status: 400 });
    }
    if (screenshot.size > MAX_SCREENSHOT_SIZE) {
      return NextResponse.json({ error: "Screenshot too large (max 10MB)" }, { status: 400 });
    }
  }

  const { rows } = await sql`
    INSERT INTO tasks (
      project_id, title, description, url, created_by, entered_by, approved,
      ticket_type, intake, triage_status
    )
    VALUES (
      ${projectId}, ${title}, ${intakeDescription(kind as IntakeKind, intake)}, ${intake.url ?? null},
      'client', ${clientName}, false, ${kind}, ${JSON.stringify(intake)}::jsonb, 'new'
    )
    RETURNING id, title, description, status, created_by, entered_by, approved, created_at, ticket_type
  `;
  const task = rows[0];

  if (screenshot) {
    const safeName = screenshot.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "screenshot";
    const fileUrl = await storeFile(`tasks/${task.id}/${safeName}`, screenshot);
    await sql`
      INSERT INTO task_attachments (task_id, file_name, file_url, file_size, content_type, uploaded_by_name)
      VALUES (${task.id}, ${screenshot.name}, ${fileUrl}, ${screenshot.size}, ${screenshot.type}, ${clientName})
    `;
  }

  await logEvent(task.id, "client", "ticket_created", { ticket_type: kind, has_screenshot: Boolean(screenshot) }, clientName);
  after(() => dispatchAgentRun(task.id, "triage"));
  return NextResponse.json(task, { status: 201 });
}
