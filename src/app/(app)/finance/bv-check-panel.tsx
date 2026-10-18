"use client";

import dynamicImport from "next/dynamic";
import { useMemo, useState } from "react";
import { ArrowRight, Check, Info, X } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import {
  BOX2_LOW_RATE,
  GEBRUIKELIJK_LOON,
  VPB_LOW_RATE,
  buildComparisonSeries,
  bvTax,
  compareAtProfit,
  findBvAdvantageRange,
  splitProfit,
  vofTax,
} from "@/lib/dutch-tax";
import { buildTaxReserve, buildYearRevenue } from "@/lib/tax-projection";
import type { TaxSettings } from "@/lib/tax-settings";
import type { FinanceDeal, Opportunity } from "@/lib/types";
import { TASK_ASSIGNEES } from "@/lib/types";
import {
  AmountRow,
  CARD,
  Disclaimer,
  NumberField,
  StatCard,
  ToggleChip,
  formatPercent,
} from "./tax-shared";

const BvComparisonChart = dynamicImport(
  () => import("./bv-comparison-chart").then((m) => m.BvComparisonChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-[280px] rounded-lg bg-neutral-900/60 animate-pulse" />
    ),
  },
);

const CHART_MAX_PROFIT = 800_000;
const CHART_STEP = 10_000;
/** Gross that nets about €5,500 per month, holiday pay included in the year. */
const SALARY_FOR_5500_NET = 107_500;
const TARGET_NET_MONTH = 5_500;
const TARGET_NET_YEAR = TARGET_NET_MONTH * 12;

const PAYOUT_SCENARIOS = [
  {
    id: "top-up",
    label: "€5,500 net via dividend",
    salary: GEBRUIKELIJK_LOON,
    dividendShare: 0,
    targetNetPerPartner: TARGET_NET_YEAR as number | null,
    hint: "Recommended. Low salary, dividend only until you reach €5,500",
  },
  {
    id: "net-5500",
    label: "€5,500 net as salary",
    salary: SALARY_FOR_5500_NET,
    dividendShare: 0,
    targetNetPerPartner: null,
    hint: "Same pocket money, almost nothing left to save",
  },
  {
    id: "holding",
    label: "Low salary, keep the rest",
    salary: GEBRUIKELIJK_LOON,
    dividendShare: 0,
    targetNetPerPartner: null,
    hint: "Most wealth stays in the holding. About €3,600 net per month",
  },
  {
    id: "all-out",
    label: "Pay everything out",
    salary: GEBRUIKELIJK_LOON,
    dividendShare: 1,
    targetNetPerPartner: null,
    hint: "Salary plus full dividend, box 2 this year",
  },
];

