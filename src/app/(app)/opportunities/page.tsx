"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Plus,
  Search,
  Trash2,
  Pencil,
  ArrowUpDown,
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
import { getOpportunities, deleteOpportunity, updateOpportunity } from "@/lib/api";
import {
  Opportunity,
  Stage,
  OpportunityType,
  STAGE_LABELS,
  STAGE_ORDER,
  TYPE_LABELS,
  normalizeOpportunityType,
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

function InlineProbability({
  value,
  onSave,
}: {
  value: number;
  onSave: (value: number) => void;
}) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  function commit(next: number) {
    const clamped = Math.min(100, Math.max(0, next));
    if (clamped !== value) onSave(clamped);
  }

  return (
    <div
      className="flex items-center gap-2 w-full min-w-[140px]"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={local}
        onChange={(e) => setLocal(Number(e.target.value))}
        onPointerUp={() => commit(local)}
        onBlur={() => commit(local)}
        className="flex-1 h-2.5 min-w-[60px] cursor-pointer accent-[#e8ff47]"
      />
      <span className="text-sm text-neutral-300 font-mono w-8 text-right shrink-0">
        {local}
      </span>
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

export default function OpportunitiesPage() {
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<Stage | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("stage");
  const [sortAsc, setSortAsc] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingOpp, setEditingOpp] = useState<Opportunity | null>(null);

  async function load() {
    setLoading(true);
    const data = await getOpportunities();
    setOpps(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const patchOpp = useCallback(async (id: string, updates: Partial<Opportunity>) => {
    const updated = await updateOpportunity(id, updates);
    setOpps((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        const company = updated.company?.name ? updated.company : o.company;
        return { ...o, ...updated, company };
      })
    );
  }, []);

  const filtered = useMemo(() => {
    return opps
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
  }, [opps, search, stageFilter, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((a) => !a);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this opportunity?")) return;
    await deleteOpportunity(id);
    setOpps((prev) => prev.filter((o) => o.id !== id));
  }

  const totalExpected = filtered.reduce((s, o) => s + o.expected_value, 0);
  const totalWeighted = filtered.reduce((s, o) => s + o.weighted_value, 0);

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-100">Opportunities</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {filtered.length} opportunities ·{" "}
            <span className="font-mono">{formatCurrency(totalExpected)}</span> deal order ·{" "}
            <span className="font-mono text-[#e8ff47]">
              {formatCurrency(totalWeighted)}
            </span>{" "}
            weighted
          </p>
        </div>
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

      {/* Filters */}
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

      {/* Table */}
      <div className="border border-neutral-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[23%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[14%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[18%]" />
              <col className="w-[7%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-900/60">
                <th className="text-left px-4 py-3.5 text-xs text-neutral-500 font-medium">
                  <div className="flex items-center gap-1.5">
                    Name <SortBtn col="name" />
                  </div>
                </th>
                <th className="text-left px-2 py-3.5 text-xs text-neutral-500 font-medium">
                  Company
                </th>
                <th className="text-left px-2 py-3.5 text-xs text-neutral-500 font-medium">
                  Type
                </th>
                <th className="text-left px-2 py-3.5 text-xs text-neutral-500 font-medium">
                  <div className="flex items-center gap-1">
                    Stage <SortBtn col="stage" />
                  </div>
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
                      className="hover:bg-neutral-900/50 transition-colors"
                    >
                      <td className="px-4 py-4 min-w-0">
                        <p className="text-neutral-200 font-medium truncate text-sm">
                          {opp.name}
                        </p>
                      </td>
                      <td className="px-2 py-4 text-neutral-400 text-sm truncate">
                        {opp.company?.name || "—"}
                      </td>
                      <td className="px-2 py-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={normalizeOpportunityType(opp.type)}
                          onValueChange={(v) =>
                            patchOpp(opp.id, { type: v as OpportunityType })
                          }
                        >
                          <SelectTrigger
                            className={cn(
                              selectTriggerClass,
                              "w-full max-w-full rounded font-mono text-neutral-500"
                            )}
                          >
                            <SelectValue>
                              {TYPE_LABELS[normalizeOpportunityType(opp.type)]}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="bg-neutral-800 border-neutral-700">
                            {Object.entries(TYPE_LABELS).map(([k, v]) => (
                              <SelectItem key={k} value={k} className="text-neutral-100">
                                {v}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={opp.stage}
                          onValueChange={(v) =>
                            patchOpp(opp.id, { stage: v as Stage })
                          }
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
                      <td className="px-1 py-4">
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            onClick={() => {
                              setEditingOpp(opp);
                              setFormOpen(true);
                            }}
                            className="p-1.5 text-neutral-600 hover:text-neutral-300 transition-colors rounded hover:bg-neutral-800"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(opp.id)}
                            className="p-1.5 text-neutral-700 hover:text-red-400 transition-colors rounded hover:bg-neutral-800"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
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

      <OpportunityForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingOpp(null);
        }}
        initial={editingOpp}
        onSave={(opp) => {
          setOpps((prev) => {
            const exists = prev.find((o) => o.id === opp.id);
            if (exists) return prev.map((o) => (o.id === opp.id ? opp : o));
            return [opp, ...prev];
          });
        }}
      />
    </div>
  );
}
