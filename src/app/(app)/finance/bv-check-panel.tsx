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
          ? "border-violet-500/40 bg-violet-500/5"
          : "border-[#e8ff47]/30 bg-[#e8ff47]/5"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 rounded-full p-1 ${
            favoursBv ? "bg-violet-500/20 text-violet-300" : "bg-[#e8ff47]/15 text-[#e8ff47]"
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
  const [retainProfit, setRetainProfit] = useState(false);
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
    }),
    [partners, settings],
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

  // The headline cards always compare the full-payout scenario, so that the
  // BV column stays comparable to the VOF one even while the toggle is on.
  const bvFullPayout = useMemo(
    () =>
      bvTax(profit, {
        partners,
        dgaSalary: settings.bv_dga_salary,
        extraAnnualCost: settings.bv_extra_annual_cost,
      }),
    [profit, partners, settings],
  );

  const favoursBv = current.difference > 0;
  const inBand =
    range.from !== null &&
    profit >= range.from &&
    (range.to === null || profit <= range.to);
  const toBreakEven = range.from !== null ? range.from - profit : null;

  const headline = favoursBv
    ? `A BV would net you about ${formatCurrency(current.difference)} more per year`
    : range.from === null
      ? "A BV does not pay off at any profit level for you"
      : `Stay a VOF — a BV would cost you about ${formatCurrency(-current.difference)} per year`;

  const body = favoursBv
    ? `At ${formatCurrency(profit)} profit the lower corporate rate outweighs the two statutory salaries and the extra running costs. Worth discussing with your accountant, including the transfer itself.`
    : range.from === null
      ? "The mkb-winstvrijstelling keeps the VOF ahead across the whole range at your current settings. Raising the profit split or lowering the extra BV costs may change that."
      : toBreakEven !== null && toBreakEven > 0
        ? `You would need roughly ${formatCurrency(toBreakEven)} more yearly profit before it flips. Below that, two salaries of ${formatCurrency(settings.bv_dga_salary)} plus ${formatCurrency(settings.bv_extra_annual_cost)} of extra costs eat the rate advantage.`
        : `Your profit sits above the band where a BV wins. The 12.7% mkb-winstvrijstelling has no ceiling, so at high profits the VOF pulls ahead again.`;

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
          sub={`Net for both partners · ${formatPercent(vof.effectiveRate)} tax`}
        />
        <StatCard
          label="As a BV"
          value={formatCurrency(current.bvNet)}
          sub={`Salary + dividend · ${formatPercent(bvFullPayout.effectiveRate)} tax`}
        />
        <StatCard
          label="Difference"
          value={`${favoursBv ? "+" : "−"}${formatCurrency(Math.abs(current.difference))}`}
          sub={favoursBv ? "In favour of a BV" : "In favour of the VOF"}
          tone={favoursBv ? "positive" : "warning"}
        />
      </div>

      <Verdict favoursBv={favoursBv} headline={headline} body={body} />

      <div className={`${CARD} space-y-4`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium text-neutral-300">
              Net income by legal form
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              What both partners keep together, across yearly profit levels
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 bg-[#e8ff47]" />
              <span className="text-neutral-400">VOF</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 bg-violet-400" />
              <span className="text-neutral-400">BV</span>
            </span>
            {range.from !== null && (
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-2.5 rounded-sm bg-violet-400/15 border border-violet-400/30" />
                <span className="text-neutral-400">BV ahead</span>
              </span>
            )}
          </div>
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
              <span className="font-mono text-violet-300">
                {formatCurrency(range.from)}
              </span>
              {range.to !== null && (
                <>
                  {" "}up to{" "}
                  <span className="font-mono text-violet-300">
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
                inBand ? "text-violet-300" : "text-neutral-500"
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
            <ToggleChip active={retainProfit} onClick={() => setRetainProfit((v) => !v)}>
              Keep profit in the BV
            </ToggleChip>
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
            Tax is only part of the decision. A BV also limits personal liability,
            makes it easier to bring in a shareholder or sell the business, and lets
            you park profit at {formatPercent(VPB_LOW_RATE, 0)} instead of paying box 1
            rates on it straight away.
          </p>
          <p>
            Against that: annual accounts, payroll administration, a mandatory salary
            even in a bad year, and the conversion itself. A tax-neutral conversion via
            a holding structure carries a continuation requirement of several years.
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
