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
  await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS entered_by TEXT`;
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
      await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS slack_channel_id TEXT`;
      await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS slack_channel_name TEXT`;
      await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS entered_by TEXT`;
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
      await ensureTodoAssigneesTable();
      await ensureSlackDueNotificationsTable();
      await ensureNetworkContactsTable();
      await ensureToolsTable();
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
      slack_channel_id TEXT,
      slack_channel_name TEXT,
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
      entered_by TEXT,
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
  await ensureTodoAssigneesTable();
  await ensureSlackDueNotificationsTable();
  await ensureNetworkContactsTable();
  await ensureToolsTable();

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

async function ensureSlackDueNotificationsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS slack_due_notifications (
      item_type TEXT NOT NULL,
      item_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('eve', 'morning')),
      due_date DATE NOT NULL,
      destination TEXT NOT NULL DEFAULT 'channel',
      sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (item_type, item_id, kind, due_date, destination)
    )
  `;
  await sql`ALTER TABLE slack_due_notifications ADD COLUMN IF NOT EXISTS destination TEXT NOT NULL DEFAULT 'channel'`;
  await sql`ALTER TABLE slack_due_notifications DROP CONSTRAINT IF EXISTS slack_due_notifications_item_type_check`;
  await sql`ALTER TABLE slack_due_notifications DROP CONSTRAINT IF EXISTS slack_due_notifications_pkey`;
  await sql`ALTER TABLE slack_due_notifications ALTER COLUMN item_id TYPE TEXT USING item_id::text`;
  await sql`
    ALTER TABLE slack_due_notifications
    ADD PRIMARY KEY (item_type, item_id, kind, due_date, destination)
  `;
}

async function ensureTodoAssigneesTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS todo_assignees (
      todo_id UUID NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (todo_id, user_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS todo_assignees_user_id ON todo_assignees (user_id)`;
  await sql`
    INSERT INTO todo_assignees (todo_id, user_id)
    SELECT id, assignee_id FROM todos
    WHERE assignee_id IS NOT NULL
    ON CONFLICT DO NOTHING
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
      slack_channel_id TEXT,
      slack_channel_name TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  await sql`ALTER TABLE retainer_agreements ADD COLUMN IF NOT EXISTS period_anchor TEXT NOT NULL DEFAULT 'calendar'`;
  await sql`ALTER TABLE retainer_agreements ADD COLUMN IF NOT EXISTS flex_hours BOOLEAN NOT NULL DEFAULT false`;
  await sql`ALTER TABLE retainer_agreements ADD COLUMN IF NOT EXISTS invoiced_periods JSONB NOT NULL DEFAULT '[]'::jsonb`;
  await sql`ALTER TABLE retainer_agreements ADD COLUMN IF NOT EXISTS hour_buckets JSONB NOT NULL DEFAULT '[]'::jsonb`;
  await sql`ALTER TABLE retainer_agreements ADD COLUMN IF NOT EXISTS linked_repos JSONB NOT NULL DEFAULT '[]'::jsonb`;
  await sql`ALTER TABLE retainer_agreements ADD COLUMN IF NOT EXISTS share_token TEXT`;
  await sql`ALTER TABLE retainer_agreements ADD COLUMN IF NOT EXISTS slack_channel_id TEXT`;
  await sql`ALTER TABLE retainer_agreements ADD COLUMN IF NOT EXISTS slack_channel_name TEXT`;
  await sql`
    UPDATE retainer_agreements
    SET share_token = encode(gen_random_bytes(16), 'hex')
    WHERE share_token IS NULL
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS retainer_agreements_share_token_idx
    ON retainer_agreements (share_token)
  `;
  await sql`
    ALTER TABLE retainer_agreements
    ALTER COLUMN share_token SET DEFAULT encode(gen_random_bytes(16), 'hex')
  `;

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

  // Always ensure Adsomnia exists even if an earlier seed flag was set empty.
  const { rows: adsomniaRows } = await sql`
    SELECT id FROM retainer_agreements WHERE client_name ILIKE 'Adsomnia' LIMIT 1
  `;
  if (!adsomniaRows[0]) {
    const { rows: companies } = await sql`
      SELECT id FROM companies WHERE name ILIKE 'Adsomnia' LIMIT 1
    `;
    await sql`
      INSERT INTO retainer_agreements (
        client_name, company_id, status, hours_cadence, hours_included,
        billing_model, hourly_rate, monthly_fee, start_date,
        period_anchor, flex_hours, notes, hour_buckets, linked_repos
      ) VALUES (
        'Adsomnia',
        ${companies[0]?.id ?? null},
        'active',
        'weekly',
        12,
        'hourly',
        175,
        0,
        '2026-09-15',
        'start_day',
        false,
        '12u/week · €175/uur · Innovatie/Productie/Business · vanaf 15e',
        ${JSON.stringify(adsomniaBuckets)}::jsonb,
        ${JSON.stringify(["adsomnia", "deleted-users"])}::jsonb
      )
    `;
  }

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

async function ensureNetworkContactsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS network_contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      company TEXT,
      role TEXT,
      linkedin_url TEXT,
      notes TEXT,
      tags TEXT[] DEFAULT '{}',
      last_contacted DATE,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'dormant', 'archived')),
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS network_contacts_status ON network_contacts (status)`;
  await sql`CREATE INDEX IF NOT EXISTS network_contacts_name ON network_contacts (name)`;
}

