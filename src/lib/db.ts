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

  await sql`
    CREATE TABLE IF NOT EXISTS projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL,
      company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'active'
        CHECK (status IN ('active', 'on_hold', 'completed', 'cancelled')),
      share_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
      client_name TEXT,
      client_email TEXT,
      start_date DATE,
      end_date DATE,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS milestones (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      position INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'completed')),
      due_date DATE,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'open'
        CHECK (status IN ('open', 'in_progress', 'done')),
      created_by TEXT DEFAULT 'team'
        CHECK (created_by IN ('team', 'client')),
      approved BOOLEAN DEFAULT true,
      assignee TEXT,
      due_date DATE,
      position INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS monthly_revenue (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
      month DATE NOT NULL,
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(company_id, month)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS finance_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS salary_withdrawals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      month DATE NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      person TEXT NOT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  await sql`
    INSERT INTO finance_settings (key, value) VALUES
      ('salary_pct', '45'),
      ('tax_pct', '40'),
      ('reserve_pct', '10'),
      ('salary_per_person', '4500'),
      ('founders', '2')
    ON CONFLICT (key) DO NOTHING
  `;

  initialized = true;
}
