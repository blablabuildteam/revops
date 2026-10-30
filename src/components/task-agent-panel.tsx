"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Check, ExternalLink, GitPullRequest, Loader2, Play, RefreshCw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  decideAgentAction,
  getTaskAgent,
  taskAgentCommand,
  type AgentTicketView,
} from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { INTAKE_FIELDS } from "@/lib/ticket-intake";
import type { AgentAction, TriageStatus } from "@/lib/types";

const STATUS_LABELS: Record<TriageStatus, string> = {
  new: "Triaging",
  needs_admin: "Needs you",
  needs_client: "Waiting on client",
  needs_spec: "Needs spec",
  ready: "Ready",
  human_only: "Human only",
  stale: "Stale",
  in_progress: "Agent working",
  pr_open: "PR open",
  done: "Done",
};

const KIND_LABELS: Record<AgentAction["kind"], string> = {
  approve_plan: "Plan approval",
  client_message: "Client message",
  start_execution: "Execution start",
};

function actionText(action: AgentAction) {
  const edited = action.edited_payload?.text;
  if (typeof edited === "string") return edited;
  if (typeof action.payload.text === "string") return action.payload.text;
  return null;
}

/** AI triage panel inside the task dialog. Rendered only for tasks that have a triage status. */
export function TaskAgentPanel({ taskId }: { taskId: string }) {
  const [view, setView] = useState<AgentTicketView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [answer, setAnswer] = useState("");

  const load = useCallback(() => {
    getTaskAgent(taskId)
      .then(setView)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load AI details"));
  }, [taskId]);

  useEffect(load, [load]);

  async function act(key: string, fn: () => Promise<{ reason?: string } | unknown>) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const res = (await fn()) as { reason?: string } | undefined;
      if (res && typeof res === "object" && "reason" in res && res.reason) setNotice(`Not dispatched: ${res.reason}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  if (!view) {
    return (
      <div className="flex items-center gap-2 text-xs text-neutral-500 py-2">
        {error ?? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading AI details…</>}
      </div>
    );
  }

  const triage = view.triage;
  const intake = view.client_content.intake ?? {};
  const intakeKind = view.ticket_type === "bug" || view.ticket_type === "feature" ? view.ticket_type : null;
  const openActions = view.actions.filter(
    (a) => a.status === "pending" || (a.kind === "client_message" && a.status === "approved"),
  );
  const planApproved = view.actions.some((a) => a.kind === "approve_plan" && a.status === "approved");

  return (
    <div className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Bot className="w-4 h-4 text-[#d4e052]" />
        <span className="text-xs font-medium text-neutral-300">AI triage</span>
        {view.ticket_type && (
          <span className="text-[11px] rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-400">{view.ticket_type}</span>
        )}
        {view.triage_status && (
          <span className="text-[11px] rounded bg-[#d4e052]/15 px-1.5 py-0.5 text-[#d4e052]">
            {STATUS_LABELS[view.triage_status]}
          </span>
        )}
        <div className="ml-auto flex gap-1.5">
          {view.triage_status === "ready" && planApproved && (
            <Button
              type="button"
              size="sm"
              disabled={busy !== null}
              onClick={() => act("exec", () => taskAgentCommand(taskId, "start_execution"))}
              className="h-7 text-xs gap-1.5 bg-[#d4e052] hover:bg-[#c2ce45] text-neutral-950"
            >
              <Play className="w-3 h-3" /> Start execution
            </Button>
          )}
          {view.triage_status !== "in_progress" && view.triage_status !== "pr_open" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => act("triage", () => taskAgentCommand(taskId, "start_triage"))}
              className="h-7 text-xs gap-1.5 border-neutral-700 bg-transparent text-neutral-300"
            >
              <RefreshCw className="w-3 h-3" /> Re-triage
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {notice && <p className="text-xs text-amber-400">{notice}</p>}

      {intakeKind && Object.keys(intake).length > 0 && (
        <dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-[max-content_1fr]">
          {INTAKE_FIELDS[intakeKind]
            .filter((f) => intake[f.key])
            .map((f) => (
              <div key={f.key} className="contents">
                <dt className="text-neutral-500">{f.label}</dt>
                <dd className="text-neutral-300 whitespace-pre-wrap break-words">{intake[f.key]}</dd>
              </div>
            ))}
        </dl>
      )}

      {triage?.summary && <p className="text-xs text-neutral-300 whitespace-pre-wrap">{triage.summary}</p>}

      {triage?.plan && triage.plan.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-neutral-500">
            Plan{triage.size ? ` · ${triage.size.toUpperCase()}` : ""}
            {triage.estimate_hours != null ? ` · ~${triage.estimate_hours}h` : ""}
            {triage.in_sla != null ? ` · ${triage.in_sla ? "in SLA" : "new work"}` : ""}
          </p>
          <ol className="list-decimal pl-5 text-xs text-neutral-300 space-y-0.5">
            {triage.plan.map((step, i) => <li key={i}>{step}</li>)}
          </ol>
        </div>
      )}

      {triage?.checklist && triage.checklist.length > 0 && (
        <ul className="text-xs space-y-0.5">
          {triage.checklist.map((c, i) => (
            <li key={i} className="flex gap-1.5 text-neutral-400">
              {c.ok ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <X className="w-3.5 h-3.5 text-red-400 shrink-0" />}
              <span>{c.item}{c.note ? ` — ${c.note}` : ""}</span>
            </li>
          ))}
        </ul>
      )}

      {openActions.map((action) => {
        const text = actionText(action);
        const isMessage = action.kind === "client_message";
        return (
          <div key={action.id} className="rounded-md border border-neutral-800 p-3 space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-neutral-500">
              {KIND_LABELS[action.kind]} · {action.status}
              {action.decided_by_name ? ` by ${action.decided_by_name} (${action.decided_via})` : ""}
            </p>
            {isMessage && action.status === "pending" ? (
              <Textarea
                value={edits[action.id] ?? text ?? ""}
                onChange={(e) => setEdits((m) => ({ ...m, [action.id]: e.target.value }))}
                rows={3}
                className="bg-neutral-800 border-neutral-700 text-neutral-100 text-xs"
              />
            ) : text ? (
              <p className="text-xs text-neutral-300 whitespace-pre-wrap">{text}</p>
            ) : null}
            <div className="flex gap-1.5">
              {action.status === "pending" && (
                <>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() =>
                      act(action.id, () =>
                        decideAgentAction(
                          action.id,
                          "approve",
                          isMessage && edits[action.id] !== undefined && edits[action.id] !== text
                            ? edits[action.id]
                            : undefined,
                        ),
                      )
                    }
                    className="h-7 text-xs gap-1 bg-[#d4e052] hover:bg-[#c2ce45] text-neutral-950"
                  >
                    <Check className="w-3 h-3" /> Approve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => act(action.id, () => decideAgentAction(action.id, "reject"))}
                    className="h-7 text-xs gap-1 border-neutral-700 bg-transparent text-neutral-300"
                  >
                    <X className="w-3 h-3" /> Reject
                  </Button>
                </>
              )}
              {isMessage && action.status === "approved" && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => act(action.id, () => decideAgentAction(action.id, "sent"))}
                  className="h-7 text-xs gap-1 border-neutral-700 bg-transparent text-neutral-300"
                >
                  <Send className="w-3 h-3" /> Mark sent
                </Button>
              )}
            </div>
          </div>
        );
      })}

      {(view.triage_status === "needs_admin" || view.triage_status === "needs_spec") && (
        <div className="space-y-2">
          <Textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Answer the agent's questions; triage runs again…"
            rows={2}
            className="bg-neutral-800 border-neutral-700 text-neutral-100 text-xs"
          />
          <Button
            type="button"
            size="sm"
            disabled={busy !== null || !answer.trim()}
            onClick={() =>
              act("answer", async () => {
                const res = await taskAgentCommand(taskId, "answer", answer);
                setAnswer("");
                return res;
              })
            }
            className="h-7 text-xs gap-1 bg-neutral-700 hover:bg-neutral-600 text-neutral-100"
          >
            <Send className="w-3 h-3" /> Answer &amp; re-triage
          </Button>
        </div>
      )}

      {(view.pr_url || view.preview_url) && (
        <div className="flex flex-wrap gap-3 text-xs">
          {view.pr_url && (
            <a href={view.pr_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[#d4e052] hover:underline">
              <GitPullRequest className="w-3.5 h-3.5" /> Pull request
            </a>
          )}
          {view.preview_url && (
            <a href={view.preview_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[#d4e052] hover:underline">
              <ExternalLink className="w-3.5 h-3.5" /> Preview
            </a>
          )}
          {view.agent_branch && <span className="font-mono text-neutral-500">{view.agent_branch}</span>}
        </div>
      )}

      {view.events.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-neutral-500">Timeline ({view.events.length})</summary>
          <ul className="mt-2 space-y-1 max-h-48 overflow-y-auto">
            {view.events.map((e) => (
              <li key={e.id} className="flex gap-2 text-neutral-400">
                <time className="text-neutral-600 shrink-0" dateTime={e.created_at}>{formatDateTime(e.created_at)}</time>
                <span className="text-neutral-500 shrink-0">{e.actor_label ?? e.actor}</span>
                <span className="break-words">
                  {e.kind.replace(/_/g, " ")}
                  {typeof e.data.reason === "string" ? ` — ${e.data.reason}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
