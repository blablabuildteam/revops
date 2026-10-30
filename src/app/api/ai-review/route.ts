import { NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";
import { agentErrorResponse } from "@/lib/agent-auth";
import { backlogStats, listAwaiting } from "@/lib/agent-tickets";

// Admin review: AI-mode projects with backlog stats, plus everything waiting on a person.
export async function GET() {
  try {
    await ensureTables();
    const { rows: projects } = await sql`
      SELECT id, name, repo_full_name FROM projects WHERE ai_mode = true ORDER BY name
    `;
    const [stats, awaiting] = await Promise.all([
      Promise.all(projects.map((p) => backlogStats(p.id))),
      listAwaiting(),
    ]);
    return NextResponse.json({
      projects: projects.map((p, i) => ({ ...p, stats: stats[i] })),
      awaiting,
    });
  } catch (err) {
    return agentErrorResponse(err);
  }
}
