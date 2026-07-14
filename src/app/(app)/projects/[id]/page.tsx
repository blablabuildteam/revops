"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Plus, Check, X, Copy, CheckCircle2, Circle, Clock, Trash2, GripVertical, Link2,
} from "lucide-react";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getProject, createMilestone, createTask, updateTask, deleteTask, updateMilestone, deleteMilestone, deleteProject } from "@/lib/api";
import { Project, Milestone, Task, TASK_STATUS_LABELS, TASK_ASSIGNEES } from "@/lib/types";
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

function sortByPosition(tasks: Task[]) {
  return [...tasks].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
}

function TaskDetailDialog({
  task,
  open,
  onClose,
  onSave,
}: {
  task: Task | null;
  open: boolean;
  onClose: () => void;
  onSave: (t: Task) => void;
}) {
  const [form, setForm] = useState({
    due_date: "",
    assignee: "",
    description: "",
    url: "",
    status: "open" as Task["status"],
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (task && open) {
      setForm({
        due_date: task.due_date ? task.due_date.slice(0, 10) : "",
        assignee: task.assignee ?? "",
        description: task.description ?? "",
        url: task.url ?? "",
        status: task.status,
      });
    }
  }, [task, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!task) return;
    setLoading(true);
    try {
      const updated = await updateTask(task.id, {
        due_date: form.due_date || undefined,
        assignee: form.assignee || undefined,
        description: form.description || undefined,
        url: form.url || undefined,
        status: form.status,
      });
      onSave(updated);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-neutral-900 border-neutral-700 text-neutral-100 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-neutral-100 pr-6">{task.title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-neutral-400 text-xs">Date</Label>
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                className="bg-neutral-800 border-neutral-700 text-neutral-100"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-neutral-400 text-xs">Responsible</Label>
              <Select
                value={form.assignee || "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, assignee: v === "none" ? "" : (v ?? "") }))}
              >
                <SelectTrigger className="bg-neutral-800 border-neutral-700 text-neutral-100">
                  <SelectValue placeholder="Choose person">
                    {form.assignee || "Nobody"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-neutral-800 border-neutral-700">
                  <SelectItem value="none" className="text-neutral-400">Nobody</SelectItem>
                  {TASK_ASSIGNEES.map((name) => (
                    <SelectItem key={name} value={name} className="text-neutral-100">{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-neutral-400 text-xs">Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: (v ?? "open") as Task["status"] }))}
            >
              <SelectTrigger className="bg-neutral-800 border-neutral-700 text-neutral-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-neutral-800 border-neutral-700">
                {(Object.keys(TASK_STATUS_LABELS) as Task["status"][]).map((s) => (
                  <SelectItem key={s} value={s} className="text-neutral-100">
                    {TASK_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-neutral-400 text-xs">URL</Label>
            <Input
              type="url"
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="https://..."
              className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-neutral-400 text-xs">Notes</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Add notes or details..."
              rows={4}
              className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600 resize-none"
            />
          </div>
          <DialogFooter className="bg-transparent border-neutral-800 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={loading}
              className="text-neutral-400 hover:text-neutral-200"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950"
            >
              {loading ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PendingTaskRow({
  task,
  onDelete,
  onApprove,
}: {
  task: Task;
  onDelete: (id: string) => void;
  onApprove: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-orange-950/30 border border-orange-900/40 rounded-lg mx-2 my-1">
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

function SortableTaskRow({
  task,
  onUpdate,
  onDelete,
  onClick,
}: {
  task: Task;
  onUpdate: (t: Task) => void;
  onDelete: (id: string) => void;
  onClick: (t: Task) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const statuses: Task["status"][] = ["open", "in_progress", "done"];

  function cycleStatus(e: React.MouseEvent) {
    e.stopPropagation();
    const next = statuses[(statuses.indexOf(task.status) + 1) % statuses.length];
    updateTask(task.id, { status: next }).then(onUpdate);
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    onDelete(task.id);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onClick(task)}
      className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-neutral-900/50 transition-colors group cursor-pointer"
    >
      <button
        type="button"
        className="shrink-0 text-neutral-700 hover:text-neutral-500 cursor-grab active:cursor-grabbing touch-none p-0.5"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        aria-label="Drag to reorder"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={cycleStatus} className="shrink-0">
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
      {task.url && (
        <a
          href={task.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-neutral-600 hover:text-[#e8ff47] transition-colors shrink-0"
          aria-label="Open link"
        >
          <Link2 className="w-3.5 h-3.5" />
        </a>
      )}
      {task.due_date && (
        <span className="text-xs text-neutral-700 font-mono shrink-0">{formatDate(task.due_date)}</span>
      )}
      <button
        type="button"
        onClick={handleDelete}
        className="opacity-0 group-hover:opacity-100 text-neutral-700 hover:text-red-400 transition-all p-1 rounded"
      >
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
  const [tasks, setTasks] = useState<Task[]>(() => sortByPosition(milestone.tasks || []));
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const pendingTasks = tasks.filter((t) => !t.approved);
  const approvedTasks = sortByPosition(tasks.filter((t) => t.approved));
  const done = approvedTasks.filter((t) => t.status === "done").length;
  const total = approvedTasks.length;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleTaskUpdate(updated: Task) {
    setTasks((prev) => sortByPosition(prev.map((t) => (t.id === updated.id ? updated : t))));
  }

  function handleTaskDelete(id: string) {
    deleteTask(id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
    if (selectedTask?.id === id) {
      setDetailOpen(false);
      setSelectedTask(null);
    }
  }

  function handleApprove(id: string) {
    updateTask(id, { approved: true }).then((updated) => {
      setTasks((prev) => sortByPosition(prev.map((t) => (t.id === updated.id ? updated : t))));
    });
  }

  function handleAddTask(task: Task) {
    setTasks((prev) => sortByPosition([...prev, task]));
  }

  function openTaskDetail(task: Task) {
    setSelectedTask(task);
    setDetailOpen(true);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = approvedTasks.findIndex((t) => t.id === active.id);
    const newIndex = approvedTasks.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(approvedTasks, oldIndex, newIndex).map((t, i) => ({ ...t, position: i }));
    setTasks([...pendingTasks, ...reordered]);

    await Promise.all(reordered.map((t) => updateTask(t.id, { position: t.position })));
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
          {pendingTasks.length > 0 && (
            <span className="text-xs text-orange-400">{pendingTasks.length} request{pendingTasks.length !== 1 ? "s" : ""}</span>
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

      {pendingTasks.map((task) => (
        <PendingTaskRow
          key={task.id}
          task={task}
          onDelete={handleTaskDelete}
          onApprove={handleApprove}
        />
      ))}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={approvedTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="divide-y divide-neutral-800/40">
            {approvedTasks.map((task) => (
              <SortableTaskRow
                key={task.id}
                task={task}
                onUpdate={handleTaskUpdate}
                onDelete={handleTaskDelete}
                onClick={openTaskDetail}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <AddTaskInline onAdd={handleAddTask} projectId={projectId} milestoneId={milestone.id} />

      <TaskDetailDialog
        task={selectedTask}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onSave={handleTaskUpdate}
      />
    </div>
  );
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  type ProjectDetail = Project & { milestones: (Milestone & { tasks: Task[] })[]; unassigned_tasks: Task[] };
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [newMilestoneName, setNewMilestoneName] = useState("");
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  async function handleDeleteProject() {
    if (!project) return;
    setDeleting(true);
    try {
      await deleteProject(project.id);
      router.push("/projects");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
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
        <div className="flex items-center gap-2">
          <button
            onClick={copyShareLink}
            className="flex items-center gap-2 text-xs border border-neutral-700 px-3 py-2 rounded-lg text-neutral-400 hover:text-neutral-200 hover:border-neutral-600 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied!" : "Share client link"}
          </button>
          <button
            onClick={() => setDeleteOpen(true)}
            className="flex items-center justify-center text-xs border border-neutral-700 p-2 rounded-lg text-neutral-500 hover:text-red-400 hover:border-red-900/50 transition-colors"
            aria-label="Delete project"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="bg-neutral-900 border-neutral-700 text-neutral-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-neutral-100">Delete project</DialogTitle>
            <DialogDescription className="text-neutral-500">
              Are you sure you want to delete <span className="text-neutral-300">{project.name}</span>?
              This will permanently remove all phases, tasks, and the client share link.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-transparent border-neutral-800">
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
              className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteProject}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? "Deleting..." : "Delete project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