async function ensureToolsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS tool_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      vendor TEXT,
      category TEXT NOT NULL DEFAULT 'other'
        CHECK (category IN ('software', 'ai', 'hosting', 'design', 'comms', 'other')),
      cost_type TEXT NOT NULL DEFAULT 'fixed'
        CHECK (cost_type IN ('fixed', 'usage', 'hybrid')),
      billing_frequency TEXT NOT NULL DEFAULT 'monthly'
        CHECK (billing_frequency IN ('monthly', 'yearly')),
      our_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'EUR',
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'ended')),
      start_date DATE,
      end_date DATE,
      bill_to_company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
      pass_through BOOLEAN NOT NULL DEFAULT true,
      notes TEXT,
      login_url TEXT,
      invoiced_periods JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS tool_usage_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tool_id UUID NOT NULL REFERENCES tool_subscriptions(id) ON DELETE CASCADE,
      month TEXT NOT NULL,
      amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (tool_id, month)
    )
  `;

  await sql`ALTER TABLE tool_subscriptions ADD COLUMN IF NOT EXISTS logo_url TEXT`;

  await sql`CREATE INDEX IF NOT EXISTS tool_subscriptions_status ON tool_subscriptions (status)`;
  await sql`CREATE INDEX IF NOT EXISTS tool_subscriptions_bill_to ON tool_subscriptions (bill_to_company_id)`;
  await sql`CREATE INDEX IF NOT EXISTS tool_usage_entries_tool_month ON tool_usage_entries (tool_id, month DESC)`;

  const { rows: seedFlag } = await sql`
    SELECT value FROM finance_settings WHERE key = 'tools_seeded_v1'
  `;
  if (seedFlag[0]?.value !== "true") {
    const { rows: existing } = await sql`
      SELECT COUNT(*)::int AS c FROM tool_subscriptions
    `;
    if (Number(existing[0]?.c) === 0) {
      await sql`
        INSERT INTO tool_subscriptions (
          name, vendor, category, cost_type, billing_frequency, our_cost, status, notes, logo_url, login_url
        ) VALUES
          (
            'Cursor', 'Anysphere', 'software', 'fixed', 'monthly', 0, 'active',
            'IDE / coding — vul maandbedrag in', '/tools/cursor.png', 'https://cursor.com'
          ),
          (
            'ChatGPT API', 'OpenAI', 'ai', 'usage', 'monthly', 0, 'active',
            'OpenAI API usage — per maand invullen; koppel klant voor doorbelasten',
            '/tools/openai.png', 'https://platform.openai.com'
          ),
          (
            'Vercel', 'Vercel', 'hosting', 'hybrid', 'monthly', 0, 'active',
            'Hosting — vast plan + usage', '/tools/vercel.png', 'https://vercel.com'
          )
      `;
    }
    await sql`
      INSERT INTO finance_settings (key, value, updated_at)
      VALUES ('tools_seeded_v1', 'true', now())
      ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now()
    `;
  }

  // Real blablabuild stack + logos. Upserts by name; leaves bill_to_company_id alone.
  const { rows: v2Flag } = await sql`
    SELECT value FROM finance_settings WHERE key = 'tools_seeded_v2_stack'
  `;
  if (v2Flag[0]?.value !== "true") {
    const stack: Array<{
      name: string;
      vendor: string;
      category: string;
      cost_type: string;
      billing_frequency: string;
      notes: string;
      logo_url: string;
      login_url: string;
    }> = [
      {
        name: "Neon",
        vendor: "Neon",
        category: "hosting",
        cost_type: "hybrid",
        billing_frequency: "monthly",
        notes: "Postgres database — vast + compute/usage",
        logo_url: "/tools/neon.png",
        login_url: "https://console.neon.tech",
      },
      {
        name: "Cursor",
        vendor: "Anysphere",
        category: "software",
        cost_type: "fixed",
        billing_frequency: "monthly",
        notes: "IDE / coding seats — vul maandbedrag in",
        logo_url: "/tools/cursor.png",
        login_url: "https://cursor.com",
      },
      {
        name: "Claude API",
        vendor: "Anthropic",
        category: "ai",
        cost_type: "usage",
        billing_frequency: "monthly",
        notes: "Anthropic API — usage per maand; koppel klant om door te belasten",
        logo_url: "/tools/anthropic.png",
        login_url: "https://console.anthropic.com",
      },
      {
        name: "Gemini API",
        vendor: "Google",
        category: "ai",
        cost_type: "usage",
        billing_frequency: "monthly",
        notes: "Google Gemini API — usage per maand",
        logo_url: "/tools/gemini.png",
        login_url: "https://aistudio.google.com",
      },
      {
        name: "Apollo",
        vendor: "Apollo.io",
        category: "software",
        cost_type: "fixed",
        billing_frequency: "monthly",
        notes: "Sales intelligence / enrichment",
        logo_url: "/tools/apollo.png",
        login_url: "https://app.apollo.io",
      },
      {
        name: "Hunter",
        vendor: "Hunter.io",
        category: "software",
        cost_type: "fixed",
        billing_frequency: "monthly",
        notes: "Email finder / verifier",
        logo_url: "/tools/hunter.png",
        login_url: "https://hunter.io",
      },
      {
        name: "ChatGPT API",
        vendor: "OpenAI",
        category: "ai",
        cost_type: "usage",
        billing_frequency: "monthly",
        notes: "OpenAI API (ChatGPT) — usage per maand; koppel klant voor doorbelasten",
        logo_url: "/tools/openai.png",
        login_url: "https://platform.openai.com",
      },
      {
        name: "Vercel",
        vendor: "Vercel",
        category: "hosting",
        cost_type: "hybrid",
        billing_frequency: "monthly",
        notes: "Hosting / deployments — ontdekt via workspace stack",
        logo_url: "/tools/vercel.png",
        login_url: "https://vercel.com",
      },
      {
        name: "Slack",
        vendor: "Slack",
        category: "comms",
        cost_type: "fixed",
        billing_frequency: "monthly",
        notes: "Team chat — ontdekt via workspace integraties",
        logo_url: "/tools/slack.png",
        login_url: "https://slack.com",
      },
    ];

    for (const tool of stack) {
      const { rows: existing } = await sql`
        SELECT id FROM tool_subscriptions
        WHERE name ILIKE ${tool.name}
           OR (name ILIKE 'OpenAI' AND ${tool.name} = 'ChatGPT API')
        LIMIT 1
      `;
      if (existing[0]?.id) {
        await sql`
          UPDATE tool_subscriptions SET
            vendor = ${tool.vendor},
            category = ${tool.category},
            cost_type = ${tool.cost_type},
            billing_frequency = ${tool.billing_frequency},
            notes = ${tool.notes},
            logo_url = ${tool.logo_url},
            login_url = ${tool.login_url},
            name = ${tool.name},
            status = 'active',
            updated_at = now()
          WHERE id = ${existing[0].id}
        `;
      } else {
        await sql`
          INSERT INTO tool_subscriptions (
            name, vendor, category, cost_type, billing_frequency, our_cost,
            status, notes, logo_url, login_url, pass_through
          ) VALUES (
            ${tool.name},
            ${tool.vendor},
            ${tool.category},
            ${tool.cost_type},
            ${tool.billing_frequency},
            0,
            'active',
            ${tool.notes},
            ${tool.logo_url},
            ${tool.login_url},
            false
          )
        `;
      }
    }

    await sql`
      INSERT INTO finance_settings (key, value, updated_at)
      VALUES ('tools_seeded_v2_stack', 'true', now())
      ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now()
    `;
  }

  // Apollo + Hunter pass-through for Thuishaven and Recruitment Scout (shared seats).
  const { rows: v3Flag } = await sql`
    SELECT value FROM finance_settings WHERE key = 'tools_seeded_v3_apollo_hunter'
  `;
  if (v3Flag[0]?.value !== "true") {
    async function ensureCompany(name: string, industry: string) {
      const { rows: existing } = await sql`
        SELECT id FROM companies WHERE name ILIKE ${name} LIMIT 1
      `;
      if (existing[0]?.id) return String(existing[0].id);
      const { rows: created } = await sql`
        INSERT INTO companies (name, industry, country)
        VALUES (${name}, ${industry}, 'NL')
        RETURNING id
      `;
      return String(created[0].id);
    }

    const thuishavenId = await ensureCompany("Thuishaven", "Hospitality");
    const scoutId = await ensureCompany("Recruitment Scout", "Recruitment");

    async function ensureBilledTool(
      toolName: string,
      companyId: string,
      companyLabel: string,
    ) {
      const { rows: templateRows } = await sql`
        SELECT * FROM tool_subscriptions
        WHERE name ILIKE ${toolName}
        ORDER BY created_at ASC
        LIMIT 1
      `;
      if (!templateRows[0]) return;

      const { rows: existing } = await sql`
        SELECT id FROM tool_subscriptions
        WHERE name ILIKE ${toolName}
          AND bill_to_company_id = ${companyId}
        LIMIT 1
      `;
      if (existing[0]) {
        await sql`
          UPDATE tool_subscriptions
          SET pass_through = true, status = 'active', updated_at = now()
          WHERE id = ${existing[0].id}
        `;
        return;
      }

      const unassigned = await sql`
        SELECT id FROM tool_subscriptions
        WHERE name ILIKE ${toolName}
          AND bill_to_company_id IS NULL
        ORDER BY created_at ASC
        LIMIT 1
      `;
      if (unassigned.rows[0]?.id) {
        await sql`
          UPDATE tool_subscriptions SET
            bill_to_company_id = ${companyId},
            pass_through = true,
            notes = ${`${String(templateRows[0].notes ?? toolName)} · doorbelasten ${companyLabel} (gedeeld)`},
            updated_at = now()
          WHERE id = ${unassigned.rows[0].id}
        `;
        return;
      }

      const t = templateRows[0];
      await sql`
        INSERT INTO tool_subscriptions (
          name, vendor, category, cost_type, billing_frequency, our_cost,
          currency, status, bill_to_company_id, pass_through, notes, logo_url, login_url
        ) VALUES (
          ${String(t.name)},
          ${t.vendor ?? null},
          ${String(t.category)},
          ${String(t.cost_type)},
          ${String(t.billing_frequency)},
          ${Number(t.our_cost) || 0},
          ${String(t.currency ?? "EUR")},
          'active',
          ${companyId},
          true,
          ${`${String(t.notes ?? t.name)} · doorbelasten ${companyLabel} (gedeeld)`},
          ${t.logo_url ?? null},
          ${t.login_url ?? null}
        )
      `;
    }

    for (const toolName of ["Apollo", "Hunter"]) {
      await ensureBilledTool(toolName, thuishavenId, "Thuishaven");
      await ensureBilledTool(toolName, scoutId, "Recruitment Scout");
    }

    await sql`
      INSERT INTO finance_settings (key, value, updated_at)
      VALUES ('tools_seeded_v3_apollo_hunter', 'true', now())
      ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now()
    `;
  }

  // Resend (email) + KvK API (Thuishaven pass-through).
  const { rows: v4Flag } = await sql`
    SELECT value FROM finance_settings WHERE key = 'tools_seeded_v4_resend_kvk'
  `;
  if (v4Flag[0]?.value !== "true") {
    const { rows: existingResend } = await sql`
      SELECT id FROM tool_subscriptions WHERE name ILIKE 'Resend' LIMIT 1
    `;
    if (!existingResend[0]) {
      await sql`
        INSERT INTO tool_subscriptions (
          name, vendor, category, cost_type, billing_frequency, our_cost,
          status, notes, logo_url, login_url, pass_through
        ) VALUES (
          'Resend',
          'Resend',
          'comms',
          'usage',
          'monthly',
          0,
          'active',
          'Transactional email API — usage per maand',
          '/tools/resend.png',
          'https://resend.com',
          false
        )
      `;
    } else {
      await sql`
        UPDATE tool_subscriptions SET
          vendor = 'Resend',
          category = 'comms',
          cost_type = 'usage',
          logo_url = COALESCE(logo_url, '/tools/resend.png'),
          login_url = COALESCE(login_url, 'https://resend.com'),
          notes = COALESCE(NULLIF(notes, ''), 'Transactional email API — usage per maand'),
          status = 'active',
          updated_at = now()
        WHERE id = ${existingResend[0].id}
      `;
    }

    let thuishavenId: string | null = null;
    const { rows: thuishavenRows } = await sql`
      SELECT id FROM companies WHERE name ILIKE 'Thuishaven' LIMIT 1
    `;
    if (thuishavenRows[0]?.id) {
      thuishavenId = String(thuishavenRows[0].id);
    }

    const { rows: existingKvk } = await sql`
      SELECT id FROM tool_subscriptions
      WHERE name ILIKE 'KvK API' OR name ILIKE 'KvK'
      LIMIT 1
    `;
    if (!existingKvk[0]) {
      await sql`
        INSERT INTO tool_subscriptions (
          name, vendor, category, cost_type, billing_frequency, our_cost,
          status, bill_to_company_id, pass_through, notes, logo_url, login_url
        ) VALUES (
          'KvK API',
          'Kamer van Koophandel',
          'software',
          'usage',
          'monthly',
          0,
          'active',
          ${thuishavenId},
          ${thuishavenId != null},
          'KvK handelsregister data voor Thuishaven — usage per maand doorbelasten',
          '/tools/kvk.png',
          'https://developers.kvk.nl'
        )
      `;
    } else {
      await sql`
        UPDATE tool_subscriptions SET
          name = 'KvK API',
          vendor = 'Kamer van Koophandel',
          category = 'software',
          cost_type = 'usage',
          bill_to_company_id = COALESCE(bill_to_company_id, ${thuishavenId}),
          pass_through = true,
          logo_url = COALESCE(logo_url, '/tools/kvk.png'),
          login_url = COALESCE(login_url, 'https://developers.kvk.nl'),
          notes = COALESCE(
            NULLIF(notes, ''),
            'KvK handelsregister data voor Thuishaven — usage per maand doorbelasten'
          ),
          status = 'active',
          updated_at = now()
        WHERE id = ${existingKvk[0].id}
      `;
    }

    await sql`
      INSERT INTO finance_settings (key, value, updated_at)
      VALUES ('tools_seeded_v4_resend_kvk', 'true', now())
      ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now()
    `;
  }

  // Resend pass-through for CityBiteGuide + Elite Escort Group.
  const { rows: v5Flag } = await sql`
    SELECT value FROM finance_settings WHERE key = 'tools_seeded_v5_resend_clients'
  `;
  if (v5Flag[0]?.value !== "true") {
    async function ensureNamedCompany(name: string, industry: string) {
      const { rows: existing } = await sql`
        SELECT id FROM companies WHERE name ILIKE ${name} LIMIT 1
      `;
      if (existing[0]?.id) return String(existing[0].id);
      const { rows: created } = await sql`
        INSERT INTO companies (name, industry, country)
        VALUES (${name}, ${industry}, 'NL')
        RETURNING id
      `;
      return String(created[0].id);
    }

    const cityId = await ensureNamedCompany("CityBiteGuide", "Local guides");
    let eliteId: string | null = null;
    const { rows: eliteRows } = await sql`
      SELECT id FROM companies
      WHERE name ILIKE 'Elite Escort Group'
         OR name ILIKE 'EliteEscortGroup'
      LIMIT 1
    `;
    if (eliteRows[0]?.id) {
      eliteId = String(eliteRows[0].id);
    } else {
      eliteId = await ensureNamedCompany("Elite Escort Group", "Entertainment");
    }

    async function ensureResendFor(companyId: string, companyLabel: string) {
      const { rows: templateRows } = await sql`
        SELECT * FROM tool_subscriptions
        WHERE name ILIKE 'Resend'
        ORDER BY created_at ASC
        LIMIT 1
      `;
      if (!templateRows[0]) return;

      const { rows: existing } = await sql`
        SELECT id FROM tool_subscriptions
        WHERE name ILIKE 'Resend' AND bill_to_company_id = ${companyId}
        LIMIT 1
      `;
      if (existing[0]) {
        await sql`
          UPDATE tool_subscriptions
          SET pass_through = true, status = 'active', updated_at = now()
          WHERE id = ${existing[0].id}
        `;
        return;
      }

      const { rows: unassigned } = await sql`
        SELECT id FROM tool_subscriptions
        WHERE name ILIKE 'Resend' AND bill_to_company_id IS NULL
        ORDER BY created_at ASC
        LIMIT 1
      `;
      if (unassigned[0]?.id) {
        await sql`
          UPDATE tool_subscriptions SET
            bill_to_company_id = ${companyId},
            pass_through = true,
            notes = ${`Transactional email API — doorbelasten ${companyLabel} (gedeeld)`},
            updated_at = now()
          WHERE id = ${unassigned[0].id}
        `;
        return;
      }

      const t = templateRows[0];
      await sql`
        INSERT INTO tool_subscriptions (
          name, vendor, category, cost_type, billing_frequency, our_cost,
          currency, status, bill_to_company_id, pass_through, notes, logo_url, login_url
        ) VALUES (
          'Resend',
          ${t.vendor ?? "Resend"},
          ${String(t.category ?? "comms")},
          ${String(t.cost_type ?? "usage")},
          ${String(t.billing_frequency ?? "monthly")},
          ${Number(t.our_cost) || 0},
          ${String(t.currency ?? "EUR")},
          'active',
          ${companyId},
          true,
          ${`Transactional email API — doorbelasten ${companyLabel} (gedeeld)`},
          ${t.logo_url ?? "/tools/resend.png"},
          ${t.login_url ?? "https://resend.com"}
        )
      `;
    }

    await ensureResendFor(cityId, "CityBiteGuide");
    if (eliteId) await ensureResendFor(eliteId, "Elite Escort Group");

    await sql`
      INSERT INTO finance_settings (key, value, updated_at)
      VALUES ('tools_seeded_v5_resend_clients', 'true', now())
      ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now()
    `;
  }

  // Resend plan is $20/mo total — split across billed clients so KPIs don't double-count.
  const { rows: v6Flag } = await sql`
    SELECT value FROM finance_settings WHERE key = 'tools_seeded_v6_resend_cost'
  `;
  if (v6Flag[0]?.value !== "true") {
    const { rows: resendRows } = await sql`
      SELECT id FROM tool_subscriptions
      WHERE name ILIKE 'Resend' AND status = 'active'
    `;
    const share =
      resendRows.length > 0
        ? Math.round((20 / resendRows.length) * 100) / 100
        : 20;
    for (const row of resendRows) {
      await sql`
        UPDATE tool_subscriptions SET
          our_cost = ${share},
          currency = 'USD',
          cost_type = 'fixed',
          billing_frequency = 'monthly',
          updated_at = now()
        WHERE id = ${row.id}
      `;
    }
    await sql`
      INSERT INTO finance_settings (key, value, updated_at)
      VALUES ('tools_seeded_v6_resend_cost', 'true', now())
      ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now()
    `;
  }

  // Firecrawl web crawl / scrape API.
  const { rows: v7Flag } = await sql`
    SELECT value FROM finance_settings WHERE key = 'tools_seeded_v7_firecrawl'
  `;
  if (v7Flag[0]?.value !== "true") {
    const { rows: existing } = await sql`
      SELECT id FROM tool_subscriptions
      WHERE name ILIKE 'Firecrawl' OR name ILIKE 'FireCrawl'
      LIMIT 1
    `;
    if (!existing[0]) {
      await sql`
        INSERT INTO tool_subscriptions (
          name, vendor, category, cost_type, billing_frequency, our_cost,
          status, notes, logo_url, login_url, pass_through
        ) VALUES (
          'Firecrawl',
          'Firecrawl',
          'software',
          'usage',
          'monthly',
          0,
          'active',
          'Web scraping / crawl API — usage per maand; koppel klant om door te belasten',
          '/tools/firecrawl.png',
          'https://www.firecrawl.dev',
          false
        )
      `;
    } else {
      await sql`
        UPDATE tool_subscriptions SET
          name = 'Firecrawl',
          vendor = 'Firecrawl',
          category = 'software',
          cost_type = 'usage',
          logo_url = COALESCE(logo_url, '/tools/firecrawl.png'),
          login_url = COALESCE(login_url, 'https://www.firecrawl.dev'),
          notes = COALESCE(
            NULLIF(notes, ''),
            'Web scraping / crawl API — usage per maand; koppel klant om door te belasten'
          ),
          status = 'active',
          updated_at = now()
        WHERE id = ${existing[0].id}
      `;
    }
    await sql`
      INSERT INTO finance_settings (key, value, updated_at)
      VALUES ('tools_seeded_v7_firecrawl', 'true', now())
      ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now()
    `;
  }
}

