"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bot, ChevronDown, ChevronRight, Copy, Loader2, Play, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskAgentPanel } from "@/components/task-agent-panel";
import {
  getAiReview,
  getClientBundle,
  markClientBundleSent,
  startBacklogTriageRequest,
  type AiReview,
  type ClientBundle,
} from "@/lib/api";

const STAT_ORDER = ["new", "ready", "needs_client", "needs_admin", "needs_spec", "human_only", "stale", "pr_open", "done"];

/** Phase 6 review: backlog shadow triage, decisions waiting on you, and bundled client questions. */
export default function AiReviewPage() {
  const [review, setReview] = useState<AiReview | null>(null);
  const [bundles, setBundles] = useState<Record<string, ClientBundle>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      getAiReview()
        .then(async (data) => {
          const entries = await Promise.all(
            data.projects.map(async (p) => [p.id, await getClientBundle(p.id)] as const),
          );
          setReview(data);
          setBundles(Object.fromEntries(entries));
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Could not load")),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function run(key: string, fn: () => Promise<string | void>) {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      const note = await fn();
      if (note) setMessage(note);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  if (!review) {
    return (
      <div className="page-shell text-sm text-neutral-500 flex items-center gap-2">
        {error ?? <><Loader2 className="w-4 h-4 animate-spin" /> Loading…</>}
      </div>
    );
  }

  return (
    <div className="page-shell space-y-6">
      <div>
        <h1 className="text-lg sm:text-xl font-semibold text-neutral-100 flex items-center gap-2">
          <Bot className="w-5 h-5 text-[#d4e052]" /> AI review
        </h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Triage the existing backlog, decide on plans and questions, and send client questions as one message.
        </p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {message && <p className="text-sm text-amber-400">{message}</p>}

      {review.projects.length === 0 && (
        <p className="text-sm text-neutral-500">No projects have AI mode on. Turn it on from a project&apos;s AI button.</p>
      )}

      {review.projects.map((project) => {
        const bundle = bundles[project.id];
        const items = review.awaiting.filter((a) => a.project_id === project.id);
        const total = Object.values(project.stats.by_status).reduce((a, b) => a + b, 0);
        return (
          <section key={project.id} className="border border-neutral-800 rounded-lg">
            <div className="flex flex-wrap items-center gap-3 p-4 border-b border-neutral-800">
              <Link href={`/projects/${project.id}`} className="font-medium text-neutral-100 hover:underline">
                {project.name}
              </Link>
              <span className="text-xs text-neutral-500 font-mono">{project.repo_full_name ?? "no repo set"}</span>
              <Button
                type="button"
                size="sm"
                disabled={busy !== null || project.stats.untriaged_open === 0}
                onClick={() =>
                  run(`backlog-${project.id}`, async () => {
                    const r = await startBacklogTriageRequest(project.id, 25);
                    return `Started ${r.started}, dispatched ${r.dispatched}` +
                      (r.skipped_reason ? ` (skipped: ${r.skipped_reason})` : "") +
                      `. ${r.untriaged_left} left.`;
                  })
                }
                className="ml-auto h-7 text-xs gap-1.5 bg-[#d4e052] hover:bg-[#c2ce45] text-neutral-950"
              >
                <Play className="w-3 h-3" /> Triage next 25 ({project.stats.untriaged_open} open)
              </Button>
            </div>

            <div className="p-4 space-y-4">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="text-neutral-500">Backfilled {project.stats.backfilled}:</span>
                {STAT_ORDER.filter((s) => project.stats.by_status[s]).map((s) => (
                  <span key={s} className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-300">
                    {s.replace(/_/g, " ")} {project.stats.by_status[s]}
                    <span className="text-neutral-500"> · {Math.round((project.stats.by_status[s] / total) * 100)}%</span>
                  </span>
                ))}
              </div>

              {bundle && bundle.action_ids.length > 0 && (
                <div className="rounded-md border border-[#d4e052]/30 p-3 space-y-2">
                  <p className="text-xs text-neutral-400">
                    {bundle.action_ids.length} approved question{bundle.action_ids.length === 1 ? "" : "s"} for the client, as one message:
                  </p>
                  <pre className="whitespace-pre-wrap text-xs text-neutral-200 font-sans">{bundle.text}</pre>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => navigator.clipboard.writeText(bundle.text)}
                      className="h-7 text-xs gap-1 border-neutral-700 bg-transparent text-neutral-300"
                    >
                      <Copy className="w-3 h-3" /> Copy
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() =>
                        run(`bundle-${project.id}`, async () => {
                          const r = await markClientBundleSent(project.id, bundle.action_ids);
                          return `Marked ${r.sent} message${r.sent === 1 ? "" : "s"} sent.`;
                        })
                      }
                      className="h-7 text-xs gap-1 bg-neutral-700 hover:bg-neutral-600 text-neutral-100"
                    >
                      <Send className="w-3 h-3" /> Mark all sent
                    </Button>
                  </div>
                </div>
              )}

              {items.length === 0 ? (
                <p className="text-xs text-neutral-600">Nothing waiting on you.</p>
              ) : (
                <ul className="divide-y divide-neutral-800 border border-neutral-800 rounded-md">
                  {items.map((item) => (
                    <li key={item.task_id}>
                      <button
                        type="button"
                        onClick={() => setOpen(open === item.task_id ? null : item.task_id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-900"
                      >
                        {open === item.task_id ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        <span className="text-neutral-200 truncate">{item.title}</span>
                        <span className="ml-auto text-[11px] text-neutral-500 shrink-0">
                          {item.triage_status?.replace(/_/g, " ")}
                          {item.open_actions.length > 0 && ` · ${item.open_actions.map((a) => a.kind.replace(/_/g, " ")).join(", ")}`}
                        </span>
                      </button>
                      {open === item.task_id && (
                        <div className="px-3 pb-3">
                          <TaskAgentPanel taskId={item.task_id} onChange={() => void load()} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
