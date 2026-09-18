"use client";

export const dynamic = "force-dynamic";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RetainerHoursReport } from "@/components/retainer-hours-report";
import { useRetainers } from "@/hooks/use-api-data";
import { toPublicRetainer } from "@/lib/retainers";

export default function RetainerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: retainers = [], isLoading } = useRetainers();
  const retainer = retainers.find((r) => r.id === id);
  const loading = isLoading && !retainer;
  const [copied, setCopied] = useState(false);

  async function copyClientLink() {
    if (!retainer?.share_token) return;
    const url = `${window.location.origin}/retainer/${retainer.share_token}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="page-shell">
        <div className="h-64 border border-neutral-800 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!retainer) {
    return (
      <div className="page-shell space-y-4">
        <Link
          href="/retainers"
          className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-200"
        >
          <ArrowLeft className="w-4 h-4" />
          Retainers
        </Link>
        <p className="text-sm text-neutral-500">Retainer niet gevonden.</p>
      </div>
    );
  }

  const clientUrl = retainer.share_token
    ? `/retainer/${retainer.share_token}`
    : null;

  return (
    <div className="page-shell space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/retainers"
          className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-200"
        >
          <ArrowLeft className="w-4 h-4" />
          Retainers
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void copyClientLink()}
            disabled={!clientUrl}
            className="h-8 border-neutral-700 bg-neutral-900 text-neutral-200 hover:bg-neutral-800"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            {copied ? "Gekopieerd" : "Kopieer klanlink"}
          </Button>
          {clientUrl && (
            <Link
              href={clientUrl}
              target="_blank"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 text-sm text-neutral-200 hover:bg-neutral-800"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Bekijk als klant
            </Link>
          )}
        </div>
      </div>

      <div className="max-w-3xl">
        <RetainerHoursReport retainer={toPublicRetainer(retainer)} />
      </div>
    </div>
  );
}
