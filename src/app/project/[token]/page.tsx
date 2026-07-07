"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, use } from "react";
import { CheckCircle2, Circle, Clock, Plus, X, Check, Send } from "lucide-react";
import { getPublicProject, submitClientTask } from "@/lib/api";
import { Project, Milestone, Task } from "@/lib/types";
import { formatDate } from "@/lib/format";

const taskStatusIcon = {
  open: <Circle className="w-4 h-4 text-neutral-500" />,
  in_progress: <Clock className="w-4 h-4 text-blue-400" />,
  done: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
};

const milestoneStatusBar: Record<string, string> = {
  pending: "bg-neutral-700",
  in_progress: "bg-blue-500",
  completed: "bg-emerald-500",
};

type PublicProject = Project & {
  milestones: (Milestone & { tasks: Task[] })[];
  unassigned_tasks: Task[];
};

export default function ClientProjectPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [project, setProject] = useState<PublicProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestTitle, setRequestTitle] = useState("");
  const [requestDesc, setRequestDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    getPublicProject(token)
      .then((p) => { setProject(p as PublicProject); setLoading(false); })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [token]);

  async function handleSubmitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!requestTitle.trim()) return;
    setSubmitting(true);
    try {
      await submitClientTask(token, { title: requestTitle.trim(), description: requestDesc || undefined });
      setSubmitted(true);
      setRequestTitle("");
      setRequestDesc("");
      setTimeout(() => { setSubmitted(false); setRequestOpen(false); }, 2500);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#e8ff47]/30 border-t-[#e8ff47] rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !project) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-center px-6">
        <div>
          <p className="text-xs text-[#e8ff47] tracking-[0.2em] uppercase font-bold mb-4">blablabuild</p>
          <h1 className="text-xl font-semibold text-neutral-300 mb-2">Project niet gevonden</h1>
          <p className="text-sm text-neutral-600">Deze link is ongeldig of verlopen.</p>
        </div>
      </div>
    );
  }

  const allApprovedTasks = [
    ...project.milestones.flatMap((m) => (m.tasks || []).filter((t) => t.approved)),
    ...(project.unassigned_tasks || []).filter((t) => t.approved),
  ];
  const pendingClientTasks = [
    ...project.milestones.flatMap((m) => (m.tasks || []).filter((t) => !t.approved && t.created_by === "client")),
    ...(project.unassigned_tasks || []).filter((t) => !t.approved && t.created_by === "client"),
  ];

  const totalDone = allApprovedTasks.filter((t) => t.status === "done").length;
  const totalTasks = allApprovedTasks.length;
  const progress = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Header */}
      <div className="border-b border-neutral-800 px-6 py-4 flex items-center justify-between">
        <p className="text-xs font-bold tracking-[0.2em] uppercase text-[#e8ff47]">blablabuild</p>
        <p className="text-xs text-neutral-600 font-mono">projectupdate</p>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-10 space-y-8">
        {/* Project header */}
        <div>
          <h1 className="text-2xl font-semibold text-neutral-100">{project.name}</h1>
          {project.description && (
            <p className="text-sm text-neutral-500 mt-2">{project.description}</p>
          )}
          <div className="flex items-center gap-4 mt-3 text-xs text-neutral-600 font-mono">
            {project.start_date && <span>Start: {formatDate(project.start_date)}</span>}
            {project.end_date && <span>Einde: {formatDate(project.end_date)}</span>}
          </div>
        </div>

        {/* Progress */}
        <div className="border border-neutral-800 rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-neutral-500 uppercase tracking-widest">Voortgang</p>
            <p className="text-sm font-mono text-neutral-300">{totalDone} van {totalTasks} taken klaar</p>
          </div>
          <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#e8ff47] rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-right text-xs font-mono text-[#e8ff47] mt-1.5">{progress}%</p>
        </div>

        {/* Milestones */}
        {project.milestones.map((milestone) => {
          const milestoneTasks = (milestone.tasks || []).filter((t) => t.approved);
          const milestoneDone = milestoneTasks.filter((t) => t.status === "done").length;

          return (
            <div key={milestone.id} className="space-y-2">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full shrink-0 ${milestoneStatusBar[milestone.status]}`} />
                <h2 className="font-medium text-neutral-200">{milestone.name}</h2>
                <div className="flex-1 h-px bg-neutral-800" />
                <span className="text-xs font-mono text-neutral-600">
                  {milestoneDone}/{milestoneTasks.length}
                </span>
              </div>

              <div className="ml-5 space-y-1">
                {milestoneTasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-3 py-1.5">
                    {taskStatusIcon[task.status]}
                    <span className={`text-sm ${task.status === "done" ? "line-through text-neutral-600" : "text-neutral-300"}`}>
                      {task.title}
                    </span>
                    {task.due_date && (
                      <span className="text-xs text-neutral-700 font-mono ml-auto">{formatDate(task.due_date)}</span>
                    )}
                  </div>
                ))}
                {milestoneTasks.length === 0 && (
                  <p className="text-xs text-neutral-700 py-1">Geen taken gepland</p>
                )}
              </div>
            </div>
          );
        })}

        {/* Pending client requests */}
        {pendingClientTasks.length > 0 && (
          <div className="border border-orange-900/40 rounded-lg p-4 space-y-2">
            <p className="text-xs text-orange-400 uppercase tracking-widest">Jouw verzoeken · wachten op goedkeuring</p>
            {pendingClientTasks.map((task) => (
              <div key={task.id} className="flex items-center gap-3 py-1">
                <div className="w-3 h-3 rounded border border-orange-600 shrink-0" />
                <span className="text-sm text-orange-300/70">{task.title}</span>
              </div>
            ))}
          </div>
        )}

        {/* Request form */}
        <div className="border border-neutral-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
            <p className="text-sm font-medium text-neutral-300">Taak aanvragen</p>
            <button
              onClick={() => setRequestOpen(!requestOpen)}
              className="flex items-center gap-1.5 text-xs text-neutral-600 hover:text-neutral-300 transition-colors"
            >
              {requestOpen ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {requestOpen ? "Sluiten" : "Nieuw verzoek"}
            </button>
          </div>

          {requestOpen && (
            <form onSubmit={handleSubmitRequest} className="p-4 space-y-3">
              {submitted ? (
                <div className="flex items-center gap-2 text-emerald-400 py-2">
                  <Check className="w-4 h-4" />
                  <span className="text-sm">Verzoek ingediend — we nemen het in behandeling!</span>
                </div>
              ) : (
                <>
                  <input
                    required
                    value={requestTitle}
                    onChange={(e) => setRequestTitle(e.target.value)}
                    placeholder="Wat wil je dat we toevoegen of aanpassen?"
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-neutral-600"
                  />
                  <textarea
                    value={requestDesc}
                    onChange={(e) => setRequestDesc(e.target.value)}
                    placeholder="Aanvullende toelichting (optioneel)..."
                    rows={2}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-neutral-600 resize-none"
                  />
                  <button
                    type="submit"
                    disabled={submitting || !requestTitle.trim()}
                    className="flex items-center gap-2 text-sm bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {submitting ? "Versturen..." : "Verzoek indienen"}
                  </button>
                </>
              )}
            </form>
          )}
        </div>

        <p className="text-center text-xs text-neutral-700">
          Gemaakt door blablabuild · Talk less, build more.
        </p>
      </div>
    </div>
  );
}
