"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  Search,
  ArrowUpDown,
  Columns3,
  ListFilter,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OpportunityForm } from "@/components/opportunity-form";
import { OpportunityPipelineView } from "@/components/opportunity-pipeline-view";
import { DealActivationWizard } from "@/components/deal-activation-wizard";
import { getOpportunities, deleteOpportunity, updateOpportunity, getFinanceDeals } from "@/lib/api";
import {
  Opportunity,
  Stage,
  STAGE_LABELS,
  STAGE_ORDER,
} from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type SortKey = "name" | "stage" | "expected_value" | "probability" | "updated_at";

const stageStyles: Record<Stage, string> = {
  prospect: "bg-neutral-800 text-neutral-300",
  qualified: "bg-blue-950 text-blue-300",
  proposal: "bg-violet-950 text-violet-300",
  negotiation: "bg-[#e8ff47]/10 text-[#e8ff47]",
  won: "bg-emerald-950 text-emerald-300",
  lost: "bg-red-950 text-red-400",
  on_hold: "bg-neutral-800 text-neutral-500",
};

const selectTriggerClass =
  "h-9 border-0 bg-transparent shadow-none px-2 text-sm focus:ring-0";

const STAGE_PROBABILITY: Record<Stage, number> = {
  prospect: 20,
  qualified: 40,
  proposal: 60,
  negotiation: 80,
  won: 100,
  lost: 0,
  on_hold: 25,
};

function InlineProbability({
  value,
  onSave,
}: {
  value: number;
  onSave: (value: number) => void;
}) {
  const [local, setLocal] = useState(value);
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setLocal(value);
    setText(String(value));
  }, [value]);

  function commit(next: number) {
    const clamped = Math.min(100, Math.max(0, Math.round(next)));
    setLocal(clamped);
    setText(String(clamped));
    if (clamped !== value) onSave(clamped);
  }

  function commitText() {
    const parsed = Number.parseInt(text, 10);
    if (Number.isNaN(parsed)) {
      setText(String(local));
      return;
    }
    commit(parsed);
  }

  return (
    <div
      className="flex items-center gap-1.5 w-full min-w-0"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={local}
        onChange={(e) => {
          const next = Number(e.target.value);
          setLocal(next);
          setText(String(next));
        }}
        onPointerUp={() => commit(local)}
        className="flex-1 h-2.5 min-w-0 cursor-pointer accent-[#e8ff47]"
      />
      <input
        type="number"
        min={0}
        max={100}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commitText}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        className="w-10 shrink-0 bg-neutral-900/50 border border-transparent hover:border-neutral-700 focus:border-neutral-600 rounded px-1 py-0.5 text-sm font-mono text-neutral-300 text-right outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <span className="text-sm text-neutral-500 shrink-0">%</span>
    </div>
  );
}

function InlineNumber({
  value,
  onSave,
  className,
  placeholder = "0",
}: {
  value: number;
  onSave: (value: number) => void;
  className?: string;
  placeholder?: string;
}) {
  const [local, setLocal] = useState(String(value || ""));

  useEffect(() => {
    setLocal(String(value ?? ""));
  }, [value]);

  function commit() {
    const next = parseFloat(local) || 0;
    if (next !== value) onSave(next);
  }

  return (
    <input
      type="number"
      min={0}
      value={local}
      placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "w-full bg-neutral-900/50 border border-transparent hover:border-neutral-700 focus:border-neutral-600 rounded px-2 py-1 text-sm font-mono outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
        className
      )}
    />
  );
}

function InlineMonth({
  value,
  onSave,
  className,
}: {
  value?: string;
  onSave: (value: string | null) => void;
  className?: string;
}) {
  const month = value?.slice(0, 7) ?? "";
  const [local, setLocal] = useState(month);

  useEffect(() => {
    setLocal(value?.slice(0, 7) ?? "");
  }, [value]);

  function commit(next: string) {
    const iso = next ? `${next}-01` : null;
    const current = value?.slice(0, 7) ? `${value.slice(0, 7)}-01` : null;
    if (iso !== current) onSave(iso);
  }

  return (
    <div className="relative shrink-0 w-[140px]">
      <input
        type="month"
        value={local}
        onChange={(e) => {
          setLocal(e.target.value);
          commit(e.target.value);
        }}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "month-picker-input relative w-full bg-neutral-900/50 border border-transparent hover:border-neutral-700 focus:border-neutral-600 rounded px-2 py-1 pr-7 text-xs font-mono text-neutral-400 outline-none transition-colors",
          className
        )}
      />
      <Calendar
        aria-hidden
        className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-neutral-300"
      />
    </div>
  );
}

