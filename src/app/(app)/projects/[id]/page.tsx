"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, use } from "react";
import { ArrowLeft, Plus, Check, X, Copy, CheckCircle2, Circle, Clock, Trash2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getProject, createMilestone, createTask, updateTask, deleteTask, updateMilestone, deleteMilestone } from "@/lib/api";
import { Project, Milestone, Task } from "@/lib/types";
import { formatDate } from "@/lib/format";

const taskStatusIcon = {
  open: <Circle className="w-4 h-4 text-neutral-600" />,
  in_progress: <Clock className="w-4 h-4 text-blue-400" />,
  done: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
};

const milestoneStatusColors = {
  pending: "text-neutral-500 bg-neutral-800",
  in_progress: "text-blue-400 bg-blue-950",
  completed: "text-emerald-400 bg-emerald-950",
};

function TaskRow({
  task,
  onUpdate,
  onDelete,
  onApprove,
}: {
  task: Task;
  onUpdate: (t: Task) => void;
  onDelete: (id: string) => void;
  onApprove: (id: string) => void;
}) {
  const statuses: Task["status"][] = ["open", "in_progress", "done"];

  function cycleStatus() {
    if (!task.approved) return;
    const next = statuses[(statuses.indexOf(task.status) + 1) % statuses.length];
    updateTask(task.id, { status: next }).then(onUpdate);
  }

  if (!task.approved) {
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 bg-orange-950/30 border border-orange-900/40 rounded-lg">
        <div className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-orange-200">{task.title}</p>
          {task.description && <p className="text-xs text-orange-400/60 mt-0.5 truncate">{task.description}</p>}
          <p className="text-xs text-orange-600 mt-0.5">Client request</p>
        </div>
        <button onClick={() => onApprove(task.id)}
          className="flex items-center gap-1 text-xs bg-emerald-900/50 text-emerald-400 px-2 py-1 rounded hover:bg-emerald-900 transition-colors">
          <Check className="w-3 h-3" /> Approve
        </button>
        <button onClick={() => onDelete(task.id)}
          className="text-neutral-600 hover:text-red-400 transition-colors p-1 rounded hover:bg-neutral-800">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-900/50 transition-colors group">
      <button onClick={cycleStatus} className="shrink-0">
        {taskStatusIcon[task.status]}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${task.status === "done" ? "line-through text-neutral-600" : "text-neutral-200"}`}>
          {task.title}
        </p>
        {task.description && (
          <p className="text-xs text-neutral-600 truncate">{task.description}</p>
        )}
      </div>
      {task.assignee && (
        <span className="text-xs text-neutral-600 font-mono shrink-0">{task.assignee}</span>
      )}
      {task.due_date && (
        <span className="text-xs text-neutral-700 font-mono shrink-0">{formatDate(task.due_date)}</span>
      )}
      <button onClick={() => onDelete(task.id)}
        className="opacity-0 group-hover:opacity-100 text-neutral-700 hover:text-red-400 transition-all p-1 rounded">
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

function AddTaskInline({
  onAdd,
  projectId,
  milestoneId,
}: {
  onAdd: (t: Task) => void;
  projectId: string;
  milestoneId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const task = await createTask(projectId, { title: title.trim(), milestone_id: milestoneId });
    onAdd(task);
    setTitle("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-xs text-neutral-700 hover:text-neutral-400 transition-colors px-3 py-1.5 w-full">
        <Plus className="w-3.5 h-3.5" /> Add task
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 px-3 py-1.5">
      <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder="Task description..."
        className="h-7 text-xs bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600 flex-1" />
      <Button type="submit" size="sm"
        className="h-7 text-xs bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 px-2">
        <Check className="w-3 h-3" />
      </Button>
      <Button type="button" size="sm" variant="ghost"
        className="h-7 text-xs text-neutral-600 hover:text-neutral-400 px-2"
        onClick={() => { setOpen(false); setTitle(""); }}>
        <X className="w-3 h-3" />
      </Button>
    </form>
  );
}

function MilestoneSection({
  milestone,
  projectId,
  onUpdate,
  onDelete,
}: {
  milestone: Milestone & { tasks: Task[] };
  projectId: string;
  onUpdate: (m: Milestone & { tasks: Task[] }) => void;
  onDelete: (id: string) => void;
}) {
  const [tasks, setTasks] = useState<Task[]>(milestone.tasks || []);
  const done = tasks.filter((t) => t.approved && t.status === "done").length;
  const total = tasks.filter((t) => t.approved).length;
  const pending = tasks.filter((t) => !t.approved).length;

  function handleTaskUpdate(updated: Task) {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  function handleTaskDelete(id: string) {
    deleteTask(id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  function handleApprove(id: string) {
    updateTask(id, { approved: true }).then((updated) => {
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    });
  }

  function handleAddTask(task: Task) {
    setTasks((prev) => [...prev, task]);
  }

  function cycleStatus() {
    const statuses: Milestone["status"][] = ["pending", "in_progress", "completed"];
    const next = statuses[(statuses.indexOf(milestone.status) + 1) % statuses.length];
    updateMilestone(milestone.id, { status: next }).then((m) => {
      onUpdate({ ...milestone, ...m, tasks });
    });
  }

  return (
    <div className="border border-neutral-800 rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-neutral-900/60 border-b border-neutral-800">
        <button onClick={cycleStatus}
          className={`text-xs px-2 py-0.5 rounded font-mono cursor-pointer ${milestoneStatusColors[milestone.status]}`}>
          {milestone.status === "pending" ? "Planned" : milestone.status === "in_progress" ? "In progress" : "Completed"}
        </button>
        <h3 className="font-medium text-neutral-200 flex-1">{milestone.name}</h3>
        <div className="flex items-center gap-3">
          {pending > 0 && (
            <span className="text-xs text-orange-400">{pending} request{pending !== 1 ? "s" : ""}</span>
          )}
          <span className="text-xs text-neutral-600 font-mono">{done}/{total}</span>
          {milestone.due_date && (
            <span className="text-xs text-neutral-700 font-mono">{formatDate(milestone.due_date)}</span>
          )}
          <button onClick={() => onDelete(milestone.id)}
            className="text-neutral-700 hover:text-red-400 transition-colors p-1 rounded hover:bg-neutral-800">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="divide-y divide-neutral-800/40">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            onUpdate={handleTaskUpdate}
            onDelete={handleTaskDelete}
            onApprove={handleApprove}
          />
        ))}
      </div>

      <AddTaskInline onAdd={handleAddTask} projectId={projectId} milestoneId={milestone.id} />
    </div>
  );
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  type ProjectDetail = Project & { milestones: (Milestone & { tasks: Task[] })[]; unassigned_tasks: Task[] };
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [newMilestoneName, setNewMilestoneName] = useState("");
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getProject(id).then((p) => { setProject(p as ProjectDetail); setLoading(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleAddMilestone(e: React.FormEvent) {
    e.preventDefault();
    if (!newMilestoneName.trim() || !project) return;
    setAddingMilestone(true);
    const milestone = await createMilestone(project.id, {
      name: newMilestoneName.trim(),
      position: project.milestones.length,
    });
    setProject((prev) => prev ? {
      ...prev,
      milestones: [...prev.milestones, { ...milestone, tasks: [] }],
    } : prev);
    setNewMilestoneName("");
    setAddingMilestone(false);
  }

  function copyShareLink() {
    if (!project) return;
    navigator.clipboard.writeText(`${window.location.origin}/project/${project.share_token}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="p-8 space-y-4">
        <div className="h-8 w-48 bg-neutral-800 rounded animate-pulse" />
        <div className="h-40 bg-neutral-800 rounded animate-pulse" />
      </div>
    );
  }

  if (!project) return <div className="p-8 text-neutral-600">Project not found</div>;

  const allTasks = [
    ...project.milestones.flatMap((m) => m.tasks || []),
    ...(project.unassigned_tasks || []),
  ];
  const pendingRequests = allTasks.filter((t) => !t.approved).length;

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Link href="/projects" className="text-neutral-600 hover:text-neutral-300 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-neutral-100">{project.name}</h1>
          <p className="text-sm text-neutral-600 mt-0.5">
            {(project.company as { name?: string })?.name || "—"}
            {project.client_name && ` · ${project.client_name}`}
          </p>
        </div>
        <button
          onClick={copyShareLink}
          className="flex items-center gap-2 text-xs border border-neutral-700 px-3 py-2 rounded-lg text-neutral-400 hover:text-neutral-200 hover:border-neutral-600 transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied!" : "Share client link"}
        </button>
      </div>

      {pendingRequests > 0 && (
        <div className="flex items-center gap-3 bg-orange-950/40 border border-orange-900/50 rounded-lg px-4 py-3">
          <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse shrink-0" />
          <p className="text-sm text-orange-300">
            <span className="font-medium">{pendingRequests} task request{pendingRequests !== 1 ? "s" : ""}</span> from the client awaiting approval
          </p>
        </div>
      )}

      <div className="space-y-3">
        {project.milestones.map((milestone) => (
          <MilestoneSection
            key={milestone.id}
            milestone={milestone}
            projectId={project.id}
            onUpdate={(m) => setProject((prev) => prev ? {
              ...prev,
              milestones: prev.milestones.map((ms) => ms.id === m.id ? m : ms),
            } : prev)}
            onDelete={(mid) => {
              deleteMilestone(mid);
              setProject((prev) => prev ? {
                ...prev,
                milestones: prev.milestones.filter((ms) => ms.id !== mid),
              } : prev);
            }}
          />
        ))}
      </div>

      <form onSubmit={handleAddMilestone} className="flex gap-2">
        <Input
          value={newMilestoneName}
          onChange={(e) => setNewMilestoneName(e.target.value)}
          placeholder="Add new phase... (e.g. Discovery, Design, Build)"
          className="bg-neutral-900 border-neutral-700 text-neutral-100 placeholder:text-neutral-600"
        />
        <Button type="submit" disabled={addingMilestone || !newMilestoneName.trim()}
          className="bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 font-medium gap-2 shrink-0">
          <Plus className="w-4 h-4" /> Phase
        </Button>
      </form>
    </div>
  );
}
