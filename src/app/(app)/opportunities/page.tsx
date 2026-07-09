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
  STAGE_LABELS,
  STAGE_ORDER,
  TYPE_LABELS,
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
  "h-7 border-0 bg-transparent shadow-none px-1.5 text-xs focus:ring-0";

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
        "w-full bg-neutral-900/50 border border-transparent hover:border-neutral-700 focus:border-neutral-600 rounded px-1.5 py-0.5 text-xs font-mono outline-none transition-colors",
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
    if (!confirm("Weet je zeker dat je deze kans wil verwijderen?")) return;
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
          <h1 className="text-xl font-semibold text-neutral-100">Kansen</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {filtered.length} kansen ·{" "}
            <span className="font-mono">{formatCurrency(totalExpected)}</span> deal order ·{" "}
            <span className="font-mono text-[#e8ff47]">
              {formatCurrency(totalWeighted)}
            </span>{" "}
            gewogen
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
          Nieuwe kans
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-600" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoeken..."
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
            <SelectItem value="all" className="text-neutral-400">Alle fases</SelectItem>
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
              <col />
              <col className="w-[90px]" />
              <col className="w-[72px]" />
              <col className="w-[118px]" />
              <col className="w-[76px]" />
              <col className="w-[84px]" />
              <col className="w-[128px]" />
              <col className="w-[68px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-900/60">
                <th className="text-left px-4 py-2.5 text-xs text-neutral-500 font-medium">
                  <div className="flex items-center gap-1.5">
                    Naam <SortBtn col="name" />
                  </div>
                </th>
                <th className="text-left px-2 py-2.5 text-xs text-neutral-500 font-medium">
                  Bedrijf
                </th>
                <th className="text-left px-1.5 py-2.5 text-xs text-neutral-500 font-medium">
                  Type
                </th>
                <th className="text-left px-1.5 py-2.5 text-xs text-neutral-500 font-medium">
                  <div className="flex items-center gap-1">
                    Fase <SortBtn col="stage" />
                  </div>
                </th>
                <th className="text-right px-1.5 py-2.5 text-xs text-neutral-500 font-medium whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1">
                    Deal Order <SortBtn col="expected_value" />
                  </div>
                </th>
                <th className="text-right px-1.5 py-2.5 text-xs text-neutral-500 font-medium whitespace-nowrap">
                  Gerealiseerd
                </th>
                <th className="text-right px-2 py-2.5 text-xs text-neutral-500 font-medium whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1">
                    Kans % <SortBtn col="probability" />
                  </div>
                </th>
                <th className="px-1 py-2.5 w-[68px]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {loading
                ? [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      {[...Array(8)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-neutral-800 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : filtered.map((opp) => (
                    <tr
                      key={opp.id}
                      className="hover:bg-neutral-900/50 transition-colors"
                    >
                      <td className="px-4 py-3 min-w-0">
                        <p className="text-neutral-200 font-medium truncate">
                          {opp.name}
                        </p>
                      </td>
                      <td className="px-2 py-3 text-neutral-400 text-xs truncate">
                        {opp.company?.name || "—"}
                      </td>
                      <td className="px-1.5 py-3 text-neutral-500 text-xs font-mono truncate">
                        {TYPE_LABELS[opp.type]}
                      </td>
                      <td className="px-1.5 py-3" onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={opp.stage}
                          onValueChange={(v) =>
                            patchOpp(opp.id, { stage: v as Stage })
                          }
                        >
                          <SelectTrigger
                            className={cn(
                              selectTriggerClass,
                              "w-fit rounded font-medium font-mono",
                              stageStyles[opp.stage]
                            )}
                          >
                            <SelectValue />
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
                      <td className="px-1.5 py-3 text-right">
                        <InlineNumber
                          value={Number(opp.expected_value)}
                          onSave={(v) => patchOpp(opp.id, { expected_value: v })}
                          className="text-right text-neutral-300 w-16 ml-auto"
                        />
                      </td>
                      <td className="px-1.5 py-3 text-right">
                        <InlineNumber
                          value={Number(opp.actual_value)}
                          onSave={(v) => patchOpp(opp.id, { actual_value: v })}
                          className="text-right text-emerald-400 w-16 ml-auto"
                        />
                      </td>
                      <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1 min-w-0">
                          <div className="w-7 h-1.5 bg-neutral-800 rounded-full overflow-hidden shrink-0">
                            <div
                              className="h-full bg-[#e8ff47]/70 rounded-full"
                              style={{ width: `${opp.probability}%` }}
                            />
                          </div>
                          <InlineNumber
                            value={opp.probability}
                            onSave={(v) =>
                              patchOpp(opp.id, {
                                probability: Math.min(100, Math.max(0, v)),
                              })
                            }
                            className="text-right text-neutral-400 w-9 shrink-0"
                          />
                          <span className="text-xs text-neutral-600 shrink-0">%</span>
                        </div>
                      </td>
                      <td className="px-1 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingOpp(opp);
                              setFormOpen(true);
                            }}
                            className="p-1 text-neutral-600 hover:text-neutral-300 transition-colors rounded hover:bg-neutral-800"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(opp.id)}
                            className="p-1 text-neutral-700 hover:text-red-400 transition-colors rounded hover:bg-neutral-800"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
            <p className="text-neutral-600 text-sm">Geen kansen gevonden</p>
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
