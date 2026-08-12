import { sql, ensureTables } from "@/lib/db";
import {
  fetchIncomingPayments,
  type BunqIncomingPayment,
} from "@/lib/bunq/client";

export type BunqPaymentRow = {
  id: number;
  created_at: string;
  amount: number;
  currency: string;
  description: string;
  counterparty_name: string | null;
  counterparty_iban: string | null;
  monetary_account_id: number;
  account_iban: string | null;
  account_name: string | null;
  payment_type: string | null;
  company_id: string | null;
  finance_deal_id: string | null;
  matched_confidence: string | null;
  synced_at: string;
};

export async function ensureBunqPaymentsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS bunq_payments (
      id BIGINT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      currency TEXT NOT NULL DEFAULT 'EUR',
      description TEXT NOT NULL DEFAULT '',
      counterparty_name TEXT,
      counterparty_iban TEXT,
      monetary_account_id BIGINT NOT NULL,
      account_iban TEXT,
      account_name TEXT,
      payment_type TEXT,
      company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
      finance_deal_id UUID REFERENCES finance_deals(id) ON DELETE SET NULL,
      matched_confidence TEXT,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      raw JSONB DEFAULT '{}'::jsonb
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS bunq_payments_created_at
    ON bunq_payments (created_at DESC)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS bunq_payments_counterparty_name
    ON bunq_payments (counterparty_name)
  `;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(b\.?\s*v\.?|v\.?\s*o\.?\s*f\.?|n\.?\s*v\.?)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function loadCompanyMap(): Promise<Map<string, string>> {
  const { rows } = await sql`SELECT id, name FROM companies`;
  const map = new Map<string, string>();
  for (const row of rows) {
    const name = String(row.name ?? "");
    if (!name) continue;
    map.set(normalizeName(name), String(row.id));
  }
  return map;
}

async function loadDeals(): Promise<
  {
    id: string;
    company_id: string | null;
    company_name: string;
    project_name: string;
    total: number;
    paid: number;
  }[]
> {
  const { rows } = await sql`
    SELECT id, company_id, company_name, project_name,
           total_deal_value, amount_paid
    FROM finance_deals
    ORDER BY updated_at DESC
  `;
  return rows.map((row) => ({
    id: String(row.id),
    company_id: row.company_id ? String(row.company_id) : null,
    company_name: String(row.company_name ?? ""),
    project_name: String(row.project_name ?? ""),
    total: Number(row.total_deal_value) || 0,
    paid: Number(row.amount_paid) || 0,
  }));
}

function matchPayment(
  payment: BunqIncomingPayment,
  companyMap: Map<string, string>,
  deals: Awaited<ReturnType<typeof loadDeals>>,
): { companyId: string | null; dealId: string | null; confidence: string | null } {
  const counterparty = payment.counterpartyName
    ? normalizeName(payment.counterpartyName)
    : "";
  const description = normalizeName(payment.description || "");

  let companyId = counterparty ? companyMap.get(counterparty) ?? null : null;

  // Fuzzy: company name appears in description or counterparty contains company name.
  if (!companyId) {
    for (const [name, id] of companyMap) {
      if (!name || name.length < 3) continue;
      if (
        (counterparty && (counterparty.includes(name) || name.includes(counterparty))) ||
        (description && description.includes(name))
      ) {
        companyId = id;
        break;
      }
    }
  }

  const candidates = deals.filter((d) => {
    if (companyId && d.company_id === companyId) return true;
    if (companyId && normalizeName(d.company_name) === counterparty) return true;
    if (counterparty && normalizeName(d.company_name) === counterparty) return true;
    return false;
  });

  if (candidates.length === 0) {
    return { companyId, dealId: null, confidence: companyId ? "company" : null };
  }

  // Prefer deals whose remaining balance is close to this payment (incl. VAT amounts).
  const withAmount = candidates
    .map((d) => {
      const remaining = Math.max(0, d.total - d.paid);
      const delta = Math.abs(remaining - payment.amount);
      const projectHit =
        d.project_name && description.includes(normalizeName(d.project_name)) ? 1 : 0;
      return { deal: d, delta, projectHit, remaining };
    })
    .sort((a, b) => b.projectHit - a.projectHit || a.delta - b.delta);

  const best = withAmount[0];
  if (best.projectHit) {
    return { companyId: companyId ?? best.deal.company_id, dealId: best.deal.id, confidence: "project" };
  }
  if (best.delta <= 1 || (best.remaining > 0 && best.delta / Math.max(best.remaining, 1) < 0.05)) {
    return { companyId: companyId ?? best.deal.company_id, dealId: best.deal.id, confidence: "amount" };
  }
  if (candidates.length === 1) {
    return { companyId: companyId ?? best.deal.company_id, dealId: best.deal.id, confidence: "company" };
  }

  return { companyId, dealId: null, confidence: companyId ? "company" : null };
}

export type BunqSyncResult = {
  fetched: number;
  upserted: number;
  matchedCompanies: number;
  matchedDeals: number;
  totalIncoming: number;
  syncedAt: string;
};

export async function syncBunqPayments(): Promise<BunqSyncResult> {
  await ensureTables();
  await ensureBunqPaymentsTable();

  const [payments, companyMap, deals] = await Promise.all([
    fetchIncomingPayments({ maxPages: 5 }),
    loadCompanyMap(),
    loadDeals(),
  ]);

  let upserted = 0;
  let matchedCompanies = 0;
  let matchedDeals = 0;
  let totalIncoming = 0;

  for (const payment of payments) {
    const match = matchPayment(payment, companyMap, deals);
    if (match.companyId) matchedCompanies += 1;
    if (match.dealId) matchedDeals += 1;
    totalIncoming += payment.amount;

    await sql`
      INSERT INTO bunq_payments (
        id, created_at, amount, currency, description,
        counterparty_name, counterparty_iban, monetary_account_id,
        account_iban, account_name, payment_type,
        company_id, finance_deal_id, matched_confidence, synced_at, raw
      ) VALUES (
        ${payment.id},
        ${payment.created},
        ${payment.amount},
        ${payment.currency},
        ${payment.description},
        ${payment.counterpartyName},
        ${payment.counterpartyIban},
        ${payment.monetaryAccountId},
        ${payment.accountIban},
        ${payment.accountName},
        ${payment.type},
        ${match.companyId},
        ${match.dealId},
        ${match.confidence},
        now(),
        ${JSON.stringify(payment.raw)}::jsonb
      )
      ON CONFLICT (id) DO UPDATE SET
        created_at = EXCLUDED.created_at,
        amount = EXCLUDED.amount,
        currency = EXCLUDED.currency,
        description = EXCLUDED.description,
        counterparty_name = EXCLUDED.counterparty_name,
        counterparty_iban = EXCLUDED.counterparty_iban,
        monetary_account_id = EXCLUDED.monetary_account_id,
        account_iban = EXCLUDED.account_iban,
        account_name = EXCLUDED.account_name,
        payment_type = EXCLUDED.payment_type,
        company_id = COALESCE(EXCLUDED.company_id, bunq_payments.company_id),
        finance_deal_id = COALESCE(EXCLUDED.finance_deal_id, bunq_payments.finance_deal_id),
        matched_confidence = COALESCE(EXCLUDED.matched_confidence, bunq_payments.matched_confidence),
        synced_at = now(),
        raw = EXCLUDED.raw
    `;
    upserted += 1;
  }

  const syncedAt = new Date().toISOString();
  await sql`
    INSERT INTO finance_settings (key, value, updated_at)
    VALUES ('bunq_last_sync', ${syncedAt}, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `;

  return {
    fetched: payments.length,
    upserted,
    matchedCompanies,
    matchedDeals,
    totalIncoming: Math.round(totalIncoming * 100) / 100,
    syncedAt,
  };
}

export async function listBunqPayments(opts?: {
  limit?: number;
}): Promise<BunqPaymentRow[]> {
  await ensureTables();
  await ensureBunqPaymentsTable();
  const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 500);
  const { rows } = await sql`
    SELECT *
    FROM bunq_payments
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    id: Number(row.id),
    created_at: String(row.created_at),
    amount: Number(row.amount) || 0,
    currency: String(row.currency || "EUR"),
    description: String(row.description || ""),
    counterparty_name: row.counterparty_name ? String(row.counterparty_name) : null,
    counterparty_iban: row.counterparty_iban ? String(row.counterparty_iban) : null,
    monetary_account_id: Number(row.monetary_account_id),
    account_iban: row.account_iban ? String(row.account_iban) : null,
    account_name: row.account_name ? String(row.account_name) : null,
    payment_type: row.payment_type ? String(row.payment_type) : null,
    company_id: row.company_id ? String(row.company_id) : null,
    finance_deal_id: row.finance_deal_id ? String(row.finance_deal_id) : null,
    matched_confidence: row.matched_confidence ? String(row.matched_confidence) : null,
    synced_at: String(row.synced_at),
  }));
}

