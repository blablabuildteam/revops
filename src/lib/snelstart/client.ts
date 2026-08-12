/**
 * Thin client for the SnelStart B2B API v2.
 *
 * Auth is three-layered:
 * 1. Subscription key from the developer portal (Ocp-Apim-Subscription-Key)
 * 2. Maatwerksleutel from SnelStart Web → Koppelingen → Maatwerk (clientkey)
 * 3. Short-lived bearer token from https://auth.snelstart.nl/b2b/token
 */

const DEFAULT_BASE_URL = "https://b2bapi.snelstart.nl/v2";
const DEFAULT_TOKEN_URL = "https://auth.snelstart.nl/b2b/token";

export type SnelstartConfig = {
  subscriptionKey: string;
  clientKey: string;
  baseUrl?: string;
  tokenUrl?: string;
};

export type SnelstartMoneyLike =
  | number
  | string
  | { value?: number | string; amount?: number | string }
  | null
  | undefined;

export type SnelstartRelatieRef = {
  id?: string;
  uri?: string;
  relatiesoort?: string[];
  naam?: string;
};

export type SnelstartVerkoopfactuur = {
  id: string;
  factuurnummer?: string | null;
  factuurDatum?: string | null;
  vervalDatum?: string | null;
  factuurBedrag?: SnelstartMoneyLike;
  openstaandSaldo?: SnelstartMoneyLike;
  modifiedOn?: string | null;
  relatie?: SnelstartRelatieRef | null;
  verkoopBoeking?: { id?: string } | null;
};

export type SnelstartRelatie = {
  id: string;
  naam?: string | null;
  relatiesoort?: string[];
  btwNummer?: string | null;
  kvkNummer?: string | null;
  email?: string | null;
};

type TokenCache = {
  accessToken: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;

export function getSnelstartConfig(): SnelstartConfig | null {
  const subscriptionKey = process.env.SNELSTART_SUBSCRIPTION_KEY?.trim();
  const clientKey = process.env.SNELSTART_CLIENT_KEY?.trim();
  if (!subscriptionKey || !clientKey) return null;
  return {
    subscriptionKey,
    clientKey,
    baseUrl: process.env.SNELSTART_BASE_URL?.trim() || DEFAULT_BASE_URL,
    tokenUrl: process.env.SNELSTART_TOKEN_URL?.trim() || DEFAULT_TOKEN_URL,
  };
}

export function snelstartConfigStatus() {
  const subscriptionKey = Boolean(process.env.SNELSTART_SUBSCRIPTION_KEY?.trim());
  const clientKey = Boolean(process.env.SNELSTART_CLIENT_KEY?.trim());
  return {
    configured: subscriptionKey && clientKey,
    hasSubscriptionKey: subscriptionKey,
    hasClientKey: clientKey,
    baseUrl: process.env.SNELSTART_BASE_URL?.trim() || DEFAULT_BASE_URL,
  };
}

export function parseSnelstartAmount(value: SnelstartMoneyLike): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof value === "object") {
    const raw = value.value ?? value.amount;
    return parseSnelstartAmount(raw as SnelstartMoneyLike);
  }
  return 0;
}

export class SnelstartError extends Error {
  status: number;
  body: string;

  constructor(message: string, status = 500, body = "") {
    super(message);
    this.name = "SnelstartError";
    this.status = status;
    this.body = body;
  }
}

async function fetchAccessToken(config: SnelstartConfig): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }

  const tokenUrl = config.tokenUrl ?? DEFAULT_TOKEN_URL;
  const body = new URLSearchParams({
    grant_type: "clientkey",
    clientkey: config.clientKey,
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    throw new SnelstartError(
      `SnelStart auth failed (${res.status}). Check the maatwerksleutel.`,
      res.status,
      text.slice(0, 500),
    );
  }

  let data: { access_token?: string; expires_in?: number };
  try {
    data = JSON.parse(text) as { access_token?: string; expires_in?: number };
  } catch {
    throw new SnelstartError("SnelStart auth returned invalid JSON", 502, text.slice(0, 500));
  }

  if (!data.access_token) {
    throw new SnelstartError("SnelStart auth response missing access_token", 502, text.slice(0, 500));
  }

  const expiresInSec = Number(data.expires_in) || 3600;
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + expiresInSec * 1000,
  };
  return data.access_token;
}

export async function snelstartFetch<T>(
  path: string,
  init?: RequestInit & { config?: SnelstartConfig },
): Promise<T> {
  const config = init?.config ?? getSnelstartConfig();
  if (!config) {
    throw new SnelstartError(
      "SnelStart is not configured. Set SNELSTART_SUBSCRIPTION_KEY and SNELSTART_CLIENT_KEY.",
      503,
    );
  }

  const token = await fetchAccessToken(config);
  const base = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const url = path.startsWith("http") ? path : `${base}/${path.replace(/^\//, "")}`;

  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": config.subscriptionKey,
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    // Force a fresh token on the next call if auth failed mid-flight.
    if (res.status === 401 || res.status === 403) tokenCache = null;
    throw new SnelstartError(
      `SnelStart API ${path} failed (${res.status})`,
      res.status,
      text.slice(0, 800),
    );
  }

  if (!text) return [] as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new SnelstartError(`SnelStart API ${path} returned invalid JSON`, 502, text.slice(0, 500));
  }
}

/** Paginate a list endpoint with OData $skip / $top. */
export async function snelstartListAll<T>(
  resource: string,
  opts?: { pageSize?: number; filter?: string; orderby?: string },
): Promise<T[]> {
  const pageSize = opts?.pageSize ?? 100;
  const items: T[] = [];
  let skip = 0;

  for (;;) {
    const params = new URLSearchParams();
    params.set("$top", String(pageSize));
    params.set("$skip", String(skip));
    if (opts?.filter) params.set("$filter", opts.filter);
    if (opts?.orderby) params.set("$orderby", opts.orderby);

    const page = await snelstartFetch<T[]>(`${resource}?${params.toString()}`);
    if (!Array.isArray(page) || page.length === 0) break;
    items.push(...page);
    if (page.length < pageSize) break;
    skip += pageSize;
    // Safety valve — admin books rarely need more than this in one sync.
    if (skip >= 5_000) break;
  }

  return items;
}

export async function fetchVerkoopfacturen(): Promise<SnelstartVerkoopfactuur[]> {
  return snelstartListAll<SnelstartVerkoopfactuur>("verkoopfacturen", {
    orderby: "factuurDatum desc",
  });
}

export async function fetchRelaties(): Promise<SnelstartRelatie[]> {
  return snelstartListAll<SnelstartRelatie>("relaties");
}

export async function testSnelstartConnection(): Promise<{
  ok: boolean;
  invoiceCount?: number;
  error?: string;
}> {
  try {
    const params = new URLSearchParams({ $top: "1" });
    const page = await snelstartFetch<SnelstartVerkoopfactuur[]>(
      `verkoopfacturen?${params.toString()}`,
    );
    return { ok: true, invoiceCount: Array.isArray(page) ? page.length : 0 };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown SnelStart error",
    };
  }
}
