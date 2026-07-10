-- RevOps schema migration for Vercel Postgres
-- Run this once in Vercel Postgres → Query Editor

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  industry TEXT,
  website TEXT,
  country TEXT DEFAULT 'NL',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

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
);

-- Sample data
INSERT INTO companies (id, name, industry, website) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Acme Corp', 'Technology', 'acme.com'),
  ('22222222-2222-2222-2222-222222222222', 'FinTech BV', 'Finance', 'fintech.nl'),
  ('33333333-3333-3333-3333-333333333333', 'MediaGroup', 'Media', 'mediagroup.nl')
ON CONFLICT (id) DO NOTHING;

INSERT INTO opportunities (company_id, name, type, stage, probability, expected_value, actual_value, sentiment, proposal_status, owner, close_date, notes) VALUES
  ('11111111-1111-1111-1111-111111111111', 'CRM implementatie Q3', 'project', 'proposal', 70, 45000, 0, 'positive', 'sent', 'Kevin', '2026-08-15', 'Klant is enthousiast, wacht op go/no-go van board'),
  ('22222222-2222-2222-2222-222222222222', 'Data platform retainer', 'retainer', 'negotiation', 85, 8500, 0, 'very_positive', 'accepted', 'Kevin', '2026-07-30', 'Contract bijna rond'),
  ('33333333-3333-3333-3333-333333333333', 'SEO & Content strategie', 'new', 'qualified', 40, 18000, 0, 'neutral', 'draft', 'Kevin', '2026-09-01', 'Eerste gesprek goed gegaan')
ON CONFLICT DO NOTHING;
