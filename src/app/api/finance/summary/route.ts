import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";

export async function GET(req: NextRequest) {
  await ensureTables();
  const month = req.nextUrl.searchParams.get("month");
  const monthDate = month ? `${month}-01` : new Date().toISOString().slice(0, 7) + "-01";

  // Revenue this month
  const { rows: revenueRows } = await sql`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM monthly_revenue
    WHERE date_trunc('month', month) = date_trunc('month', ${monthDate}::date)
  `;
  const totalRevenue = Number(revenueRows[0].total);

  // Finance settings
  const { rows: settings } = await sql`SELECT key, value FROM finance_settings`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfg = Object.fromEntries(settings.map((s: any) => [s.key as string, Number(s.value)]));
  const salaryPct = cfg.salary_pct ?? 45;
  const taxPct = cfg.tax_pct ?? 40;
  const reservePct = cfg.reserve_pct ?? 10;
  const salaryPerPerson = cfg.salary_per_person ?? 5445;
  const founders = cfg.founders ?? 2;
  const totalSalaryTarget = salaryPerPerson * founders;

  // This month splits
  const salaryPot = totalRevenue * (salaryPct / 100);
  const taxReserve = totalRevenue * (taxPct / 100);
  const companyReserve = totalRevenue * (reservePct / 100);

  // Withdrawals this month
  const { rows: withdrawalRows } = await sql`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM salary_withdrawals
    WHERE date_trunc('month', month) = date_trunc('month', ${monthDate}::date)
  `;
  const withdrawnThisMonth = Number(withdrawalRows[0].total);

  // Cumulative pot: all time salary_pct of revenue MINUS all withdrawals
  const { rows: allRevenue } = await sql`
    SELECT COALESCE(SUM(amount * ${salaryPct} / 100), 0) AS total
    FROM monthly_revenue
  `;
  const { rows: allWithdrawals } = await sql`
    SELECT COALESCE(SUM(amount), 0) AS total FROM salary_withdrawals
  `;
  const potBalance = Number(allRevenue[0].total) - Number(allWithdrawals[0].total);

  // Last 6 months history
  const { rows: history } = await sql`
    SELECT
      to_char(date_trunc('month', month), 'YYYY-MM') AS month,
      SUM(amount) AS revenue
    FROM monthly_revenue
    WHERE month >= (${monthDate}::date - interval '5 months')
    GROUP BY date_trunc('month', month)
    ORDER BY date_trunc('month', month)
  `;

  // Pipeline forecast: won active + weighted pipeline per month
  const { rows: pipeline } = await sql`
    SELECT
      stage, expected_value, probability,
      (expected_value * probability / 100) AS weighted_value,
      close_date
    FROM opportunities
    WHERE stage NOT IN ('lost', 'on_hold')
    ORDER BY close_date
  `;

  return NextResponse.json({
    month: monthDate.slice(0, 7),
    totalRevenue,
    splits: { salaryPot, taxReserve, companyReserve },
    salaryTarget: totalSalaryTarget,
    withdrawnThisMonth,
    canPaySalary: salaryPot >= totalSalaryTarget,
    shortfall: Math.max(0, totalSalaryTarget - salaryPot),
    surplus: Math.max(0, salaryPot - totalSalaryTarget),
    potBalance,
    settings: { salaryPct, taxPct, reservePct, salaryPerPerson, founders },
    history,
    pipeline,
  });
}
