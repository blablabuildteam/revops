/**
 * Bunq API client for our own company account(s).
 *
 * Handshake: installation → device-server → session-server.
 * RSA keypair + installation token are persisted so Vercel cold starts
 * reuse the same device registration (needed when IPs change).
 *
 * Docs: https://doc.bunq.com/
 */

import { createSign, generateKeyPairSync, randomUUID } from "crypto";
import { sql } from "@/lib/db";

const SANDBOX_URL = "https://public-api.sandbox.bunq.com/v1";
const PRODUCTION_URL = "https://api.bunq.com/v1";

export type BunqEnvironment = "sandbox" | "production";

export type BunqMoney = { value: string; currency: string };

export type BunqAlias = {
  type?: string;
  value?: string;
  name?: string;
  display_name?: string;
  country?: string;
  iban?: string;
  public_nick_name?: string;
};

export type BunqPayment = {
  id: number;
  created: string;
  updated?: string;
  amount: BunqMoney;
  description?: string;
  type?: string;
  sub_type?: string;
  alias?: BunqAlias;
  counterparty_alias?: BunqAlias;
};

export type BunqMonetaryAccount = {
  id: number;
  description?: string;
  balance?: BunqMoney;
  status?: string;
  iban?: string;
  displayName?: string;
};

type BunqContextRow = {
  private_key_pem: string;
  public_key_pem: string;
  installation_token: string;
  server_public_key: string | null;
  device_id: number | null;
  session_token: string | null;
  session_user_id: number | null;
  session_expires_at: string | null;
  api_key_fingerprint: string;
  environment: string;
};

export class BunqError extends Error {
  status: number;
  body: string;

  constructor(message: string, status = 500, body = "") {
    super(message);
    this.name = "BunqError";
    this.status = status;
    this.body = body;
  }
}

export function getBunqApiKey(): string | null {
  return process.env.BUNQ_API_KEY?.trim() || null;
}

export function getBunqEnvironment(): BunqEnvironment {
  const raw = (process.env.BUNQ_ENVIRONMENT || "production").trim().toLowerCase();
  return raw === "sandbox" ? "sandbox" : "production";
}

export function bunqConfigStatus() {
  const apiKey = Boolean(getBunqApiKey());
  return {
    configured: apiKey,
    hasApiKey: apiKey,
    environment: getBunqEnvironment(),
    baseUrl: getBunqEnvironment() === "sandbox" ? SANDBOX_URL : PRODUCTION_URL,
  };
}

function baseUrl(): string {
  return getBunqEnvironment() === "sandbox" ? SANDBOX_URL : PRODUCTION_URL;
}

function fingerprint(apiKey: string): string {
  // Not a secret hash for security — just detects key rotation.
  let h = 0;
  for (let i = 0; i < apiKey.length; i++) h = (h * 31 + apiKey.charCodeAt(i)) | 0;
  return `k${Math.abs(h)}`;
}

function generateKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { privateKey, publicKey };
}

function signBody(privateKeyPem: string, body: string): string {
  const signer = createSign("RSA-SHA256");
  signer.update(body);
  signer.end();
  return signer.sign(privateKeyPem, "base64");
}

function unwrapResponse(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return [];
  const response = (payload as { Response?: unknown }).Response;
  if (!Array.isArray(response)) return [];
  return response as Record<string, unknown>[];
}

function pick<T>(items: Record<string, unknown>[], key: string): T | null {
  for (const item of items) {
    if (key in item) return item[key] as T;
  }
  return null;
}

