import { sql } from "@vercel/postgres";
import { backfillMissingStandardPhases } from "@/lib/milestones";
export { sql };

let initialized = false;
let initPromise: Promise<void> | null = null;

export async function ensureTables() {
  // Single flight: if already running, wait for the same promise
  if (initialized) return;
  if (initPromise) return initPromise;
  initPromise = _init();
  return initPromise;
}

async function migrateOpportunityTypes() {
  // Drop the old constraint first — updates to 'new'/'retainer' fail while it still
  // only allows legacy values like 'new_business' and 'upsell'.
  await sql`ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_type_check`;
  await sql`UPDATE opportunities SET type = 'new' WHERE type IN ('new_business', 'upsell')`;
  await sql`UPDATE opportunities SET type = 'retainer' WHERE type = 'renewal'`;
  await sql`ALTER TABLE opportunities ALTER COLUMN type SET DEFAULT 'new'`;
  try {
    await sql`ALTER TABLE opportunities ADD CONSTRAINT opportunities_type_check CHECK (type IN ('new', 'project', 'retainer'))`;
  } catch {
    // Constraint already exists with the updated definition
  }
}

async function _init() {
  // Check if tables already exist (fast path for warm instances after first boot)
  try {
    const { rows } = await sql`
      SELECT COUNT(*) AS c FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users'
    `;
    if (Number(rows[0].c) > 0) {
      // Tables exist — still run ALTER TABLE for any new columns, but skip CREATE
      await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS retainer_type TEXT DEFAULT 'none'`;
      await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS retainer_amount NUMERIC(12,2) DEFAULT 0`;
      await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS commission_pct NUMERIC(5,2) DEFAULT 0`;
      await sql`ALTER TABLE todos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()`;
      await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS url TEXT`;
      await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE`;
      await sql`ALTER TABLE milestones ADD COLUMN IF NOT EXISTS color TEXT`;
      await sql`UPDATE milestones SET color = '#60a5fa' WHERE name = 'Open' AND color IS NULL`;
      await sql`UPDATE milestones SET color = '#c084fc' WHERE name = 'Up Next' AND color IS NULL`;
      await sql`UPDATE milestones SET color = '#e8ff47' WHERE name = 'In Progress' AND color IS NULL`;
      await sql`UPDATE milestones SET color = '#f87171' WHERE name = 'On Hold' AND color IS NULL`;
      await sql`UPDATE milestones SET color = '#4ade80' WHERE name = 'Done' AND color IS NULL`;
      await sql`ALTER TABLE finance_deals ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12,2) DEFAULT 0`;
      await sql`ALTER TABLE finance_deals ADD COLUMN IF NOT EXISTS payments JSONB DEFAULT '[]'`;
      await sql`
        CREATE TABLE IF NOT EXISTS finance_deals (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL,
          project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
          company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
          company_name TEXT NOT NULL,
          project_name TEXT NOT NULL,
          deal_type TEXT NOT NULL CHECK (deal_type IN ('project', 'retainer')),
          total_deal_value NUMERIC(12,2) DEFAULT 0,
          start_date DATE,
          end_date DATE,
          payment_schedule JSONB DEFAULT '[]',
          monthly_fee NUMERIC(12,2) DEFAULT 0,
          monthly_revshare NUMERIC(12,2) DEFAULT 0,
          amount_paid NUMERIC(12,2) DEFAULT 0,
          payments JSONB DEFAULT '[]',
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now()
        )
      `;
      await migrateOpportunityTypes();
      await backfillMissingStandardPhases();
      initialized = true;
      return;
    }
  } catch {
    // Fall through to full init
  }

  await sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`;

  await sql`
    CREATE TABLE IF NOT EXISTS companies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      industry TEXT,
      website TEXT,
      country TEXT DEFAULT 'NL',
      retainer_type TEXT DEFAULT 'none'
        CHECK (retainer_type IN ('none', 'fixed', 'commission')),
      retainer_amount NUMERIC(12,2) DEFAULT 0,
      commission_pct NUMERIC(5,2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  // Add retainer columns to existing companies tables (safe, idempotent)
  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS retainer_type TEXT DEFAULT 'none'`;
  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS retainer_amount NUMERIC(12,2) DEFAULT 0`;
  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS commission_pct NUMERIC(5,2) DEFAULT 0`;

  await sql`
    CREATE TABLE IF NOT EXISTS opportunities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL DEFAULT 'new'
        CHECK (type IN ('new', 'project', 'retainer')),
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
      color TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL,
      parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'open'
        CHECK (status IN ('open', 'in_progress', 'done')),
      created_by TEXT DEFAULT 'team'
        CHECK (created_by IN ('team', 'client')),
      approved BOOLEAN DEFAULT true,
      assignee TEXT,
      due_date DATE,
      url TEXT,
      position INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS todos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'open'
        CHECK (status IN ('open', 'in_progress', 'done')),
      priority TEXT DEFAULT 'medium'
        CHECK (priority IN ('low', 'medium', 'high')),
      assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
      company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
      project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
      due_date DATE,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
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
    CREATE TABLE IF NOT EXISTS finance_deals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL,
      project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
      company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
      company_name TEXT NOT NULL,
      project_name TEXT NOT NULL,
      deal_type TEXT NOT NULL CHECK (deal_type IN ('project', 'retainer')),
      total_deal_value NUMERIC(12,2) DEFAULT 0,
      start_date DATE,
      end_date DATE,
      payment_schedule JSONB DEFAULT '[]',
      monthly_fee NUMERIC(12,2) DEFAULT 0,
      monthly_revshare NUMERIC(12,2) DEFAULT 0,
      amount_paid NUMERIC(12,2) DEFAULT 0,
      payments JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  await sql`
    INSERT INTO finance_settings (key, value) VALUES
      ('salary_pct', '45'),
      ('tax_pct', '40'),
      ('reserve_pct', '10'),
      ('salary_per_person', '5445'),
      ('founders', '2')
    ON CONFLICT (key) DO NOTHING
  `;

  await migrateOpportunityTypes();
  await backfillMissingStandardPhases();

  initialized = true;
}
