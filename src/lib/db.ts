import { sql } from "@vercel/postgres";
export { sql };

let initialized = false;

export async function ensureTables() {
  if (initialized) return;

  await sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`;

  await sql`
    CREATE TABLE IF NOT EXISTS companies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      industry TEXT,
      website TEXT,
      country TEXT DEFAULT 'NL',
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS opportunities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL DEFAULT 'new_business'
        CHECK (type IN ('new_business', 'upsell', 'renewal', 'project', 'retainer')),
      stage TEXT NOT NULL DEFAULT 'prospect'
        CHECK (stage IN ('prospect', 'qualified', 'proposal', 'negotiation', 'won', 'lost', 'on_hold')),
      probability INTEGER DEFAULT 50 CHECK (probability >= 0 AND probability <= 100),
      expected_value NUMERIC(12,2) DEFAULT 0,
      actual_value NUMERIC(12,2) DEFAULT 0,
      currency TEXT DEFAULT 'EUR',
      sentiment TEXT DEFAULT 'neutral'
        CHECK (sentiment IN ('very_positive', 'positive', 'neutral', 'negative', 'very_negative')),
      proposal_status TEXT
        CHECK (proposal_status IN ('not_sent', 'draft', 'sent', 'viewed', 'accepted', 'declined', 'expired')),
      proposal_url TEXT,
      owner TEXT,
      close_date DATE,
      start_date DATE,
      end_date DATE,
      notes TEXT,
      tags TEXT[],
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  initialized = true;
}
