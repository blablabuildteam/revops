"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { Plus, TrendingUp, Target, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StageBadge } from "@/components/stage-badge";
import { SentimentIndicator } from "@/components/sentiment-indicator";
import { OpportunityForm } from "@/components/opportunity-form";
import { getOpportunities } from "@/lib/api";
import { Opportunity } from "@/lib/types";
import { formatCurrency, formatRelativeDate } from "@/lib/format";

function KpiCard({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="border border-neutral-800 rounded-lg px-5 py-4 bg-neutral-900/40">
      <p className="text-xs text-neutral-500 uppercase tracking-widest mb-1">{label}</p>
      <p
        className={`text-2xl font-mono font-semibold ${accent ? "text-[#e8ff47]" : "text-neutral-100"}`}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-neutral-600 mt-1">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  async function load() {
    setLoading(true);
    const data = await getOpportunities();
    setOpps(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const active = opps.filter((o) => !["won", "lost"].includes(o.stage));
  const won = opps.filter((o) => o.stage === "won");
  const pipeline = active.reduce((s, o) => s + o.expected_value, 0);
  const weighted = active.reduce((s, o) => s + o.weighted_value, 0);
  const actualRevenue = won.reduce((s, o) => s + o.actual_value, 0);
  const winRate =
    opps.filter((o) => ["won", "lost"].includes(o.stage)).length > 0
      ? Math.round(
          (won.length /
            opps.filter((o) => ["won", "lost"].includes(o.stage)).length) *
            100
        )
      : 0;

  const recentOpps = [...opps]
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
    .slice(0, 8);

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-100">Dashboard</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Overzicht van pipeline &amp; omzet
          </p>
        </div>
        <Button
          onClick={() => setFormOpen(true)}
          className="bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 font-medium gap-2"
        >
          <Plus className="w-4 h-4" />
          Nieuwe kans
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="border border-neutral-800 rounded-lg px-5 py-4 bg-neutral-900/40 h-20 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Pipeline totaal"
            value={formatCurrency(pipeline)}
            sub={`${active.length} actieve kansen`}
            accent
          />
          <KpiCard
            label="Gewogen pipeline"
            value={formatCurrency(weighted)}
            sub="Op basis van kans %"
          />
          <KpiCard
            label="Gerealiseerde omzet"
            value={formatCurrency(actualRevenue)}
            sub={`${won.length} gewonnen`}
          />
          <KpiCard
            label="Win rate"
            value={`${winRate}%`}
            sub={`van ${opps.filter((o) => ["won", "lost"].includes(o.stage)).length} afgesloten`}
          />
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Recent opportunities */}
        <div className="col-span-2 border border-neutral-800 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-neutral-800 flex items-center justify-between">
            <h2 className="text-sm font-medium text-neutral-300">Recente kansen</h2>
            <a
              href="/opportunities"
              className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              Alle kansen →
            </a>
          </div>
          <div className="divide-y divide-neutral-800/70">
            {recentOpps.map((opp) => (
              <div
                key={opp.id}
                className="px-5 py-3 flex items-center gap-4 hover:bg-neutral-900/50 transition-colors"
              >
                <SentimentIndicator sentiment={opp.sentiment} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-neutral-200 truncate">{opp.name}</p>
                  <p className="text-xs text-neutral-600 truncate">
                    {opp.company?.name || "—"}
                  </p>
                </div>
                <StageBadge stage={opp.stage} />
                <div className="text-right shrink-0">
                  <p className="text-sm font-mono text-neutral-300">
                    {formatCurrency(opp.expected_value)}
                  </p>
                  <p className="text-xs text-neutral-600 font-mono">
                    {opp.probability}%
                  </p>
                </div>
              </div>
            ))}
            {recentOpps.length === 0 && (
              <p className="px-5 py-8 text-sm text-neutral-600 text-center">
                Nog geen kansen. Voeg er een toe!
              </p>
            )}
          </div>
        </div>

        {/* Stage breakdown */}
        <div className="border border-neutral-800 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-neutral-800">
            <h2 className="text-sm font-medium text-neutral-300">Per fase</h2>
          </div>
          <div className="p-5 space-y-3">
            {(["prospect", "qualified", "proposal", "negotiation", "won"] as const).map(
              (stage) => {
                const stageOpps = opps.filter((o) => o.stage === stage);
                const stageValue = stageOpps.reduce(
                  (s, o) => s + o.expected_value,
                  0
                );
                return (
                  <div key={stage} className="flex items-center gap-3">
                    <StageBadge stage={stage} className="w-28 justify-center" />
                    <div className="flex-1">
                      <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#e8ff47]/60 rounded-full transition-all"
                          style={{
                            width: pipeline
                              ? `${Math.min((stageValue / pipeline) * 100, 100)}%`
                              : "0%",
                          }}
                        />
                      </div>
                    </div>
                    <span className="text-xs font-mono text-neutral-500 w-16 text-right">
                      {formatCurrency(stageValue)}
                    </span>
                  </div>
                );
              }
            )}
          </div>

          <div className="border-t border-neutral-800 px-5 py-4 space-y-2">
            <h3 className="text-xs text-neutral-500 uppercase tracking-widest mb-3">
              Aandacht nodig
            </h3>
            {opps
              .filter((o) => o.sentiment === "negative" || o.sentiment === "very_negative")
              .slice(0, 3)
              .map((opp) => (
                <div key={opp.id} className="flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs text-neutral-300 truncate">{opp.name}</p>
                    <p className="text-xs text-neutral-600">
                      Sluit {formatRelativeDate(opp.close_date)}
                    </p>
                  </div>
                </div>
              ))}
            {opps.filter(
              (o) => o.sentiment === "negative" || o.sentiment === "very_negative"
            ).length === 0 && (
              <div className="flex items-center gap-2 text-xs text-neutral-600">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Alles ziet er goed uit
              </div>
            )}
          </div>
        </div>
      </div>

      <OpportunityForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={(opp) => {
          setOpps((prev) => [opp, ...prev]);
        }}
      />
    </div>
  );
}
