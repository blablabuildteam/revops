"use client";

import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { MKB_WINSTVRIJSTELLING, URENCRITERIUM_HOURS, TAX_YEAR } from "@/lib/dutch-tax";
import { buildTaxReserve, buildYearRevenue } from "@/lib/tax-projection";
import {
  defaultPartnerPersonal,
  type PartnerPersonalSettings,
  type TaxSettings,
} from "@/lib/tax-settings";
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
const DEFAULT_PERSONAL = TASK_ASSIGNEES.map(() => defaultPartnerPersonal());

function patchPersonal(
  list: PartnerPersonalSettings[],
  index: number,
  patch: Partial<PartnerPersonalSettings>,
): PartnerPersonalSettings[] {
  const next = TASK_ASSIGNEES.map((_, i) => ({
    ...(list[i] ?? defaultPartnerPersonal()),
  }));
  next[index] = { ...next[index], ...patch };
  return next;
}

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
  const personal = settings.tax_personal ?? DEFAULT_PERSONAL;

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
        personal,
      }),
    [revenue, settings, includePipeline, partnerNames.length, personal],
  );

  // Flat 40% rule still compares against VOF profit tax only.
  const vofReserveToDate = reserve.profitToDate * reserve.effectiveRate;
  const flatReserve = revenue.realised * FLAT_RESERVE_PCT;
  const flatDifference = flatReserve - vofReserveToDate;

  function updatePartner(index: number, patch: Partial<PartnerPersonalSettings>) {
    onSettingsChange({ tax_personal: patchPersonal(personal, index, patch) });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Still to reserve now"
          value={formatCurrency(reserve.reserveToDate)}
          sub={`YTD tax − withheld − VA · both partners`}
          tone="accent"
        />
        <StatCard
          label={`Still to reserve ${year}`}
          value={formatCurrency(reserve.reserveFullYear)}
          sub={`${formatCurrency(reserve.totalTaxDue)} due − ${formatCurrency(reserve.totalCreditsAgainstTax)} already covered`}
        />
        <StatCard
          label="Total tax due"
          value={formatCurrency(reserve.totalTaxDue)}
          sub="IB + Zvw on VOF + salary + WW"
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
              label="VOF tax on profit so far"
              value={vofReserveToDate}
              hint="Ignores salary / WW — firm pot only"
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
              ? `The flat rule holds back ${formatCurrency(flatDifference)} more than VOF tax alone. Personal salary/WW is handled in the partner cards below.`
              : `The flat rule leaves you ${formatCurrency(-flatDifference)} short on VOF tax alone.`}
          </p>
          <Disclaimer>
            The 40% is applied to revenue including VAT, while tax is due on profit
            excluding VAT. The two only line up by coincidence.
          </Disclaimer>
        </div>
      </div>

      <div className={`${CARD} space-y-5`}>
        <div>
          <h2 className="text-sm font-medium text-neutral-300">
            Per partner — whole-year tax pot
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            VOF share + salary + WW + other box 1. Still to reserve = total IB/Zvw −
            loonheffing − voorlopige aanslag. WW does not count for arbeidskorting;
            Zvw zelfstandigen only on the VOF slice.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {reserve.personalFullYear.map((partner, index) => {
            const p = personal[index] ?? defaultPartnerPersonal();
            const ytd = reserve.personalYtd[index];
            const name = partnerNames[index] ?? `Partner ${index + 1}`;

            return (
              <div
                key={name}
                className="border border-neutral-800 rounded-lg p-4 bg-neutral-950/40 space-y-4"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-medium text-neutral-200">{name}</h3>
                  <span className="text-xs text-neutral-500 font-mono">
                    {formatPercent(
                      reserve.projectedProfit > 0
                        ? partner.profitShare / reserve.projectedProfit
                        : 0,
                      0,
                    )}{" "}
                    of VOF profit
                  </span>
                </div>

                <div className="rounded-md border border-[#d4e052]/20 bg-[#d4e052]/5 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-widest text-neutral-500 mb-0.5">
                    Nog te reserveren ({year})
                  </p>
                  <p className="text-xl font-mono font-semibold tabular-nums text-[#d4e052]">
                    {formatCurrency(partner.stillToReserve)}
                  </p>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    YTD pot: {formatCurrency(ytd?.stillToReserve ?? 0)}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] uppercase tracking-widest text-neutral-600 mb-2">
                    Income ({year})
                  </p>
                  <AmountRow label="VOF profit share" value={partner.profitShare} />
                  <AmountRow label="Salary (gross)" value={partner.salary} tone="muted" />
                  <AmountRow label="WW (gross)" value={partner.ww} tone="muted" />
                  {partner.other > 0 && (
                    <AmountRow label="Other box 1" value={partner.other} tone="muted" />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label="Salary YTD"
                    prefix="€"
                    step={100}
                    value={p.salary_ytd}
                    onChange={(v) => updatePartner(index, { salary_ytd: v })}
                  />
                  <NumberField
                    label="Salary rest of year"
                    prefix="€"
                    step={100}
                    value={p.salary_rest}
                    onChange={(v) => updatePartner(index, { salary_rest: v })}
                  />
                  <NumberField
                    label="WW YTD"
                    prefix="€"
                    step={100}
                    value={p.ww_ytd}
                    onChange={(v) => updatePartner(index, { ww_ytd: v })}
                  />
                  <NumberField
                    label="WW € / month"
                    prefix="€"
                    step={50}
                    value={p.ww_monthly}
                    onChange={(v) => updatePartner(index, { ww_monthly: v })}
                  />
                  <NumberField
                    label="WW months left"
                    step={1}
                    min={0}
                    max={12}
                    value={p.ww_months_rest}
                    onChange={(v) =>
                      updatePartner(index, {
                        ww_months_rest: Math.min(12, Math.max(0, Math.round(v))),
                      })
                    }
                  />
                  <NumberField
                    label="Other YTD (VSO e.d.)"
                    prefix="€"
                    step={100}
                    value={p.other_ytd}
                    onChange={(v) => updatePartner(index, { other_ytd: v })}
                  />
                  <NumberField
                    label="Other rest"
                    prefix="€"
                    step={100}
                    value={p.other_rest}
                    onChange={(v) => updatePartner(index, { other_rest: v })}
                  />
                  <NumberField
                    label="Loonheffing YTD"
                    prefix="€"
                    step={50}
                    value={p.withheld_ytd}
                    onChange={(v) => updatePartner(index, { withheld_ytd: v })}
                    hint="Werkgever + UWV"
                  />
                  <NumberField
                    label="Loonheffing rest"
                    prefix="€"
                    step={50}
                    value={p.withheld_rest}
                    onChange={(v) => updatePartner(index, { withheld_rest: v })}
                  />
                  <NumberField
                    label="Voorlopige aanslag paid"
                    prefix="€"
                    step={100}
                    value={p.provisional_paid}
                    onChange={(v) => updatePartner(index, { provisional_paid: v })}
                  />
                </div>

                <div className="border-t border-neutral-800 pt-3">
                  <p className="text-[10px] uppercase tracking-widest text-neutral-600 mb-2">
                    Tax breakdown
                  </p>
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
                  <AmountRow
                    label="Taxable box 1"
                    value={partner.taxableBox1}
                    hint="Salary + WW + other + VOF after deductions"
                    emphasis
                  />
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
                    hint="AHK on total box 1 · arbeidskorting on salary + VOF (not WW)"
                    tone="positive"
                    negative
                  />
                  <AmountRow label="Income tax" value={partner.incomeTax} tone="negative" />
                  <AmountRow
                    label="Zvw (zelfstandigen)"
                    value={partner.zvw}
                    hint="4.85% of VOF taxable profit only"
                    tone="negative"
                  />
                  <AmountRow
                    label="Total tax due"
                    value={partner.totalDue}
                    emphasis
                    tone="accent"
                  />
                  <AmountRow
                    label="Already withheld"
                    value={partner.withheld}
                    tone="positive"
                    negative
                  />
                  <AmountRow
                    label="VA already paid"
                    value={partner.provisionalPaid}
                    tone="positive"
                    negative
                  />
                  <AmountRow
                    label="Still to reserve"
                    value={partner.stillToReserve}
                    emphasis
                    tone="accent"
                  />
                </div>

                <div className="flex items-center justify-between pt-1 text-xs text-neutral-500">
                  <span>Effective {formatPercent(partner.effectiveRate)}</span>
                  <span>Next VOF euro @ {formatPercent(partner.marginalRate)}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2.5 text-xs text-neutral-500 bg-neutral-950/60 border border-neutral-800 rounded-lg p-3.5">
          <Info className="w-4 h-4 shrink-0 mt-px text-neutral-600" />
          <div className="space-y-1.5 leading-relaxed">
            <p>
              Figures use {TAX_YEAR} rates below AOW age. Fill salary, WW and
              loonheffing from your payslips / UWV statements — the VOF profit comes
              from deals automatically. This is a reserve estimate, not a tax return.
            </p>
            <p>
              WW height vs urencriterium is out of scope here; this module only
              answers how much tax is due and how much is still left to set aside.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