function InlinePeriod({
  startDate,
  endDate,
  onSaveStart,
  onSaveEnd,
}: {
  startDate?: string;
  endDate?: string;
  onSaveStart: (value: string | null) => void;
  onSaveEnd: (value: string | null) => void;
}) {
  return (
    <div
      className="flex items-center gap-1.5 whitespace-nowrap"
      onClick={(e) => e.stopPropagation()}
    >
      <InlineMonth value={startDate} onSave={onSaveStart} />
      <span className="text-neutral-600 text-xs shrink-0">—</span>
      <InlineMonth value={endDate} onSave={onSaveEnd} />
    </div>
  );
}

type ViewMode = "list" | "pipeline";

export default function OpportunitiesPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view: ViewMode =
    searchParams.get("view") === "pipeline" ? "pipeline" : "list";

  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<Stage | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("stage");
  const [sortAsc, setSortAsc] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingOpp, setEditingOpp] = useState<Opportunity | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [activatingOpp, setActivatingOpp] = useState<Opportunity | null>(null);
  const [activatedOpportunityIds, setActivatedOpportunityIds] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const patchQueues = useRef(new Map<string, Promise<void>>());

  async function load() {
    setLoading(true);
    const [data, deals] = await Promise.all([
      getOpportunities(),
      getFinanceDeals(),
    ]);
    setOpps(data);
    setActivatedOpportunityIds(
      new Set(deals.map((d) => d.opportunity_id).filter((id): id is string => Boolean(id)))
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const patchOpp = useCallback(async (id: string, updates: Partial<Opportunity>) => {
    let snapshot: Opportunity | undefined;
    setOpps((prev) => {
      snapshot = prev.find((o) => o.id === id);
      return prev.map((o) => (o.id === id ? { ...o, ...updates } : o));
    });
    setEditingOpp((prev) => (prev?.id === id ? { ...prev, ...updates } : prev));

    if (updates.stage && stageFilter !== "all" && updates.stage !== stageFilter) {
      setStageFilter("all");
    }

    const applyServer = (updated: Opportunity) => {
      setOpps((prev) =>
        prev.map((o) => {
          if (o.id !== id) return o;
          const company = updated.company?.name ? updated.company : o.company;
          return { ...o, ...updated, company };
        })
      );
      setEditingOpp((prev) => {
        if (!prev || prev.id !== id) return prev;
        const company = updated.company?.name ? updated.company : prev.company;
        return { ...prev, ...updated, company };
      });
      setSaveError(null);
    };

    const rollback = () => {
      if (snapshot) {
        setOpps((prev) => prev.map((o) => (o.id === id ? snapshot! : o)));
        setEditingOpp((prev) => (prev?.id === id ? snapshot! : prev));
      }
    };

    const previous = patchQueues.current.get(id) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(async () => {
        try {
          const updated = await updateOpportunity(id, updates);
          applyServer(updated);
        } catch (err) {
          rollback();
          const message = err instanceof Error ? err.message : "Failed to save changes";
          setSaveError(message);
          throw err;
        }
      });

    patchQueues.current.set(id, next);
    await next;
  }, [stageFilter]);

  async function handleStageChange(id: string, stage: Stage) {
    await patchOpp(id, { stage, probability: STAGE_PROBABILITY[stage] });
  }

  function handleRowClick(e: React.MouseEvent, opp: Opportunity) {
    const target = e.target as HTMLElement;
    if (target.closest('[data-slot="select-trigger"], [data-slot="select-content"], input, button')) {
      return;
    }
    openEdit(opp);
  }

  const filtered = useMemo(() => {
    return opps
      .filter((o) => !activatedOpportunityIds.has(o.id))
      .filter((o) => {
        const q = search.toLowerCase();
        const matchSearch =
          !q ||
          o.name.toLowerCase().includes(q) ||
          o.company?.name?.toLowerCase().includes(q) ||
          o.owner?.toLowerCase().includes(q);
        const matchStage = stageFilter === "all" || o.stage === stageFilter;
        return matchSearch && matchStage;
      })
      .sort((a, b) => {
        if (sortKey === "stage") {
          const cmp =
            STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage);
          return sortAsc ? cmp : -cmp;
        }

        let av: string | number = a[sortKey] ?? "";
        let bv: string | number = b[sortKey] ?? "";
        if (typeof av === "string") av = av.toLowerCase();
        if (typeof bv === "string") bv = bv.toLowerCase();
        if (av < bv) return sortAsc ? -1 : 1;
        if (av > bv) return sortAsc ? 1 : -1;
        return 0;
      });
  }, [opps, search, stageFilter, sortKey, sortAsc, activatedOpportunityIds]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((a) => !a);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteOpportunity(id);
    setOpps((prev) => prev.filter((o) => o.id !== id));
  }

  function openEdit(opp: Opportunity) {
    setEditingOpp(opp);
    setFormOpen(true);
  }

  function openActivation(opp: Opportunity, e: React.MouseEvent) {
    e.stopPropagation();
    setActivatingOpp(opp);
    setWizardOpen(true);
  }

  function setView(next: ViewMode) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "pipeline") {
      params.set("view", "pipeline");
    } else {
      params.delete("view");
    }
    const query = params.toString();
    router.replace(query ? `/opportunities?${query}` : "/opportunities");
  }

  async function handlePipelineStageChange(id: string, stage: Stage) {
    await handleStageChange(id, stage);
  }

  const totalExpected = filtered.reduce(
    (s, o) => s + (Number(o.expected_value) || 0),
    0
  );
  const totalWeighted = filtered.reduce(
    (s, o) => s + (Number(o.weighted_value) || 0),
    0
  );

  const SortBtn = ({ col }: { col: SortKey }) => (
    <button
      onClick={() => toggleSort(col)}
      className="inline-flex items-center gap-1 hover:text-neutral-200 transition-colors"
    >
      <ArrowUpDown className="w-3 h-3" />
    </button>
  );

  return (
    <div className="p-8 space-y-6">
      {saveError && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {saveError}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-100">Opportunities</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {filtered.length} opportunities ·{" "}
            <span className="font-mono">{formatCurrency(totalExpected)}</span> deal order excl. VAT ·{" "}
            <span className="font-mono text-[#e8ff47]">
              {formatCurrency(totalWeighted)}
            </span>{" "}
            weighted
            {view === "pipeline" && (
              <span className="text-neutral-600">
                {" "}
                · click a card to edit · hover for quick stage changes
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setView(view === "pipeline" ? "list" : "pipeline")}
            className="border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100 gap-2"
          >
            {view === "pipeline" ? (
              <>
                <ListFilter className="w-4 h-4" />
                List view
              </>
            ) : (
              <>
                <Columns3 className="w-4 h-4" />
                Pipeline
              </>
            )}
          </Button>
          <Button
            onClick={() => {
              setEditingOpp(null);
              setFormOpen(true);
            }}
            className="bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 font-medium gap-2"
          >
            <Plus className="w-4 h-4" />
            New opportunity
          </Button>
        </div>
      </div>

      {view === "list" && (
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-600" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="pl-9 bg-neutral-900 border-neutral-700 text-neutral-100 placeholder:text-neutral-600 h-8 text-sm"
          />
        </div>
        <Select
          value={stageFilter}
          onValueChange={(v) => setStageFilter(v as Stage | "all")}
        >
          <SelectTrigger className="w-40 bg-neutral-900 border-neutral-700 text-neutral-100 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-neutral-800 border-neutral-700">
            <SelectItem value="all" className="text-neutral-400">All stages</SelectItem>
            {Object.entries(STAGE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k} className="text-neutral-100">
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      )}

      {view === "list" ? (
      <div className="border border-neutral-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[10%]" />
              <col className="w-[16%]" />
              <col className="w-[11%]" />
              <col className="w-[28%]" />
              <col className="w-[9%]" />
              <col className="w-[8%]" />
              <col className="w-[14%]" />
              <col className="w-[4%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-900/60">
                <th className="text-left px-4 py-3.5 text-xs text-neutral-500 font-medium">
                  Company
                </th>
                <th className="text-left px-2 py-3.5 text-xs text-neutral-500 font-medium">
                  <div className="flex items-center gap-1.5">
                    Name <SortBtn col="name" />
                  </div>
                </th>
                <th className="text-left px-2 py-3.5 text-xs text-neutral-500 font-medium">
                  <div className="flex items-center gap-1">
                    Stage <SortBtn col="stage" />
                  </div>
                </th>
                <th className="text-left px-2 py-3.5 text-xs text-neutral-500 font-medium whitespace-nowrap">
                  Period
                </th>
                <th className="text-right px-1.5 py-3.5 text-xs text-neutral-500 font-medium whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1">
                    Deal Order <SortBtn col="expected_value" />
                  </div>
                </th>
                <th className="text-right px-1.5 py-3.5 text-xs text-neutral-500 font-medium whitespace-nowrap">
                  Committed
                </th>
                <th className="text-left px-2 py-3.5 text-xs text-neutral-500 font-medium whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    Probability % <SortBtn col="probability" />
                  </div>
                </th>
                <th className="px-1 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {loading
                ? [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      {[...Array(8)].map((_, j) => (
                        <td key={j} className="px-4 py-4">
                          <div className="h-5 bg-neutral-800 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : filtered.map((opp) => (
                    <tr
                      key={opp.id}
                      onClick={(e) => handleRowClick(e, opp)}
                      className="hover:bg-neutral-900/50 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-4 text-neutral-300 text-sm truncate font-medium">
                        {opp.company?.name || "—"}
                      </td>
                      <td className="px-2 py-4 min-w-0">
                        <p className="text-neutral-400 truncate text-sm">
                          {opp.name}
                        </p>
                      </td>
                      <td className="px-2 py-4 overflow-hidden" onPointerDown={(e) => e.stopPropagation()}>
                        <Select
                          value={opp.stage}
                          onValueChange={(v) => void handleStageChange(opp.id, v as Stage)}
                        >
                          <SelectTrigger
                            className={cn(
                              selectTriggerClass,
                              "w-full max-w-full rounded font-medium font-mono",
                              stageStyles[opp.stage]
                            )}
                          >
                            <SelectValue>{STAGE_LABELS[opp.stage]}</SelectValue>
                          </SelectTrigger>
                          <SelectContent className="bg-neutral-800 border-neutral-700">
                            {Object.entries(STAGE_LABELS).map(([k, v]) => (
                              <SelectItem key={k} value={k} className="text-neutral-100">
                                {v}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-4">
                        <InlinePeriod
                          startDate={opp.start_date}
                          endDate={opp.end_date}
                          onSaveStart={(v) => patchOpp(opp.id, { start_date: v || "" })}
                          onSaveEnd={(v) => patchOpp(opp.id, { end_date: v || "" })}
                        />
                      </td>
                      <td className="px-1.5 py-4 text-right">
                        <InlineNumber
                          value={Number(opp.expected_value)}
                          onSave={(v) => patchOpp(opp.id, { expected_value: v })}
                          className="text-right text-neutral-300 w-16 ml-auto"
                        />
                      </td>
                      <td className="px-1.5 py-4 text-right">
                        <InlineNumber
                          value={Number(opp.actual_value)}
                          onSave={(v) => patchOpp(opp.id, { actual_value: v })}
                          className="text-right text-emerald-400 w-16 ml-auto"
                        />
                      </td>
                      <td className="px-2 py-4" onClick={(e) => e.stopPropagation()}>
                        <InlineProbability
                          value={opp.probability}
                          onSave={(v) => patchOpp(opp.id, { probability: v })}
                        />
                      </td>
                      <td className="px-1 py-4" onClick={(e) => e.stopPropagation()}>
                        {opp.stage === "won" && !activatedOpportunityIds.has(opp.id) && (
                          <div className="flex items-center justify-end">
                            <button
                              onClick={(e) => openActivation(opp, e)}
                              title="Activate deal"
                              className="p-1.5 text-lg hover:bg-neutral-800 rounded transition-colors"
                            >
                              🚀
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-neutral-600 text-sm">No opportunities found</p>
          </div>
        )}
      </div>
      ) : (
        <OpportunityPipelineView
          opps={filtered}
          loading={loading}
          activatedOpportunityIds={activatedOpportunityIds}
          onEdit={openEdit}
          onStageChange={handlePipelineStageChange}
          onActivate={openActivation}
        />
      )}

      <OpportunityForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingOpp(null);
        }}
        initial={editingOpp}
        onDelete={handleDelete}
        onSave={(opp) => {
          setOpps((prev) => {
            const exists = prev.find((o) => o.id === opp.id);
            if (exists) return prev.map((o) => (o.id === opp.id ? opp : o));
            return [opp, ...prev];
          });
        }}
      />

      <DealActivationWizard
        open={wizardOpen}
        onClose={() => {
          setWizardOpen(false);
          setActivatingOpp(null);
        }}
        opportunity={activatingOpp}
        onComplete={() => {
          if (activatingOpp) {
            setActivatedOpportunityIds((prev) => new Set([...prev, activatingOpp.id]));
            setOpps((prev) => prev.filter((o) => o.id !== activatingOpp.id));
          }
        }}
      />
    </div>
  );
}
