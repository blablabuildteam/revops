import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { sql } from "@/lib/db";

/**
 * Machine keys for the agent runtime (scope "agent") and Grok Bots (scope "operator").
 * Format: rvk_<prefix>_<secret>. Only a SHA-256 hash is stored; the key is shown once.
 */

export type AgentKeyScope = "agent" | "operator";

export interface AgentKeyRecord {
  id: string;
  name: string;
  prefix: string;
  scope: AgentKeyScope;
  user_id: string | null;
  project_id: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

function hashKey(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

export async function createAgentKey(input: {
  name: string;
  scope: AgentKeyScope;
  userId?: string | null;
  projectId?: string | null;
}): Promise<{ key: string; record: AgentKeyRecord }> {
  if (input.scope === "operator" && !input.userId) {
    throw new Error("Operator keys must be bound to a user");
  }
  const prefix = randomBytes(4).toString("hex");
  const key = `rvk_${prefix}_${randomBytes(32).toString("base64url")}`;
  const { rows } = await sql`
    INSERT INTO agent_api_keys (name, prefix, key_hash, scope, user_id, project_id)
    VALUES (${input.name}, ${prefix}, ${hashKey(key)}, ${input.scope},
            ${input.userId ?? null}, ${input.projectId ?? null})
    RETURNING id, name, prefix, scope, user_id, project_id, last_used_at, revoked_at, created_at
  `;
  return { key, record: rows[0] as AgentKeyRecord };
}

/** Returns the active key record for a raw key, or null. */
export async function verifyAgentKey(raw: string): Promise<AgentKeyRecord | null> {
  const match = /^rvk_([0-9a-f]{8})_[\w-]+$/.exec(raw);
  if (!match) return null;
  const { rows } = await sql`
    SELECT id, name, prefix, key_hash, scope, user_id, project_id, last_used_at, revoked_at, created_at
    FROM agent_api_keys WHERE prefix = ${match[1]}
  `;
  const row = rows[0];
  if (!row || row.revoked_at) return null;
  const expected = Buffer.from(row.key_hash as string, "hex");
  const actual = Buffer.from(hashKey(raw), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  await sql`UPDATE agent_api_keys SET last_used_at = now() WHERE id = ${row.id}`;
  delete row.key_hash;
  return row as AgentKeyRecord;
}

export async function listAgentKeys() {
  const { rows } = await sql`
    SELECT k.id, k.name, k.prefix, k.scope, k.user_id, k.project_id, k.last_used_at,
           k.revoked_at, k.created_at, u.name AS user_name, p.name AS project_name
    FROM agent_api_keys k
    LEFT JOIN users u ON u.id = k.user_id
    LEFT JOIN projects p ON p.id = k.project_id
    ORDER BY k.revoked_at NULLS FIRST, k.created_at DESC
  `;
  return rows as (AgentKeyRecord & { user_name: string | null; project_name: string | null })[];
}

export async function revokeAgentKey(id: string) {
  const { rows } = await sql`
    UPDATE agent_api_keys SET revoked_at = now()
    WHERE id = ${id} AND revoked_at IS NULL
    RETURNING id
  `;
  return Boolean(rows[0]);
}
