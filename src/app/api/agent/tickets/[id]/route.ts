import { NextRequest, NextResponse } from "next/server";
import { agentErrorResponse, requireAgentKey, type AgentRouteContext } from "@/lib/agent-auth";
import { getTicket } from "@/lib/agent-tickets";

// Agent runtime: full ticket context. Client text is under client_content (untrusted).
export async function GET(req: NextRequest, { params }: AgentRouteContext) {
  const auth = await requireAgentKey(req, "agent");
  if ("error" in auth) return auth.error;
  const { id } = await params;
  try {
    return NextResponse.json(await getTicket(id, { projectId: auth.key.project_id }));
  } catch (err) {
    return agentErrorResponse(err);
  }
}
