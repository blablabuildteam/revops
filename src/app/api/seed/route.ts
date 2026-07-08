import { NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";

export async function GET() {
  try {
    await ensureTables();

    // Check if already seeded
    const { rows: existing } = await sql`SELECT COUNT(*) as count FROM companies`;
    if (Number(existing[0].count) > 0) {
      return NextResponse.json({ message: "Al gevuld, skip." });
    }

    // ── Companies ──────────────────────────────────────────────────────────
    const { rows: companies } = await sql`
      INSERT INTO companies (name, industry, website, country) VALUES
        ('Heatnest',      'E-commerce',  'heatnest.nl',      'NL'),
        ('ComfortZzzone', 'E-commerce',  'comfortzzone.nl',  'NL'),
        ('Escort',        'Entertainment','escort.nl',        'NL'),
        ('Solero',        'Food & Beverage','solero.com',     'NL'),
        ('Thuishaven',    'Hospitality', 'thuishaven.nl',    'NL'),
        ('WeezEvent',     'Events',      'weezevent.com',    'NL'),
        ('Adsomnia',      'AdTech',      'adsomnia.io',      'NL')
      RETURNING id, name
    `;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = Object.fromEntries(companies.map((r: any) => [r.name as string, r.id as string]));

    // ── Opportunities ──────────────────────────────────────────────────────
    await sql`
      INSERT INTO opportunities
        (company_id, name, type, stage, probability, expected_value, actual_value,
         currency, sentiment, proposal_status, owner, close_date, notes)
      VALUES
        (
          ${c["Heatnest"]},
          'Heatnest — Performance marketing retainer',
          'retainer', 'won', 100, 2500, 2500,
          'EUR', 'positive', 'accepted', 'Kevin', '2026-01-01',
          '10% over omzet excl. BTW t/m €30k (max €3.000). Daarna 6% over alles boven €30k. Wordt maandelijks verrekend op basis van werkelijke omzet.'
        ),
        (
          ${c["ComfortZzzone"]},
          'ComfortZzzone — Retainer + performance',
          'retainer', 'won', 100, 1750, 1750,
          'EUR', 'positive', 'accepted', 'Kevin', '2026-01-01',
          '€1.250/maand vaste retainer. Bij ROAS ≥ 3 ontvangen we aanvullend €5 per verkocht item. Performance bonus wordt maandelijks berekend.'
        ),
        (
          ${c["Escort"]},
          'Escort — Traffic & marketing (lifetime deal)',
          'retainer', 'won', 100, 3000, 3000,
          'EUR', 'neutral', 'accepted', 'Kevin', '2026-01-01',
          'Lifetime deal. We genereren traffic voor meerdere escort-sites. Verdienmodel: €21 per uur boven de drempel van 15 uur. Meerdere sites actief.'
        ),
        (
          ${c["Solero"]},
          'Solero — Lopende projecten',
          'project', 'won', 100, 8000, 8000,
          'EUR', 'positive', 'accepted', 'Kevin', '2026-06-01',
          'Meerdere gelijktijdige projecten voor Solero. Zie projectplanning voor details per deelproject.'
        ),
        (
          ${c["Thuishaven"]},
          'Thuishaven — Voorstel marketing strategie',
          'project', 'proposal', 60, 12000, 0,
          'EUR', 'positive', 'sent', 'Kevin', '2026-08-01',
          'Voorstel uitgestuurd voor marketing strategie en implementatie. Afwachten reactie.'
        ),
        (
          ${c["WeezEvent"]},
          'WeezEvent — Marketing & groei',
          'new_business', 'prospect', 20, 6000, 0,
          'EUR', 'neutral', 'not_sent', 'Kevin', '2026-09-01',
          'Prospect. Eerste oriënterende gesprekken geweest. Interesse in marketingondersteuning rondom events.'
        ),
        (
          ${c["Adsomnia"]},
          'Adsomnia — Nieuw voorstel (binnenkort)',
          'new_business', 'qualified', 50, 9500, 0,
          'EUR', 'positive', 'draft', 'Kevin', '2026-08-15',
          'Actieve relatie. Binnenkort gaat er een nieuw voorstel uit. Details nog in afstemming.'
        )
    `;

    // ── Projects ───────────────────────────────────────────────────────────
    const { rows: projects } = await sql`
      INSERT INTO projects (company_id, name, description, status, client_name, start_date, end_date)
      VALUES
        (
          ${c["Heatnest"]},
          'Heatnest — Performance marketing',
          'Doorlopende performance marketing campagnes: Google Ads, Meta Ads en SEO-optimalisatie.',
          'active', 'Heatnest team', '2026-01-01', NULL
        ),
        (
          ${c["ComfortZzzone"]},
          'ComfortZzzone — Ads & ROAS optimalisatie',
          'Maandelijkse campagne-optimalisatie gericht op ROAS ≥ 3 en schaling van winstgevende producten.',
          'active', 'ComfortZzzone team', '2026-01-01', NULL
        ),
        (
          ${c["Escort"]},
          'Escort — Traffic generatie (multi-site)',
          'Traffic en marketing voor meerdere escort-gerelateerde sites op lifetime deal basis.',
          'active', 'Escort team', '2026-01-01', NULL
        ),
        (
          ${c["Solero"]},
          'Solero — Campagne zomer 2026',
          'Zomercampagne voor Solero: content, paid social, influencer activaties.',
          'active', 'Solero marketing', '2026-05-01', '2026-09-01'
        ),
        (
          ${c["Solero"]},
          'Solero — Brand & strategie',
          'Merkstrategie en positionering voor het komende seizoen.',
          'active', 'Solero marketing', '2026-04-01', '2026-10-01'
        )
      RETURNING id, name, company_id
    `;

    // ── Milestones per project ─────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const project of projects as any[]) {
      if (String(project.name).includes("Heatnest")) {
        await sql`
          INSERT INTO milestones (project_id, name, status, position) VALUES
            (${project.id}, 'Setup & tracking', 'completed', 0),
            (${project.id}, 'Campagne lancering', 'completed', 1),
            (${project.id}, 'Optimalisatie Q2', 'in_progress', 2),
            (${project.id}, 'Rapportage & schaling Q3', 'pending', 3)
        `;
      } else if (String(project.name).includes("ComfortZzzone")) {
        await sql`
          INSERT INTO milestones (project_id, name, status, position) VALUES
            (${project.id}, 'Account audit & structuur', 'completed', 0),
            (${project.id}, 'ROAS 3 behalen', 'in_progress', 1),
            (${project.id}, 'Performance bonus activeren', 'pending', 2)
        `;
      } else if (String(project.name).includes("Escort")) {
        await sql`
          INSERT INTO milestones (project_id, name, status, position) VALUES
            (${project.id}, 'Site setup & tracking', 'completed', 0),
            (${project.id}, 'Traffic opbouw', 'in_progress', 1),
            (${project.id}, 'Schaling & nieuwe sites', 'pending', 2)
        `;
      } else if (String(project.name).includes("Campagne zomer")) {
        await sql`
          INSERT INTO milestones (project_id, name, status, position) VALUES
            (${project.id}, 'Contentplanning', 'completed', 0),
            (${project.id}, 'Campagne live', 'in_progress', 1),
            (${project.id}, 'Resultaten & evaluatie', 'pending', 2)
        `;
      } else if (String(project.name).includes("Brand")) {
        await sql`
          INSERT INTO milestones (project_id, name, status, position) VALUES
            (${project.id}, 'Merkonderzoek', 'completed', 0),
            (${project.id}, 'Positionering', 'in_progress', 1),
            (${project.id}, 'Implementatie', 'pending', 2)
        `;
      }
    }

    // ── Taken per milestone ────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const heatnestProject = (projects as any[]).find((p) => String(p.name).includes("Heatnest"));
    if (heatnestProject) {
      const { rows: heatnestMs } = await sql`
        SELECT id, name FROM milestones WHERE project_id = ${heatnestProject.id}
      `;
      for (const ms of heatnestMs as { id: string; name: string }[]) {
        if (ms.name === "Setup & tracking") {
          await sql`INSERT INTO tasks (project_id, milestone_id, title, status, approved) VALUES
            (${heatnestProject.id}, ${ms.id}, 'Google Ads account koppelen', 'done', true),
            (${heatnestProject.id}, ${ms.id}, 'Conversietracking instellen', 'done', true),
            (${heatnestProject.id}, ${ms.id}, 'GA4 koppeling verifiëren', 'done', true)
          `;
        } else if (ms.name === "Optimalisatie Q2") {
          await sql`INSERT INTO tasks (project_id, milestone_id, title, status, approved) VALUES
            (${heatnestProject.id}, ${ms.id}, 'Keyword analyse bijwerken', 'in_progress', true),
            (${heatnestProject.id}, ${ms.id}, 'A/B test nieuwe advertentieteksten', 'open', true),
            (${heatnestProject.id}, ${ms.id}, 'Budget verdeling optimaliseren', 'open', true)
          `;
        }
      }
    }

    return NextResponse.json({
      success: true,
      companies: companies.length,
      projects: projects.length,
      message: "Seed geslaagd! Je kunt /api/seed nu verwijderen.",
    });

  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
