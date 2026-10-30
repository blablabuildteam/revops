import { NextRequest, NextResponse } from "next/server";
import { ensureTables } from "@/lib/db";
import { resolveSessionUser } from "@/lib/auth";
import { agentErrorResponse } from "@/lib/agent-auth";
import { backlogStats, startBacklogTriage } from "@/lib/agent-tickets";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await ensureTables();
    return NextResponse.json(await backlogStats(id));
  } catch (err) {
    return agentErrorResponse(err);
  }
}

// Shadow-triage the next batch of open, never-triaged tasks.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await ensureTables();
    const user = await resolveSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { limit } = await req.json().catch(() => ({}));
    return NextResponse.json(
      await startBacklogTriage(id, { userId: user.id, via: "ui" }, Number(limit) || 25),
    );
  } catch (err) {
    return agentErrorResponse(err);
  }
}
