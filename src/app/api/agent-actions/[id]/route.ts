import { NextRequest, NextResponse } from "next/server";
import { ensureTables } from "@/lib/db";
import { resolveSessionUser } from "@/lib/auth";
import { agentErrorResponse } from "@/lib/agent-auth";
import { decideAction, markMessageSent } from "@/lib/agent-tickets";

// Admin UI: approve / reject a pending action, or confirm a client message was sent.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await ensureTables();
    const user = await resolveSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const decider = { userId: user.id, via: "ui" as const };
    const { decision, text } = await req.json();

    if (decision === "approve" || decision === "reject") {
      return NextResponse.json(await decideAction(id, decision, decider, { text }));
    }
    if (decision === "sent") return NextResponse.json(await markMessageSent(id, decider));
    return NextResponse.json({ error: "Unknown decision" }, { status: 400 });
  } catch (err) {
    return agentErrorResponse(err);
  }
}
