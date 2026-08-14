"use client";

export const dynamic = "force-dynamic";

import dynamicImport from "next/dynamic";
import { useState, useCallback, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { formatCurrency, toDateInputValue } from "@/lib/format";
import { DealActivationWizard } from "@/components/deal-activation-wizard";
import { VatAmountPair } from "@/components/vat-amount-pair";
import { removeVat } from "@/lib/vat";
import { updateFinanceDeal, updateTaxSettings } from "@/lib/api";
import { useUndoToast } from "@/components/mutation-provider";
import {
  useBunqPots,
  useBunqTotals,
  useFinanceDeals,
  useFinanceSummary,
  useOpportunities,
  useTaxSettings,
} from "@/hooks/use-api-data";
import { DEFAULT_TAX_SETTINGS, type TaxSettings } from "@/lib/tax-settings";
import { buildTaxReserve, buildYearRevenue } from "@/lib/tax-projection";
import {
  DEAL_TYPE_LABELS,
  DealType,
  DealPaymentEntry,
  FinanceDeal,
  PaymentScheduleEntry,
  TASK_ASSIGNEES,
  dealContractValue,
  dealFixedOutstanding,
  dealOutstanding,
  sumDealPayments,
  monthlyInsights,
  buildInsightSeries,
  expectedRevenueBreakdownForMonth,
  actualRevenueBreakdownForMonth,
  type RevenueBreakdownItem,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const FinanceOutlookChart = dynamicImport(
  () =>
    import("./finance-outlook-chart").then((m) => m.FinanceOutlookChart),
  {
    ssr: false,
    loading: () => (
      <div className="lg:col-span-3 h-[320px] border border-neutral-800 rounded-lg bg-neutral-900/40 animate-pulse" />
    ),
  }
);

const TaxReservePanel = dynamicImport(
  () => import("./tax-reserve-panel").then((m) => m.TaxReservePanel),
  {
    ssr: false,
    loading: () => (
      <div className="h-96 border border-neutral-800 rounded-lg bg-neutral-900/40 animate-pulse" />
    ),
  }
);

const BvCheckPanel = dynamicImport(
  () => import("./bv-check-panel").then((m) => m.BvCheckPanel),
  {
    ssr: false,
    loading: () => (
      <div className="h-96 border border-neutral-800 rounded-lg bg-neutral-900/40 animate-pulse" />
    ),
  }
);

const BunqPanel = dynamicImport(
  () => import("./bunq-panel").then((m) => m.BunqPanel),
  {
    ssr: false,
    loading: () => (
      <div className="h-96 border border-neutral-800 rounded-lg bg-neutral-900/40 animate-pulse" />
    ),
  }
);

const TABS = [
  { id: "overview", label: "Overview", sub: "Wat binnenkwam, wat openstaat, hoe je het verdeelt" },
  { id: "bunq", label: "Bunq", sub: "Bankinkomsten vanaf jan 2026 → koppelen aan deals" },
  { id: "tax", label: "Belastingreserve", sub: "IB-pot, VOF + salaris/WW → wat je nog moet reserveren" },
  { id: "bv", label: "BV check", sub: "Holding + personal holdings vs VOF blijven" },
] as const;

/** Operational cash split on received revenue excl. VAT. */
const SALARY_SPLIT = 0.5;
const IB_SPLIT = 0.4;
const COMPANY_SPLIT = 0.1;

type TabId = (typeof TABS)[number]["id"];

interface Summary {
  month: string;
  totalRevenue: number;
  splits: { salaryPot: number; taxReserve: number; companyReserve: number };
  salaryTarget: number;
  withdrawnThisMonth: number;
  canPaySalary: boolean;
  shortfall: number;
  surplus: number;
  potBalance: number;
  settings: { salaryPct: number; taxPct: number; reservePct: number; salaryPerPerson: number; founders: number };
  history: { month: string; revenue: string }[];
  pipeline: { stage: string; expected_value: string; probability: number; weighted_value: string; close_date: string }[];
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" })
    .format(new Date(Number(y), Number(m) - 1, 1));
}

function addMonths(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatDate(date?: string) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

const fc = "h-10 bg-neutral-800 border-neutral-700 text-neutral-100 text-sm";

function BreakdownItems({
  breakdown,
  amountClassName,
  onDealClick,
}: {
  breakdown: RevenueBreakdownItem[];
  amountClassName: string;
  onDealClick?: (dealId: string) => void;
}) {
  return (
    <ul className="space-y-1.5">
      {breakdown.map((item) => {
        const content = (
          <>
            <div className="min-w-0">
              <p className="text-neutral-200 truncate">{item.projectName}</p>
              <p className="text-[10px] text-neutral-500 truncate">
                {item.companyName} · {item.label}
              </p>
            </div>
            <span className={cn("font-mono shrink-0", amountClassName)}>
              {formatCurrency(item.amount)}
            </span>
          </>
        );

        return (
          <li key={item.dealId}>
            {onDealClick ? (
              <button
                type="button"
                onClick={() => onDealClick(item.dealId)}
                className="flex w-full items-start justify-between gap-3 rounded px-1 py-0.5 -mx-1 text-left hover:bg-neutral-800/80 transition-colors"
              >
                {content}
              </button>
            ) : (
              <div className="flex items-start justify-between gap-3">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function RevenueBreakdownTooltip({
  amount,
  amountClassName,
  breakdown,
  emptyMessage,
  onDealClick,
}: {
  amount: number;
  amountClassName: string;
  breakdown: RevenueBreakdownItem[];
  emptyMessage: string;
  onDealClick?: (dealId: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        className={cn(
          "text-sm font-mono font-semibold cursor-help underline decoration-dotted decoration-neutral-600 underline-offset-2",
          amountClassName,
        )}
      >
        {formatCurrency(amount)}
      </span>
      {hovered && (
        <div className="absolute right-0 top-full z-50 w-64 pt-2">
          <div className="rounded-lg border border-neutral-700 bg-neutral-950 p-3 text-xs shadow-xl shadow-black/40">
            <p className="font-medium text-neutral-300 mb-2">Breakdown by project</p>
            {breakdown.length === 0 ? (
              <p className="text-neutral-500">{emptyMessage}</p>
            ) : (
              <BreakdownItems
                breakdown={breakdown}
                amountClassName={amountClassName}
                onDealClick={onDealClick}
              />
            )}
            <div className="mt-2 pt-2 border-t border-neutral-800 flex items-center justify-between">
              <span className="text-neutral-500">Total</span>
              <span className="font-mono font-medium text-neutral-200">
                {formatCurrency(amount)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FinancePage() {
  const month = currentMonth();
  const { data: summary, isLoading: summaryLoading, mutate: mutateSummary } =
    useFinanceSummary<Summary>(month);
  const { data: deals = [], isLoading: dealsLoading, mutate: mutateDeals } = useFinanceDeals();
  const { data: opportunities = [], isLoading: oppsLoading } = useOpportunities();
  const { data: bunqTotals } = useBunqTotals();
  const { data: bunqPots } = useBunqPots();
  const loading =
    (summaryLoading && !summary) ||
    (dealsLoading && deals.length === 0) ||
    (oppsLoading && opportunities.length === 0);
  const [selectedDeal, setSelectedDeal] = useState<FinanceDeal | null>(null);
  const [editForm, setEditForm] = useState<Partial<FinanceDeal>>({});
  const [savingDeal, setSavingDeal] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [manualDealOpen, setManualDealOpen] = useState(false);
  const [insightsMonth, setInsightsMonth] = useState(currentMonth);
  const [tab, setTab] = useState<TabId>("overview");
  const withUndo = useUndoToast();

  const { data: savedTaxSettings } = useTaxSettings();
  const [taxOverrides, setTaxOverrides] = useState<Partial<TaxSettings>>({});
  const taxSettings: TaxSettings = {
    ...DEFAULT_TAX_SETTINGS,
    ...savedTaxSettings,
    ...taxOverrides,
  };

  // Keep the panels responsive while the save round-trips in the background.
  const handleTaxSettingsChange = useCallback((patch: Partial<TaxSettings>) => {
    setTaxOverrides((prev) => ({ ...prev, ...patch }));
    void updateTaxSettings(patch).catch((err) => console.error(err));
  }, []);

  const load = useCallback(async () => {
    await Promise.all([mutateSummary(), mutateDeals()]);
  }, [mutateSummary, mutateDeals]);

  function openDeal(deal: FinanceDeal) {
    setSelectedDeal(deal);
    setSaveError(null);
    const payments = deal.payments?.length
      ? deal.payments
      : deal.amount_paid > 0
        ? [{ date: "", amount: deal.amount_paid }]
        : [];

    setEditForm({
      company_name: deal.company_name,
      project_name: deal.project_name,
      deal_type: deal.deal_type,
      total_deal_value: deal.total_deal_value,
      start_date: toDateInputValue(deal.start_date),
      end_date: toDateInputValue(deal.end_date),
      monthly_fee: deal.monthly_fee,
      monthly_revshare: deal.monthly_revshare,
      amount_paid: deal.amount_paid ?? 0,
      payments,
      payment_schedule: deal.payment_schedule ?? [],
    });
  }

  const handleDealBreakdownClick = useCallback((dealId: string) => {
    const deal = deals.find((entry) => entry.id === dealId);
    if (deal) openDeal(deal);
  }, [deals]);

  function updatePayment(index: number, field: keyof DealPaymentEntry, value: string) {
    setEditForm((f) => ({
      ...f,
      payments: (f.payments ?? []).map((entry, i) =>
        i === index
          ? {
              ...entry,
              [field]: field === "amount" ? (parseFloat(value) || 0) : value,
            }
          : entry
      ),
    }));
  }

  function addPayment() {
    setEditForm((f) => ({
      ...f,
      payments: [...(f.payments ?? []), { date: "", amount: 0 }],
    }));
  }

  function removePayment(index: number) {
    setEditForm((f) => ({
      ...f,
      payments: (f.payments ?? []).filter((_, i) => i !== index),
    }));
  }

  function updateSchedule(index: number, field: keyof PaymentScheduleEntry, value: string) {
    setEditForm((f) => ({
      ...f,
      payment_schedule: (f.payment_schedule ?? []).map((entry, i) =>
        i === index
          ? {
              ...entry,
              [field]: field === "percentage" ? Number(value) || 0 : value,
            }
          : entry
      ),
    }));
  }

  function addScheduleRow() {
    setEditForm((f) => ({
      ...f,
      payment_schedule: [...(f.payment_schedule ?? []), { month: "", percentage: 0 }],
    }));
  }

  function removeScheduleRow(index: number) {
    setEditForm((f) => ({
      ...f,
      payment_schedule: (f.payment_schedule ?? []).filter((_, i) => i !== index),
    }));
  }

  async function saveDeal() {
    if (!selectedDeal) return;
    setSavingDeal(true);
    setSaveError(null);
    const snapshot = { ...selectedDeal };
    try {
      const payments = (editForm.payments ?? []).filter((p) => p.amount > 0);
      await withUndo({
        label: "Updated",
        run: async () => {
          await updateFinanceDeal(selectedDeal.id, {
            company_name: editForm.company_name,
            project_name: editForm.project_name,
            deal_type: editForm.deal_type,
            total_deal_value: editForm.total_deal_value,
            monthly_fee: editForm.monthly_fee,
            monthly_revshare: editForm.monthly_revshare,
            payment_schedule: editForm.payment_schedule ?? [],
            payments,
            start_date: editForm.start_date || null,
            end_date: editForm.end_date || null,
          });
          await mutateDeals();
          setSelectedDeal(null);
        },
        undo: async () => {
          await updateFinanceDeal(selectedDeal.id, {
            company_name: snapshot.company_name,
            project_name: snapshot.project_name,
            deal_type: snapshot.deal_type,
            total_deal_value: snapshot.total_deal_value,
            monthly_fee: snapshot.monthly_fee,
            monthly_revshare: snapshot.monthly_revshare,
            payment_schedule: snapshot.payment_schedule ?? [],
            payments: snapshot.payments ?? [],
            start_date: snapshot.start_date || null,
            end_date: snapshot.end_date || null,
          });
          await mutateDeals();
        },
      });
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Failed to save deal");
    } finally {
      setSavingDeal(false);
    }
  }

  const maxHistory = summary?.history.length
    ? Math.max(...summary.history.map((h) => Number(h.revenue)))
    : 1;

  const insights = monthlyInsights(deals, insightsMonth);
  const expectedBreakdown = useMemo(
    () => expectedRevenueBreakdownForMonth(deals, insightsMonth),
    [deals, insightsMonth],
  );
  const actualBreakdown = useMemo(
    () => actualRevenueBreakdownForMonth(deals, insightsMonth),
    [deals, insightsMonth],
  );
  const insightSeries = buildInsightSeries(deals, opportunities, month, 12);

  const cashPosition = useMemo(() => {
    const year = new Date().getFullYear();
    const outstandingIncl = deals.reduce((sum, d) => sum + dealFixedOutstanding(d), 0);
    const outstandingExcl = removeVat(outstandingIncl);
    const dealPaymentsYtd = deals.reduce((sum, d) => {
      const payments = Array.isArray(d.payments) ? d.payments : [];
      return (
        sum +
        payments.reduce((s, p) => {
          if (!p?.date || !String(p.date).startsWith(String(year))) return s;
          return s + (Number(p.amount) || 0);
        }, 0)
      );
    }, 0);
    // Same universe as Bunq tab “Received” (all client revenue, incl. VAT).
    const receivedIncl =
      bunqTotals != null ? Number(bunqTotals.yearTotal) || 0 : dealPaymentsYtd;
    const receivedExcl = removeVat(receivedIncl);
    const linkedIncl = Number(bunqTotals?.linkedYearTotal) || 0;
    const unmatchedIncl = Number(bunqTotals?.unmatchedYearTotal) || 0;
    const salaryTarget = receivedExcl * SALARY_SPLIT;
    const ibRuleTarget = receivedExcl * IB_SPLIT;
    const companyTarget = receivedExcl * COMPANY_SPLIT;
    const salaryPotBalance = bunqPots?.salary?.balance ?? null;
    const ibPotBalance = bunqPots?.incomeTax?.balance ?? null;

    const revenue = buildYearRevenue(deals, opportunities, year, {
      realisedGrossInclVat: bunqTotals != null ? receivedIncl : null,
    });
    const reserve = buildTaxReserve(revenue, {
      annualCosts: taxSettings.tax_annual_costs,
      firstPartnerSharePct: taxSettings.tax_profit_split,
      partners: TASK_ASSIGNEES.length,
      includePipeline: false,
      urencriterium: taxSettings.tax_urencriterium,
      startersaftrek: taxSettings.tax_startersaftrek,
      personal: taxSettings.tax_personal,
    });

    return {
      outstanding: outstandingExcl,
      outstandingIncl,
      receivedIncl,
      receivedExcl,
      linkedIncl,
      unmatchedIncl,
      receivedFromBunq: bunqTotals != null,
      salaryTarget,
      ibRuleTarget,
      companyTarget,
      salaryPot: salaryPotBalance,
      salaryGap:
        salaryPotBalance != null ? salaryTarget - salaryPotBalance : null,
      taxSetAside: reserve.reserveToDate,
      taxFullYear: reserve.reserveFullYear,
      ibPot: ibPotBalance,
      ibGap:
        ibPotBalance != null
          ? reserve.reserveToDate - ibPotBalance
          : null,
    };
  }, [deals, opportunities, taxSettings, bunqTotals, bunqPots]);

  const activeTab = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <div className="page-shell space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-neutral-100">Finance</h1>
          <p className="text-[13px] sm:text-sm text-neutral-500 mt-0.5">{activeTab.sub}</p>
        </div>
        {tab === "overview" && (
          <Button
            onClick={() => setManualDealOpen(true)}
            className="bg-[#d4e052] hover:bg-[#c2ce45] text-neutral-950 font-medium gap-2 w-full sm:w-auto"
          >
            <Plus className="w-4 h-4" />
            Add deal
          </Button>
        )}
      </div>

      <div className="snap-rail flex items-center gap-1 border-b border-neutral-800 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            aria-current={tab === entry.id ? "page" : undefined}
            className={cn(
              "relative shrink-0 whitespace-nowrap px-3 py-2.5 sm:py-2 text-sm transition-colors -mb-px border-b-2",
              tab === entry.id
                ? "text-[#d4e052] border-[#d4e052]"
                : "text-neutral-500 border-transparent hover:text-neutral-200",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "bunq" && <BunqPanel />}

      {tab === "tax" && (
        <TaxReservePanel
          deals={deals}
          opportunities={opportunities}
          settings={taxSettings}
          onSettingsChange={handleTaxSettingsChange}
          bunqYearTotalInclVat={bunqTotals?.yearTotal ?? null}
          incomeTaxSavingsBalance={bunqPots?.incomeTax?.balance ?? null}
        />
      )}

      {tab === "bv" && (
        <BvCheckPanel
          deals={deals}
          opportunities={opportunities}
          settings={taxSettings}
          onSettingsChange={handleTaxSettingsChange}
          bunqYearTotalInclVat={bunqTotals?.yearTotal ?? null}
        />
      )}

      {tab === "overview" && (loading ? (
        <div className="h-64 bg-neutral-900 rounded-lg animate-pulse border border-neutral-800" />
      ) : summary && (
        <>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="border border-neutral-800 rounded-lg px-4 py-3.5 sm:px-5 sm:py-4 bg-neutral-900/40">
                <p className="text-[10px] sm:text-xs text-neutral-500 uppercase tracking-widest mb-1">
                  Ontvangen dit jaar
                </p>
                <p className="text-xl sm:text-2xl font-mono font-semibold tabular-nums text-emerald-400">
                  {formatCurrency(cashPosition.receivedExcl)}
                </p>
                <p className="text-[11px] sm:text-xs text-neutral-500 mt-1">
                  Excl. btw · basis voor 50/40/10
                </p>
                <p className="text-[11px] sm:text-xs text-neutral-600 mt-0.5">
                  Bunq {formatCurrency(cashPosition.receivedIncl)} incl.
                  {cashPosition.unmatchedIncl > 0 && (
                    <>
                      {" · "}
                      <button
                        type="button"
                        className="text-orange-300 hover:underline"
                        onClick={() => setTab("bunq")}
                      >
                        {formatCurrency(cashPosition.unmatchedIncl)} te koppelen
                      </button>
                    </>
                  )}
                </p>
              </div>
              <div className="border border-neutral-800 rounded-lg px-4 py-3.5 sm:px-5 sm:py-4 bg-neutral-900/40">
                <p className="text-[10px] sm:text-xs text-neutral-500 uppercase tracking-widest mb-1">
                  Nog open (confirmed)
                </p>
                <p
                  className={cn(
                    "text-xl sm:text-2xl font-mono font-semibold tabular-nums",
                    cashPosition.outstanding > 0 ? "text-orange-300" : "text-emerald-400",
                  )}
                >
                  {formatCurrency(cashPosition.outstanding)}
                </p>
                <p className="text-[11px] sm:text-xs text-neutral-500 mt-1">
                  Excl. btw · lopende opdrachten / facturen
                </p>
                <p className="text-[11px] sm:text-xs text-neutral-600 mt-0.5">
                  Zonder commissie (Escort e.d.)
                </p>
              </div>
            </div>

            <div className="border border-neutral-800 rounded-lg px-4 py-4 sm:px-5 sm:py-5 bg-neutral-900/40 space-y-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                <div>
                  <h2 className="text-sm font-medium text-neutral-200">
                    Verdeling van ontvangen (excl. btw)
                  </h2>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Jullie regel over {formatCurrency(cashPosition.receivedExcl)}: 50%
                    salaris · 40% IB · 10% bedrijf
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs text-[#d4e052] hover:underline self-start sm:self-auto"
                  onClick={() => setTab("tax")}
                >
                  IB / belastingreserve →
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-md border border-neutral-800 bg-neutral-950/50 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-widest text-neutral-500 mb-1">
                    Salaris 50%
                  </p>
                  <p className="text-lg font-mono font-semibold tabular-nums text-[#d4e052]">
                    {formatCurrency(cashPosition.salaryTarget)}
                  </p>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    {cashPosition.salaryPot != null ? (
                      <>
                        Op Bunq Salaris: {formatCurrency(cashPosition.salaryPot)}
                        {cashPosition.salaryGap != null && cashPosition.salaryGap > 0 && (
                          <span className="text-orange-300">
                            {" "}
                            · nog {formatCurrency(cashPosition.salaryGap)}
                          </span>
                        )}
                        {cashPosition.salaryGap != null && cashPosition.salaryGap <= 0 && (
                          <span className="text-emerald-400"> · op peil</span>
                        )}
                      </>
                    ) : (
                      "Doel op basis van ontvangen excl. btw"
                    )}
                  </p>
                </div>
                <div className="rounded-md border border-neutral-800 bg-neutral-950/50 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-widest text-neutral-500 mb-1">
                    IB-pot 40%
                  </p>
                  <p className="text-lg font-mono font-semibold tabular-nums text-neutral-100">
                    {formatCurrency(cashPosition.ibRuleTarget)}
                  </p>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    {cashPosition.ibPot != null ? (
                      <>
                        Op Bunq IB: {formatCurrency(cashPosition.ibPot)}
                        {" · "}
                        <button
                          type="button"
                          className="text-[#d4e052] hover:underline"
                          onClick={() => setTab("tax")}
                        >
                          echte belasting →
                        </button>
                      </>
                    ) : (
                      "Cash-regel; detail op Belastingreserve"
                    )}
                  </p>
                </div>
                <div className="rounded-md border border-neutral-800 bg-neutral-950/50 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-widest text-neutral-500 mb-1">
                    Bedrijf 10%
                  </p>
                  <p className="text-lg font-mono font-semibold tabular-nums text-neutral-100">
                    {formatCurrency(cashPosition.companyTarget)}
                  </p>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Buffer / kosten na 50% + 40%
                  </p>
                </div>
              </div>
            </div>
          </div>

          {insightSeries.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <FinanceOutlookChart
              data={insightSeries}
              deals={deals}
              opportunities={opportunities}
              onDealClick={handleDealBreakdownClick}
            />

            <div className="border border-neutral-800 rounded-lg p-5 space-y-5 bg-neutral-900/40">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-neutral-300">Monthly insights</h2>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setInsightsMonth((m) => addMonths(m, -1))}
                      className="p-1 rounded hover:bg-neutral-800 text-neutral-500 hover:text-neutral-200 transition-colors"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs font-medium text-neutral-400 w-20 text-center capitalize">
                      {monthLabel(insightsMonth).split(" ")[0].slice(0, 3)} {insightsMonth.split("-")[0]}
                    </span>
                    <button
                      onClick={() => setInsightsMonth((m) => addMonths(m, 1))}
                      className="p-1 rounded hover:bg-neutral-800 text-neutral-500 hover:text-neutral-200 transition-colors"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-500">Expected revenue</span>
                    <RevenueBreakdownTooltip
                      amount={insights.expected}
                      amountClassName="text-[#d4e052]"
                      breakdown={expectedBreakdown}
                      emptyMessage="No expected revenue this month"
                      onDealClick={handleDealBreakdownClick}
                    />
                  </div>
                  <p className="text-[10px] text-neutral-600">Based on payment terms &amp; retainer fees · incl. VAT</p>
                </div>

                <div className="border-t border-neutral-800" />

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-500">Actual revenue</span>
                    <RevenueBreakdownTooltip
                      amount={insights.actual}
                      amountClassName="text-emerald-400"
                      breakdown={actualBreakdown}
                      emptyMessage="No payments recorded this month"
                      onDealClick={handleDealBreakdownClick}
                    />
                  </div>
                  {insights.expected > 0 && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500/70 rounded-full transition-all"
                          style={{ width: `${Math.min(100, insights.expected > 0 ? (insights.actual / insights.expected) * 100 : 0)}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-neutral-600">
                        {insights.expected > 0 ? Math.round((insights.actual / insights.expected) * 100) : 0}%
                      </span>
                    </div>
                  )}
                  <p className="text-[10px] text-neutral-600">Recorded payments this month</p>
                </div>

                <div className="border-t border-neutral-800" />

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-500">Actual income tax</span>
                    <span className="text-sm font-mono font-semibold text-red-400">
                      {formatCurrency(insights.actualIncomeTax)}
                    </span>
                  </div>
                  <p className="text-[10px] text-neutral-600">40% of actual revenue</p>
                </div>

                <div className="border-t border-neutral-800" />

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-500">Available salary</span>
                    <span className={cn(
                      "text-sm font-mono font-semibold",
                      insights.availableSalary >= 0 ? "text-emerald-400" : "text-orange-300"
                    )}>
                      {insights.availableSalary >= 0
                        ? formatCurrency(insights.availableSalary) + " surplus"
                        : formatCurrency(Math.abs(insights.availableSalary)) + " short"
                      }
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          insights.availableSalary >= 0 ? "bg-emerald-500" : "bg-neutral-500/50"
                        )}
                        style={{
                          width: `${Math.min(
                            100,
                            insights.salaryTarget > 0
                              ? ((insights.actual - insights.actualIncomeTax) / insights.salaryTarget) * 100
                              : 0,
                          )}%`,
                        }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-neutral-600">
                      {Math.min(
                        100,
                        Math.round(
                          insights.salaryTarget > 0
                            ? ((insights.actual - insights.actualIncomeTax) / insights.salaryTarget) * 100
                            : 0,
                        ),
                      )}%
                    </span>
                  </div>
                  <p className="text-[10px] text-neutral-600">
                    {formatCurrency(insights.salaryTarget)} salary · {formatCurrency(insights.actual - insights.actualIncomeTax)} after tax
                  </p>
                </div>
            </div>
            </div>
          )}

          <div className="space-y-4">
              <div className="border border-neutral-800 rounded-lg overflow-hidden">
                <div className="px-4 sm:px-5 py-3.5 border-b border-neutral-800">
                  <h2 className="text-sm font-medium text-neutral-300">Finance deals</h2>
                  <p className="text-[11px] sm:text-xs text-neutral-600 mt-0.5">
                    {deals.length} deal{deals.length !== 1 ? "s" : ""} from won opportunities
                  </p>
                </div>

                <ul className="divide-y divide-neutral-800/60 md:hidden">
                  {deals.length === 0 ? (
                    <li className="px-4 py-10 text-center text-sm text-neutral-600">
                      No finance deals yet. Activate a won opportunity to create one.
                    </li>
                  ) : (
                    deals.map((deal) => {
                      const contractValue = dealContractValue(deal);
                      const outstanding = dealOutstanding(deal);
                      const paidPct =
                        contractValue > 0
                          ? Math.min(
                              100,
                              Math.round(((deal.amount_paid ?? 0) / contractValue) * 100),
                            )
                          : 0;

                      return (
                        <li key={deal.id}>
                          <button
                            type="button"
                            onClick={() => openDeal(deal)}
                            className="w-full px-4 py-3.5 text-left active:bg-neutral-900/60"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm text-neutral-200 truncate">
                                  {deal.company_name}
                                </p>
                                <p className="text-xs text-neutral-500 truncate">
                                  {deal.project_name}
                                </p>
                              </div>
                              <span
                                className={cn(
                                  "shrink-0 text-[11px] font-mono px-2 py-0.5 rounded",
                                  deal.deal_type === "project"
                                    ? "bg-violet-950 text-violet-300"
                                    : "bg-blue-950 text-blue-300",
                                )}
                              >
                                {DEAL_TYPE_LABELS[deal.deal_type]}
                              </span>
                            </div>

                            <div className="mt-2.5 flex items-baseline justify-between gap-2 font-mono text-sm tabular-nums">
                              <span className="text-neutral-300">
                                {formatCurrency(contractValue)}
                              </span>
                              <span
                                className={
                                  outstanding > 0 ? "text-orange-300" : "text-emerald-400"
                                }
                              >
                                {formatCurrency(outstanding)} left
                              </span>
                            </div>

                            {contractValue > 0 && (
                              <div className="mt-1.5 flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                                  <div
                                    className={cn(
                                      "h-full rounded-full transition-all",
                                      paidPct >= 100
                                        ? "bg-emerald-500"
                                        : paidPct > 0
                                          ? "bg-emerald-500/70"
                                          : "",
                                    )}
                                    style={{ width: `${paidPct}%` }}
                                  />
                                </div>
                                <span
                                  className={cn(
                                    "text-[10px] font-mono tabular-nums w-8 text-right",
                                    paidPct >= 100
                                      ? "text-emerald-400"
                                      : paidPct > 0
                                        ? "text-neutral-500"
                                        : "text-neutral-700",
                                  )}
                                >
                                  {paidPct}%
                                </span>
                              </div>
                            )}

                            <p className="mt-2 text-[11px] text-neutral-600">
                              {formatDate(deal.start_date)} — {formatDate(deal.end_date)} · incl. VAT
                            </p>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>

                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-800 bg-neutral-900/60">
                        <th className="text-left px-4 py-3 text-xs text-neutral-500 font-medium">Company</th>
                        <th className="text-left px-4 py-3 text-xs text-neutral-500 font-medium">Project</th>
                        <th className="text-left px-4 py-3 text-xs text-neutral-500 font-medium">Type</th>
                        <th className="text-right px-4 py-3 text-xs text-neutral-500 font-medium">Value / Outstanding (incl. VAT)</th>
                        <th className="text-left px-4 py-3 text-xs text-neutral-500 font-medium">Period</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/60">
                      {deals.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-12 text-center text-neutral-600 text-sm">
                            No finance deals yet. Activate a won opportunity to create one.
                          </td>
                        </tr>
                      ) : (
                        deals.map((deal) => {
                          const contractValue = dealContractValue(deal);
                          const outstanding = dealOutstanding(deal);
                          const paidPct = contractValue > 0
                            ? Math.min(100, Math.round(((deal.amount_paid ?? 0) / contractValue) * 100))
                            : 0;

                          return (
                          <tr
                            key={deal.id}
                            onClick={() => openDeal(deal)}
                            className="hover:bg-neutral-900/50 transition-colors cursor-pointer"
                          >
                            <td className="px-4 py-3 text-neutral-200">{deal.company_name}</td>
                            <td className="px-4 py-3 text-neutral-400">{deal.project_name}</td>
                            <td className="px-4 py-3">
                              <span className={cn(
                                "text-xs font-mono px-2 py-0.5 rounded",
                                deal.deal_type === "project"
                                  ? "bg-violet-950 text-violet-300"
                                  : "bg-blue-950 text-blue-300"
                              )}>
                                {DEAL_TYPE_LABELS[deal.deal_type]}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-3 font-mono text-sm">
                                <span className="text-neutral-300">{formatCurrency(contractValue)}</span>
                                <span className="text-neutral-700">·</span>
                                <span className={outstanding > 0 ? "text-orange-300" : "text-emerald-400"}>
                                  {formatCurrency(outstanding)} left
                                </span>
                              </div>
                              {contractValue > 0 && (
                                <div className="mt-1.5 flex items-center gap-2">
                                  <div className="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                                    <div
                                      className={cn(
                                        "h-full rounded-full transition-all",
                                        paidPct >= 100 ? "bg-emerald-500" : paidPct > 0 ? "bg-emerald-500/70" : ""
                                      )}
                                      style={{ width: `${paidPct}%` }}
                                    />
                                  </div>
                                  <span className={cn(
                                    "text-[10px] font-mono tabular-nums w-8 text-right",
                                    paidPct >= 100 ? "text-emerald-400" : paidPct > 0 ? "text-neutral-500" : "text-neutral-700"
                                  )}>
                                    {paidPct}%
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-neutral-500 text-xs">
                              {formatDate(deal.start_date)} — {formatDate(deal.end_date)}
                            </td>
                          </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {summary.history.length > 0 && (
                <div className="border border-neutral-800 rounded-lg p-5">
                  <h2 className="text-sm font-medium text-neutral-300 mb-4">Revenue last months</h2>
                  <div className="flex items-end gap-3 h-32">
                    {summary.history.map((h) => {
                      const pct = (Number(h.revenue) / maxHistory) * 100;
                      const isCurrentMonth = h.month === month;
                      return (
                        <div key={h.month} className="flex-1 flex flex-col items-center gap-1.5">
                          <span className="text-xs font-mono text-neutral-600">
                            {formatCurrency(Number(h.revenue), "EUR").replace("€", "").replace(/\s/g, "")}
                          </span>
                          <div className="w-full bg-neutral-800 rounded-t relative" style={{ height: "80px" }}>
                            <div
                              className={`absolute bottom-0 w-full rounded-t transition-all ${isCurrentMonth ? "bg-[#d4e052]" : "bg-neutral-600"}`}
                              style={{ height: `${pct}%` }}
                            />
                          </div>
                          <span className={`text-xs font-mono ${isCurrentMonth ? "text-[#d4e052]" : "text-neutral-700"}`}>
                            {h.month.slice(5)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
          </div>
        </>
      ))}

      <Dialog open={!!selectedDeal} onOpenChange={(o) => !o && setSelectedDeal(null)}>
        <DialogContent className="bg-neutral-900 border-neutral-700 text-neutral-100 !max-w-2xl w-[92vw] p-0 overflow-x-hidden">
          <div className="px-6 pt-6 pb-2">
            <DialogHeader>
              <DialogTitle className="text-neutral-100 text-lg">Finance deal</DialogTitle>
            </DialogHeader>
          </div>

          {selectedDeal && (
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-1.5">
                  <Label className="text-neutral-400 text-xs">Company</Label>
                  <Input
                    value={editForm.company_name ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, company_name: e.target.value }))}
                    className={fc}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-neutral-400 text-xs">Project</Label>
                  <Input
                    value={editForm.project_name ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, project_name: e.target.value }))}
                    className={fc}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-neutral-400 text-xs">Deal type</Label>
                <div className="flex gap-2">
                  {(["project", "retainer"] as DealType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setEditForm((f) => ({ ...f, deal_type: type }))}
                      className={cn(
                        "px-4 py-2 rounded text-sm font-medium border transition-colors",
                        editForm.deal_type === type
                          ? "bg-[#d4e052]/10 border-[#d4e052] text-[#d4e052]"
                          : "border-neutral-700 text-neutral-500 hover:text-neutral-300"
                      )}
                    >
                      {DEAL_TYPE_LABELS[type]}
                    </button>
                  ))}
                </div>
              </div>

              {editForm.deal_type === "project" ? (
                <VatAmountPair
                  exclLabel="Total deal value, excl. VAT (€)"
                  inclLabel="Total deal value, incl. VAT (€)"
                  exclValue={String(removeVat(Number(editForm.total_deal_value ?? 0)))}
                  inclValue={String(editForm.total_deal_value ?? 0)}
                  onChange={(_, incl) =>
                    setEditForm((f) => ({ ...f, total_deal_value: Number(incl) || 0 }))
                  }
                />
              ) : (
                <div className="space-y-4">
                  <VatAmountPair
                    exclLabel="Monthly fee, excl. VAT (€)"
                    inclLabel="Monthly fee, incl. VAT (€)"
                    exclValue={String(removeVat(Number(editForm.monthly_fee ?? 0)))}
                    inclValue={String(editForm.monthly_fee ?? 0)}
                    onChange={(_, incl) =>
                      setEditForm((f) => ({ ...f, monthly_fee: Number(incl) || 0 }))
                    }
                  />
                  <VatAmountPair
                    exclLabel="Monthly revshare, excl. VAT (€)"
                    inclLabel="Monthly revshare, incl. VAT (€)"
                    exclValue={String(removeVat(Number(editForm.monthly_revshare ?? 0)))}
                    inclValue={String(editForm.monthly_revshare ?? 0)}
                    onChange={(_, incl) =>
                      setEditForm((f) => ({ ...f, monthly_revshare: Number(incl) || 0 }))
                    }
                  />
                </div>
              )}

              {editForm.deal_type === "project" ? (
                <div className="space-y-1.5">
                  <Label className="text-neutral-400 text-xs">Deadline</Label>
                  <DatePicker
                    value={editForm.end_date ?? ""}
                    onChange={(v) => setEditForm((f) => ({ ...f, end_date: v }))}
                    className={fc}
                  />
                  <p className="text-[11px] text-neutral-600">
                    Capacity spreads the fee ÷ €175 over the weeks left until this date.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-neutral-400 text-xs">Start date</Label>
                    <DatePicker
                      value={editForm.start_date ?? ""}
                      onChange={(v) => setEditForm((f) => ({ ...f, start_date: v }))}
                      className={fc}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-neutral-400 text-xs">End date</Label>
                    <DatePicker
                      value={editForm.end_date ?? ""}
                      onChange={(v) => setEditForm((f) => ({ ...f, end_date: v }))}
                      className={fc}
                    />
                  </div>
                </div>
              )}

              {editForm.deal_type === "project" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-neutral-400 text-xs">Payment terms</Label>
                    <span className={cn(
                      "text-xs font-mono",
                      (editForm.payment_schedule ?? []).reduce((s, e) => s + (Number(e.percentage) || 0), 0) === 100
                        ? "text-stone-300"
                        : "text-neutral-400"
                    )}>
                      Total: {(editForm.payment_schedule ?? []).reduce((s, e) => s + (Number(e.percentage) || 0), 0)}%
                    </span>
                  </div>
                  <div className="space-y-2">
                    {(editForm.payment_schedule ?? []).map((entry, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          type="month"
                          value={entry.month}
                          onChange={(e) => updateSchedule(index, "month", e.target.value)}
                          className={`${fc} flex-1`}
                        />
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={entry.percentage}
                          onChange={(e) => updateSchedule(index, "percentage", e.target.value)}
                          className={`${fc} w-24 font-mono`}
                        />
                        <span className="text-xs text-neutral-500">%</span>
                        <button
                          type="button"
                          onClick={() => removeScheduleRow(index)}
                          className="p-2 text-neutral-600 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={addScheduleRow}
                    className="text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 gap-2 h-8"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add payment term
                  </Button>
                </div>
              )}

              {(() => {
                const payments = editForm.payments ?? [];
                const amountPaid = sumDealPayments(payments);
                const preview = { ...selectedDeal, ...editForm, amount_paid: amountPaid } as FinanceDeal;
                const contractValue = dealContractValue(preview);
                const outstanding = dealOutstanding(preview);
                const paidPct = contractValue > 0
                  ? Math.min(100, Math.round((amountPaid / contractValue) * 100))
                  : 0;

                return (
                  <div className="border border-neutral-800 rounded-lg p-4 space-y-4 bg-neutral-900/40">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-neutral-400 text-xs">Payments received (incl. VAT)</Label>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={addPayment}
                          className="text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 gap-2 h-8"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add payment
                        </Button>
                      </div>

                      {(payments.length === 0) ? (
                        <p className="text-xs text-neutral-600">No payments recorded yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {payments.map((payment, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <DatePicker
                                value={payment.date}
                                onChange={(v) => updatePayment(index, "date", v)}
                                className={`${fc} flex-1`}
                              />
                              <Input
                                type="text"
                                inputMode="decimal"
                                value={payment.amount ? String(payment.amount) : ""}
                                onChange={(e) => updatePayment(index, "amount", e.target.value)}
                                placeholder="0"
                                className={`${fc} w-32 font-mono`}
                              />
                              <button
                                type="button"
                                onClick={() => removePayment(index)}
                                className="p-2 text-neutral-600 hover:text-red-400 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-neutral-500">Contract value (incl. VAT)</p>
                        <p className="font-mono text-neutral-200 mt-0.5">{formatCurrency(contractValue)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-neutral-500">Paid (incl. VAT)</p>
                        <p className="font-mono text-emerald-400 mt-0.5">{formatCurrency(amountPaid)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-neutral-500">Outstanding (incl. VAT)</p>
                        <p className={cn("font-mono mt-0.5", outstanding > 0 ? "text-orange-300" : "text-emerald-400")}>
                          {formatCurrency(outstanding)}
                        </p>
                      </div>
                    </div>

                    {contractValue > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs text-neutral-500">
                          <span>Payment progress</span>
                          <span className="font-mono">{paidPct}%</span>
                        </div>
                        <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all"
                            style={{ width: `${paidPct}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {saveError && (
            <p className="text-red-400 text-xs bg-red-950/50 px-6 py-2">{saveError}</p>
          )}

          <div className="flex justify-end gap-3 px-6 py-4 border-t border-neutral-800">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSelectedDeal(null)}
              className="text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={savingDeal}
              onClick={saveDeal}
              className="bg-[#d4e052] hover:bg-[#c2ce45] text-neutral-950 font-medium"
            >
              {savingDeal ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <DealActivationWizard
        open={manualDealOpen}
        onClose={() => setManualDealOpen(false)}
        onComplete={() => load()}
      />
    </div>
  );
}
