"use client";

export const dynamic = "force-dynamic";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUndoToast } from "@/components/mutation-provider";
import { RetainerHoursReport } from "@/components/retainer-hours-report";
import { SlackChannelBinder } from "@/components/slack-channel-picker";
import { suggestedSlackChannelName } from "@/lib/slack-channel-name";
import { useRetainers } from "@/hooks/use-api-data";
import { updateRetainerTimeEntry } from "@/lib/api";
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
  const withUndo = useUndoToast();

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
          <SlackChannelBinder
            kind="retainer"
            id={retainer.id}
            channelId={retainer.slack_channel_id}
            channelName={retainer.slack_channel_name}
            suggestedName={suggestedSlackChannelName(retainer.client_name, "retainer")}
            compact
          />
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
        <RetainerHoursReport
          retainer={toPublicRetainer(retainer)}
          onUpdateEntry={async (entry, next) => {
            const original = retainer.entries.find((item) => item.id === entry.id);
            await withUndo({
              label: "Uren bijgewerkt",
              run: async () => {
                await updateRetainerTimeEntry(entry.id, next);
              },
              undo: async () => {
                if (!original) return;
                await updateRetainerTimeEntry(entry.id, {
                  hours: original.hours,
                  activity: original.activity,
                  category: original.category,
                  logged_by: original.logged_by,
                  work_date: original.work_date ?? null,
                  week_start: original.week_start,
                });
              },
            });
          }}
        />
      </div>
    </div>
  );
}
