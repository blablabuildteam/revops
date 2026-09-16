import { sql } from "@vercel/postgres";
import { backfillMissingStandardPhases, ensureDefaultMilestones } from "@/lib/milestones";
export { sql };

let initialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Ensures the schema is ready for requests.
 * Warm path: no-op after first call in this isolate.
 * Cold path when tables already exist: single existence check only.
 * Set RUN_DB_MIGRATIONS=true to apply DDL, constraint fixes, and one-shot data migrations.
 * Fresh databases still run full CREATE + migrations.
 */
export async function ensureTables() {
  if (initialized) return;
  if (initPromise) return initPromise;
  initPromise = _init();
  return initPromise;
}

async function migrateFinanceDealsToInclVat() {
  const { rows } = await sql`
    SELECT value FROM finance_settings WHERE key = 'finance_deals_incl_vat'
  `;
  if (rows.length > 0 && rows[0].value === "true") return;

  await sql`
    UPDATE finance_deals SET
      total_deal_value = ROUND(total_deal_value * 1.21, 2),
      monthly_fee = ROUND(monthly_fee * 1.21, 2),
      monthly_revshare = ROUND(monthly_revshare * 1.21, 2),
      amount_paid = ROUND(amount_paid * 1.21, 2),
      updated_at = now()
  `;

  await sql`
    UPDATE finance_deals
    SET payments = (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'date', elem->>'date',
          'amount', ROUND((elem->>'amount')::numeric * 1.21, 2)
        )
      ), '[]'::jsonb)
      FROM jsonb_array_elements(payments) AS elem
    )
    WHERE jsonb_array_length(COALESCE(payments, '[]'::jsonb)) > 0
  `;

  await sql`
    INSERT INTO finance_settings (key, value, updated_at)
    VALUES ('finance_deals_incl_vat', 'true', now())
    ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now()
  `;
}

/**
 * One-shot: add missing standard phases / place Backlog once.
 * Must not re-run — Edit statuses owns column order after this.
 * If Backlog already exists, the historical migration already applied; only stamp the flag.
 */
async function migrateStandardPhasesOnce() {
  await sql`
    CREATE TABLE IF NOT EXISTS finance_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  const { rows } = await sql`
    SELECT value FROM finance_settings WHERE key = 'standard_phases_backfilled'
  `;
  if (rows.length > 0 && rows[0].value === "true") return;

  const { rows: backlogRows } = await sql`
    SELECT 1 AS ok FROM milestones WHERE name = 'Backlog' LIMIT 1
  `;
  // Already applied in production — do not re-enforce order or revive deleted phases.
  if (backlogRows.length === 0) {
    await backfillMissingStandardPhases();
  }

  await sql`
    INSERT INTO finance_settings (key, value, updated_at)
    VALUES ('standard_phases_backfilled', 'true', now())
    ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now()
  `;
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

/** Idempotent schema/data migrations. Call via RUN_DB_MIGRATIONS=true or after fresh create. */
async function runSchemaMigrations() {
  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS retainer_type TEXT DEFAULT 'none'`;
  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS retainer_amount NUMERIC(12,2) DEFAULT 0`;
  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS commission_pct NUMERIC(5,2) DEFAULT 0`;
  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`;
  await sql`ALTER TABLE todos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()`;
  await sql`ALTER TABLE todos DROP CONSTRAINT IF EXISTS todos_status_check`;
  await sql`ALTER TABLE todos ADD CONSTRAINT todos_status_check CHECK (status IN ('backlog', 'open', 'in_progress', 'done'))`;
  await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS url TEXT`;
  await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE`;
  await sql`ALTER TABLE milestones ADD COLUMN IF NOT EXISTS color TEXT`;
  await sql`UPDATE milestones SET color = '#9ca3af' WHERE name = 'Backlog' AND color IS NULL`;
  await sql`UPDATE milestones SET color = '#60a5fa' WHERE name = 'Open' AND color IS NULL`;
  await sql`UPDATE milestones SET color = '#c084fc' WHERE name = 'Up Next' AND color IS NULL`;
  await sql`UPDATE milestones SET color = '#d4e052' WHERE name = 'In Progress' AND color IS NULL`;
  await sql`UPDATE milestones SET color = '#f87171' WHERE name = 'On Hold' AND color IS NULL`;
  await sql`UPDATE milestones SET color = '#4ade80' WHERE name = 'Done' AND color IS NULL`;
  await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'low'`;
  await sql`ALTER TABLE tasks ALTER COLUMN priority SET DEFAULT 'low'`;
  await sql`UPDATE tasks SET priority = 'low' WHERE priority != 'low'`;
  await sql`ALTER TABLE todos ALTER COLUMN priority SET DEFAULT 'low'`;
  await sql`UPDATE todos SET priority = 'low' WHERE priority != 'low'`;
  await sql`ALTER TABLE finance_deals ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12,2) DEFAULT 0`;
  await sql`ALTER TABLE finance_deals ADD COLUMN IF NOT EXISTS payments JSONB DEFAULT '[]'`;
  await sql`ALTER TABLE finance_deals ADD COLUMN IF NOT EXISTS delivery_weeks NUMERIC(6,1)`;
  await sql`ALTER TABLE finance_deals ADD COLUMN IF NOT EXISTS monthly_hours NUMERIC(8,1)`;
  await sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS delivery_weeks NUMERIC(6,1)`;
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS edit_token TEXT UNIQUE`;
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'low'`;
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS priority_manual BOOLEAN DEFAULT false`;
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS lead TEXT`;
  await ensurePriorityAllowsUrgent();
  await ensureTaskCreatedByConstraint();
  await sql`
    CREATE TABLE IF NOT EXISTS task_comments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      author_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      author_name TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS task_comments_task_id_created_at
    ON task_comments (task_id, created_at)
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS task_attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      file_url TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      content_type TEXT NOT NULL,
      uploaded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      uploaded_by_name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS task_attachments_task_id_created_at
    ON task_attachments (task_id, created_at)
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
      delivery_weeks NUMERIC(6,1),
      monthly_hours NUMERIC(8,1),
      payment_schedule JSONB DEFAULT '[]',
      monthly_fee NUMERIC(12,2) DEFAULT 0,
      monthly_revshare NUMERIC(12,2) DEFAULT 0,
      amount_paid NUMERIC(12,2) DEFAULT 0,
      payments JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  await ensureAllocationsTable();
  await ensurePerformanceIndexes();
  await migrateOpportunityTypes();
  await migrateFinanceDealsToInclVat();
  await migrateStandardPhasesOnce();
  await ensureBunqTables();
}

