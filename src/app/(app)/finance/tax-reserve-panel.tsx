"use client";

import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { MKB_WINSTVRIJSTELLING, URENCRITERIUM_HOURS, TAX_YEAR } from "@/lib/dutch-tax";
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

/** The flat percentage the salary pot model reserves for tax. */
const FLAT_RESERVE_PCT = 0.4;

export function TaxReservePanel({
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
  const [includePipeline, setIncludePipeline] = useState(false);
  const year = new Date().getFullYear();
  const partnerNames = TASK_ASSIGNEES;

  const revenue = useMemo(
    () => buildYearRevenue(deals, opportunities, year),
    [deals, opportunities, year],
  );

  const reserve = useMemo(
    () =>
      buildTaxReserve(revenue, {
        annualCosts: settings.tax_annual_costs,
        firstPartnerSharePct: settings.tax_profit_split,
        partners: partnerNames.length,
        includePipeline,
        urencriterium: settings.tax_urencriterium,
        startersaftrek: settings.tax_startersaftrek,
      }),
    [revenue, settings, includePipeline, partnerNames.length],
  );

  const flatReserve = revenue.realised * FLAT_RESERVE_PCT;
  const flatDifference = flatReserve - reserve.reserveToDate;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Set aside by now"
          value={formatCurrency(reserve.reserveToDate)}
          sub={`On ${formatCurrency(reserve.profitToDate)} profit earned in ${year}`}
          tone="accent"
        />
        <StatCard
          label={`Full ${year} estimate`}
          value={formatCurrency(reserve.reserveFullYear)}
          sub="Income tax + Zvw, both partners"
        />
        <StatCard
          label="Effective rate"
          value={formatPercent(reserve.effectiveRate)}
          sub={`${formatPercent(reserve.projected.partners[0]?.marginalRate ?? 0)} on the next euro`}
        />
        <StatCard
          label="Per month"
          value={formatCurrency(reserve.monthlyReserve)}
          sub="To stay on track for the year"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`${CARD} lg:col-span-2 space-y-4`}>
          <div>
            <h2 className="text-sm font-medium text-neutral-300">
              From revenue to taxable profit
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Deal amounts include VAT, so 21% is stripped first — VAT is never profit.
            </p>
          </div>

          <div>
            <AmountRow
              label="Received so far"
              value={revenue.realised}
              hint={`${revenue.monthsElapsed} of 12 months, excl. VAT · from Bunq / deal payments`}
              tone="positive"
            />
            <AmountRow
              label="Still due on confirmed deals"
              value={revenue.contractedRemaining}
              hint="Payment schedule + retainers not yet paid (incl. overdue)"
            />
            <AmountRow
              label="Confirmed revenue"
              value={revenue.realised + revenue.contractedRemaining}
              hint="Received + outstanding on signed deals"
              emphasis
            />
            <AmountRow
              label="Weighted kansen (pipeline)"
              value={revenue.pipelineRemaining}
              hint="Open opportunities × win probability, rest of year"
              tone={includePipeline ? "default" : "muted"}
            />
            <AmountRow
              label={
                includePipeline
                  ? `Projected ${year} revenue (deals + kansen)`
                  : `Projected ${year} revenue (confirmed deals)`
              }
              value={reserve.projectedRevenue}
              emphasis
              tone="accent"
            />
            <AmountRow
              label="Estimated business costs"
              value={settings.tax_annual_costs}
              hint="Tools, insurance, office, accountant — excl. VAT"
              tone="negative"
              negative
            />
            <AmountRow
              label={includePipeline ? "Profit (with kansen)" : "Profit (confirmed deals)"}
              value={reserve.projectedProfit}
              emphasis
              tone="accent"
            />
            {!includePipeline && revenue.pipelineRemaining > 0 && (
              <AmountRow
                label="Profit if pipeline also lands"
                value={reserve.projectedProfitWithPipeline}
                hint={`${formatCurrency(revenue.pipelineRemaining)} weighted kansen on top`}
                tone="muted"
              />
            )}
          </div>

          <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-neutral-800">
            <div className="w-44">
              <NumberField
                label="Yearly costs"
                prefix="€"
                step={500}
                value={settings.tax_annual_costs}
                onChange={(value) => onSettingsChange({ tax_annual_costs: value })}
              />
            </div>
            <div className="w-40">
              <NumberField
                label={`${partnerNames[0]}'s share`}
                suffix="%"
                step={5}
                min={0}
                max={100}
                value={settings.tax_profit_split}
                onChange={(value) =>
                  onSettingsChange({
                    tax_profit_split: Math.min(100, Math.max(0, value)),
                  })
                }
              />
            </div>
            <ToggleChip
              active={includePipeline}
              onClick={() => setIncludePipeline((v) => !v)}
            >
              Include kansen
            </ToggleChip>
            <ToggleChip
              active={settings.tax_urencriterium}
              onClick={() =>
                onSettingsChange({ tax_urencriterium: !settings.tax_urencriterium })
              }
            >
              {URENCRITERIUM_HOURS}+ hours
            </ToggleChip>
            <ToggleChip
              active={settings.tax_startersaftrek}
              onClick={() =>
                onSettingsChange({ tax_startersaftrek: !settings.tax_startersaftrek })
              }
            >
              Startersaftrek
            </ToggleChip>
          </div>
        </div>

        <div className={`${CARD} space-y-4`}>
          <h2 className="text-sm font-medium text-neutral-300">
            Versus the flat 40% rule
          </h2>
          <div>
            <AmountRow label="40% of revenue received" value={flatReserve} tone="muted" />
            <AmountRow
              label="Actually owed on that profit"
              value={reserve.reserveToDate}
              tone="accent"
            />
            <AmountRow
              label={flatDifference >= 0 ? "Over-reserved" : "Short"}
              value={Math.abs(flatDifference)}
              emphasis
              tone={flatDifference >= 0 ? "positive" : "negative"}
            />
          </div>
          <p className="text-xs leading-relaxed text-neutral-500">
            {flatDifference >= 0
              ? `The flat rule holds back ${formatCurrency(flatDifference)} more than the tax office will ask. That is a safe buffer, but it is money you could be paying yourselves.`
              : `The flat rule leaves you ${formatCurrency(-flatDifference)} short. Raise the reserve percentage or set the difference aside separately.`}
          </p>
          <Disclaimer>
            The 40% is applied to revenue including VAT, while tax is due on profit
            excluding VAT. The two only line up by coincidence.
          </Disclaimer>
        </div>
      </div>

      <div className={`${CARD} space-y-5`}>
        <div>
          <h2 className="text-sm font-medium text-neutral-300">Per partner</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Each partner in a VOF is taxed individually in box 1, so the brackets and
            credits run per person rather than over the firm.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {reserve.projected.partners.map((partner, index) => (
            <div
              key={partnerNames[index] ?? index}
              className="border border-neutral-800 rounded-lg p-4 bg-neutral-950/40"
            >
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-sm font-medium text-neutral-200">
                  {partnerNames[index] ?? `Partner ${index + 1}`}
                </h3>
                <span className="text-xs text-neutral-500 font-mono">
                  {formatPercent(
                    reserve.projectedProfit > 0
                      ? partner.profitShare / reserve.projectedProfit
                      : 0,
                    0,
                  )}{" "}
                  of profit
                </span>
              </div>

              <AmountRow label="Profit share" value={partner.profitShare} />
              {partner.zelfstandigenaftrek > 0 && (
                <AmountRow
                  label="Zelfstandigenaftrek"
                  value={partner.zelfstandigenaftrek}
                  tone="muted"
                  negative
                />
              )}
              {partner.startersaftrek > 0 && (
                <AmountRow
                  label="Startersaftrek"
                  value={partner.startersaftrek}
                  tone="muted"
                  negative
                />
              )}
              <AmountRow
                label={`MKB-winstvrijstelling (${(MKB_WINSTVRIJSTELLING * 100).toFixed(1)}%)`}
                value={partner.mkbVrijstelling}
                tone="muted"
                negative
              />
              <AmountRow label="Taxable profit" value={partner.taxableProfit} emphasis />
              <AmountRow label="Box 1 before credits" value={partner.grossTax} tone="muted" />
              {partner.deductionRateAdjustment > 0 && (
                <AmountRow
                  label="Deduction rate cap"
                  value={partner.deductionRateAdjustment}
                  hint="Deductions only count at 37.56%, not at the 49.5% top rate"
                  tone="muted"
                />
              )}
              <AmountRow
                label="Tax credits"
                value={partner.totalCredits}
                hint="Algemene heffingskorting + arbeidskorting"
                tone="positive"
                negative
              />
              <AmountRow label="Income tax" value={partner.incomeTax} tone="negative" />
              <AmountRow
                label="Zvw contribution"
                value={partner.zvw}
                hint="4.85% of taxable profit, capped at €79,409"
                tone="negative"
              />
              <AmountRow
                label="Total to reserve"
                value={partner.totalDue}
                emphasis
                tone="accent"
              />
              <AmountRow label="Net for this partner" value={partner.netIncome} tone="positive" />

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-neutral-800 text-xs text-neutral-500">
                <span>Effective {formatPercent(partner.effectiveRate)}</span>
                <span>Next euro taxed at {formatPercent(partner.marginalRate)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2.5 text-xs text-neutral-500 bg-neutral-950/60 border border-neutral-800 rounded-lg p-3.5">
          <Info className="w-4 h-4 shrink-0 mt-px text-neutral-600" />
          <div className="space-y-1.5 leading-relaxed">
            <p>
              Figures use {TAX_YEAR} rates for partners below AOW age, with no other
              income, mortgage interest or partner deductions. Your own return will
              differ — treat this as the amount to park in a savings account, not as
              the assessment itself.
            </p>
            <p>
              The Belastingdienst collects most of this through a voorlopige aanslag
              during the year. Anything already paid can come off the reserve above.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
