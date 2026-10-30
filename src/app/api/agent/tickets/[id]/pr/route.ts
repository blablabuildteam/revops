import { NextRequest, NextResponse } from "next/server";
import { agentErrorResponse, requireAgentKey, type AgentRouteContext } from "@/lib/agent-auth";
import { prInputSchema, recordPr } from "@/lib/agent-tickets";

// Agent runtime: report the opened PR and its preview URL.
export async function POST(req: NextRequest, { params }: AgentRouteContext) {
  const auth = await requireAgentKey(req, "agent");
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const parsed = prInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid PR report", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    return NextResponse.json(await recordPr(id, parsed.data, { projectId: auth.key.project_id }));
  } catch (err) {
    return agentErrorResponse(err);
  }
}
