"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { bindProjectSlack, bindRetainerSlack, getSlackChannels } from "@/lib/api";
import {
  slackChannelName,
  slackChannelUrl,
  type SlackBindInput,
  type SlackChannelOption,
} from "@/lib/slack-channel-name";
import { cn } from "@/lib/utils";

export type SlackChannelDraft = SlackBindInput;

export function SlackMark({ className }: { className?: string }) {
  return (
    <img
      src="/Slack_icon_2019.svg.webp"
      alt=""
      className={cn("shrink-0 object-contain", className)}
    />
  );
}

export function isSlackDraftReady(draft: SlackChannelDraft | null): boolean {
  if (!draft) return false;
  if (draft.action === "connect") return Boolean(draft.channelId);
  return Boolean(draft.name.trim());
}

export function SlackChannelPicker({
  draft,
  onChange,
  suggestedName,
  required = false,
}: {
  draft: SlackChannelDraft | null;
  onChange: (next: SlackChannelDraft) => void;
  suggestedName?: string;
  required?: boolean;
}) {
  const [channels, setChannels] = useState<SlackChannelOption[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const suggested = slackChannelName(suggestedName ?? "");
  const action = draft?.action ?? "create";

  useEffect(() => {
    let cancelled = false;
    getSlackChannels()
      .then((res) => {
        if (cancelled) return;
        setConfigured(res.configured);
        setChannels(res.channels);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load Slack channels");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return channels;
    return channels.filter((ch) => ch.name.toLowerCase().includes(q));
  }, [channels, query]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading Slack channels…
      </div>
    );
  }

  if (!configured) {
    return (
      <p className="text-xs text-amber-300/90">
        Slack is not configured. Add SLACK_BOT_TOKEN to continue.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-neutral-400 text-xs">
          Slack channel{required ? " *" : ""}
        </Label>
        <div className="flex gap-1">
          {(["create", "connect"] as const).map((next) => (
            <button
              key={next}
              type="button"
              onClick={() =>
                onChange(
                  next === "create"
                    ? { action: "create", name: suggested, isPrivate: true }
                    : { action: "connect", channelId: draft?.action === "connect" ? draft.channelId : "" },
                )
              }
              className={cn(
                "px-2 py-1 rounded text-[11px] border transition-colors",
                action === next
                  ? "bg-[#d4e052]/10 border-[#d4e052] text-[#d4e052]"
                  : "border-neutral-700 text-neutral-500 hover:text-neutral-300",
              )}
            >
              {next === "create" ? "Create" : "Existing"}
            </button>
          ))}
        </div>
      </div>

      {action === "connect" ? (
        <div className="space-y-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search channels"
            className="h-8 bg-neutral-800 border-neutral-700 text-neutral-100 text-xs placeholder:text-neutral-600"
          />
          <div className="max-h-48 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-800/80">
            {filtered.length === 0 ? (
              <div className="px-2.5 py-2 text-xs text-neutral-500">No channels match</div>
            ) : (
              filtered.map((ch) => {
                const selected = draft?.action === "connect" && draft.channelId === ch.id;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    title={`#${ch.name}`}
                    onClick={() => onChange({ action: "connect", channelId: ch.id })}
                    className={cn(
                      "flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs font-mono transition-colors",
                      selected
                        ? "bg-[#d4e052]/10 text-[#d4e052]"
                        : "text-neutral-200 hover:bg-neutral-700/60",
                    )}
                  >
                    <span className="min-w-0 truncate">#{ch.name}</span>
                    {ch.is_private ? (
                      <span className="shrink-0 font-sans text-[10px] text-neutral-500">
                        private
                      </span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
          <p className="text-[11px] text-neutral-600">
            Private channels only appear if the bot is already a member.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500 text-sm">
              #
            </span>
            <Input
              value={draft?.action === "create" ? draft.name : suggested}
              onChange={(e) =>
                onChange({
                  action: "create",
                  name: slackChannelName(e.target.value),
                  isPrivate: true,
                })
              }
              className="h-10 bg-neutral-800 border-neutral-700 text-neutral-100 pl-6 font-mono text-sm"
            />
          </div>
          <p className="text-[11px] text-neutral-600">Creates a private Slack channel.</p>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

export function SlackChannelBinder({
  kind,
  id,
  channelId,
  channelName,
  suggestedName,
  compact = false,
  onBound,
}: {
  kind: "project" | "retainer";
  id: string;
  channelId?: string | null;
  channelName?: string | null;
  suggestedName: string;
  compact?: boolean;
  onBound?: (result: {
    slack_channel_id: string;
    slack_channel_name: string;
  }) => void;
}) {
  const [editing, setEditing] = useState(!channelId);
  const [draft, setDraft] = useState<SlackChannelDraft>({
    action: "create",
    name: slackChannelName(suggestedName),
    isPrivate: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bound, setBound] = useState({
    slack_channel_id: channelId ?? "",
    slack_channel_name: channelName ?? "",
  });

  useEffect(() => {
    setBound({
      slack_channel_id: channelId ?? "",
      slack_channel_name: channelName ?? "",
    });
    setEditing(!channelId);
  }, [channelId, channelName]);

  async function save() {
    if (!isSlackDraftReady(draft)) return;
    setSaving(true);
    setError(null);
    try {
      const result =
        kind === "project"
          ? await bindProjectSlack(id, draft)
          : await bindRetainerSlack(id, draft);
      const next = {
        slack_channel_id: result.slack_channel_id ?? "",
        slack_channel_name: result.slack_channel_name ?? "",
      };
      setBound(next);
      setEditing(false);
      onBound?.(next);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to link Slack channel");
    } finally {
      setSaving(false);
    }
  }

  const editor = (
    <div className="space-y-2 min-w-[16rem]">
      <SlackChannelPicker
        draft={draft}
        onChange={setDraft}
        suggestedName={suggestedName}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          disabled={saving || !isSlackDraftReady(draft)}
          onClick={() => void save()}
          className="h-8 bg-[#d4e052] hover:bg-[#c2ce45] text-neutral-950 text-xs"
        >
          {saving ? "Linking…" : bound.slack_channel_id ? "Update channel" : "Link channel"}
        </Button>
        {bound.slack_channel_id && !compact && (
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
            className="text-[11px] text-neutral-600 hover:text-neutral-300"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );

  if (compact) {
    return (
      <Popover>
        <PopoverTrigger
          aria-label={
            bound.slack_channel_id
              ? `Slack #${bound.slack_channel_name}`
              : "Link Slack channel"
          }
          title={
            bound.slack_channel_id
              ? `#${bound.slack_channel_name}`
              : "Link Slack channel"
          }
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-lg border transition-colors cursor-pointer",
            bound.slack_channel_id
              ? "border-emerald-500 hover:bg-emerald-500/10"
              : "border-dashed border-neutral-700 hover:border-neutral-500",
          )}
        >
          <SlackMark className="h-3.5 w-3.5" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-3">
          {bound.slack_channel_id && (
            <a
              href={slackChannelUrl(bound.slack_channel_id)}
              target="_blank"
              rel="noreferrer"
              className="mb-3 inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-[#d4e052]"
            >
              Open #{bound.slack_channel_name}
              <ExternalLink className="w-3 h-3 opacity-60" />
            </a>
          )}
          {editor}
        </PopoverContent>
      </Popover>
    );
  }

  if (bound.slack_channel_id && !editing) {
    return (
      <div className="flex items-center gap-2">
        <a
          href={slackChannelUrl(bound.slack_channel_id)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-[#d4e052]"
        >
          <SlackMark className="h-3.5 w-3.5" />
          {bound.slack_channel_name || "channel"}
          <ExternalLink className="w-3 h-3 opacity-60" />
        </a>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-[11px] text-neutral-600 hover:text-neutral-300"
        >
          Change
        </button>
      </div>
    );
  }

  return editor;
}
