"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Plus,
  Search,
  Trash2,
  Pencil,
  ExternalLink,
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
import { StageBadge } from "@/components/stage-badge";
import { SentimentIndicator } from "@/components/sentiment-indicator";
import { ProposalBadge } from "@/components/proposal-badge";
import { OpportunityForm } from "@/components/opportunity-form";
import { getOpportunities, deleteOpportunity } from "@/lib/api";
import {
  Opportunity,
  Stage,
  STAGE_LABELS,
  TYPE_LABELS,
} from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";

type SortKey = "name" | "expected_value" | "probability" | "close_date" | "updated_at";

export default function OpportunitiesPage() {
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<Stage | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("updated_at");
  const [sortAsc, setSortAsc] = useState(false);
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
            <span className="font-mono">{formatCurrency(totalExpected)}</span> verwacht ·{" "}
            <span className="font-mono text-amber-400">
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
          className="bg-amber-500 hover:bg-amber-400 text-neutral-950 font-medium gap-2"
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-900/60">
                <th className="text-left px-4 py-2.5 text-xs text-neutral-500 font-medium">
                  <div className="flex items-center gap-1.5">
                    Naam <SortBtn col="name" />
                  </div>
                </th>
                <th className="text-left px-4 py-2.5 text-xs text-neutral-500 font-medium">
                  Bedrijf
                </th>
                <th className="text-left px-4 py-2.5 text-xs text-neutral-500 font-medium">
                  Type
                </th>
                <th className="text-left px-4 py-2.5 text-xs text-neutral-500 font-medium">
                  Fase
                </th>
                <th className="text-right px-4 py-2.5 text-xs text-neutral-500 font-medium">
                  <div className="flex items-center justify-end gap-1.5">
                    Verwacht <SortBtn col="expected_value" />
                  </div>
                </th>
                <th className="text-right px-4 py-2.5 text-xs text-neutral-500 font-medium">
                  Gerealiseerd
                </th>
                <th className="text-right px-4 py-2.5 text-xs text-neutral-500 font-medium">
                  <div className="flex items-center justify-end gap-1.5">
                    Kans % <SortBtn col="probability" />
                  </div>
                </th>
                <th className="text-left px-4 py-2.5 text-xs text-neutral-500 font-medium">
                  Voorstel
                </th>
                <th className="text-left px-4 py-2.5 text-xs text-neutral-500 font-medium">
                  Sentiment
                </th>
                <th className="text-left px-4 py-2.5 text-xs text-neutral-500 font-medium">
                  <div className="flex items-center gap-1.5">
                    Sluitdatum <SortBtn col="close_date" />
                  </div>
                </th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {loading
                ? [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      {[...Array(11)].map((_, j) => (
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
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-neutral-200 font-medium truncate max-w-48">
                            {opp.name}
                          </p>
                          {opp.notes && (
                            <p className="text-xs text-neutral-600 truncate max-w-48">
                              {opp.notes}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-neutral-400 text-xs">
                        {opp.company?.name || "—"}
                      </td>
                      <td className="px-4 py-3 text-neutral-500 text-xs font-mono">
                        {TYPE_LABELS[opp.type]}
                      </td>
                      <td className="px-4 py-3">
                        <StageBadge stage={opp.stage} />
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-neutral-300 text-xs">
                        {formatCurrency(opp.expected_value)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {opp.actual_value > 0 ? (
                          <span className="text-emerald-400">
                            {formatCurrency(opp.actual_value)}
                          </span>
                        ) : (
                          <span className="text-neutral-700">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-12 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-amber-500/70 rounded-full"
                              style={{ width: `${opp.probability}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono text-neutral-400 w-8">
                            {opp.probability}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <ProposalBadge status={opp.proposal_status} />
                          {opp.proposal_url && (
                            <a
                              href={opp.proposal_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-neutral-600 hover:text-neutral-400 transition-colors"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <SentimentIndicator
                          sentiment={opp.sentiment}
                          showLabel
                        />
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-neutral-500">
                        {formatDate(opp.close_date)}
                      </td>
                      <td className="px-4 py-3">
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
