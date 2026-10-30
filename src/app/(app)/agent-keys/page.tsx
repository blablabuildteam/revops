"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { Copy, KeyRound, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createAgentKeyRequest,
  getAgentKeys,
  getProjects,
  revokeAgentKeyRequest,
  type AgentKeyRow,
  type ProjectWithStats,
} from "@/lib/api";
import { formatDateTime } from "@/lib/format";

/** Machine keys: "agent" for the GitHub runtime (per project), "operator" for Grok Bots (acts as you). */
export default function AgentKeysPage() {
  const [keys, setKeys] = useState<AgentKeyRow[]>([]);
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"agent" | "operator">("agent");
  const [projectId, setProjectId] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    getAgentKeys().then(setKeys).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    getProjects().then(setProjects).catch(() => {});
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { key } = await createAgentKeyRequest({ name, scope, project_id: projectId || null });
      setNewKey(key);
      setName("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create key");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this key? Anything using it stops working.")) return;
    try {
      await revokeAgentKeyRequest(id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke key");
    }
  }

  return (
    <div className="page-shell space-y-6">
      <div>
        <h1 className="text-lg sm:text-xl font-semibold text-neutral-100">Agent keys</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Agent keys let a client repo&apos;s workflow read tickets and write triage back. Operator keys are for
          Grok Bots and record approvals as you.
        </p>
      </div>

      <form onSubmit={create} className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-end border border-neutral-800 rounded-lg p-4">
        <div className="space-y-1">
          <Label className="text-xs text-neutral-500">Name</Label>
          <Input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="comfortzzzone runner"
            className="bg-neutral-900 border-neutral-700 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-neutral-500">Scope</Label>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as "agent" | "operator")}
            className="h-9 rounded-md bg-neutral-900 border border-neutral-700 px-2 text-sm text-neutral-100"
          >
            <option value="agent">agent</option>
            <option value="operator">operator</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-neutral-500">Project (agent keys)</Label>
          <select
            value={projectId}
            disabled={scope !== "agent"}
            onChange={(e) => setProjectId(e.target.value)}
            className="h-9 w-full rounded-md bg-neutral-900 border border-neutral-700 px-2 text-sm text-neutral-100 disabled:opacity-40"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={busy} className="bg-[#d4e052] hover:bg-[#c2ce45] text-neutral-950 gap-1.5">
          <Plus className="w-4 h-4" /> Create
        </Button>
      </form>

      {newKey && (
        <div className="border border-[#d4e052]/40 rounded-lg p-4 space-y-2">
          <p className="text-sm text-neutral-200">Copy this key now. It is not shown again.</p>
          <div className="flex gap-2">
            <code className="flex-1 min-w-0 break-all rounded bg-neutral-900 px-3 py-2 text-xs text-[#d4e052]">{newKey}</code>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigator.clipboard.writeText(newKey)}
              className="border-neutral-700 bg-transparent"
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <button type="button" onClick={() => setNewKey(null)} className="text-xs text-neutral-500 hover:text-neutral-300">
            Done
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="border border-neutral-800 rounded-lg divide-y divide-neutral-800">
        {keys.length === 0 && <p className="p-4 text-sm text-neutral-600">No keys yet.</p>}
        {keys.map((k) => (
          <div key={k.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <KeyRound className="w-4 h-4 text-neutral-500" />
            <span className={k.revoked_at ? "text-neutral-600 line-through" : "text-neutral-200"}>{k.name}</span>
            <span className="font-mono text-xs text-neutral-500">rvk_{k.prefix}_…</span>
            <span className="text-xs rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-400">{k.scope}</span>
            {k.scope === "operator" && k.user_name && <span className="text-xs text-neutral-500">as {k.user_name}</span>}
            {k.scope === "agent" && <span className="text-xs text-neutral-500">{k.project_name ?? "all projects"}</span>}
            <span className="ml-auto text-xs text-neutral-600">
              {k.revoked_at
                ? `Revoked ${formatDateTime(k.revoked_at)}`
                : k.last_used_at
                  ? `Used ${formatDateTime(k.last_used_at)}`
                  : "Never used"}
            </span>
            {!k.revoked_at && (
              <button type="button" onClick={() => revoke(k.id)} className="text-xs text-red-400/80 hover:text-red-400">
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
