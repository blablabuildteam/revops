import { NextRequest, NextResponse } from "next/server";
import { agentErrorResponse, requireAgentKey, type AgentRouteContext } from "@/lib/agent-auth";
import { recordTriage, triageInputSchema } from "@/lib/agent-tickets";

// Agent runtime: write back classification, checklist, plan and draft questions.
export async function POST(req: NextRequest, { params }: AgentRouteContext) {
  const auth = await requireAgentKey(req, "agent");
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const parsed = triageInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid triage", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    return NextResponse.json(await recordTriage(id, parsed.data, { projectId: auth.key.project_id }));
  } catch (err) {
    return agentErrorResponse(err);
  }
}
