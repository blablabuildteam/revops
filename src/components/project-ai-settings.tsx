"use client";

import { useState } from "react";
import Link from "next/link";
import { Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { updateProject } from "@/lib/api";
import type { Project, ProjectAiConfig, TicketType } from "@/lib/types";
import { cn } from "@/lib/utils";

const TICKET_TYPES: TicketType[] = ["bug", "change", "feature", "question"];

/** AI mode toggle, repo and agent config for a project. A setting, not a view type. */
export function ProjectAiSettings({
  project,
  onSaved,
}: {
  project: Project;
  onSaved: (updated: Project) => void;
}) {
  const config: ProjectAiConfig = project.ai_config ?? {};
  const [aiMode, setAiMode] = useState(Boolean(project.ai_mode));
  const [repo, setRepo] = useState(project.repo_full_name ?? "");
  const [branch, setBranch] = useState(project.repo_default_branch ?? "main");
  const [types, setTypes] = useState<TicketType[]>(config.allowed_ticket_types ?? ["bug", "change"]);
  const [sensitive, setSensitive] = useState((config.sensitive_paths ?? []).join("\n"));
  const [contactMode, setContactMode] = useState(config.client_contact_mode ?? "whatsapp");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateProject(project.id, {
        ai_mode: aiMode,
        repo_full_name: repo.trim() || null,
        repo_default_branch: branch.trim() || "main",
        ai_config: {
          allowed_ticket_types: types,
          client_contact_mode: contactMode,
          sensitive_paths: sensitive.split("\n").map((s) => s.trim()).filter(Boolean),
        },
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "flex items-center gap-1.5 h-7 rounded-md border px-2 text-xs",
          project.ai_mode
            ? "border-[#d4e052]/40 text-[#d4e052]"
            : "border-neutral-700/50 bg-neutral-800/50 text-neutral-400",
        )}
      >
        <Bot className="w-3.5 h-3.5" />
        {project.ai_mode ? "AI on" : "AI"}
      </PopoverTrigger>
      <PopoverContent className="w-80 bg-neutral-900 border-neutral-700 text-neutral-100 space-y-3">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>AI ticket handling</span>
          <input
            type="checkbox"
            checked={aiMode}
            onChange={(e) => setAiMode(e.target.checked)}
            className="h-4 w-4 accent-[#d4e052]"
          />
        </label>
        <p className="text-xs text-neutral-500">
          Client requests use the guided form and are triaged by the agent. You approve plans and client messages.
        </p>
        <div className="space-y-1">
          <Label className="text-xs text-neutral-400">Repository</Label>
          <Input
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="owner/name"
            className="h-8 bg-neutral-800 border-neutral-700 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-neutral-400">Default branch</Label>
          <Input
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="h-8 bg-neutral-800 border-neutral-700 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-neutral-400">Ticket types the agent may execute</Label>
          <div className="flex flex-wrap gap-1.5">
            {TICKET_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))}
                className={cn(
                  "rounded px-2 py-0.5 text-xs border",
                  types.includes(t)
                    ? "border-[#d4e052]/50 text-[#d4e052]"
                    : "border-neutral-700 text-neutral-500",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-neutral-400">Client contact</Label>
          <select
            value={contactMode}
            onChange={(e) => setContactMode(e.target.value as ProjectAiConfig["client_contact_mode"] & string)}
            className="h-8 w-full rounded-md bg-neutral-800 border border-neutral-700 px-2 text-xs"
          >
            <option value="whatsapp">WhatsApp via Grok Bots</option>
            <option value="none">Don&apos;t contact the client</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-neutral-400">Sensitive paths (one per line)</Label>
          <Textarea
            value={sensitive}
            onChange={(e) => setSensitive(e.target.value)}
            rows={3}
            placeholder={"app/checkout/\nlib/payments/"}
            className="bg-neutral-800 border-neutral-700 text-xs font-mono"
          />
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex items-center justify-between">
          <Link href="/agent-keys" className="text-xs text-neutral-500 hover:text-neutral-300">
            Agent keys →
          </Link>
          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={save}
            className="h-7 text-xs bg-[#d4e052] hover:bg-[#c2ce45] text-neutral-950"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