async function ensureBunqContextTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS bunq_context (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      private_key_pem TEXT NOT NULL,
      public_key_pem TEXT NOT NULL,
      installation_token TEXT NOT NULL,
      server_public_key TEXT,
      device_id INTEGER,
      session_token TEXT,
      session_user_id INTEGER,
      session_expires_at TIMESTAMPTZ,
      api_key_fingerprint TEXT NOT NULL,
      environment TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

async function loadContext(): Promise<BunqContextRow | null> {
  await ensureBunqContextTable();
  const { rows } = await sql`SELECT * FROM bunq_context WHERE id = 1`;
  if (!rows[0]) return null;
  const row = rows[0];
  return {
    private_key_pem: String(row.private_key_pem),
    public_key_pem: String(row.public_key_pem),
    installation_token: String(row.installation_token),
    server_public_key: row.server_public_key ? String(row.server_public_key) : null,
    device_id: row.device_id != null ? Number(row.device_id) : null,
    session_token: row.session_token ? String(row.session_token) : null,
    session_user_id: row.session_user_id != null ? Number(row.session_user_id) : null,
    session_expires_at: row.session_expires_at ? String(row.session_expires_at) : null,
    api_key_fingerprint: String(row.api_key_fingerprint),
    environment: String(row.environment),
  };
}

async function saveContext(ctx: BunqContextRow) {
  await ensureBunqContextTable();
  await sql`
    INSERT INTO bunq_context (
      id, private_key_pem, public_key_pem, installation_token, server_public_key,
      device_id, session_token, session_user_id, session_expires_at,
      api_key_fingerprint, environment, updated_at
    ) VALUES (
      1,
      ${ctx.private_key_pem},
      ${ctx.public_key_pem},
      ${ctx.installation_token},
      ${ctx.server_public_key},
      ${ctx.device_id},
      ${ctx.session_token},
      ${ctx.session_user_id},
      ${ctx.session_expires_at},
      ${ctx.api_key_fingerprint},
      ${ctx.environment},
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      private_key_pem = EXCLUDED.private_key_pem,
      public_key_pem = EXCLUDED.public_key_pem,
      installation_token = EXCLUDED.installation_token,
      server_public_key = EXCLUDED.server_public_key,
      device_id = EXCLUDED.device_id,
      session_token = EXCLUDED.session_token,
      session_user_id = EXCLUDED.session_user_id,
      session_expires_at = EXCLUDED.session_expires_at,
      api_key_fingerprint = EXCLUDED.api_key_fingerprint,
      environment = EXCLUDED.environment,
      updated_at = now()
  `;
}

async function bunqRaw(
  method: string,
  path: string,
  opts: {
    authToken?: string | null;
    privateKeyPem?: string | null;
    body?: unknown;
  } = {},
): Promise<unknown> {
  const bodyStr = opts.body === undefined ? "" : JSON.stringify(opts.body);
  const headers: Record<string, string> = {
    "Cache-Control": "no-cache",
    "User-Agent": "blablabuild-revops/1.0",
    "X-Bunq-Language": "en_US",
    "X-Bunq-Region": "nl_NL",
    "X-Bunq-Client-Request-Id": randomUUID(),
    "X-Bunq-Geolocation": "0 0 0 0 000",
  };

  if (bodyStr) {
    headers["Content-Type"] = "application/json";
  }
  if (opts.authToken) {
    headers["X-Bunq-Client-Authentication"] = opts.authToken;
  }
  if (opts.privateKeyPem && bodyStr) {
    headers["X-Bunq-Client-Signature"] = signBody(opts.privateKeyPem, bodyStr);
  }

  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers,
    body: bodyStr || undefined,
    cache: "no-store",
  });

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new BunqError(`Bunq ${method} ${path} returned invalid JSON`, res.status, text.slice(0, 500));
  }

  if (!res.ok) {
    const errObj = unwrapResponse(json);
    const error = pick<{ error_description?: string }>(errObj, "Error");
    throw new BunqError(
      error?.error_description || `Bunq ${method} ${path} failed (${res.status})`,
      res.status,
      text.slice(0, 800),
    );
  }

  return json;
}

async function createInstallation(publicKeyPem: string) {
  const json = await bunqRaw("POST", "/installation", {
    body: { client_public_key: publicKeyPem },
  });
  const items = unwrapResponse(json);
  const token = pick<{ token: string }>(items, "Token");
  const serverKey = pick<{ server_public_key: string }>(items, "ServerPublicKey");
  if (!token?.token) throw new BunqError("Bunq installation missing token", 502);
  return {
    installationToken: token.token,
    serverPublicKey: serverKey?.server_public_key ?? null,
  };
}

async function registerDevice(installationToken: string, privateKeyPem: string, apiKey: string) {
  // Wildcard so Vercel serverless IPs keep working after the first registration.
  const permittedIps = (process.env.BUNQ_PERMITTED_IPS || "*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const json = await bunqRaw("POST", "/device-server", {
    authToken: installationToken,
    privateKeyPem,
    body: {
      description: "blablabuild revops",
      secret: apiKey,
      permitted_ips: permittedIps,
    },
  });
  const id = pick<{ id: number }>(unwrapResponse(json), "Id");
  return id?.id ?? null;
}

