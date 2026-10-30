import { NextRequest, NextResponse } from "next/server";
import { ensureTables } from "@/lib/db";
import { resolveSessionUser } from "@/lib/auth";
import { agentErrorResponse } from "@/lib/agent-auth";
import { answerAsAdmin, getTicket, startExecution, startTriage } from "@/lib/agent-tickets";

// Admin UI: AI panel data for a task.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await ensureTables();
    return NextResponse.json(await getTicket(id));
  } catch (err) {
    return agentErrorResponse(err);
  }
}

// Admin UI: start triage / execution, or answer the agent's questions.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await ensureTables();
    const user = await resolveSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const decider = { userId: user.id, via: "ui" as const };
    const { action, text } = await req.json();

    if (action === "start_triage") return NextResponse.json(await startTriage(id, decider));
    if (action === "start_execution") return NextResponse.json(await startExecution(id, decider));
    if (action === "answer") return NextResponse.json(await answerAsAdmin(id, String(text ?? ""), decider));
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return agentErrorResponse(err);
  }
}
