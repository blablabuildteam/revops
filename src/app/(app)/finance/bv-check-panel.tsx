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
}: {
  deals: FinanceDeal[];
  opportunities: Opportunity[];
  settings: TaxSettings;
  onSettingsChange: (patch: Partial<TaxSettings>) => void;
}) {
  const [retainProfit, setRetainProfit] = useState(true);
  const year = new Date().getFullYear();
  const partners = TASK_ASSIGNEES.length;

  const revenue = useMemo(
    () => buildYearRevenue(deals, opportunities, year),
    [deals, opportunities, year],
  );

  const projectedProfit = useMemo(
    () =>
      buildTaxReserve(revenue, {
        annualCosts: settings.tax_annual_costs,
        firstPartnerSharePct: settings.tax_profit_split,
        partners,
        includePipeline: false,
        urencriterium: settings.tax_urencriterium,
        startersaftrek: settings.tax_startersaftrek,
      }).projectedProfit,
    [revenue, settings, partners],
  );

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
      // Holding-style by default: salary out, rest stays in the BV after VPB.
      payout: (retainProfit ? "salary_only" : "full") as "salary_only" | "full",
    }),
    [partners, settings, retainProfit],
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
        payout: retainProfit ? "salary_only" : "full",
      }),
    [profit, partners, settings, retainProfit],
  );

  const favoursBv = current.difference > 0;
  const inBand =
    range.from !== null &&
    profit >= range.from &&
    (range.to === null || profit <= range.to);
  const toBreakEven = range.from !== null ? range.from - profit : null;

  const headline = favoursBv
    ? retainProfit
      ? `A BV would leave you about ${formatCurrency(current.difference)} richer per year`
      : `A BV would net you about ${formatCurrency(current.difference)} more cash per year`
    : range.from === null
      ? "A BV does not pay off at any profit level for you"
      : `Stay a VOF — a BV would leave you about ${formatCurrency(-current.difference)} worse off`;

  const body = favoursBv
    ? retainProfit
      ? `At ${formatCurrency(profit)} profit you take two statutory salaries and leave the rest in the BV after ${formatPercent(VPB_LOW_RATE, 0)} VPB. That retained equity is still yours — you just have not paid box 2 on it yet. This is how a holding structure usually works.`
      : `At ${formatCurrency(profit)} profit, even after paying box 2 on a full dividend, the BV still beats the VOF.`
    : range.from === null
      ? "The mkb-winstvrijstelling keeps the VOF ahead across the whole range at your current settings."
      : toBreakEven !== null && toBreakEven > 0
        ? `You would need roughly ${formatCurrency(toBreakEven)} more yearly profit before it flips. Below that, two salaries of ${formatCurrency(settings.bv_dga_salary)} plus ${formatCurrency(settings.bv_extra_annual_cost)} of extra costs eat the rate advantage.`
        : `Your profit sits above the band where a BV wins under these assumptions.`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Projected profit"
          value={formatCurrency(profit)}
          sub={profitOverride !== null ? "Manual scenario" : `Based on ${year} deals`}
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
            retainProfit
              ? `Salary in hand + ${formatCurrency(current.bvRetained)} left in BV`
              : `Salary + dividend after box 2 · ${formatPercent(bv.effectiveRate)} tax`
          }
        />
        <StatCard
          label="Difference"
          value={`${favoursBv ? "+" : "−"}${formatCurrency(Math.abs(current.difference))}`}
          sub={
            retainProfit
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
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium text-neutral-300">
              {retainProfit ? "Wealth by legal form" : "Cash by legal form"}
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              {retainProfit
                ? "VOF = cash after tax. BV = net salary + equity left in the company after VPB (box 2 deferred)."
                : "Both sides paid out privately this year, including box 2 on BV dividends."}
            </p>
          </div>
          <ToggleChip active={retainProfit} onClick={() => setRetainProfit((v) => !v)}>
            Keep profit in the BV
          </ToggleChip>
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
              {retainProfit ? "Holding-style (retain)" : "Full dividend payout"}
            </span>
          </div>
          <AmountRow label="Profit before salaries" value={profit} />
          <AmountRow
            label={`Salaries (${partners} × ${formatCurrency(bv.dgaSalaryTotal / partners)})`}
            value={bv.dgaSalaryTotal}
            hint="Statutory minimum for a director-shareholder"
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
          {retainProfit ? (
            <>
              <AmountRow label="Net salary in hand" value={bv.totalNet} emphasis tone="accent" />
              <AmountRow
                label="Retained in the BV"
                value={bv.retainedInBv}
                hint={`Carries ${formatCurrency(bv.deferredBox2)} of box 2 tax when you pay it out later`}
                tone="muted"
              />
            </>
          ) : (
            <>
              <AmountRow
                label={`Box 2 on dividend (${formatPercent(BOX2_LOW_RATE, 1)})`}
                value={bv.box2Total}
                hint={`${formatCurrency(bv.dividendPerPartner)} dividend per partner`}
                tone="negative"
                negative
              />
              <AmountRow label="Net for both partners" value={bv.totalNet} emphasis tone="accent" />
            </>
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
            onChange={(value) => onSettingsChange({ bv_dga_salary: value })}
            hint={`Statutory minimum is ${formatCurrency(GEBRUIKELIJK_LOON)}`}
          />
          <NumberField
            label="Extra yearly cost of a BV"
            prefix="€"
            step={250}
            value={settings.bv_extra_annual_cost}
            onChange={(value) => onSettingsChange({ bv_extra_annual_cost: value })}
            hint="Accountant, annual accounts, payroll"
          />
          <NumberField
            label="Profit to test"
            prefix="€"
            step={5000}
            value={profit}
            onChange={(value) => setProfitOverride(value)}
            hint={
              profitOverride !== null
                ? `Projection says ${formatCurrency(projectedProfit)}`
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
            Default view matches how most BV setups actually run: each director takes
            the statutory salary, the company pays {formatPercent(VPB_LOW_RATE, 0)} VPB
            on the rest, and that equity stays in the BV (or a holding) until you take a
            private dividend — which is when box 2 is due. Turn off “Keep profit in the
            BV” to force a full payout comparison instead.
          </p>
          <p>
            Still not modelled: separate holding + work BV entities, management fees
            between them, fiscal unity, or employee insurance beyond Zvw. Tax is also
            only part of the decision — liability, selling the business, and the
            conversion itself matter too.
          </p>
          <Disclaimer>
            An indication based on {new Date().getFullYear()} rates, not tax advice. Run
            the outcome past your accountant before acting on it.
          </Disclaimer>
        </div>
      </div>
    </div>
  );
}