export async function getBunqPaymentTotals() {
  await ensureTables();
  await ensureBunqPaymentsTable();
  const { rows } = await sql`
    SELECT
      COUNT(*)::int AS count,
      COALESCE(SUM(amount), 0) AS total,
      COUNT(*) FILTER (WHERE finance_deal_id IS NOT NULL)::int AS matched_deals,
      COUNT(*) FILTER (WHERE company_id IS NOT NULL)::int AS matched_companies
    FROM bunq_payments
  `;
  const { rows: syncRows } = await sql`
    SELECT value FROM finance_settings WHERE key = 'bunq_last_sync'
  `;
  const row = rows[0];
  return {
    count: Number(row?.count) || 0,
    total: Number(row?.total) || 0,
    matchedDeals: Number(row?.matched_deals) || 0,
    matchedCompanies: Number(row?.matched_companies) || 0,
    lastSync: syncRows[0]?.value ? String(syncRows[0].value) : null,
  };
}

/** Apply matched Bunq payments onto finance deal payment entries (idempotent by bunq id). */
export async function applyBunqPaymentsToDeals(): Promise<{ updatedDeals: number }> {
  await ensureTables();
  await ensureBunqPaymentsTable();

  const { rows } = await sql`
    SELECT id, amount, created_at, finance_deal_id, description
    FROM bunq_payments
    WHERE finance_deal_id IS NOT NULL
    ORDER BY created_at ASC
  `;

  const byDeal = new Map<string, typeof rows>();
  for (const row of rows) {
    const dealId = String(row.finance_deal_id);
    const list = byDeal.get(dealId) ?? [];
    list.push(row);
    byDeal.set(dealId, list);
  }

  let updatedDeals = 0;
  for (const [dealId, payments] of byDeal) {
    const { rows: dealRows } = await sql`
      SELECT payments FROM finance_deals WHERE id = ${dealId}::uuid
    `;
    if (!dealRows[0]) continue;

    let existing: { date: string; amount: number; bunq_id?: number }[] = [];
    try {
      existing = (dealRows[0].payments as typeof existing) || [];
      if (!Array.isArray(existing)) existing = [];
    } catch {
      existing = [];
    }

    const known = new Set(
      existing.map((p) => p.bunq_id).filter((id): id is number => typeof id === "number"),
    );
    let changed = false;
    const next = [...existing];
    for (const payment of payments) {
      const bunqId = Number(payment.id);
      if (known.has(bunqId)) continue;
      next.push({
        date: String(payment.created_at).slice(0, 10),
        amount: Number(payment.amount) || 0,
        bunq_id: bunqId,
      });
      known.add(bunqId);
      changed = true;
    }
    if (!changed) continue;

    const amountPaid = next.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    await sql`
      UPDATE finance_deals
      SET payments = ${JSON.stringify(next)}::jsonb,
          amount_paid = ${amountPaid},
          updated_at = now()
      WHERE id = ${dealId}::uuid
    `;
    updatedDeals += 1;
  }

  return { updatedDeals };
}