function Verdict({
  favoursBv,
  headline,
  body,
}: {
  favoursBv: boolean;
  headline: string;
  body: string;
}) {
  return (
    <div
      className={`rounded-lg border p-5 ${
        favoursBv
          ? "border-stone-500/40 bg-stone-500/5"
          : "border-[#d4e052]/30 bg-[#d4e052]/5"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 rounded-full p-1 ${
            favoursBv ? "bg-stone-500/20 text-stone-300" : "bg-[#d4e052]/15 text-[#d4e052]"
          }`}
        >
          {favoursBv ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-neutral-100">{headline}</p>
          <p className="text-xs leading-relaxed text-neutral-400">{body}</p>
        </div>
      </div>
    </div>
  );
}

export function BvCheckPanel({
  deals,
  opportunities,
  settings,
  onSettingsChange,
  bunqYearTotalInclVat = null,
}: {
  deals: FinanceDeal[];
  opportunities: Opportunity[];
  settings: TaxSettings;
  onSettingsChange: (patch: Partial<TaxSettings>) => void;
  bunqYearTotalInclVat?: number | null;
}) {
  const [dividendShare, setDividendShare] = useState(0);
  const [targetNetPerPartner, setTargetNetPerPartner] = useState<number | null>(
    () => (settings.bv_dga_salary <= GEBRUIKELIJK_LOON ? TARGET_NET_YEAR : null),
  );
  const activeScenario =
    PAYOUT_SCENARIOS.find((scenario) => {
      const sameSalary = scenario.salary === settings.bv_dga_salary;
      if (scenario.targetNetPerPartner != null) {
        return sameSalary && targetNetPerPartner === scenario.targetNetPerPartner;
      }
      return (
        sameSalary &&
        targetNetPerPartner == null &&
        scenario.dividendShare === dividendShare
      );
    })?.id ?? null;
  const year = new Date().getFullYear();
  const partners = TASK_ASSIGNEES.length;

  const revenue = useMemo(
    () =>
      buildYearRevenue(deals, opportunities, year, {
        realisedGrossInclVat: bunqYearTotalInclVat,
      }),
    [deals, opportunities, year, bunqYearTotalInclVat],
  );

  const reserveBase = useMemo(
    () => ({
      annualCosts: settings.tax_annual_costs,
      firstPartnerSharePct: settings.tax_profit_split,
      partners,
      urencriterium: settings.tax_urencriterium,
      startersaftrek: settings.tax_startersaftrek,
    }),
    [settings, partners],
  );

  const confirmed = useMemo(
    () => buildTaxReserve(revenue, { ...reserveBase, includePipeline: false }),
    [revenue, reserveBase],
  );

  const withKansen = useMemo(
    () => buildTaxReserve(revenue, { ...reserveBase, includePipeline: true }),
    [revenue, reserveBase],
  );

  const [profitSource, setProfitSource] = useState<"confirmed" | "kansen">("confirmed");
  const projectedProfit =
    profitSource === "kansen"
      ? withKansen.projectedProfit
      : confirmed.projectedProfit;

  const [profitOverride, setProfitOverride] = useState<number | null>(null);
  const profit = profitOverride ?? projectedProfit;

  const comparisonOptions = useMemo(
    () => ({
      partners,
      profitShares: [settings.tax_profit_split, 100 - settings.tax_profit_split],
      urencriterium: settings.tax_urencriterium,
      startersaftrek: settings.tax_startersaftrek,
      dgaSalary: settings.bv_dga_salary,
      extraAnnualCost: settings.bv_extra_annual_cost,
      dividendShare,
      targetNetPerPartner: targetNetPerPartner ?? undefined,
    }),
    [partners, settings, dividendShare, targetNetPerPartner],
  );

  const series = useMemo(
    () => buildComparisonSeries(CHART_MAX_PROFIT, CHART_STEP, comparisonOptions),
    [comparisonOptions],
  );

  const range = useMemo(
    () => findBvAdvantageRange(comparisonOptions),
    [comparisonOptions],
  );

  const current = useMemo(
    () => compareAtProfit(profit, comparisonOptions),
    [profit, comparisonOptions],
  );

  const vof = useMemo(
    () =>
      vofTax(
        splitProfit(profit, [settings.tax_profit_split, 100 - settings.tax_profit_split]),
        {
          urencriterium: settings.tax_urencriterium,
          startersaftrek: settings.tax_startersaftrek,
        },
      ),
    [profit, settings],
  );

  const bv = useMemo(
    () =>
      bvTax(profit, {
        partners,
        dgaSalary: settings.bv_dga_salary,
        extraAnnualCost: settings.bv_extra_annual_cost,
        dividendShare,
        targetNetPerPartner: targetNetPerPartner ?? undefined,
      }),
    [profit, partners, settings, dividendShare, targetNetPerPartner],
  );

  const keepsProfit = bv.retainedInBv > 1;
  const salaryNetMonth = Math.round((bv.dgaSalaryTotal - bv.salaryTaxTotal) / partners / 12);
  const netPerPersonMonth = Math.round(bv.totalNet / partners / 12);
  const dividendNetMonth = Math.max(0, netPerPersonMonth - salaryNetMonth);

  const favoursBv = current.difference > 0;
  const inBand =
    range.from !== null &&
    profit >= range.from &&
    (range.to === null || profit <= range.to);
  const toBreakEven = range.from !== null ? range.from - profit : null;

  const headline = favoursBv
    ? keepsProfit
      ? `A BV would leave you about ${formatCurrency(current.difference)} richer per year`
      : `A BV would net you about ${formatCurrency(current.difference)} more cash per year`
    : range.from === null
      ? "A BV does not pay off at any profit level for you"
      : `Stay a VOF — a BV would leave you about ${formatCurrency(-current.difference)} worse off`;

  const body = targetNetPerPartner != null
    ? `Each of you takes the statutory salary, about ${formatCurrency(salaryNetMonth)} net per month, plus roughly ${formatCurrency(dividendNetMonth)} net from dividend. That lands on about ${formatCurrency(netPerPersonMonth)} net per month. ${formatCurrency(bv.retainedInBv)} stays in the BV for later — taking the same €5,500 entirely as salary would leave nothing there.`
    : favoursBv
    ? keepsProfit
      ? `At ${formatCurrency(profit)} profit each of you takes ${formatCurrency(settings.bv_dga_salary)} salary and ${bv.dividendPerPartner === 0 ? "leaves the rest" : "pays part out as dividend and leaves the rest"} in the work BV / holdings after ${formatPercent(VPB_LOW_RATE, 0)} VPB. That retained equity is still yours — box 2 is only due when you take it privately.`
      : `At ${formatCurrency(profit)} profit, even after paying box 2 on a full dividend on top of ${formatCurrency(settings.bv_dga_salary)} salary, the BV still beats the VOF.`
    : range.from === null
      ? "The mkb-winstvrijstelling keeps the VOF ahead across the whole range at your current salary and payout."
      : toBreakEven !== null && toBreakEven > 0
        ? `You would need roughly ${formatCurrency(toBreakEven)} more yearly profit before it flips. A higher salary, or paying dividend now, spends the advantage — the holding only wins when surplus stays in the company.`
        : `Your profit sits above the band where a holding wins under these assumptions.`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label={
            profitOverride !== null
              ? "Manual profit"
              : profitSource === "kansen"
                ? "Profit + kansen"
                : "Profit (confirmed)"
          }
          value={formatCurrency(profit)}
          sub={
            profitOverride !== null
              ? "Manual scenario"
              : profitSource === "kansen"
                ? `Deals + ${formatCurrency(revenue.pipelineRemaining)} weighted pipeline`
                : `Received ${formatCurrency(revenue.realised)} + due ${formatCurrency(revenue.contractedRemaining)}`
          }
          tone="accent"
        />
        <StatCard
          label="As a VOF"
          value={formatCurrency(current.vofNet)}
          sub={`Net cash for both partners · ${formatPercent(vof.effectiveRate)} tax`}
        />
        <StatCard
          label="As a BV"
          value={formatCurrency(current.bvNet)}
          sub={
            keepsProfit
              ? `Salary in hand + ${formatCurrency(current.bvRetained)} left in BV`
              : `Salary + dividend after box 2 · ${formatPercent(bv.effectiveRate)} tax`
          }
        />
        <StatCard
          label="Difference"
          value={`${favoursBv ? "+" : "−"}${formatCurrency(Math.abs(current.difference))}`}
          sub={
            keepsProfit
              ? favoursBv
                ? "Richer with a BV (incl. retained equity)"
                : "VOF still ahead on total wealth"
              : favoursBv
                ? "In favour of a BV (cash)"
                : "In favour of the VOF (cash)"
          }
          tone={favoursBv ? "positive" : "warning"}
        />
      </div>

      <Verdict favoursBv={favoursBv} headline={headline} body={body} />

      <div className={`${CARD} space-y-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-neutral-300">How projected profit is built</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Confirmed = finance deals (received + unpaid schedule). Kansen = open opportunities ×
              win probability.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ToggleChip
              active={profitSource === "confirmed" && profitOverride === null}
              onClick={() => {
                setProfitSource("confirmed");
                setProfitOverride(null);
              }}
            >
              Confirmed deals
            </ToggleChip>
            <ToggleChip
              active={profitSource === "kansen" && profitOverride === null}
              onClick={() => {
                setProfitSource("kansen");
                setProfitOverride(null);
              }}
            >
              + Kansen
            </ToggleChip>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <AmountRow label="Received this year" value={revenue.realised} tone="positive" />
            <AmountRow
              label="Still due on confirmed deals"
              value={revenue.contractedRemaining}
              hint="Schedule / retainer not yet paid"
            />
            <AmountRow
              label="Costs"
              value={settings.tax_annual_costs}
              tone="negative"
              negative
            />
            <AmountRow
              label="Profit (confirmed)"
              value={confirmed.projectedProfit}
              emphasis
              tone={profitSource === "confirmed" && profitOverride === null ? "accent" : "default"}
            />
          </div>
          <div className="space-y-1.5">
            <AmountRow
              label="Weighted kansen"
              value={revenue.pipelineRemaining}
              hint="Pipeline × probability, rest of year"
            />
            <AmountRow
              label="Profit if kansen land"
              value={withKansen.projectedProfit}
              emphasis
              tone={profitSource === "kansen" && profitOverride === null ? "accent" : "default"}
            />
            <p className="text-[11px] text-neutral-600 leading-relaxed pt-2">
              Default for the BV verdict is confirmed deals only — kansen are upside, not a promise.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={`${CARD} space-y-3`}>
          <div>
            <h2 className="text-sm font-medium text-neutral-300">Extra costs of a holding setup</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Target: work BV + personal holding per partner ({partners} holdings)
            </p>
          </div>
          <ul className="space-y-2.5 text-sm">
            {[
              {
                title: "One-time setup",
                body: "Notary + formation for the work BV and each personal holding, accountant conversion, KvK registrations.",
                amount: "≈ €6–12k once",
              },
              {
                title: "Extra yearly admin",
                body: "Three sets of annual accounts, payroll for DGAs, filings. Captured in the “extra yearly cost” assumption below.",
                amount: formatCurrency(settings.bv_extra_annual_cost) + "/yr",
              },
              {
                title: "Director salaries",
                body: `${partners} × ${formatCurrency(settings.bv_dga_salary)} — taxed in box 1, plus employer Zvw (${formatPercent(0.061, 1)}).${
                  settings.bv_dga_salary <= GEBRUIKELIJK_LOON
                    ? " Around the statutory minimum."
                    : ""
                }`,
                amount: formatCurrency(bv.dgaSalaryTotal) + "/yr",
              },
              {
                title: "Deductions you lose",
                body: "No zelfstandigenaftrek and no 12.7% mkb-winstvrijstelling once you leave the VOF.",
                amount: "rate hit",
              },
              {
                title: "Box 2 later",
                body: "Money left in the holding after VPB still carries deferred box 2 when you take a private dividend.",
                amount:
                  bv.deferredBox2 > 0
                    ? `≈ ${formatCurrency(bv.deferredBox2)} parked`
                    : "paid this year",
              },
            ].map((item) => (
              <li
                key={item.title}
                className="flex items-start justify-between gap-4 border-b border-neutral-800/80 last:border-0 pb-2.5 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-neutral-200 font-medium">{item.title}</p>
                  <p className="text-xs text-neutral-500 leading-relaxed mt-0.5">{item.body}</p>
                </div>
                <span className="shrink-0 font-mono text-xs text-orange-300/90 pt-0.5">
                  {item.amount}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className={`${CARD} space-y-3`}>
          <div>
            <h2 className="text-sm font-medium text-neutral-300">Extra benefits of the holding</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Why most agencies move to personal holdings + a work BV
            </p>
          </div>
          <ul className="space-y-2.5 text-sm">
            {[
              {
                title: "Retain after 19% VPB",
                body: "Profit above salaries stays in the work BV / holdings at the low VPB rate instead of progressive box 1.",
                tag: "tax timing",
              },
              {
                title: "Liability ring-fence",
                body: "Client and project risk sits in the work BV. Personal holdings (and private assets) stay cleaner.",
                tag: "risk",
              },
              {
                title: "Personal holding per partner",
                body: "Each of you owns the work BV via your own holding — clear equity split, easier exits, management fees if needed.",
                tag: "structure",
              },
              {
                title: "Participation exemption",
                body: "Selling work-BV shares from a holding is often tax-free under the deelnemingsvrijstelling (accountant to confirm).",
                tag: "exit",
              },
              {
                title: "Reinvest inside the group",
                body: "Cash can stay available for hiring, tools or acquisitions without first paying private income tax.",
                tag: "growth",
              },
            ].map((item) => (
              <li
                key={item.title}
                className="flex items-start justify-between gap-4 border-b border-neutral-800/80 last:border-0 pb-2.5 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-neutral-200 font-medium">{item.title}</p>
                  <p className="text-xs text-neutral-500 leading-relaxed mt-0.5">{item.body}</p>
                </div>
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-emerald-400/80 pt-1">
                  {item.tag}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={`${CARD} space-y-4`}>
        <h2 className="text-sm font-medium text-neutral-300">Holding structure we model</h2>
        <div className="flex flex-col items-center gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
            {TASK_ASSIGNEES.slice(0, partners).map((name) => (
              <div
                key={name}
                className="rounded-lg border border-neutral-800 bg-neutral-950/50 px-3 py-3 text-center"
              >
                <p className="text-[10px] uppercase tracking-wider text-neutral-600 mb-1">
                  Personal holding
                </p>
                <p className="text-sm text-neutral-200 font-medium">{name} Holding B.V.</p>
              </div>
            ))}
          </div>
          <div className="text-neutral-600 text-xs tracking-widest">↓ owns ↓</div>
          <div className="rounded-lg border border-[#d4e052]/30 bg-[#d4e052]/5 px-5 py-3 text-center w-full max-w-sm">
            <p className="text-[10px] uppercase tracking-wider text-[#d4e052]/70 mb-1">
              Work BV
            </p>
            <p className="text-sm text-neutral-100 font-medium">blablabuild B.V.</p>
            <p className="text-[11px] text-neutral-500 mt-1">Clients · payroll · projects</p>
          </div>
        </div>
        <p className="text-xs text-neutral-500 leading-relaxed">
          Tax math still treats the group as one economic unit (salaries out, surplus retained after
          VPB) — which matches how a holding usually runs day to day. Intercompany management fees
          and fiscal unity are fine-tuning for your accountant; they rarely change the go / no-go.
        </p>
      </div>

      <div className={`${CARD} space-y-4`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium text-neutral-300">
              {keepsProfit ? "Wealth by legal form" : "Cash by legal form"}
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              A BV pays off when surplus stays in the holding. A higher salary or a dividend now moves that money into box 1 or box 2 and the chart usually closes the gap with the VOF.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          {PAYOUT_SCENARIOS.map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              onClick={() => {
                setTargetNetPerPartner(scenario.targetNetPerPartner);
                setDividendShare(scenario.dividendShare);
                if (settings.bv_dga_salary !== scenario.salary) {
                  onSettingsChange({ bv_dga_salary: scenario.salary });
                }
              }}
              className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                activeScenario === scenario.id
                  ? "border-[#d4e052]/50 bg-[#d4e052]/10"
                  : "border-neutral-800 bg-neutral-950/40 hover:border-neutral-600"
              }`}
            >
              <p className="text-xs font-medium text-neutral-100">{scenario.label}</p>
              <p className="text-[11px] text-neutral-500 mt-1 leading-relaxed">
                {scenario.targetNetPerPartner != null
                  ? `${formatCurrency(scenario.salary)} salary · dividend up to €5,500 net`
                  : scenario.dividendShare === 0
                    ? `${formatCurrency(scenario.salary)} salary · rest stays`
                    : `${formatCurrency(scenario.salary)} salary · all surplus as dividend`}
                . {scenario.hint}
              </p>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 text-xs -mt-1">
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-[#d4e052]" />
            <span className="text-neutral-400">VOF</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-stone-400" />
            <span className="text-neutral-400">BV</span>
          </span>
          {range.from !== null && (
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-2.5 rounded-sm bg-stone-400/15 border border-stone-400/30" />
              <span className="text-neutral-400">BV ahead</span>
            </span>
          )}
        </div>

        <BvComparisonChart
          data={series}
          advantageFrom={range.from}
          advantageTo={range.to}
          currentProfit={profit}
        />

        {range.from !== null && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-neutral-400 pt-1">
            <span>
              BV wins from{" "}
              <span className="font-mono text-stone-300">
                {formatCurrency(range.from)}
              </span>
              {range.to !== null && (
                <>
                  {" "}up to{" "}
                  <span className="font-mono text-stone-300">
                    {formatCurrency(range.to)}
                  </span>
                </>
              )}{" "}
              yearly profit
            </span>
            <span className="text-neutral-600">
              ≈ {formatCurrency(range.from / partners)} per partner
            </span>
            <span
              className={
                inBand ? "text-stone-300" : "text-neutral-500"
              }
            >
              {inBand ? "You are inside this band" : "You are outside this band"}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={`${CARD} space-y-3`}>
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-neutral-300">VOF today</h2>
            <span className="text-xs text-neutral-500">
              {formatPercent(vof.effectiveRate)} effective
            </span>
          </div>
          <AmountRow label="Profit" value={profit} />
          {vof.partners.map((partner, index) => (
            <AmountRow
              key={index}
              label={`${TASK_ASSIGNEES[index] ?? `Partner ${index + 1}`} — tax + Zvw`}
              value={partner.totalDue}
              hint={`On ${formatCurrency(partner.profitShare)} profit share`}
              tone="negative"
              negative
            />
          ))}
          <AmountRow label="Net for both partners" value={vof.totalNet} emphasis tone="accent" />
          <p className="text-xs text-neutral-500 leading-relaxed pt-1">
            Both partners keep the zelfstandigenaftrek and the 12.7%
            mkb-winstvrijstelling, which a BV does not have.
          </p>
        </div>

        <div className={`${CARD} space-y-3`}>
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-neutral-300">BV scenario</h2>
            <span className="text-xs text-neutral-500">
              {targetNetPerPartner != null
                ? "Salary + dividend top-up"
                : bv.dividendPerPartner === 0
                  ? "Salary only, rest stays"
                  : bv.retainedInBv > 1
                    ? "Salary + partial dividend"
                    : "Full dividend payout"}
            </span>
          </div>
          <AmountRow label="Profit before salaries" value={profit} />
          <AmountRow
            label={`Salaries (${partners} × ${formatCurrency(bv.dgaSalaryTotal / partners)})`}
            value={bv.dgaSalaryTotal}
            hint={
              settings.bv_dga_salary <= GEBRUIKELIJK_LOON
                ? "Around the statutory minimum — leaves more profit in the holding"
                : "Above the statutory minimum — more private cash, less retained"
            }
            tone="muted"
            negative
          />
          <AmountRow label="Employer Zvw (6.1%)" value={bv.employerZvw} tone="muted" negative />
          <AmountRow
            label="Extra running costs"
            value={bv.extraAnnualCost}
            hint="Annual accounts, filings, payroll"
            tone="muted"
            negative
          />
          <AmountRow
            label={`Corporate tax (${formatPercent(VPB_LOW_RATE, 0)} up to €200k)`}
            value={bv.vpb}
            tone="negative"
            negative
          />
          <AmountRow label="Income tax on salaries" value={bv.salaryTaxTotal} tone="negative" negative />
          {bv.box2Total > 0 && (
            <AmountRow
              label={`Box 2 on dividend (${formatPercent(BOX2_LOW_RATE, 1)})`}
              value={bv.box2Total}
              hint={`${formatCurrency(bv.dividendPerPartner)} dividend per partner`}
              tone="negative"
              negative
            />
          )}
          <AmountRow
            label={keepsProfit ? "Net cash this year" : "Net for both partners"}
            value={bv.totalNet}
            hint={`${formatCurrency(salaryNetMonth)} salary + ${formatCurrency(dividendNetMonth)} dividend = ${formatCurrency(netPerPersonMonth)} net per person / month`}
            emphasis
            tone="accent"
          />
          {bv.retainedInBv > 0 && (
            <AmountRow
              label="Left in the holding"
              value={bv.retainedInBv}
              hint={`Still yours. Box 2 of about ${formatCurrency(bv.deferredBox2)} only when you pay it out privately`}
              tone="muted"
            />
          )}
        </div>
      </div>

      <div className={`${CARD} space-y-4`}>
        <h2 className="text-sm font-medium text-neutral-300">Assumptions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <NumberField
            label="Salary per director"
            prefix="€"
            step={1000}
            value={settings.bv_dga_salary}
            onChange={(value) => {
              setTargetNetPerPartner(null);
              onSettingsChange({ bv_dga_salary: value });
            }}
            hint={`Play with this. Statutory floor is about ${formatCurrency(GEBRUIKELIJK_LOON)}; a higher salary makes the BV less attractive`}
          />
          <NumberField
            label="Extra yearly cost of the holding"
            prefix="€"
            step={250}
            value={settings.bv_extra_annual_cost}
            onChange={(value) => onSettingsChange({ bv_extra_annual_cost: value })}
            hint="Work BV + 2 personal holdings: accounts, payroll, filings"
          />
          <NumberField
            label="Profit to test"
            prefix="€"
            step={5000}
            value={profit}
            onChange={(value) => setProfitOverride(value)}
            hint={
              profitOverride !== null
                ? `Confirmed ${formatCurrency(confirmed.projectedProfit)} · +kansen ${formatCurrency(withKansen.projectedProfit)}`
                : "Change to test another scenario"
            }
          />
        </div>
        {profitOverride !== null && (
          <button
            type="button"
            onClick={() => setProfitOverride(null)}
            className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            Reset to the projection
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="flex gap-2.5 text-xs text-neutral-500 bg-neutral-950/60 border border-neutral-800 rounded-lg p-3.5">
        <Info className="w-4 h-4 shrink-0 mt-px text-neutral-600" />
        <div className="space-y-1.5 leading-relaxed">
          <p>
            Keep the salary near the statutory {formatCurrency(GEBRUIKELIJK_LOON)} and use dividend
            only to top private cash up to €5,500 net per month. The same €5,500 taken entirely as
            salary is about {formatCurrency(SALARY_FOR_5500_NET)} gross and leaves nothing in the
            company. Money that stays can sit in the work BV or move to a personal holding; box 2
            is due only when someone pays it out privately.
          </p>
          <p>
            The costs / benefits cards list what changes operationally. The chart only prices the
            recurring tax + admin difference — not one-time notary fees, and not soft factors like
            liability or sellability.
          </p>
          <Disclaimer>
            An indication based on {new Date().getFullYear()} rates for a work BV with personal
            holdings, not tax advice. Run the outcome past your accountant before acting on it.
          </Disclaimer>
        </div>
      </div>
    </div>
  );
}