async function ensureBunqTables() {
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
}

/** Indexes backing the task/todo list queries that run on every page load. */
async function ensurePerformanceIndexes() {
  await sql`CREATE INDEX IF NOT EXISTS todos_assignee_id ON todos (assignee_id)`;
  await sql`CREATE INDEX IF NOT EXISTS todos_project_id ON todos (project_id)`;
  await sql`CREATE INDEX IF NOT EXISTS todos_company_id ON todos (company_id)`;
  await sql`CREATE INDEX IF NOT EXISTS todos_status ON todos (status)`;
  await sql`CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks (project_id)`;
  await sql`CREATE INDEX IF NOT EXISTS tasks_milestone_id ON tasks (milestone_id)`;
  await sql`CREATE INDEX IF NOT EXISTS tasks_parent_id ON tasks (parent_id)`;
  await sql`CREATE INDEX IF NOT EXISTS tasks_assignee_approved ON tasks (assignee, approved)`;
  await sql`CREATE INDEX IF NOT EXISTS milestones_project_id_position ON milestones (project_id, position)`;
}

/** Allow `urgent` on projects, tasks, and todos. Idempotent. */
async function ensurePriorityAllowsUrgent() {
  await sql`ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_priority_check`;
  await sql`ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_priority_check`;
  await sql`ALTER TABLE todos DROP CONSTRAINT IF EXISTS todos_priority_check`;
  try {
    await sql`ALTER TABLE projects ADD CONSTRAINT projects_priority_check CHECK (priority IN ('low', 'medium', 'high', 'urgent'))`;
  } catch { /* already present */ }
  try {
    await sql`ALTER TABLE tasks ADD CONSTRAINT tasks_priority_check CHECK (priority IN ('low', 'medium', 'high', 'urgent'))`;
  } catch { /* already present */ }
  try {
    await sql`ALTER TABLE todos ADD CONSTRAINT todos_priority_check CHECK (priority IN ('low', 'medium', 'high', 'urgent'))`;
  } catch { /* already present */ }
}

/** Allow share-link board creates (`created_by = 'external'`). Idempotent. */
async function ensureTaskCreatedByConstraint() {
  await sql`ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_created_by_check`;
  try {
    await sql`
      ALTER TABLE tasks
      ADD CONSTRAINT tasks_created_by_check
      CHECK (created_by IN ('team', 'client', 'external'))
    `;
  } catch {
    // Constraint already exists with the updated definition
  }
}

