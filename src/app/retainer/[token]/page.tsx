"use client";

export const dynamic = "force-dynamic";

import { use, useEffect, useState } from "react";
import { Clock, RefreshCw } from "lucide-react";
import { RetainerHoursReport } from "@/components/retainer-hours-report";
import { getPublicRetainer } from "@/lib/api";
import type { PublicRetainer } from "@/lib/types";

export default function ClientRetainerPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [retainer, setRetainer] = useState<PublicRetainer | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function loadRetainer() {
    try {
      const data = await getPublicRetainer(token);
      setRetainer(data);
      setLastUpdated(new Date());
      setNotFound(false);
    } catch {
      setNotFound(true);
    }
  }

  useEffect(() => {
    loadRetainer().finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!retainer) return;
    document.title = `${retainer.client_name} · uren · blablabuild`;
  }, [retainer]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadRetainer();
    setRefreshing(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 border-2 border-[#d4e052]/30 border-t-[#d4e052] rounded-full animate-spin" />
        <p className="text-sm text-neutral-600">Laden...</p>
      </div>
    );
  }

  if (notFound || !retainer) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col">
        <div className="border-b border-neutral-800 px-6 py-4">
          <p className="text-xs font-bold tracking-[0.2em] uppercase text-[#d4e052]">
            blablabuild
          </p>
        </div>
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <div>
            <Clock className="w-12 h-12 text-neutral-700 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-neutral-300 mb-2">
              Retainer niet gevonden
            </h1>
            <p className="text-sm text-neutral-600 max-w-xs mx-auto">
              Deze link is ongeldig of verlopen. Neem contact op met blablabuild
              als je denkt dat dit een fout is.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-neutral-800 px-6 py-4 flex items-center justify-between sticky top-0 bg-neutral-950/95 backdrop-blur-sm z-20">
        <p className="text-xs font-bold tracking-[0.2em] uppercase text-[#d4e052]">
          blablabuild
        </p>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors disabled:opacity-50"
            title="Vernieuwen"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">Vernieuwen</span>
          </button>
          <p className="text-xs text-neutral-700 font-mono">urenoverzicht</p>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-10">
        <RetainerHoursReport retainer={retainer} />
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-800 px-6 py-6 mt-auto">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div>
            <p className="text-xs text-neutral-600">
              Laatste update:{" "}
              {lastUpdated?.toLocaleString("nl-NL", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }) ?? "—"}
            </p>
          </div>
          <p className="text-xs text-neutral-700">
            Made by{" "}
            <span className="text-[#d4e052]/80">blablabuild</span> · Talk less,
            build more.
          </p>
        </div>
      </footer>
    </div>
  );
}
