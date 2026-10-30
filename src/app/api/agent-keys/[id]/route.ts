import { NextRequest, NextResponse } from "next/server";
import { ensureTables } from "@/lib/db";
import { revokeAgentKey } from "@/lib/agent-keys";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await ensureTables();
    if (!(await revokeAgentKey(id))) {
      return NextResponse.json({ error: "Not found or already revoked" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