async function createSession(installationToken: string, privateKeyPem: string, apiKey: string) {
  const json = await bunqRaw("POST", "/session-server", {
    authToken: installationToken,
    privateKeyPem,
    body: { secret: apiKey },
  });
  const items = unwrapResponse(json);
  const token = pick<{ token: string }>(items, "Token");
  if (!token?.token) throw new BunqError("Bunq session missing token", 502);

  // UserPerson / UserCompany / UserApiKey depending on account type.
  const userPerson = pick<{ id: number }>(items, "UserPerson");
  const userCompany = pick<{ id: number }>(items, "UserCompany");
  const userApiKey = pick<{
    id?: number;
    granted_by_user?: { UserPerson?: { id: number }; UserCompany?: { id: number } };
  }>(items, "UserApiKey");

  const userId =
    userPerson?.id ??
    userCompany?.id ??
    userApiKey?.granted_by_user?.UserPerson?.id ??
    userApiKey?.granted_by_user?.UserCompany?.id ??
    userApiKey?.id;

  if (!userId) throw new BunqError("Bunq session missing user id", 502, JSON.stringify(items).slice(0, 500));

  // Sessions typically last about an hour; refresh a bit early.
  const expiresAt = new Date(Date.now() + 50 * 60 * 1000).toISOString();
  return { sessionToken: token.token, userId, expiresAt };
}

async function ensureSession(): Promise<{ sessionToken: string; userId: number; privateKeyPem: string }> {
  const apiKey = getBunqApiKey();
  if (!apiKey) {
    throw new BunqError("BUNQ_API_KEY is not set", 503);
  }

  const env = getBunqEnvironment();
  const fp = fingerprint(apiKey);
  let ctx = await loadContext();

  const needsInstall =
    !ctx ||
    ctx.api_key_fingerprint !== fp ||
    ctx.environment !== env ||
    !ctx.installation_token;

  if (needsInstall) {
    const keys = generateKeyPair();
    const installation = await createInstallation(keys.publicKey);
    const deviceId = await registerDevice(
      installation.installationToken,
      keys.privateKey,
      apiKey,
    );
    const session = await createSession(
      installation.installationToken,
      keys.privateKey,
      apiKey,
    );
    ctx = {
      private_key_pem: keys.privateKey,
      public_key_pem: keys.publicKey,
      installation_token: installation.installationToken,
      server_public_key: installation.serverPublicKey,
      device_id: deviceId,
      session_token: session.sessionToken,
      session_user_id: session.userId,
      session_expires_at: session.expiresAt,
      api_key_fingerprint: fp,
      environment: env,
    };
    await saveContext(ctx);
    return {
      sessionToken: session.sessionToken,
      userId: session.userId,
      privateKeyPem: keys.privateKey,
    };
  }

  // needsInstall covers !ctx; narrow for TypeScript.
  if (!ctx) throw new BunqError("Bunq context missing after install check", 500);

  const expired =
    !ctx.session_token ||
    !ctx.session_user_id ||
    !ctx.session_expires_at ||
    new Date(ctx.session_expires_at).getTime() < Date.now() + 60_000;

  if (expired) {
    try {
      const session = await createSession(
        ctx.installation_token,
        ctx.private_key_pem,
        apiKey,
      );
      ctx = {
        ...ctx,
        session_token: session.sessionToken,
        session_user_id: session.userId,
        session_expires_at: session.expiresAt,
      };
      await saveContext(ctx);
    } catch (err) {
      // Installation may be stale after key rotation / sandbox reset — rebuild.
      if (err instanceof BunqError && (err.status === 401 || err.status === 403 || err.status === 400)) {
        const keys = generateKeyPair();
        const installation = await createInstallation(keys.publicKey);
        const deviceId = await registerDevice(
          installation.installationToken,
          keys.privateKey,
          apiKey,
        );
        const session = await createSession(
          installation.installationToken,
          keys.privateKey,
          apiKey,
        );
        ctx = {
          private_key_pem: keys.privateKey,
          public_key_pem: keys.publicKey,
          installation_token: installation.installationToken,
          server_public_key: installation.serverPublicKey,
          device_id: deviceId,
          session_token: session.sessionToken,
          session_user_id: session.userId,
          session_expires_at: session.expiresAt,
          api_key_fingerprint: fp,
          environment: env,
        };
        await saveContext(ctx);
      } else {
        throw err;
      }
    }
  }

  return {
    sessionToken: ctx.session_token!,
    userId: ctx.session_user_id!,
    privateKeyPem: ctx.private_key_pem,
  };
}

function extractIban(alias?: BunqAlias | null): string | null {
  if (!alias) return null;
  if (alias.iban) return alias.iban;
  if (alias.type === "IBAN" && alias.value) return alias.value;
  return null;
}

function extractName(alias?: BunqAlias | null): string | null {
  if (!alias) return null;
  return alias.display_name || alias.public_nick_name || alias.name || null;
}

