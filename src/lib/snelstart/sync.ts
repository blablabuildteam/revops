import { sql, ensureTables } from "@/lib/db";
import {
  fetchRelaties,
  fetchVerkoopfacturen,
  parseSnelstartAmount,
  type SnelstartRelatie,
  type SnelstartVerkoopfactuur,
} from "@/lib/snelstart/client";

export type SnelstartInvoiceRow = {
  id: string;
  factuurnummer: string | null;
  factuur_datum: string | null;
  verval_datum: string | null;
  factuur_bedrag: number;
  openstaand_saldo: number;
  betaald_bedrag: number;
  relatie_id: string | null;
  relatie_naam: string | null;
  verkoopboeking_id: string | null;
  company_id: string | null;
  finance_deal_id: string | null;
  modified_on: string | null;
  synced_at: string;
  raw: unknown;
};

export async function ensureSnelstartTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS snelstart_invoices (
      id UUID PRIMARY KEY,
      factuurnummer TEXT,
      factuur_datum DATE,
      verval_datum DATE,
      factuur_bedrag NUMERIC(12,2) NOT NULL DEFAULT 0,
      openstaand_saldo NUMERIC(12,2) NOT NULL DEFAULT 0,
      betaald_bedrag NUMERIC(12,2) NOT NULL DEFAULT 0,
      relatie_id TEXT,
      relatie_naam TEXT,
      verkoopboeking_id TEXT,
      company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
      finance_deal_id UUID REFERENCES finance_deals(id) ON DELETE SET NULL,
      modified_on TIMESTAMPTZ,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      raw JSONB DEFAULT '{}'::jsonb
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS snelstart_invoices_factuur_datum
    ON snelstart_invoices (factuur_datum DESC)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS snelstart_invoices_relatie_naam
    ON snelstart_invoices (relatie_naam)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS snelstart_invoices_openstaand
    ON snelstart_invoices (openstaand_saldo)
  `;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(b\.?\s*v\.?|v\.?\s*o\.?\s*f\.?|n\.?\s*v\.?)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dateOnly(value?: string | null): string | null {
  if (!value) return null;
  const slice = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(slice) ? slice : null;
}

function mapInvoice(
  invoice: SnelstartVerkoopfactuur,
  relatiesById: Map<string, SnelstartRelatie>,
) {
  const factuurBedrag = parseSnelstartAmount(invoice.factuurBedrag);
  const openstaand = parseSnelstartAmount(invoice.openstaandSaldo);
  const relatieId = invoice.relatie?.id ?? null;
  const relatie =
    (relatieId ? relatiesById.get(relatieId) : undefined) ?? invoice.relatie ?? null;
  const relatieNaam = relatie?.naam?.trim() || invoice.relatie?.naam?.trim() || null;

  return {
    id: invoice.id,
    factuurnummer: invoice.factuurnummer ?? null,
    factuur_datum: dateOnly(invoice.factuurDatum),
    verval_datum: dateOnly(invoice.vervalDatum),
    factuur_bedrag: factuurBedrag,
    openstaand_saldo: openstaand,
    betaald_bedrag: Math.max(0, Math.round((factuurBedrag - openstaand) * 100) / 100),
    relatie_id: relatieId,
    relatie_naam: relatieNaam,
    verkoopboeking_id: invoice.verkoopBoeking?.id ?? null,
    modified_on: invoice.modifiedOn ?? null,
    raw: invoice,
  };
}

async function loadCompanyNameMap(): Promise<Map<string, string>> {
  const { rows } = await sql`SELECT id, name FROM companies`;
  const map = new Map<string, string>();
  for (const row of rows) {
    const name = String(row.name ?? "");
    if (!name) continue;
    map.set(normalizeName(name), String(row.id));
  }
  return map;
}

async function loadDealHints(): Promise<
  { id: string; company_id: string | null; company_name: string; project_name: string }[]
> {
  const { rows } = await sql`
    SELECT id, company_id, company_name, project_name
    FROM finance_deals
    ORDER BY updated_at DESC
  `;
  return rows.map((row) => ({
    id: String(row.id),
    company_id: row.company_id ? String(row.company_id) : null,
    company_name: String(row.company_name ?? ""),
    project_name: String(row.project_name ?? ""),
  }));
}

function matchDeal(
  invoice: ReturnType<typeof mapInvoice>,
  deals: Awaited<ReturnType<typeof loadDealHints>>,
): string | null {
  if (!invoice.relatie_naam) return null;
  const rel = normalizeName(invoice.relatie_naam);
  const sameCompany = deals.filter((d) => normalizeName(d.company_name) === rel);
  if (sameCompany.length === 0) return null;
  // Most recently updated deal for that company (deals are ordered DESC).
  return sameCompany[0].id;
}

export type SyncResult = {
  fetched: number;
  upserted: number;
  matchedCompanies: number;
  matchedDeals: number;
  totals: {
    factuurBedrag: number;
    openstaand: number;
    betaald: number;
  };
  syncedAt: string;
};

export async function syncSnelstartInvoices(): Promise<SyncResult> {
  await ensureTables();
  await ensureSnelstartTables();

  const [invoices, relaties, companyMap, deals] = await Promise.all([
    fetchVerkoopfacturen(),
    fetchRelaties().catch(() => [] as SnelstartRelatie[]),
    loadCompanyNameMap(),
    loadDealHints(),
  ]);

  const relatiesById = new Map(relaties.map((r) => [r.id, r]));
  let upserted = 0;
  let matchedCompanies = 0;
  let matchedDeals = 0;
  let factuurBedrag = 0;
  let openstaand = 0;
  let betaald = 0;

  for (const raw of invoices) {
    if (!raw?.id) continue;
    const mapped = mapInvoice(raw, relatiesById);
    const companyId = mapped.relatie_naam
      ? companyMap.get(normalizeName(mapped.relatie_naam)) ?? null
      : null;
    const financeDealId = matchDeal(mapped, deals);

    if (companyId) matchedCompanies += 1;
    if (financeDealId) matchedDeals += 1;

    factuurBedrag += mapped.factuur_bedrag;
    openstaand += mapped.openstaand_saldo;
    betaald += mapped.betaald_bedrag;

    await sql`
      INSERT INTO snelstart_invoices (
        id, factuurnummer, factuur_datum, verval_datum,
        factuur_bedrag, openstaand_saldo, betaald_bedrag,
        relatie_id, relatie_naam, verkoopboeking_id,
        company_id, finance_deal_id, modified_on, synced_at, raw
      ) VALUES (
        ${mapped.id}::uuid,
        ${mapped.factuurnummer},
        ${mapped.factuur_datum},
        ${mapped.verval_datum},
        ${mapped.factuur_bedrag},
        ${mapped.openstaand_saldo},
        ${mapped.betaald_bedrag},
        ${mapped.relatie_id},
        ${mapped.relatie_naam},
        ${mapped.verkoopboeking_id},
        ${companyId},
        ${financeDealId},
        ${mapped.modified_on},
        now(),
        ${JSON.stringify(mapped.raw)}::jsonb
      )
      ON CONFLICT (id) DO UPDATE SET
        factuurnummer = EXCLUDED.factuurnummer,
        factuur_datum = EXCLUDED.factuur_datum,
        verval_datum = EXCLUDED.verval_datum,
        factuur_bedrag = EXCLUDED.factuur_bedrag,
        openstaand_saldo = EXCLUDED.openstaand_saldo,
        betaald_bedrag = EXCLUDED.betaald_bedrag,
        relatie_id = EXCLUDED.relatie_id,
        relatie_naam = EXCLUDED.relatie_naam,
        verkoopboeking_id = EXCLUDED.verkoopboeking_id,
        company_id = COALESCE(EXCLUDED.company_id, snelstart_invoices.company_id),
        finance_deal_id = COALESCE(EXCLUDED.finance_deal_id, snelstart_invoices.finance_deal_id),
        modified_on = EXCLUDED.modified_on,
        synced_at = now(),
        raw = EXCLUDED.raw
    `;
    upserted += 1;
  }

  const syncedAt = new Date().toISOString();
  await sql`
    INSERT INTO finance_settings (key, value, updated_at)
    VALUES ('snelstart_last_sync', ${syncedAt}, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `;

  return {
    fetched: invoices.length,
    upserted,
    matchedCompanies,
    matchedDeals,
    totals: {
      factuurBedrag: Math.round(factuurBedrag * 100) / 100,
      openstaand: Math.round(openstaand * 100) / 100,
      betaald: Math.round(betaald * 100) / 100,
    },
    syncedAt,
  };
}

export async function listSnelstartInvoices(opts?: {
  openOnly?: boolean;
  limit?: number;
}): Promise<SnelstartInvoiceRow[]> {
  await ensureTables();
  await ensureSnelstartTables();

  const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 500);
  const openOnly = opts?.openOnly ?? false;

  const { rows } = openOnly
    ? await sql`
        SELECT *
        FROM snelstart_invoices
        WHERE openstaand_saldo > 0.009
        ORDER BY factuur_datum DESC NULLS LAST, synced_at DESC
        LIMIT ${limit}
      `
    : await sql`
        SELECT *
        FROM snelstart_invoices
        ORDER BY factuur_datum DESC NULLS LAST, synced_at DESC
        LIMIT ${limit}
      `;

  return rows.map((row) => ({
    id: String(row.id),
    factuurnummer: row.factuurnummer ? String(row.factuurnummer) : null,
    factuur_datum: row.factuur_datum ? String(row.factuur_datum).slice(0, 10) : null,
    verval_datum: row.verval_datum ? String(row.verval_datum).slice(0, 10) : null,
    factuur_bedrag: Number(row.factuur_bedrag) || 0,
    openstaand_saldo: Number(row.openstaand_saldo) || 0,
    betaald_bedrag: Number(row.betaald_bedrag) || 0,
    relatie_id: row.relatie_id ? String(row.relatie_id) : null,
    relatie_naam: row.relatie_naam ? String(row.relatie_naam) : null,
    verkoopboeking_id: row.verkoopboeking_id ? String(row.verkoopboeking_id) : null,
    company_id: row.company_id ? String(row.company_id) : null,
    finance_deal_id: row.finance_deal_id ? String(row.finance_deal_id) : null,
    modified_on: row.modified_on ? String(row.modified_on) : null,
    synced_at: String(row.synced_at),
    raw: row.raw,
  }));
}

export async function getSnelstartInvoiceTotals() {
  await ensureTables();
  await ensureSnelstartTables();
  const { rows } = await sql`
    SELECT
      COUNT(*)::int AS count,
      COALESCE(SUM(factuur_bedrag), 0) AS factuur_bedrag,
      COALESCE(SUM(openstaand_saldo), 0) AS openstaand,
      COALESCE(SUM(betaald_bedrag), 0) AS betaald
    FROM snelstart_invoices
  `;
  const row = rows[0];
  const { rows: syncRows } = await sql`
    SELECT value FROM finance_settings WHERE key = 'snelstart_last_sync'
  `;
  return {
    count: Number(row?.count) || 0,
    factuurBedrag: Number(row?.factuur_bedrag) || 0,
    openstaand: Number(row?.openstaand) || 0,
    betaald: Number(row?.betaald) || 0,
    lastSync: syncRows[0]?.value ? String(syncRows[0].value) : null,
  };
}