async function ensureAllocationsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS allocations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      person TEXT NOT NULL,
      target_type TEXT NOT NULL
        CHECK (target_type IN ('project', 'opportunity', 'generic')),
      target_id TEXT NOT NULL,
      week DATE NOT NULL,
      percentage NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (percentage >= 0 AND percentage <= 100),
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(person, target_type, target_id, week)
    )
  `;

  // Upgrade from the initial project_id-only schema if present
  const { rows: cols } = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'allocations'
  `;
  const names = new Set(cols.map((c) => String(c.column_name)));
  const percentageType = cols.find((c) => c.column_name === "percentage")?.data_type;
  // Allow fractional % so hour values (e.g. 1.5h → 3.75%) round-trip cleanly
  if (percentageType === "integer" || percentageType === "bigint" || percentageType === "smallint") {
    await sql`
      ALTER TABLE allocations
      ALTER COLUMN percentage TYPE NUMERIC(6,2)
      USING percentage::numeric
    `;
  }

  if (names.has("project_id") && !names.has("target_type")) {
    await sql`ALTER TABLE allocations ADD COLUMN IF NOT EXISTS target_type TEXT`;
    await sql`ALTER TABLE allocations ADD COLUMN IF NOT EXISTS target_id TEXT`;
    await sql`
      UPDATE allocations
      SET target_type = 'project', target_id = project_id::text
      WHERE target_id IS NULL AND project_id IS NOT NULL
    `;
    await sql`ALTER TABLE allocations DROP CONSTRAINT IF EXISTS allocations_person_project_id_week_key`;
    await sql`ALTER TABLE allocations DROP COLUMN IF EXISTS project_id`;
    await sql`ALTER TABLE allocations ALTER COLUMN target_type SET NOT NULL`;
    await sql`ALTER TABLE allocations ALTER COLUMN target_id SET NOT NULL`;
    try {
      await sql`
        ALTER TABLE allocations
        ADD CONSTRAINT allocations_target_type_check
        CHECK (target_type IN ('project', 'opportunity', 'generic'))
      `;
    } catch {
      // already present
    }
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS allocations_person_target_week
      ON allocations (person, target_type, target_id, week)
    `;
  } else if (names.has("project_id") && names.has("target_type")) {
    // Partial upgrade leftover — finish dropping project_id
    await sql`
      UPDATE allocations
      SET target_type = COALESCE(target_type, 'project'),
          target_id = COALESCE(target_id, project_id::text)
      WHERE target_id IS NULL
    `;
    await sql`ALTER TABLE allocations DROP CONSTRAINT IF EXISTS allocations_person_project_id_week_key`;
    await sql`ALTER TABLE allocations DROP COLUMN IF EXISTS project_id`;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS allocations_person_target_week
      ON allocations (person, target_type, target_id, week)
    `;
  }

  await sql`
    CREATE INDEX IF NOT EXISTS allocations_person_week
    ON allocations (person, week)
  `;
}

