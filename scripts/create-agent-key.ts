/**
 * Creates a machine key for the AI ticket API and prints it once.
 * Keys can also be created and revoked in Settings → Agent keys.
 *
 * Usage:
 *   npx tsx scripts/create-agent-key.ts --scope=agent --name="comfortzzzone runner" [--project=<uuid>]
 *   npx tsx scripts/create-agent-key.ts --scope=operator --name="Grok Bots" --user=<email>
 *
 * Needs POSTGRES_URL (read from .env.local / .env).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function arg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  loadEnvFile(resolve(process.cwd(), ".env"));

  const scope = arg("scope");
  const name = arg("name");
  if ((scope !== "agent" && scope !== "operator") || !name) {
    console.error('Usage: --scope=agent|operator --name="..." [--project=<uuid>] [--user=<email>]');
    process.exit(1);
  }

  // Imported after env is loaded so the DB client sees POSTGRES_URL.
  const { sql, ensureTables } = await import("../src/lib/db");
  const { createAgentKey } = await import("../src/lib/agent-keys");
  await ensureTables();

  let userId: string | null = null;
  const email = arg("user");
  if (email) {
    const { rows } = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase()}`;
    if (!rows[0]) throw new Error(`No user with email ${email}`);
    userId = rows[0].id;
  }

  const { key, record } = await createAgentKey({
    name,
    scope,
    userId,
    projectId: arg("project") ?? null,
  });
  console.log(`Created ${record.scope} key "${record.name}" (${record.prefix}).`);
  console.log("Store it now; it is not shown again:\n");
  console.log(key);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
