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

/** Het platte percentage waarmee de salarispottax voorheen werd gereserveerd. */
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
  bunqYearTotalInclVat = null,
  incomeTaxSavingsBalance = null,
}: {
  deals: FinanceDeal[];
  opportunities: Opportunity[];
  settings: TaxSettings;
  onSettingsChange: (patch: Partial<TaxSettings>) => void;
  /** Bunq client revenue YTD incl. VAT; when set, drives realised / nu-reserveren. */
  bunqYearTotalInclVat?: number | null;
  /** Live balance on the Bunq IB / income-tax savings pot. */
  incomeTaxSavingsBalance?: number | null;
}) {
  const [includePipeline, setIncludePipeline] = useState(false);
  const year = new Date().getFullYear();
  const partnerNames = TASK_ASSIGNEES;
  const personal = settings.tax_personal ?? DEFAULT_PERSONAL;

  const revenue = useMemo(
    () =>
      buildYearRevenue(deals, opportunities, year, {
        realisedGrossInclVat: bunqYearTotalInclVat,
      }),
    [deals, opportunities, year, bunqYearTotalInclVat],
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

  // Platte 40%-regel blijft alleen tegen VOF-belasting aanleggen.
  // revenue.realised is al excl. btw (Bunq/deals komen incl. binnen).
  const vofReserveToDate = reserve.profitToDate * reserve.effectiveRate;
  const flatReserve = revenue.realised * FLAT_RESERVE_PCT;
  const flatDifference = flatReserve - vofReserveToDate;
  const ibPot = incomeTaxSavingsBalance ?? null;
  const ibGap =
    ibPot != null ? reserve.reserveToDate - ibPot : null;

  function updatePartner(index: number, patch: Partial<PartnerPersonalSettings>) {
    onSettingsChange({ tax_personal: patchPersonal(personal, index, patch) });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Nu nog te reserveren"
          value={formatCurrency(reserve.reserveToDate)}
          sub="Op echt ontvangen + salaris/WW − loonheffing − VA"
          tone="accent"
        />
        <StatCard
          label="Op IB-spaarrekening"
          value={ibPot != null ? formatCurrency(ibPot) : "—"}
          sub={
            ibPot != null
              ? "Live saldo Bunq-pot “IB”"
              : "Bunq IB-rekening niet gevonden"
          }
          tone={ibPot != null && ibPot > 0 ? "positive" : "default"}
        />
        <StatCard
          label={ibGap != null && ibGap > 0 ? "Nog te storten op IB" : "IB-dekking"}
          value={
            ibGap != null
              ? formatCurrency(Math.abs(ibGap))
              : formatCurrency(reserve.reserveToDate)
          }
          sub={
            ibGap == null
              ? "Zodra IB-saldo bekend is"
              : ibGap > 0
                ? "Te reserveren − wat er al op IB staat"
                : "IB staat hoger dan nodig tot nu toe"
          }
          tone={ibGap != null && ibGap > 0 ? "warning" : "positive"}
        />
        <StatCard
          label={`Nog te reserveren ${year}`}
          value={formatCurrency(reserve.reserveFullYear)}
          sub={`${formatCurrency(reserve.totalTaxDue)} verschuldigd − ${formatCurrency(reserve.totalCreditsAgainstTax)} al gedekt`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`${CARD} lg:col-span-2 space-y-4`}>
          <div>
            <h2 className="text-sm font-medium text-neutral-300">
              Van omzet naar belastbare winst
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              “Nu reserveren” hangt aan echt ontvangen geld. Commissiepartners
              (Escort, Comfortzone, Heatnest) tellen pas mee als ze op Bunq staan.
            </p>
          </div>

          <div>
            <AmountRow
              label="Al ontvangen"
              value={revenue.realised}
              hint={
                revenue.realisedFromBunq
                  ? `${revenue.monthsElapsed} van 12 maanden, excl. btw · Bunq gekoppeld aan deal/bedrijf`
                  : `${revenue.monthsElapsed} van 12 maanden, excl. btw · dealbetalingen`
              }
              tone="positive"
            />
            <AmountRow
              label="Nog open op vaste deals"
              value={revenue.contractedRemaining}
              hint="Betalingsschema + vaste retainers nog niet betaald (excl. commissie)"
            />
            {revenue.variableRemaining > 0 && (
              <AmountRow
                label="Commissie / variabel (niet zeker)"
                value={revenue.variableRemaining}
                hint="Escort, Comfortzone, Heatnest e.d. — niet meegenomen in de zekere pot"
                tone="muted"
              />
            )}
            <AmountRow
              label="Bevestigde omzet"
              value={revenue.realised + revenue.contractedRemaining}
              hint="Ontvangen + openstaand op vaste deals"
              emphasis
            />
            <AmountRow
              label="Gewogen kansen"
              value={revenue.pipelineRemaining}
              hint="Open kansen × winkans, rest van het jaar"
              tone={includePipeline ? "default" : "muted"}
            />
            <AmountRow
              label={
                includePipeline
                  ? `Verwachte omzet ${year} (deals + kansen)`
                  : `Verwachte omzet ${year} (bevestigde deals)`
              }
              value={reserve.projectedRevenue}
              emphasis
              tone="accent"
            />
            <AmountRow
              label="Geschatte bedrijfskosten"
              value={settings.tax_annual_costs}
              hint="Tools, verzekering, kantoor, accountant — excl. btw"
              tone="negative"
              negative
            />
            <AmountRow
              label={includePipeline ? "Winst (met kansen)" : "Winst (bevestigde deals)"}
              value={reserve.projectedProfit}
              emphasis
              tone="accent"
            />
            {!includePipeline && revenue.pipelineRemaining > 0 && (
              <AmountRow
                label="Winst als kansen ook landen"
                value={reserve.projectedProfitWithPipeline}
                hint={`${formatCurrency(revenue.pipelineRemaining)} gewogen kansen erbij`}
                tone="muted"
              />
            )}
          </div>

          <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-neutral-800">
            <div className="w-44">
              <NumberField
                label="Jaarlijkse kosten"
                prefix="€"
                step={500}
                value={settings.tax_annual_costs}
                onChange={(value) => onSettingsChange({ tax_annual_costs: value })}
              />
            </div>
            <div className="w-40">
              <NumberField
                label={`Aandeel ${partnerNames[0]}`}
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
              Inclusief kansen
            </ToggleChip>
            <ToggleChip
              active={settings.tax_urencriterium}
              onClick={() =>
                onSettingsChange({ tax_urencriterium: !settings.tax_urencriterium })
              }
            >
              {URENCRITERIUM_HOURS}+ uren
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
            Versus de platte 40%-regel
          </h2>
          <div>
            <AmountRow
              label="40% van ontvangen omzet (excl. btw)"
              value={flatReserve}
              hint="Bunq-bedragen zijn incl. btw — die 21% is er eerst afgehaald"
              tone="muted"
            />
            <AmountRow
              label="VOF-belasting op winst tot nu"
              value={vofReserveToDate}
              hint="Zonder salaris / WW — alleen firmapot"
              tone="accent"
            />
            <AmountRow
              label={flatDifference >= 0 ? "Te veel gereserveerd" : "Tekort"}
              value={Math.abs(flatDifference)}
              emphasis
              tone={flatDifference >= 0 ? "positive" : "negative"}
            />
          </div>
          <p className="text-xs leading-relaxed text-neutral-500">
            {flatDifference >= 0
              ? `De platte regel houdt ${formatCurrency(flatDifference)} meer vast dan alleen VOF-belasting. Salaris/WW staat in de partnerkaarten hieronder.`
              : `De platte regel laat je ${formatCurrency(-flatDifference)} tekortkomen op alleen VOF-belasting.`}
          </p>
          <Disclaimer>
            Bunq-inkomsten komen incl. btw binnen; de 40%-regel en de
            belastingberekening werken allebei op omzet/winst excl. btw.
          </Disclaimer>
        </div>
      </div>

      <div className={`${CARD} space-y-5`}>
        <div>
          <h2 className="text-sm font-medium text-neutral-300">
            Per partner — belastingpot heel jaar
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            VOF-aandeel + salaris + WW + overig box 1. Nog te reserveren = totale IB/Zvw −
            loonheffing − voorlopige aanslag. WW telt niet mee voor arbeidskorting;
            Zvw zelfstandigen alleen over het VOF-deel.
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
                    van VOF-winst
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
                    Pot tot nu toe: {formatCurrency(ytd?.stillToReserve ?? 0)}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] uppercase tracking-widest text-neutral-600 mb-2">
                    Inkomen ({year})
                  </p>
                  <AmountRow label="VOF-winstaandeel" value={partner.profitShare} />
                  <AmountRow label="Salaris (bruto)" value={partner.salary} tone="muted" />
                  <AmountRow label="WW (bruto)" value={partner.ww} tone="muted" />
                  {partner.other > 0 && (
                    <AmountRow label="Overig box 1" value={partner.other} tone="muted" />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label="Salaris tot nu"
                    prefix="€"
                    step={100}
                    value={p.salary_ytd}
                    onChange={(v) => updatePartner(index, { salary_ytd: v })}
                  />
                  <NumberField
                    label="Salaris rest jaar"
                    prefix="€"
                    step={100}
                    value={p.salary_rest}
                    onChange={(v) => updatePartner(index, { salary_rest: v })}
                  />
                  <NumberField
                    label="WW tot nu"
                    prefix="€"
                    step={100}
                    value={p.ww_ytd}
                    onChange={(v) => updatePartner(index, { ww_ytd: v })}
                  />
                  <NumberField
                    label="WW € / maand"
                    prefix="€"
                    step={50}
                    value={p.ww_monthly}
                    onChange={(v) => updatePartner(index, { ww_monthly: v })}
                  />
                  <NumberField
                    label="WW maanden resterend"
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
                    label="Overig tot nu (VSO e.d.)"
                    prefix="€"
                    step={100}
                    value={p.other_ytd}
                    onChange={(v) => updatePartner(index, { other_ytd: v })}
                  />
                  <NumberField
                    label="Overig rest jaar"
                    prefix="€"
                    step={100}
                    value={p.other_rest}
                    onChange={(v) => updatePartner(index, { other_rest: v })}
                  />
                  <NumberField
                    label="Loonheffing tot nu"
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
                    label="Voorlopige aanslag betaald"
                    prefix="€"
                    step={100}
                    value={p.provisional_paid}
                    onChange={(v) => updatePartner(index, { provisional_paid: v })}
                  />
                </div>

                <div className="border-t border-neutral-800 pt-3">
                  <p className="text-[10px] uppercase tracking-widest text-neutral-600 mb-2">
                    Belastingopbouw
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
                    label="Belastbaar box 1"
                    value={partner.taxableBox1}
                    hint="Salaris + WW + overig + VOF na aftrek"
                    emphasis
                  />
                  <AmountRow
                    label="Box 1 vóór kortingen"
                    value={partner.grossTax}
                    tone="muted"
                  />
                  {partner.deductionRateAdjustment > 0 && (
                    <AmountRow
                      label="Tariefbeperking aftrek"
                      value={partner.deductionRateAdjustment}
                      hint="Aftrek telt tegen 37,56%, niet tegen het toptarief 49,5%"
                      tone="muted"
                    />
                  )}
                  <AmountRow
                    label="Heffingskortingen"
                    value={partner.totalCredits}
                    hint="AHK over heel box 1 · arbeidskorting over salaris + VOF (niet WW)"
                    tone="positive"
                    negative
                  />
                  <AmountRow label="Inkomstenbelasting" value={partner.incomeTax} tone="negative" />
                  <AmountRow
                    label="Zvw (zelfstandigen)"
                    value={partner.zvw}
                    hint="4,85% alleen over belastbare VOF-winst"
                    tone="negative"
                  />
                  <AmountRow
                    label="Totale belasting"
                    value={partner.totalDue}
                    emphasis
                    tone="accent"
                  />
                  <AmountRow
                    label="Al ingehouden"
                    value={partner.withheld}
                    tone="positive"
                    negative
                  />
                  <AmountRow
                    label="VA al betaald"
                    value={partner.provisionalPaid}
                    tone="positive"
                    negative
                  />
                  <AmountRow
                    label="Nog te reserveren"
                    value={partner.stillToReserve}
                    emphasis
                    tone="accent"
                  />
                </div>

                <div className="flex items-center justify-between pt-1 text-xs text-neutral-500">
                  <span>Effectief {formatPercent(partner.effectiveRate)}</span>
                  <span>Volgende VOF-euro @ {formatPercent(partner.marginalRate)}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2.5 text-xs text-neutral-500 bg-neutral-950/60 border border-neutral-800 rounded-lg p-3.5">
          <Info className="w-4 h-4 shrink-0 mt-px text-neutral-600" />
          <div className="space-y-1.5 leading-relaxed">
            <p>
              Cijfers gebruiken tarieven {TAX_YEAR} (onder AOW-leeftijd). Ontvangen
              omzet komt uit Bunq-betalingen die aan een deal of bedrijf hangen.
              Vul salaris, WW en loonheffing in vanuit je loonstroken / UWV. Dit is
              een reserveringsinschatting, geen aangifte.
            </p>
            <p>
              Variabele commissie telt pas mee zodra het binnenkomt. De hoogte van
              je WW versus het urencriterium valt buiten deze module.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