async function _init() {
  const runMigrations = process.env.RUN_DB_MIGRATIONS === "true";

  // Check if tables already exist (fast path for warm/cold instances after first deploy)
  try {
    const { rows } = await sql`
      SELECT COUNT(*) AS c FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users'
    `;
    if (Number(rows[0].c) > 0) {
      // Cheap, idempotent column adds needed by capacity planning.
      await sql`ALTER TABLE finance_deals ADD COLUMN IF NOT EXISTS delivery_weeks NUMERIC(6,1)`;
      await sql`ALTER TABLE finance_deals ADD COLUMN IF NOT EXISTS monthly_hours NUMERIC(8,1)`;
      await sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS delivery_weeks NUMERIC(6,1)`;
      await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'low'`;
      await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS priority_manual BOOLEAN DEFAULT false`;
      await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS lead TEXT`;
      const { rows: urgentFlag } = await sql`
        SELECT value FROM finance_settings WHERE key = 'priority_urgent'
      `;
      if (urgentFlag[0]?.value !== "true") {
        await ensurePriorityAllowsUrgent();
        await sql`
          INSERT INTO finance_settings (key, value, updated_at)
          VALUES ('priority_urgent', 'true', now())
          ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now()
        `;
      }
      const { rows: todoStatusFlag } = await sql`
        SELECT value FROM finance_settings WHERE key = 'todos_backlog_status'
      `;
      if (todoStatusFlag[0]?.value !== "true") {
        await sql`ALTER TABLE todos DROP CONSTRAINT IF EXISTS todos_status_check`;
        await sql`ALTER TABLE todos ADD CONSTRAINT todos_status_check CHECK (status IN ('backlog', 'open', 'in_progress', 'done'))`;
        await sql`
          INSERT INTO finance_settings (key, value, updated_at)
          VALUES ('todos_backlog_status', 'true', now())
          ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now()
        `;
      }
      // Partner / commission defaults: Escort, Comfortzone, Heatnest → 10u/mnd.
      await sql`
        UPDATE finance_deals
        SET monthly_hours = 10, updated_at = now()
        WHERE monthly_hours IS NULL
          AND (
            company_name ILIKE '%escort%'
            OR project_name ILIKE '%escort%'
            OR company_name ILIKE '%comfortzone%'
            OR project_name ILIKE '%comfortzone%'
            OR company_name ILIKE '%heatnest%'
            OR project_name ILIKE '%heatnest%'
          )
      `;
      await ensureSlaAgreementsTable();
      await ensureRetainersTable();
      // Fast path: skip remaining DDL/backfill unless explicitly requested.
      // runSchemaMigrations already covers allocations, created_by, and phases.
      if (runMigrations) {
        await runSchemaMigrations();
      }
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
      logo_url TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  // Add retainer columns to existing companies tables (safe, idempotent)
  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS retainer_type TEXT DEFAULT 'none'`;
  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS retainer_amount NUMERIC(12,2) DEFAULT 0`;
  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS commission_pct NUMERIC(5,2) DEFAULT 0`;
  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url TEXT`;

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
      delivery_weeks NUMERIC(6,1),
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
      edit_token TEXT UNIQUE,
      client_name TEXT,
      client_email TEXT,
      start_date DATE,
      end_date DATE,
      priority TEXT DEFAULT 'low'
        CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
      priority_manual BOOLEAN DEFAULT false,
      lead TEXT,
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
        CHECK (created_by IN ('team', 'client', 'external')),
      approved BOOLEAN DEFAULT true,
      assignee TEXT,
      due_date DATE,
      url TEXT,
      priority TEXT DEFAULT 'low'
        CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
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
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`;

  await sql`
    CREATE TABLE IF NOT EXISTS todos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'open'
        CHECK (status IN ('backlog', 'open', 'in_progress', 'done')),
      priority TEXT DEFAULT 'low'
        CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
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
    CREATE TABLE IF NOT EXISTS task_comments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      author_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      author_name TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS task_comments_task_id_created_at
    ON task_comments (task_id, created_at)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS task_attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      file_url TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      content_type TEXT NOT NULL,
      uploaded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      uploaded_by_name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS task_attachments_task_id_created_at
    ON task_attachments (task_id, created_at)
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
      delivery_weeks NUMERIC(6,1),
      monthly_hours NUMERIC(8,1),
      payment_schedule JSONB DEFAULT '[]',
      monthly_fee NUMERIC(12,2) DEFAULT 0,
      monthly_revshare NUMERIC(12,2) DEFAULT 0,
      amount_paid NUMERIC(12,2) DEFAULT 0,
      payments JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  await ensureAllocationsTable();
  await ensureSlaAgreementsTable();
  await ensureRetainersTable();

  await sql`
    INSERT INTO finance_settings (key, value) VALUES
      ('salary_pct', '45'),
      ('tax_pct', '40'),
      ('reserve_pct', '10'),
      ('salary_per_person', '5445'),
      ('founders', '2')
    ON CONFLICT (key) DO NOTHING
  `;

  await runSchemaMigrations();

  initialized = true;
}

async function ensureSlaAgreementsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS sla_agreements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_name TEXT NOT NULL,
      company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
      domain TEXT,
      monthly_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      billing_frequency TEXT NOT NULL DEFAULT 'monthly'
        CHECK (billing_frequency IN ('monthly', 'quarterly')),
      invoice_via TEXT,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'upcoming', 'paused', 'ended')),
      start_date DATE,
      invoiced_periods JSONB NOT NULL DEFAULT '[]'::jsonb,
      invoiced BOOLEAN NOT NULL DEFAULT false,
      invoice_period TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  await sql`ALTER TABLE sla_agreements ADD COLUMN IF NOT EXISTS start_date DATE`;
  await sql`ALTER TABLE sla_agreements ADD COLUMN IF NOT EXISTS invoiced_periods JSONB NOT NULL DEFAULT '[]'::jsonb`;

  // Older TEXT[] column → JSONB (safe no-op when already JSONB).
  await sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sla_agreements'
          AND column_name = 'invoiced_periods'
          AND data_type = 'ARRAY'
      ) THEN
        ALTER TABLE sla_agreements
          ALTER COLUMN invoiced_periods TYPE JSONB
          USING to_jsonb(invoiced_periods);
        ALTER TABLE sla_agreements
          ALTER COLUMN invoiced_periods SET DEFAULT '[]'::jsonb;
      END IF;
    END $$
  `;

  const { rows: periodsFlag } = await sql`
    SELECT value FROM finance_settings WHERE key = 'sla_periods_v2'
  `;
  if (periodsFlag[0]?.value !== "true") {
    await sql`
      UPDATE sla_agreements
      SET invoiced_periods = jsonb_build_array(invoice_period)
      WHERE invoiced = true
        AND invoice_period IS NOT NULL
        AND invoice_period <> ''
        AND (
          invoiced_periods IS NULL
          OR invoiced_periods = '[]'::jsonb
          OR invoiced_periods = 'null'::jsonb
        )
    `;
    await sql`
      UPDATE sla_agreements
      SET start_date = date_trunc('year', CURRENT_DATE)::date
      WHERE start_date IS NULL
    `;
    await sql`
      INSERT INTO finance_settings (key, value, updated_at)
      VALUES ('sla_periods_v2', 'true', now())
      ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now()
    `;
  }

  const { rows: seedFlag } = await sql`
    SELECT value FROM finance_settings WHERE key = 'sla_seeded_v1'
  `;
  if (seedFlag[0]?.value === "true") return;

  const { rows: existing } = await sql`SELECT COUNT(*)::int AS c FROM sla_agreements`;
  if (Number(existing[0]?.c) === 0) {
    const seedStart = `${new Date().getFullYear()}-01-01`;
    const seed: Array<{
      client_name: string;
      domain: string | null;
      monthly_amount: number;
      billing_frequency: "monthly" | "quarterly";
      invoice_via: string | null;
      status: "active" | "upcoming";
      notes: string | null;
      start_date: string | null;
    }> = [
      { client_name: "J Web Solutions", domain: "Desire-escorts.nl", monthly_amount: 20, billing_frequency: "monthly", invoice_via: null, status: "active", notes: null, start_date: seedStart },
      { client_name: "J Web Solutions", domain: "Mykonos-elite.com", monthly_amount: 10, billing_frequency: "monthly", invoice_via: null, status: "active", notes: null, start_date: seedStart },
      { client_name: "J Web Solutions", domain: "Ibiza-elite.com", monthly_amount: 0, billing_frequency: "monthly", invoice_via: null, status: "active", notes: null, start_date: seedStart },
      { client_name: "J Web Solutions", domain: "Salonikaelite.com", monthly_amount: 10, billing_frequency: "monthly", invoice_via: null, status: "active", notes: null, start_date: seedStart },
      { client_name: "J Web Solutions", domain: "Brendasescort.nl", monthly_amount: 15, billing_frequency: "monthly", invoice_via: null, status: "active", notes: null, start_date: seedStart },
      { client_name: "J Web Solutions", domain: "Available-escorts.com", monthly_amount: 10, billing_frequency: "monthly", invoice_via: null, status: "active", notes: null, start_date: seedStart },
      { client_name: "J Web Solutions", domain: "Escortinhotel.nl", monthly_amount: 10, billing_frequency: "monthly", invoice_via: null, status: "active", notes: null, start_date: seedStart },
      { client_name: "ComfortZzzone", domain: "ComfortZzzone.nl", monthly_amount: 30, billing_frequency: "monthly", invoice_via: null, status: "active", notes: null, start_date: seedStart },
      { client_name: "Heatnest", domain: "Heatnest.nl", monthly_amount: 30, billing_frequency: "monthly", invoice_via: null, status: "active", notes: null, start_date: seedStart },
      {
        client_name: "PropertyServiceBG",
        domain: "https://propertyservicesbg.com/",
        monthly_amount: 20,
        billing_frequency: "quarterly",
        invoice_via: "J Web Solutions",
        status: "active",
        notes: "Kwartaalfactuur via J Web Solutions",
        start_date: seedStart,
      },
      {
        client_name: "TheDailyPack",
        domain: null,
        monthly_amount: 20,
        billing_frequency: "quarterly",
        invoice_via: null,
        status: "active",
        notes: "Invoiced per kwartaal",
        start_date: seedStart,
      },
      {
        client_name: "Solero",
        domain: null,
        monthly_amount: 175,
        billing_frequency: "monthly",
        invoice_via: null,
        status: "upcoming",
        notes: "Komt eraan · verwacht ~€150–200/mnd",
        start_date: null,
      },
      {
        client_name: "Thuishaven",
        domain: null,
        monthly_amount: 175,
        billing_frequency: "monthly",
        invoice_via: null,
        status: "upcoming",
        notes: "Komt eraan · verwacht ~€150–200/mnd",
        start_date: null,
      },
    ];

    for (const row of seed) {
      const { rows: companies } = await sql`
        SELECT id FROM companies
        WHERE name ILIKE ${row.client_name}
           OR name ILIKE ${`%${row.client_name}%`}
        LIMIT 1
      `;
      await sql`
        INSERT INTO sla_agreements (
          client_name, company_id, domain, monthly_amount,
          billing_frequency, invoice_via, status, notes, start_date
        ) VALUES (
          ${row.client_name},
          ${companies[0]?.id ?? null},
          ${row.domain},
          ${row.monthly_amount},
          ${row.billing_frequency},
          ${row.invoice_via},
          ${row.status},
          ${row.notes},
          ${row.start_date}
        )
      `;
    }
  }

  await sql`
    INSERT INTO finance_settings (key, value, updated_at)
    VALUES ('sla_seeded_v1', 'true', now())
    ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now()
  `;
}

async function ensureRetainersTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS retainer_agreements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_name TEXT NOT NULL,
      company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'upcoming'
        CHECK (status IN ('active', 'upcoming', 'paused', 'ended')),
      hours_cadence TEXT NOT NULL DEFAULT 'weekly'
        CHECK (hours_cadence IN ('weekly', 'monthly')),
      hours_included NUMERIC(8,2) NOT NULL DEFAULT 0,
      billing_model TEXT NOT NULL DEFAULT 'hourly'
        CHECK (billing_model IN ('hourly', 'fixed_monthly')),
      hourly_rate NUMERIC(12,2) DEFAULT 0,
      monthly_fee NUMERIC(12,2) DEFAULT 0,
      start_date DATE NOT NULL,
      period_anchor TEXT NOT NULL DEFAULT 'calendar'
        CHECK (period_anchor IN ('calendar', 'start_day')),
      flex_hours BOOLEAN NOT NULL DEFAULT false,
      invoice_mode TEXT NOT NULL DEFAULT 'arrears_monthly'
        CHECK (invoice_mode IN ('arrears_monthly')),
      invoiced_periods JSONB NOT NULL DEFAULT '[]'::jsonb,
      hour_buckets JSONB NOT NULL DEFAULT '[]'::jsonb,
      linked_repos JSONB NOT NULL DEFAULT '[]'::jsonb,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  await sql`ALTER TABLE retainer_agreements ADD COLUMN IF NOT EXISTS period_anchor TEXT NOT NULL DEFAULT 'calendar'`;
  await sql`ALTER TABLE retainer_agreements ADD COLUMN IF NOT EXISTS flex_hours BOOLEAN NOT NULL DEFAULT false`;
  await sql`ALTER TABLE retainer_agreements ADD COLUMN IF NOT EXISTS invoiced_periods JSONB NOT NULL DEFAULT '[]'::jsonb`;
  await sql`ALTER TABLE retainer_agreements ADD COLUMN IF NOT EXISTS hour_buckets JSONB NOT NULL DEFAULT '[]'::jsonb`;
  await sql`ALTER TABLE retainer_agreements ADD COLUMN IF NOT EXISTS linked_repos JSONB NOT NULL DEFAULT '[]'::jsonb`;

  await sql`
    CREATE TABLE IF NOT EXISTS retainer_time_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      retainer_id UUID NOT NULL REFERENCES retainer_agreements(id) ON DELETE CASCADE,
      week_start DATE NOT NULL,
      hours NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (hours >= 0),
      activity TEXT NOT NULL DEFAULT '',
      category TEXT,
      logged_by TEXT,
      work_date DATE,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  await sql`ALTER TABLE retainer_time_entries ADD COLUMN IF NOT EXISTS category TEXT`;

  await sql`
    CREATE INDEX IF NOT EXISTS retainer_time_entries_retainer_week_idx
    ON retainer_time_entries (retainer_id, week_start DESC)
  `;

  const adsomniaBuckets = [
    {
      id: "adsomnia-innovatie",
      label: "Innovatie",
      source: "proposal",
      notes: "AI-initiatieven uit workshop-roadmap — meedenken, meebouwen, landen als GO in Workspace",
    },
    {
      id: "adsomnia-productie",
      label: "Productie",
      source: "proposal",
      notes: "Blockers, bugs, escalaties, Workspace/Jira — vliegende PM/PO wanneer nodig",
    },
    {
      id: "adsomnia-business",
      label: "Business",
      source: "proposal",
      notes: "Strategisch sparren: keuzes, roadmap, prioriteiten, Go/No-Go",
    },
  ];

  const soleroBuckets = [
    {
      id: "solero-builds",
      label: "Productie van nieuwe projecten",
      source: "proposal",
      notes: "Stream 1 — Shademaker, Parasols-XL, La Sombrilla (deel van 110u-pot)",
    },
    {
      id: "solero-shademaker",
      label: "Shademaker Benelux",
      source: "proposal",
      estimated_hours: 55,
      notes: "Build-venster okt–nov (~55u totaal voor die stretch)",
    },
    {
      id: "solero-parasols-xl",
      label: "Parasols-XL.nl",
      source: "proposal",
      estimated_hours: 55,
      notes: "Build-venster dec–jan (~55u)",
    },
    {
      id: "solero-la-sombrilla",
      label: "La Sombrilla",
      source: "proposal",
      estimated_hours: 45,
      notes: "Build-venster jan–feb (~45u)",
    },
    {
      id: "solero-growth",
      label: "Groei, optimalisatie & service",
      source: "proposal",
      notes: "Stream 2 — CRO, SEO, email, ads-strategie, beheer (deel van 110u-pot)",
    },
    {
      id: "solero-cro-ux",
      label: "CRO, UX & design",
      source: "proposal",
    },
    {
      id: "solero-seo",
      label: "SEO / AEO / GEO",
      source: "proposal",
    },
    {
      id: "solero-email",
      label: "E-mailmarketing",
      source: "proposal",
    },
    {
      id: "solero-ads",
      label: "Google Ads (strategie) & Social Ads",
      source: "proposal",
    },
    {
      id: "solero-ops",
      label: "Beheer en doorbouw",
      source: "proposal",
    },
    {
      id: "solero-analytics",
      label: "Analytics, tracking & sturing",
      source: "proposal",
    },
    {
      id: "solero-content",
      label: "Content & merchandising",
      source: "proposal",
    },
  ];

  const { rows: v2Flag } = await sql`
    SELECT value FROM finance_settings WHERE key = 'retainers_v2'
  `;
  if (v2Flag[0]?.value !== "true") {
    await sql`
      UPDATE retainer_agreements SET
        billing_model = 'hourly',
        hourly_rate = 175,
        monthly_fee = 0,
        period_anchor = 'start_day',
        flex_hours = false,
        notes = '8u/week (voorstel) · €175/uur · periode vanaf 15e · factuur achteraf',
        hour_buckets = ${JSON.stringify(adsomniaBuckets)}::jsonb,
        updated_at = now()
      WHERE client_name ILIKE 'Adsomnia'
    `;
    await sql`
      UPDATE retainer_agreements SET
        billing_model = 'hourly',
        hourly_rate = 150,
        monthly_fee = 0,
        period_anchor = 'calendar',
        flex_hours = true,
        notes = '110u/maand soft cap · €150/uur · flex over maanden · factuur achteraf',
        hour_buckets = ${JSON.stringify(soleroBuckets)}::jsonb,
        updated_at = now()
      WHERE client_name ILIKE 'Solero'
    `;
    await sql`
      INSERT INTO finance_settings (key, value, updated_at)
      VALUES ('retainers_v2', 'true', now())
      ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now()
    `;
  }

  const { rows: v3Flag } = await sql`
    SELECT value FROM finance_settings WHERE key = 'retainers_v3_proposals'
  `;
  if (v3Flag[0]?.value !== "true") {
    // Sync buckets + hours from proposals repo (blablabuild clients).
    await sql`
      UPDATE retainer_agreements SET
        hours_included = 8,
        hours_cadence = 'weekly',
        hourly_rate = 175,
        billing_model = 'hourly',
        period_anchor = 'start_day',
        notes = '8u/week (uit voorstel) · €175/uur · Innovatie/Productie/Business · vanaf 15e',
        hour_buckets = ${JSON.stringify(adsomniaBuckets)}::jsonb,
        linked_repos = ${JSON.stringify(["adsomnia"])}::jsonb,
        updated_at = now()
      WHERE client_name ILIKE 'Adsomnia'
    `;
    await sql`
      UPDATE retainer_agreements SET
        hours_included = 110,
        hours_cadence = 'monthly',
        hourly_rate = 150,
        billing_model = 'hourly',
        period_anchor = 'calendar',
        flex_hours = true,
        notes = '110u/maand · €150/uur · builds + groei/ops · flex · uit Solero-voorstel',
        hour_buckets = ${JSON.stringify(soleroBuckets)}::jsonb,
        linked_repos = ${JSON.stringify(["solero-global-hub"])}::jsonb,
        updated_at = now()
      WHERE client_name ILIKE 'Solero'
    `;
    await sql`
      INSERT INTO finance_settings (key, value, updated_at)
      VALUES ('retainers_v3_proposals', 'true', now())
      ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now()
    `;
  }

  const { rows: v4Flag } = await sql`
    SELECT value FROM finance_settings WHERE key = 'retainers_v4_adsomnia_12h'
  `;
  if (v4Flag[0]?.value !== "true") {
    // Commercial reality: 12u/week (not the 8u in the written proposal).
    await sql`
      UPDATE retainer_agreements SET
        hours_included = 12,
        hours_cadence = 'weekly',
        hourly_rate = 175,
        notes = '12u/week · €175/uur · Innovatie/Productie/Business · vanaf 15e',
        linked_repos = ${JSON.stringify(["adsomnia", "deleted-users"])}::jsonb,
        hour_buckets = ${JSON.stringify(adsomniaBuckets)}::jsonb,
        updated_at = now()
      WHERE client_name ILIKE 'Adsomnia'
    `;

    // Ensure Adsomnia company + deleted-users project exist.
    let adsomniaCompanyId: string | null = null;
    const { rows: existingCompany } = await sql`
      SELECT id FROM companies WHERE name ILIKE 'Adsomnia' LIMIT 1
    `;
    if (existingCompany[0]?.id) {
      adsomniaCompanyId = String(existingCompany[0].id);
    } else {
      const { rows: createdCompany } = await sql`
        INSERT INTO companies (name, industry, retainer_type)
        VALUES ('Adsomnia', 'Agency / production', 'fixed')
        RETURNING id
      `;
      adsomniaCompanyId = String(createdCompany[0].id);
    }

    await sql`
      UPDATE retainer_agreements
      SET company_id = ${adsomniaCompanyId}, updated_at = now()
      WHERE client_name ILIKE 'Adsomnia' AND company_id IS NULL
    `;

    const { rows: existingProject } = await sql`
      SELECT id FROM projects
      WHERE name ILIKE 'deleted-users'
         OR name ILIKE 'Deleted Users'
      LIMIT 1
    `;
    if (!existingProject[0]) {
      const { rows: createdProject } = await sql`
        INSERT INTO projects (
          name, description, company_id, status, priority, priority_manual, client_name, lead
        ) VALUES (
          'deleted-users',
          'Nieuw Adsomnia-project · uren vallen onder de Adsomnia-retainer',
          ${adsomniaCompanyId},
          'active',
          'medium',
          true,
          'Adsomnia',
          'Kevin + Xennith'
        )
        RETURNING id
      `;
      if (createdProject[0]?.id) {
        await ensureDefaultMilestones(String(createdProject[0].id));
      }
    }

    await sql`
      INSERT INTO finance_settings (key, value, updated_at)
      VALUES ('retainers_v4_adsomnia_12h', 'true', now())
      ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now()
    `;
  }

  // Keep Adsomnia marked active once start_date has passed (seed may have lagged).
  await sql`
    UPDATE retainer_agreements
    SET status = 'active', updated_at = now()
    WHERE client_name ILIKE 'Adsomnia'
      AND status = 'upcoming'
      AND start_date <= CURRENT_DATE
  `;

  const { rows: seedFlag } = await sql`
    SELECT value FROM finance_settings WHERE key = 'retainers_seeded_v1'
  `;
  if (seedFlag[0]?.value === "true") return;

  const { rows: existing } = await sql`
    SELECT COUNT(*)::int AS c FROM retainer_agreements
  `;
  if (Number(existing[0]?.c) === 0) {
    const seed: Array<{
      client_name: string;
      status: "active" | "upcoming";
      hours_cadence: "weekly" | "monthly";
      hours_included: number;
      billing_model: "hourly" | "fixed_monthly";
      hourly_rate: number;
      monthly_fee: number;
      start_date: string;
      period_anchor: "calendar" | "start_day";
      flex_hours: boolean;
      notes: string;
      hour_buckets: unknown;
      linked_repos: string[];
    }> = [
      {
        client_name: "Adsomnia",
        status: "active",
        hours_cadence: "weekly",
        hours_included: 12,
        billing_model: "hourly",
        hourly_rate: 175,
        monthly_fee: 0,
        start_date: "2026-09-15",
        period_anchor: "start_day",
        flex_hours: false,
        notes: "12u/week · €175/uur · Innovatie/Productie/Business · vanaf 15e",
        hour_buckets: adsomniaBuckets,
        linked_repos: ["adsomnia", "deleted-users"],
      },
      {
        client_name: "Solero",
        status: "upcoming",
        hours_cadence: "monthly",
        hours_included: 110,
        billing_model: "hourly",
        hourly_rate: 150,
        monthly_fee: 0,
        start_date: "2026-10-01",
        period_anchor: "calendar",
        flex_hours: true,
        notes: "110u/maand · €150/uur · builds + groei/ops · flex · uit Solero-voorstel",
        hour_buckets: soleroBuckets,
        linked_repos: ["solero-global-hub"],
      },
    ];

    for (const row of seed) {
      const { rows: companies } = await sql`
        SELECT id FROM companies
        WHERE name ILIKE ${row.client_name}
           OR name ILIKE ${`%${row.client_name}%`}
        LIMIT 1
      `;
      await sql`
        INSERT INTO retainer_agreements (
          client_name, company_id, status, hours_cadence, hours_included,
          billing_model, hourly_rate, monthly_fee, start_date,
          period_anchor, flex_hours, notes, hour_buckets, linked_repos
        ) VALUES (
          ${row.client_name},
          ${companies[0]?.id ?? null},
          ${row.status},
          ${row.hours_cadence},
          ${row.hours_included},
          ${row.billing_model},
          ${row.hourly_rate},
          ${row.monthly_fee},
          ${row.start_date},
          ${row.period_anchor},
          ${row.flex_hours},
          ${row.notes},
          ${JSON.stringify(row.hour_buckets)}::jsonb,
          ${JSON.stringify(row.linked_repos)}::jsonb
        )
      `;
    }
  }

  await sql`
    INSERT INTO finance_settings (key, value, updated_at)
    VALUES ('retainers_seeded_v1', 'true', now())
    ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now()
  `;
}

