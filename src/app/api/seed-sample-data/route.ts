import { NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";

export async function GET() {
  try {
    await ensureTables();

    const { rows: existing } = await sql`SELECT COUNT(*) AS count FROM companies`;
    if (Number(existing[0].count) > 0) {
      return NextResponse.json({ message: "Sample data already exists." });
    }

    await sql`
      INSERT INTO companies (id, name, industry, website) VALUES
        ('11111111-1111-1111-1111-111111111111', 'Acme Corp', 'Technology', 'acme.com'),
        ('22222222-2222-2222-2222-222222222222', 'FinTech BV', 'Finance', 'fintech.nl'),
        ('33333333-3333-3333-3333-333333333333', 'MediaGroup', 'Media', 'mediagroup.nl')
      ON CONFLICT (id) DO NOTHING
    `;

    await sql`
      INSERT INTO opportunities (company_id, name, type, stage, probability, expected_value, actual_value, sentiment, proposal_status, owner, close_date, notes) VALUES
        ('11111111-1111-1111-1111-111111111111', 'CRM implementation Q3', 'project', 'proposal', 70, 45000, 0, 'positive', 'sent', 'Kevin', '2026-08-15', 'Client is enthusiastic, waiting on board go/no-go'),
        ('22222222-2222-2222-2222-222222222222', 'Data platform retainer', 'retainer', 'negotiation', 85, 8500, 0, 'very_positive', 'accepted', 'Kevin', '2026-07-30', 'Contract almost finalized'),
        ('33333333-3333-3333-3333-333333333333', 'SEO & Content strategy', 'new', 'qualified', 40, 18000, 0, 'neutral', 'draft', 'Kevin', '2026-09-01', 'First meeting went well')
    `;

    return NextResponse.json({
      success: true,
      message: "Sample companies and opportunities seeded.",
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
