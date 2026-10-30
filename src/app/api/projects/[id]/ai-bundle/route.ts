import { NextRequest, NextResponse } from "next/server";
import { ensureTables } from "@/lib/db";
import { resolveSessionUser } from "@/lib/auth";
import { agentErrorResponse } from "@/lib/agent-auth";
import { clientBundle, markBundleSent } from "@/lib/agent-tickets";

// Approved client questions for this project, combined into one message.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await ensureTables();
    return NextResponse.json(await clientBundle(id));
  } catch (err) {
    return agentErrorResponse(err);
  }
}

// Confirm the bundle went out; every message in it must be approved.
export async function POST(req: NextRequest) {
  try {
    await ensureTables();
    const user = await resolveSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { action_ids } = await req.json();
    if (!Array.isArray(action_ids) || action_ids.length === 0) {
      return NextResponse.json({ error: "action_ids required" }, { status: 400 });
    }
    return NextResponse.json(await markBundleSent(action_ids.map(String), { userId: user.id, via: "ui" }));
  } catch (err) {
    return agentErrorResponse(err);
  }
}
