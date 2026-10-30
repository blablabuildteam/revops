import { NextRequest, NextResponse } from "next/server";
import { agentErrorResponse, requireAgentKey, type AgentRouteContext } from "@/lib/agent-auth";
import { agentEventInputSchema, recordAgentEvent } from "@/lib/agent-tickets";

// Agent runtime: progress, tool calls, and "stopped" reports for the ticket timeline.
export async function POST(req: NextRequest, { params }: AgentRouteContext) {
  const auth = await requireAgentKey(req, "agent");
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const parsed = agentEventInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid event", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    await recordAgentEvent(id, parsed.data, { projectId: auth.key.project_id });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return agentErrorResponse(err);
  }
}
