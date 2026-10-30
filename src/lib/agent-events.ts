import { sql } from "@/lib/db";
import type { AgentEventActor } from "@/lib/types";

/** Append-only audit trail for AI ticket handling. Never updated or deleted in code. */
export async function logEvent(
  taskId: string,
  actor: AgentEventActor,
  kind: string,
  data: Record<string, unknown> = {},
  actorLabel?: string | null,
) {
  await sql`
    INSERT INTO agent_events (task_id, actor, actor_label, kind, data)
    VALUES (${taskId}, ${actor}, ${actorLabel ?? null}, ${kind}, ${JSON.stringify(data)}::jsonb)
  `;
}