function parseAccount(entry: Record<string, unknown>): BunqMonetaryAccount | null {
  const bank = entry.MonetaryAccountBank as
    | {
        id: number;
        description?: string;
        balance?: BunqMoney;
        status?: string;
        alias?: Array<{ type?: string; value?: string; name?: string; display_name?: string }>;
      }
    | undefined;
  const joint = entry.MonetaryAccountJoint as typeof bank;
  const light = entry.MonetaryAccountLight as typeof bank;
  const savings = entry.MonetaryAccountSavings as typeof bank;
  const account = bank || joint || light || savings;
  if (!account?.id) return null;

  const ibanAlias = (account.alias || []).find((a) => a.type === "IBAN");
  return {
    id: account.id,
    description: account.description,
    balance: account.balance,
    status: account.status,
    iban: ibanAlias?.value,
    displayName: ibanAlias?.name || ibanAlias?.display_name || account.description,
  };
}

export async function listMonetaryAccounts(): Promise<BunqMonetaryAccount[]> {
  const { sessionToken, userId } = await ensureSession();
  const json = await bunqRaw("GET", `/user/${userId}/monetary-account?count=50`, {
    authToken: sessionToken,
  });
  const accounts: BunqMonetaryAccount[] = [];
  for (const item of unwrapResponse(json)) {
    const parsed = parseAccount(item);
    if (parsed && parsed.status !== "CANCELLED" && parsed.status !== "PENDING_REOPEN") {
      accounts.push(parsed);
    }
  }
  return accounts;
}

async function listPaymentsPage(
  userId: number,
  accountId: number,
  sessionToken: string,
  olderId?: number,
): Promise<BunqPayment[]> {
  const params = new URLSearchParams({ count: "200" });
  if (olderId) params.set("older_id", String(olderId));
  const json = await bunqRaw(
    "GET",
    `/user/${userId}/monetary-account/${accountId}/payment?${params}`,
    { authToken: sessionToken },
  );
  const payments: BunqPayment[] = [];
  for (const item of unwrapResponse(json)) {
    const payment = item.Payment as BunqPayment | undefined;
    if (payment?.id && payment.amount) payments.push(payment);
  }
  return payments;
}

export type BunqIncomingPayment = {
  id: number;
  created: string;
  amount: number;
  currency: string;
  description: string;
  counterpartyName: string | null;
  counterpartyIban: string | null;
  monetaryAccountId: number;
  accountIban: string | null;
  accountName: string | null;
  type: string | null;
  raw: unknown;
};

/**
 * Collect incoming money from each active monetary account.
 * In the payment list, positive amounts are credits (money in).
 * Stops paging once payments fall before `since` (ISO date, default 2026-01-01).
 */
export async function fetchIncomingPayments(opts?: {
  maxPages?: number;
  /** Inclusive lower bound, YYYY-MM-DD. Older payments are skipped. */
  since?: string;
}): Promise<BunqIncomingPayment[]> {
  const maxPages = opts?.maxPages ?? 8;
  const since = opts?.since ?? "2026-01-01";
  const sinceMs = new Date(`${since}T00:00:00.000Z`).getTime();
  const { sessionToken, userId } = await ensureSession();
  const accounts = await listMonetaryAccounts();

  const incomingById = new Map<number, BunqIncomingPayment>();

  for (const account of accounts) {
    let olderId: number | undefined;
    for (let page = 0; page < maxPages; page++) {
      const payments = await listPaymentsPage(userId, account.id, sessionToken, olderId);
      if (payments.length === 0) break;

      let hitOlderThanSince = false;
      for (const payment of payments) {
        if (!payment?.id || !payment.amount) continue;
        const createdMs = new Date(payment.created).getTime();
        if (Number.isFinite(createdMs) && createdMs < sinceMs) {
          hitOlderThanSince = true;
          continue;
        }
        const amount = Number(payment.amount.value);
        if (!Number.isFinite(amount) || amount <= 0) continue;

        incomingById.set(payment.id, {
          id: payment.id,
          created: payment.created,
          amount,
          currency: payment.amount.currency || "EUR",
          description: payment.description?.trim() || "",
          counterpartyName: extractName(payment.counterparty_alias) || extractName(payment.alias),
          counterpartyIban: extractIban(payment.counterparty_alias) || extractIban(payment.alias),
          monetaryAccountId: account.id,
          accountIban: account.iban ?? null,
          accountName: account.description || account.displayName || null,
          type: payment.type || payment.sub_type || null,
          raw: payment,
        });
      }

      olderId = payments[payments.length - 1]?.id;
      if (hitOlderThanSince || payments.length < 200) break;
    }
  }

  return [...incomingById.values()].sort((a, b) => b.created.localeCompare(a.created));
}

export async function testBunqConnection(): Promise<{
  ok: boolean;
  accounts?: number;
  error?: string;
}> {
  try {
    const accounts = await listMonetaryAccounts();
    return { ok: true, accounts: accounts.length };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown Bunq error",
    };
  }
}
