import { NextRequest, NextResponse } from "next/server";
import { ensureTables } from "@/lib/db";
import { resolveSessionUser } from "@/lib/auth";
import { createAgentKey, listAgentKeys } from "@/lib/agent-keys";

export async function GET() {
  try {
    await ensureTables();
    return NextResponse.json(await listAgentKeys());
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

// Creates a key. The raw key is returned once and never stored.
export async function POST(req: NextRequest) {
  try {
    await ensureTables();
    const user = await resolveSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { name, scope, project_id } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (scope !== "agent" && scope !== "operator") {
      return NextResponse.json({ error: "Scope must be agent or operator" }, { status: 400 });
    }
    const { key, record } = await createAgentKey({
      name: name.trim(),
      scope,
      // Operator keys act as the person who created them.
      userId: scope === "operator" ? user.id : null,
      projectId: scope === "agent" ? project_id || null : null,
    });
    return NextResponse.json({ key, record }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
