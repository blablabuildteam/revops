import { sql } from "@/lib/db";
import { logEvent } from "@/lib/agent-events";

export type AgentRunMode = "triage" | "execute";

/**
 * Starts an agent run in the client repo via GitHub `repository_dispatch`.
 * The repo's workflow fetches the ticket from /api/agent and writes results back.
 * Skips (and logs why) when the project is not set up for it. Never throws.
 */
export async function dispatchAgentRun(taskId: string, mode: AgentRunMode) {
  try {
    const { rows } = await sql`
      SELECT p.ai_mode, p.repo_full_name
      FROM tasks t JOIN projects p ON p.id = t.project_id
      WHERE t.id = ${taskId}
    `;
    const project = rows[0];
    const token = process.env.GITHUB_DISPATCH_TOKEN;
    const skipReason = !project
      ? "task not found"
      : !project.ai_mode
        ? "AI mode is off"
        : !project.repo_full_name
          ? "no repo set on project"
          : !token
            ? "GITHUB_DISPATCH_TOKEN not set"
            : null;
    if (skipReason) {
      if (project) await logEvent(taskId, "system", "dispatch_skipped", { mode, reason: skipReason });
      return { dispatched: false, reason: skipReason };
    }

    const res = await fetch(`https://api.github.com/repos/${project.repo_full_name}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_type: "revops-agent",
        client_payload: { ticket_id: taskId, mode },
      }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 500);
      await logEvent(taskId, "system", "dispatch_failed", { mode, status: res.status, detail });
      return { dispatched: false, reason: `GitHub responded ${res.status}` };
    }
    await logEvent(taskId, "system", "dispatched", { mode, repo: project.repo_full_name });
    return { dispatched: true };
  } catch (err) {
    console.error("[agent-dispatch]", err);
    try {
      await logEvent(taskId, "system", "dispatch_failed", { mode, detail: String(err) });
    } catch {
      // Logging is best-effort here.
    }
    return { dispatched: false, reason: "dispatch error" };
  }
}
