import { NextResponse } from "next/server";
import { ensureTables } from "@/lib/db";
import { verifyAgentKey, type AgentKeyRecord, type AgentKeyScope } from "@/lib/agent-keys";
import { GateError } from "@/lib/agent-tickets";

/**
 * Bearer-key check for /api/agent/* and /api/mcp. The proxy only lets requests
 * through that carry a bearer header; this is where the key is actually verified.
 */
export async function requireAgentKey(
  req: Request,
  scope: AgentKeyScope,
): Promise<{ key: AgentKeyRecord } | { error: NextResponse }> {
  await ensureTables();
  const header = req.headers.get("authorization") ?? "";
  const raw = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const key = raw ? await verifyAgentKey(raw) : null;
  if (!key) {
    return { error: NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 }) };
  }
  if (key.scope !== scope) {
    return { error: NextResponse.json({ error: `This endpoint needs a ${scope} key` }, { status: 403 }) };
  }
  return { key };
}

/** Maps GateError (and anything else) to a JSON response for agent routes. */
export function agentErrorResponse(err: unknown) {
  if (err instanceof GateError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(err);
  return NextResponse.json({ error: "Server error" }, { status: 500 });
}

export type AgentRouteContext = { params: Promise<{ id: string }> };
