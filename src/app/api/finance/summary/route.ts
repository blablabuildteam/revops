import { NextRequest, NextResponse } from "next/server";
import { sql, ensureTables } from "@/lib/db";

export async function GET(req: NextRequest) {
  await ensureTables();
  const month = req.nextUrl.searchParams.get("month");
  const monthDate = month ? `${month}-01` : new Date().toISOString().slice(0, 7) + "-01";

  const [
    { rows: revenueRows },
    { rows: settings },
    { rows: withdrawalRows },
    { rows: allRevenue },
    { rows: allWithdrawals },
    { rows: history },
    { rows: pipeline },
  ] = await Promise.all([
    sql`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM monthly_revenue
      WHERE date_trunc('month', month) = date_trunc('month', ${monthDate}::date)
    `,
    sql`SELECT key, value FROM finance_settings`,
    sql`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM salary_withdrawals
      WHERE date_trunc('month', month) = date_trunc('month', ${monthDate}::date)
    `,
    sql`SELECT COALESCE(SUM(amount), 0) AS total FROM monthly_revenue`,
    sql`SELECT COALESCE(SUM(amount), 0) AS total FROM salary_withdrawals`,
    sql`
      SELECT
        to_char(date_trunc('month', month), 'YYYY-MM') AS month,
        SUM(amount) AS revenue
      FROM monthly_revenue
      WHERE month >= (${monthDate}::date - interval '5 months')
      GROUP BY date_trunc('month', month)
      ORDER BY date_trunc('month', month)
    `,
    sql`
      SELECT
        stage, expected_value, probability,
        (expected_value * probability / 100) AS weighted_value,
        close_date
      FROM opportunities
      WHERE stage NOT IN ('lost', 'on_hold')
      ORDER BY close_date
    `,
  ]);

  const totalRevenue = Number(revenueRows[0].total);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfg = Object.fromEntries(settings.map((s: any) => [s.key as string, Number(s.value)]));
  const salaryPct = cfg.salary_pct ?? 45;
  const taxPct = cfg.tax_pct ?? 40;
  const reservePct = cfg.reserve_pct ?? 10;
  const salaryPerPerson = cfg.salary_per_person ?? 5445;
  const founders = cfg.founders ?? 2;
  const totalSalaryTarget = salaryPerPerson * founders;

  const salaryPot = totalRevenue * (salaryPct / 100);
  const taxReserve = totalRevenue * (taxPct / 100);
  const companyReserve = totalRevenue * (reservePct / 100);
  const withdrawnThisMonth = Number(withdrawalRows[0].total);
  const potBalance =
    Number(allRevenue[0].total) * (salaryPct / 100) - Number(allWithdrawals[0].total);

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
