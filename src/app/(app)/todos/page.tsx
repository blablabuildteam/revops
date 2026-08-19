"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Plus, CheckCircle2, Trash2,
  User, Building2, FolderKanban, ArrowUpDown,
  ChevronDown, ChevronRight, ListTodo, ArrowLeft, Search,
} from "lucide-react";
import Link from "next/link";
import { BinaryText } from "@/components/binary-text";
import { PrioritySelect, type Priority } from "@/components/priority-select";
import { TodoStatusSelect, type TodoStatus } from "@/components/todo-status-select";
import { CompanyAvatar } from "@/components/company-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { createCompany, createTask, getCompanies, getProject, getProjects, getUsers } from "@/lib/api";
import { Company, Milestone, Project, Task } from "@/lib/types";
import { toDateInputValue } from "@/lib/format";
import { matchesTaskSearch, normalizeTaskSearchQuery } from "@/lib/task-search";
import {
  sortTodos, todoSortToBoardSortKey, TODO_SORT_LABELS, type TodoSortKey,
} from "@/lib/todo-sort";
import { useConfirmDelete } from "@/components/confirm-delete-dialog";
import { ProjectTaskBoardPanel } from "@/components/project-task-board";
import { useSession } from "@/components/session-provider";
import { cacheKeys, getCached, invalidateTaskLists, setCached } from "@/lib/query-cache";
import { useMutationFeedback, useUndoToast } from "@/components/mutation-provider";
import { useUndoablePatch } from "@/hooks/use-undoable-patch";

interface TodoUser { id: string; email: string; name: string }
interface Todo {
  id: string;
  title: string;
  description?: string;
  status: TodoStatus;
  priority: "low" | "medium" | "high";
  assignee_id?: string;
  assignee_name?: string;
  company_id?: string;
  company_name?: string;
  company_logo_url?: string;
  project_id?: string;
  project_name?: string;
  project_company_name?: string;
  project_company_logo_url?: string;
  /** null clears the date server-side; undefined leaves it untouched. */
  due_date?: string | null;
  created_at: string;
  updated_at?: string;
  _source: "todo";
}

async function putTodo(id: string, patch: Record<string, unknown>): Promise<Todo> {
  const res = await fetch(`/api/todos/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const data = await res.json();
  return { ...data, _source: "todo" };
}

interface ProjectBoardTask {
  id: string;
  title: string;
  description?: string;
  status: "open" | "in_progress" | "done";
  priority: Priority;
  assignee?: string;
  due_date?: string;
  project_id: string;
  project_name: string;
  company_name?: string;
  company_id?: string;
  company_logo_url?: string;
  milestone_id?: string | null;
  milestone_name?: string;
  milestone_color?: string;
  parent_id?: string | null;
  position?: number;
  approved?: boolean;
  url?: string | null;
  created_at: string;
  updated_at?: string;
  _source: "task";
}

type TaskListPayload = {
  todos: Todo[];
  boardTasks: ProjectBoardTask[];
  milestonesByProject: Record<string, Milestone[]>;
};

function boardTaskToTask(t: ProjectBoardTask): Task {
  return {
    id: t.id,
    project_id: t.project_id,
    milestone_id: t.milestone_id ?? null,
    parent_id: t.parent_id ?? null,
    title: t.title,
    description: t.description ?? null,
    status: t.status,
    created_by: "team",
    approved: t.approved !== false,
    assignee: t.assignee ?? null,
    due_date: t.due_date ?? null,
    url: t.url ?? null,
    priority: t.priority ?? "low",
    position: t.position ?? 0,
    created_at: t.created_at,
    updated_at: t.updated_at ?? t.created_at,
  };
}

function isDonePhase(name?: string) {
  return (name ?? "").toLowerCase() === "done";
}

function todoMatchesSearch(todo: Todo, query: string): boolean {
  return matchesTaskSearch(
    query,
    todo.title,
    todo.description,
    todo.assignee_name,
    todo.company_name,
    todo.project_name,
    todo.project_company_name,
  );
}

function boardTaskMatchesSearch(task: ProjectBoardTask, query: string): boolean {
  return matchesTaskSearch(
    query,
    task.title,
    task.description,
    task.assignee,
    task.project_name,
    task.company_name,
    task.milestone_name,
  );
}

function sortCompletedLatest(todos: Todo[]) {
  return [...todos].sort((a, b) => {
    const aTime = new Date(a.updated_at || a.created_at).getTime();
    const bTime = new Date(b.updated_at || b.created_at).getTime();
    return bTime - aTime;
  });
}

function assigneeOptions(users: TodoUser[], currentUser: TodoUser | null): TodoUser[] {
  if (!currentUser) return users;
  if (users.some((u) => u.id === currentUser.id)) return users;
  return [currentUser, ...users];
}

function assigneeLabel(users: TodoUser[], assigneeId: string, currentUser: TodoUser | null) {
  if (!assigneeId) return "Nobody";
  return (
    users.find((u) => u.id === assigneeId)?.name ??
    (currentUser?.id === assigneeId ? currentUser.name : null) ??
    "Choose person"
  );
}

function namedOptionLabel(
  items: { id: string; name: string }[],
  id: string,
  emptyLabel: string
) {
  if (!id) return emptyLabel;
  return items.find((i) => i.id === id)?.name ?? emptyLabel;
}

function projectBoardLabel(project: Project) {
  return project.company?.name
    ? `${project.company.name} – ${project.name}`
    : project.name;
}

function defaultOpenMilestoneId(milestones: Milestone[]) {
  const open = milestones.find((m) => m.name.toLowerCase() === "open");
  return open?.id ?? milestones[0]?.id ?? "";
}

const statusFilterLabels: Record<string, string> = {
  active: "Active",
  backlog: "Backlog",
  all: "All",
  done: "Done",
};

const sortOptions: TodoSortKey[] = ["smart", "priority", "due_date", "title", "created"];

// ---------------------------------------------------------------------------
// New Task Dialog (full form)
// ---------------------------------------------------------------------------

function TodoFormDialog({
  open, onClose, onSave, todo, users, companies, projects, currentUser, defaultProjectId, defaultCompanyId,
  onCompanyCreated,
}: {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  todo?: Todo | null;
  users: TodoUser[];
  companies: Company[];
  projects: Project[];
  currentUser: TodoUser | null;
  defaultProjectId?: string;
  defaultCompanyId?: string;
  onCompanyCreated?: (company: Company) => void;
}) {
  const isEdit = !!todo;
  const boardMode = !!defaultProjectId;
  const [form, setForm] = useState({
    title: "", description: "", status: "open" as TodoStatus, priority: "low",
    assignee_id: "",
    company_id: "",
    project_id: defaultProjectId ?? "", milestone_id: "", due_date: "",
  });
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [milestonesLoading, setMilestonesLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [addingCompany, setAddingCompany] = useState(false);
  const [localCompanies, setLocalCompanies] = useState<Company[]>(companies);
  const withUndo = useUndoToast();

  const people = assigneeOptions(users, currentUser);
  const projectOptions = [...projects].sort((a, b) => {
    const companyCmp = (a.company?.name ?? "").localeCompare(b.company?.name ?? "");
    if (companyCmp !== 0) return companyCmp;
    return a.name.localeCompare(b.name);
  });
  const selectedProject = projects.find((p) => p.id === form.project_id) ?? null;
  const showPhaseStatus = boardMode && !!form.project_id;
  const selectedCompany = localCompanies.find((c) => c.id === form.company_id) ?? null;

  useEffect(() => {
    setLocalCompanies(companies);
  }, [companies]);

  async function handleAddCompany() {
    const name = newCompanyName.trim();
    if (!name || addingCompany) return;
    setAddingCompany(true);
    setError("");
    try {
      const company = await createCompany({ name });
      setLocalCompanies((list) =>
        [...list, company].sort((a, b) => a.name.localeCompare(b.name)),
      );
      onCompanyCreated?.(company);
      setForm((f) => ({ ...f, company_id: company.id }));
      setNewCompanyName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add company");
    } finally {
      setAddingCompany(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setError("");
    setNewCompanyName("");
    setMilestones([]);
    if (todo) {
      setForm({
        title: todo.title,
        description: todo.description ?? "",
        status: todo.status,
        priority: todo.priority,
        assignee_id: todo.assignee_id ?? "",
        company_id: todo.company_id ?? "",
        project_id: "",
        milestone_id: "",
        due_date: toDateInputValue(todo.due_date),
      });
      return;
    }
    setForm({
      title: "", description: "", status: "open", priority: "low",
      assignee_id: currentUser?.id ?? "",
      company_id: defaultCompanyId ?? "",
      project_id: defaultProjectId ?? "", milestone_id: "", due_date: "",
    });
  }, [open, todo, currentUser, defaultProjectId, defaultCompanyId]);

  useEffect(() => {
    if (!open || !form.project_id) {
      if (!form.project_id) setMilestones([]);
      return;
    }

    let cancelled = false;
    setMilestonesLoading(true);
    getProject(form.project_id)
      .then((project) => {
        if (cancelled) return;
        const next = [...(project.milestones ?? [])].sort((a, b) => a.position - b.position);
        setMilestones(next);
        setForm((f) => {
          if (f.project_id !== form.project_id) return f;
          if (f.milestone_id && next.some((m) => m.id === f.milestone_id)) return f;
          return { ...f, milestone_id: defaultOpenMilestoneId(next) };
        });
      })
      .catch(() => {
        if (!cancelled) {
          setMilestones([]);
          setForm((f) => (f.project_id === form.project_id ? { ...f, milestone_id: "" } : f));
        }
      })
      .finally(() => {
        if (!cancelled) setMilestonesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, form.project_id]);

  async function resolveMilestoneId(projectId: string, preferredId: string) {
    if (preferredId && milestones.some((m) => m.id === preferredId)) {
      return preferredId;
    }
    const project = await getProject(projectId);
    const next = [...(project.milestones ?? [])].sort((a, b) => a.position - b.position);
    if (preferredId && next.some((m) => m.id === preferredId)) return preferredId;
    return defaultOpenMilestoneId(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    if (boardMode && form.project_id && milestonesLoading) {
      setError("Loading board statuses...");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const assigneeName = form.assignee_id
        ? (people.find((u) => u.id === form.assignee_id)?.name
          ?? (currentUser?.id === form.assignee_id ? currentUser.name : null))
        : null;

      // Project group “Add task” still lands on the project board.
      if (boardMode && form.project_id) {
        const milestoneId = await resolveMilestoneId(form.project_id, form.milestone_id);
        if (!milestoneId) {
          setError("This project board has no statuses yet");
          return;
        }
        await createTask(form.project_id, {
          title: form.title.trim(),
          description: form.description.trim() || null,
          priority: form.priority as Task["priority"],
          assignee: assigneeName,
          due_date: form.due_date || null,
          milestone_id: milestoneId,
        });
        if (isEdit && todo) {
          await fetch(`/api/todos/${todo.id}`, { method: "DELETE" }).catch(() => null);
        }
        onSave();
        onClose();
        return;
      }

      const payload = {
        title: form.title.trim(),
        description: form.description,
        status: form.status,
        priority: form.priority,
        assignee_id:
          form.assignee_id === ""
            ? null
            : (form.assignee_id || currentUser?.id || null),
        company_id: form.company_id || null,
        project_id: null,
        due_date: form.due_date || null,
      };
      const res = await fetch(isEdit ? `/api/todos/${todo!.id}` : "/api/todos", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? (isEdit ? "Failed to update task" : "Failed to create task"));
        return;
      }
      if (isEdit && todo) {
        await withUndo({
          label: "Updated",
          run: async () => {
            onSave();
            onClose();
          },
          undo: async () => {
            await putTodo(todo.id, {
              title: todo.title,
              description: todo.description ?? null,
              status: todo.status,
              priority: todo.priority,
              assignee_id: todo.assignee_id ?? null,
              company_id: todo.company_id ?? null,
              project_id: null,
              due_date: todo.due_date ?? null,
            });
            onSave();
          },
        });
        return;
      }
      onSave();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEdit ? "Failed to update task" : "Failed to create task"));
    } finally {
      setLoading(false);
    }
  }

  const s = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-neutral-900 border-neutral-700 text-neutral-100 max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit task" : "New task"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-neutral-400 text-xs">Task *</Label>
            <Input required value={form.title} onChange={(e) => s("title", e.target.value)}
              placeholder="What needs to be done?"
              className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label className="text-neutral-400 text-xs">Description</Label>
            <Textarea value={form.description} onChange={(e) => s("description", e.target.value)}
              placeholder="Optional details..."
              rows={2} className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-neutral-400 text-xs">Priority</Label>
              <Select value={form.priority} onValueChange={(v) => s("priority", v ?? "low")}>
                <SelectTrigger className="bg-neutral-800 border-neutral-700 text-neutral-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-neutral-800 border-neutral-700">
                  <SelectItem value="high" className="text-red-400">High</SelectItem>
                  <SelectItem value="medium" className="text-neutral-300">Medium</SelectItem>
                  <SelectItem value="low" className="text-neutral-400">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-neutral-400 text-xs">Assigned to</Label>
              <Select value={form.assignee_id || "none"} onValueChange={(v) => s("assignee_id", v === "none" ? "" : (v ?? ""))}>
                <SelectTrigger className="bg-neutral-800 border-neutral-700 text-neutral-100">
                  <SelectValue placeholder="Choose person">
                    {assigneeLabel(people, form.assignee_id, currentUser)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-neutral-800 border-neutral-700">
                  <SelectItem value="none" className="text-neutral-400">Nobody</SelectItem>
                  {people.map((u) => (
                    <SelectItem key={u.id} value={u.id} className="text-neutral-100">{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {boardMode ? (
            <>
          <div className="space-y-1.5">
            <Label className="text-neutral-400 text-xs">Project Board</Label>
            <Select
              value={form.project_id || "none"}
              onValueChange={(v) => {
                const projectId = v === "none" ? "" : (v ?? "");
                setForm((f) => ({ ...f, project_id: projectId, milestone_id: "" }));
                if (!projectId) setMilestones([]);
              }}
            >
              <SelectTrigger className="w-full bg-neutral-800 border-neutral-700 text-neutral-100">
                <SelectValue placeholder="Optional">
                  {selectedProject ? projectBoardLabel(selectedProject) : "No project board"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent
                alignItemWithTrigger={false}
                align="start"
                className="bg-neutral-800 border-neutral-700 max-h-60 min-w-[min(360px,90vw)] w-max"
              >
                <SelectItem value="none" className="text-neutral-400">No project board</SelectItem>
                {projectOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-neutral-100">
                    <span className="whitespace-normal">{projectBoardLabel(p)}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {showPhaseStatus && (
            <div className="space-y-1.5">
              <Label className="text-neutral-400 text-xs">Status</Label>
              <Select
                value={form.milestone_id}
                onValueChange={(v) => s("milestone_id", v ?? "")}
                disabled={milestonesLoading || milestones.length === 0}
              >
                <SelectTrigger className="w-full bg-neutral-800 border-neutral-700 text-neutral-100">
                  <SelectValue placeholder={milestonesLoading ? "Loading statuses..." : "Choose status"}>
                    {milestones.find((m) => m.id === form.milestone_id)?.name
                      ?? (milestonesLoading ? "Loading statuses..." : "Choose status")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-neutral-800 border-neutral-700">
                  {milestones.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-neutral-100">
                      <span className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: m.color ?? "#9ca3af" }}
                        />
                        {m.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-neutral-400 text-xs">Company</Label>
                <Select
                  value={form.company_id || "none"}
                  onValueChange={(v) => {
                    if (v === "__new__") return;
                    s("company_id", v === "none" ? "" : (v ?? ""));
                  }}
                >
                  <SelectTrigger className="w-full bg-neutral-800 border-neutral-700 text-neutral-100">
                    <SelectValue placeholder="Optional">
                      {selectedCompany?.name ?? "No company"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-neutral-800 border-neutral-700 max-h-72">
                    <SelectItem value="none" className="text-neutral-400">No company</SelectItem>
                    {localCompanies.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-neutral-100">
                        {c.name}
                      </SelectItem>
                    ))}
                    <div className="border-t border-neutral-700 mt-1 pt-1 px-1 pb-1">
                      <div
                        className="flex gap-1.5 items-center"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <input
                          value={newCompanyName}
                          onChange={(e) => setNewCompanyName(e.target.value)}
                          placeholder="Nieuw bedrijf..."
                          className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-neutral-500"
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void handleAddCompany();
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => void handleAddCompany()}
                          disabled={addingCompany || !newCompanyName.trim()}
                          className="shrink-0 h-6 w-6 rounded bg-[#d4e052] hover:bg-[#c2ce45] text-neutral-950 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-neutral-400 text-xs">Status</Label>
                <TodoStatusSelect
                  status={form.status}
                  onChange={(next) => s("status", next)}
                  className="h-10 w-full bg-neutral-800 border-neutral-700"
                />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label className="text-neutral-400 text-xs">Due date</Label>
            <DatePicker
              value={form.due_date}
              onChange={(v) => s("due_date", v)}
              className="bg-neutral-800 border-neutral-700 text-neutral-100"
            />
          </div>
          <DialogFooter className="flex-col items-stretch gap-2 sm:flex-col sm:items-stretch">
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}
              className="text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800">Cancel</Button>
            <Button type="submit" disabled={loading || (showPhaseStatus && (milestonesLoading || !form.milestone_id))}
              className="bg-[#d4e052] hover:bg-[#c2ce45] text-neutral-950 font-medium">
              {loading ? (isEdit ? "Saving..." : "Adding...") : (isEdit ? "Save" : "Add")}
            </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Inline Quick-Add for personal to-dos
// ---------------------------------------------------------------------------

function QuickAddTodo({ onAdd, currentUser }: {
  onAdd: (t: Todo) => void;
  currentUser: TodoUser | null;
}) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: value.trim(),
          priority: "low",
          assignee_id: currentUser?.id ?? null,
          company_id: null,
          project_id: null,
          due_date: null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        onAdd(data);
        setValue("");
        inputRef.current?.focus();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <div className="flex items-center gap-2 flex-1 bg-neutral-900/60 border border-neutral-800 rounded-lg px-3 py-1.5 focus-within:border-neutral-600 transition-colors">
        <Plus className="w-4 h-4 text-neutral-600 shrink-0" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Add a quick to-do..."
          className="flex-1 bg-transparent text-sm text-neutral-200 placeholder:text-neutral-600 outline-none"
        />
      </div>
      {value.trim() && (
        <Button
          type="submit"
          disabled={loading}
          size="sm"
          className="bg-[#d4e052] hover:bg-[#c2ce45] text-neutral-950 font-medium h-8 px-3 text-xs shrink-0"
        >
          {loading ? "..." : "Add"}
        </Button>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Shared status update
// ---------------------------------------------------------------------------

function useTodoStatusChange(todo: Todo, onUpdate: (t: Todo) => void) {
  const { begin, end, pushUndo } = useMutationFeedback();

  const changeStatus = useCallback((next: TodoStatus) => {
    if (next === todo.status) return;
    const prev = todo.status;
    onUpdate({ ...todo, status: next, _source: "todo" });

    begin();
    fetch(`/api/todos/${todo.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    })
      .then((r) => r.json())
      .then((d) => {
        onUpdate({ ...d, _source: "todo" });
        pushUndo({
          label: "Status changed",
          revert: async () => {
            onUpdate({ ...todo, status: prev, _source: "todo" });
            const res = await fetch(`/api/todos/${todo.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: prev }),
            });
            const data = await res.json();
            onUpdate({ ...data, _source: "todo" });
          },
        });
      })
      .catch(() => onUpdate({ ...todo, status: prev, _source: "todo" }))
      .finally(() => end());
  }, [todo, onUpdate, begin, end, pushUndo]);

  return { changeStatus };
}

/** Shared inline due-date control for both to-do row variants. */
function TodoDueDate({
  todo,
  onUpdate,
  className,
}: {
  todo: Todo;
  onUpdate: (t: Todo) => void;
  className?: string;
}) {
  const patchTodo = useUndoablePatch<Todo>();
  const isOverdue = !!todo.due_date && todo.status !== "done" &&
    new Date(todo.due_date) < new Date();

  return (
    <DatePicker
      value={toDateInputValue(todo.due_date)}
      onChange={(v) => {
        void patchTodo({
          item: todo,
          patch: { due_date: v || null },
          apply: (id, patch) => putTodo(id, patch),
          onSuccess: onUpdate,
        });
      }}
      onClick={(e) => e.stopPropagation()}
      size="sm"
      placeholder="No date"
      overdue={isOverdue}
      className={`shrink-0 border-neutral-700/50 bg-neutral-800/50 ${
        isOverdue ? "text-red-400" : "text-neutral-400"
      } ${className ?? ""}`}
    />
  );
}

// ---------------------------------------------------------------------------
// Compact todo row for the checklist
// ---------------------------------------------------------------------------

function TodoRow({ todo, onUpdate, onDelete, onEdit }: {
  todo: Todo;
  onUpdate: (t: Todo) => void;
  onDelete: (id: string) => void;
  onEdit: (t: Todo) => void;
}) {
  const { changeStatus } = useTodoStatusChange(todo, onUpdate);
  const patchTodo = useUndoablePatch<Todo>();

  const isOverdue = todo.due_date && todo.status !== "done" &&
    new Date(todo.due_date) < new Date();

  return (
    <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all group ${
      todo.status === "done"
        ? "opacity-60 bg-neutral-900/20 border-neutral-800/50"
        : "bg-neutral-900/40 border-neutral-800 hover:border-neutral-700"
    }`}>
      <TodoStatusSelect status={todo.status} onChange={changeStatus} />
      <button
        type="button"
        onClick={() => onEdit(todo)}
        className={`flex-1 min-w-0 text-left cursor-pointer hover:text-neutral-100 transition-colors ${
          todo.status === "done" ? "line-through text-neutral-600" : "text-neutral-200"
        }`}
      >
        <p className="text-sm leading-snug flex items-center gap-1.5 min-w-0">
          <span className="truncate">
            <BinaryText text={todo.title} id={todo.id} />
          </span>
          {todo.company_name && (
            <span className="hidden sm:inline text-[11px] text-neutral-600 truncate max-w-28 shrink-0">
              {todo.company_name}
            </span>
          )}
          {isOverdue && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"
              title="Overdue"
              aria-label="Overdue"
            />
          )}
        </p>
      </button>
      {todo.assignee_name && (
        <span className="hidden lg:flex items-center gap-1 text-xs text-neutral-500 shrink-0 max-w-32 truncate">
          <User className="w-3 h-3 shrink-0" /> {todo.assignee_name}
        </span>
      )}
      <TodoDueDate todo={todo} onUpdate={onUpdate} className="w-[104px] sm:w-[126px]" />
      <PrioritySelect
        priority={todo.priority}
        onChange={(next) => {
          void patchTodo({
            item: todo,
            patch: { priority: next },
            apply: (id, patch) => putTodo(id, patch),
            onSuccess: onUpdate,
          });
        }}
        className="hidden sm:flex w-[100px]"
      />
      <button onClick={() => onDelete(todo.id)}
        className="hidden sm:block opacity-0 group-hover:opacity-100 p-1 text-neutral-700 hover:text-red-400 transition-all rounded shrink-0">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expanded todo card (used in project groups for more detail)
// ---------------------------------------------------------------------------

function TodoCard({ todo, onUpdate, onDelete, onEdit }: {
  todo: Todo;
  onUpdate: (t: Todo) => void;
  onDelete: (id: string) => void;
  onEdit: (t: Todo) => void;
}) {
  const { changeStatus } = useTodoStatusChange(todo, onUpdate);
  const patchTodo = useUndoablePatch<Todo>();

  const isOverdue = todo.due_date && todo.status !== "done" &&
    new Date(todo.due_date) < new Date();

  return (
    <div className={`flex items-start gap-2.5 px-3.5 py-2 transition-all group ${
      todo.status === "done" ? "opacity-60" : ""
    }`}>
      <div className="shrink-0">
        <TodoStatusSelect status={todo.status} onChange={changeStatus} />
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <button
          type="button"
          onClick={() => onEdit(todo)}
          className={`w-full text-left cursor-pointer hover:text-neutral-100 transition-colors ${
            todo.status === "done" ? "line-through text-neutral-600" : "text-neutral-200"
          }`}
        >
          <p className="text-sm leading-snug flex items-center gap-1.5 min-w-0">
            <span className="truncate">
              <BinaryText text={todo.title} id={todo.id} />
            </span>
            {isOverdue && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"
                title="Overdue"
                aria-label="Overdue"
              />
            )}
          </p>
        </button>
        {todo.description && (
          <p className="text-xs text-neutral-500 mt-0.5 line-clamp-1">
            <BinaryText text={todo.description} id={`${todo.id}-desc`} />
          </p>
        )}
        {(todo.assignee_name || todo.company_name) && (
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {todo.assignee_name && (
              <span className="flex items-center gap-1 text-xs text-neutral-500">
                <User className="w-3 h-3" /> {todo.assignee_name}
              </span>
            )}
            {todo.company_name && (
              <span className="flex items-center gap-1 text-xs text-neutral-500">
                <Building2 className="w-3 h-3" /> {todo.company_name}
              </span>
            )}
          </div>
        )}
      </div>
      <TodoDueDate todo={todo} onUpdate={onUpdate} className="w-[104px] sm:w-[126px]" />
      <PrioritySelect
        priority={todo.priority}
        onChange={(next) => {
          void patchTodo({
            item: todo,
            patch: { priority: next },
            apply: (id, patch) => putTodo(id, patch),
            onSuccess: onUpdate,
          });
        }}
        className="hidden sm:flex w-[100px]"
      />
      <button onClick={() => onDelete(todo.id)}
        className="hidden sm:block opacity-0 group-hover:opacity-100 p-1 mt-0.5 text-neutral-700 hover:text-red-400 transition-all rounded shrink-0">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function CompanyGroup({
  companyName, companyLogoUrl, todos, filterStatus, sortKey,
  onTodoUpdate, onTodoDelete, onTodoEdit,
}: {
  companyName: string;
  companyLogoUrl?: string;
  todos: Todo[];
  filterStatus: string;
  sortKey: TodoSortKey;
  onTodoUpdate: (t: Todo) => void;
  onTodoDelete: (id: string) => void;
  onTodoEdit: (t: Todo) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const filtered = filterStatus === "done"
    ? todos.filter((t) => t.status === "done")
    : filterStatus === "backlog"
      ? todos.filter((t) => t.status === "backlog")
      : filterStatus === "active"
        ? todos.filter((t) => t.status !== "done")
        : todos;
  const visible = sortTodos(filtered, sortKey);
  const doneCount = todos.filter((t) => t.status === "done").length;

  return (
    <div className="border border-neutral-800 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 w-full px-4 py-3 bg-neutral-900/60 hover:bg-neutral-900/80 transition-colors text-left"
      >
        {expanded
          ? <ChevronDown className="w-4 h-4 text-neutral-500 shrink-0" />
          : <ChevronRight className="w-4 h-4 text-neutral-500 shrink-0" />
        }
        <CompanyAvatar name={companyName} logoUrl={companyLogoUrl} size="sm" />
        <span className="flex-1 min-w-0 text-sm font-medium text-neutral-200 truncate">
          {companyName}
        </span>
        <span className="text-xs text-neutral-600 font-mono shrink-0">
          {doneCount}/{todos.length}
        </span>
      </button>
      {expanded && (
        <div className="divide-y divide-neutral-800/40">
          {visible.map((todo) => (
            <TodoCard
              key={todo.id}
              todo={todo}
              onUpdate={onTodoUpdate}
              onDelete={onTodoDelete}
              onEdit={onTodoEdit}
            />
          ))}
          {visible.length === 0 && (
            <p className="text-xs text-neutral-700 px-4 py-3">No tasks</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible project group
// ---------------------------------------------------------------------------

function ProjectGroup({
  projectId, projectName, companyName, companyLogoUrl,
  todos, boardTasks, milestones, filterStatus, sortKey,
  onTodoUpdate, onTodoDelete, onTodoEdit,
  onBoardTaskUpdate, onBoardTaskDelete, onNewTask,
}: {
  projectId: string;
  projectName: string;
  companyName?: string;
  companyLogoUrl?: string;
  todos: Todo[];
  boardTasks: ProjectBoardTask[];
  milestones?: Milestone[];
  filterStatus: string;
  sortKey: TodoSortKey;
  onTodoUpdate: (t: Todo) => void;
  onTodoDelete: (id: string) => void;
  onTodoEdit: (t: Todo) => void;
  onBoardTaskUpdate: (t: Task, milestone?: { name?: string; color?: string }) => void;
  onBoardTaskDelete: (id: string) => void;
  onNewTask: (projectId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const filteredTodos = filterStatus === "done"
    ? todos.filter((t) => t.status === "done")
    : filterStatus === "backlog"
      ? todos.filter((t) => t.status === "backlog")
      : filterStatus === "active"
        ? todos.filter((t) => t.status !== "done")
        : todos;
  const visibleTodos = sortTodos(filteredTodos, sortKey);

  const todoDone = todos.filter((t) => t.status === "done").length;
  const boardDone = boardTasks.filter((t) => isDonePhase(t.milestone_name)).length;
  const total = todos.length + boardTasks.length;
  const doneCount = todoDone + boardDone;

  return (
    <div className="border border-neutral-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 w-full px-4 py-3 bg-neutral-900/60 hover:bg-neutral-900/80 transition-colors text-left"
      >
        {expanded
          ? <ChevronDown className="w-4 h-4 text-neutral-500 shrink-0" />
          : <ChevronRight className="w-4 h-4 text-neutral-500 shrink-0" />
        }
        {companyName ? (
          <CompanyAvatar name={companyName} logoUrl={companyLogoUrl} size="sm" />
        ) : (
          <FolderKanban className="w-4 h-4 text-neutral-500 shrink-0" />
        )}
        <span className="flex-1 min-w-0">
          <span className="text-sm font-medium text-neutral-200 truncate">{projectName}</span>
        </span>
        <span className="text-xs text-neutral-600 font-mono shrink-0">
          {doneCount}/{total}
        </span>
        <div
          className="w-16 h-1.5 rounded-full bg-neutral-800 overflow-hidden shrink-0"
          title={`${doneCount} of ${total} done`}
        >
          {total > 0 && (
            <div
              className="h-full rounded-full bg-stone-500/50 transition-all"
              style={{ width: `${(doneCount / total) * 100}%` }}
            />
          )}
        </div>
      </button>

      {expanded && (
        <>
          {visibleTodos.length > 0 && (
            <div className="divide-y divide-neutral-800/40 border-b border-neutral-800/60">
              <div className="px-4 py-1.5">
                <span className="text-[10px] text-neutral-600 uppercase tracking-widest">To-dos</span>
              </div>
              {visibleTodos.map((todo) => (
                <TodoCard
                  key={`todo-${todo.id}`}
                  todo={todo}
                  onUpdate={onTodoUpdate}
                  onDelete={onTodoDelete}
                  onEdit={onTodoEdit}
                />
              ))}
            </div>
          )}
          <ProjectTaskBoardPanel
            projectId={projectId}
            tasks={boardTasks
              .filter((t) => {
                if (filterStatus === "backlog") return (t.milestone_name ?? "").toLowerCase() === "backlog";
                return true;
              })
              .map(boardTaskToTask)}
            milestonesOverride={milestones}
            filterStatus={
              filterStatus === "backlog" ? "all" : (filterStatus as "active" | "all" | "done")
            }
            sortKeyOverride={todoSortToBoardSortKey(sortKey)}
            hideToolbar
            onTaskUpdate={onBoardTaskUpdate}
            onTaskDelete={onBoardTaskDelete}
          />
          {total === 0 && (
            <p className="text-xs text-neutral-700 px-4 py-3">No tasks yet</p>
          )}
          <div className="px-3 py-2 flex items-center gap-2 border-t border-neutral-800/60">
            <button
              onClick={() => onNewTask(projectId)}
              className="flex items-center gap-1.5 text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add task
            </button>
            <span className="text-neutral-800">·</span>
            <Link
              href={`/projects/${projectId}`}
              className="text-xs text-neutral-600 hover:text-[#d4e052] transition-colors"
            >
              Open project board
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function TodosPage() {
  const { user: sessionUser, ready: sessionReady } = useSession();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [boardTasks, setBoardTasks] = useState<ProjectBoardTask[]>([]);
  const [milestonesByProject, setMilestonesByProject] = useState<Record<string, Milestone[]>>({});
  const [users, setUsers] = useState<TodoUser[]>(
    () => (getCached<TodoUser[]>(cacheKeys.users) ?? [])
  );
  const [companies, setCompanies] = useState<Company[]>(
    () => getCached<Company[]>(cacheKeys.companies) ?? []
  );
  const [projects, setProjects] = useState<Project[]>(
    () => getCached<Project[]>(cacheKeys.projects) ?? []
  );
  const [currentUser, setCurrentUser] = useState<TodoUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showRefreshHint, setShowRefreshHint] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [formDefaultProject, setFormDefaultProject] = useState<string | undefined>();
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [filterCompany, setFilterCompany] = useState("all");
  const [filterStatus, setFilterStatus] = useState("active");
  const [sortKey, setSortKey] = useState<TodoSortKey>("smart");
  const [search, setSearch] = useState("");
  const [myTodosView, setMyTodosView] = useState<"active" | "completed">("active");
  const [filtersReady, setFiltersReady] = useState(false);
  const defaultAssigneeApplied = useRef(false);
  const { requestDelete, confirmDialog } = useConfirmDelete();

  // Reuse layout session — no extra /api/auth/me round-trip on this page
  useEffect(() => {
    if (!sessionReady || defaultAssigneeApplied.current) return;
    defaultAssigneeApplied.current = true;
    if (sessionUser) {
      setCurrentUser({
        id: sessionUser.id,
        email: sessionUser.email,
        name: sessionUser.name,
      });
      setFilterAssignee(sessionUser.id);
    }
    setFiltersReady(true);
  }, [sessionReady, sessionUser]);

  // Reference lists come from the SSR-seeded cache, so they never gate the
  // task list behind a spinner.
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      getUsers().catch(() => [] as TodoUser[]),
      getCompanies().catch(() => [] as Company[]),
      getProjects().catch(() => [] as Project[]),
    ]).then(([userData, companyData, projectData]) => {
      if (cancelled) return;
      setUsers(userData);
      setCompanies(companyData);
      setProjects(projectData as Project[]);
      setCurrentUser((prev) => userData.find((u: TodoUser) => u.id === prev?.id) ?? prev);
    });
    return () => { cancelled = true; };
  }, []);

  const load = useCallback(async () => {
    if (!filtersReady) return;

    const params = new URLSearchParams();
    if (filterAssignee !== "all") params.set("assignee", filterAssignee);
    if (filterCompany !== "all") params.set("company", filterCompany);
    if (filterStatus === "backlog" || filterStatus === "done") {
      params.set("status", filterStatus);
    }

    const boardParams = new URLSearchParams();
    if (filterAssignee !== "all") boardParams.set("assignee", filterAssignee);
    if (filterCompany !== "all") boardParams.set("company", filterCompany);
    if (filterStatus !== "all") boardParams.set("status", filterStatus);

    // Paint whatever we showed last time for this filter combination, then
    // reconcile with the server response.
    const cacheKey = cacheKeys.taskList(`${params}|${boardParams}`);
    const cached = getCached<TaskListPayload>(cacheKey);
    let loadingTimer: ReturnType<typeof setTimeout> | undefined;
    if (cached) {
      setTodos(cached.todos);
      setBoardTasks(cached.boardTasks);
      setMilestonesByProject(cached.milestonesByProject);
      setLoading(false);
    } else {
      // Only show skeletons if the request isn't effectively instant.
      loadingTimer = setTimeout(() => setLoading(true), 180);
    }
    setRefreshing(true);

    try {
      const [todoData, boardPayload] = await Promise.all([
        fetch(`/api/todos?${params}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
        fetch(`/api/tasks/assigned?${boardParams}`)
          .then((r) => (r.ok ? r.json() : { tasks: [], milestonesByProject: {} }))
          .catch(() => ({ tasks: [], milestonesByProject: {} })),
      ]);

      const boardTasksRaw = Array.isArray(boardPayload)
        ? boardPayload
        : (boardPayload.tasks ?? []);
      const milestonesRaw = Array.isArray(boardPayload)
        ? {}
        : (boardPayload.milestonesByProject ?? {});

      const payload: TaskListPayload = {
        todos: todoData.map((t: Todo) => ({ ...t, _source: "todo" as const })),
        boardTasks: boardTasksRaw.map((t: ProjectBoardTask) => ({ ...t, _source: "task" as const })),
        milestonesByProject: milestonesRaw,
      };

      setCached(cacheKey, payload);
      setTodos(payload.todos);
      setBoardTasks(payload.boardTasks);
      setMilestonesByProject(payload.milestonesByProject);
    } finally {
      if (loadingTimer) clearTimeout(loadingTimer);
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterAssignee, filterCompany, filterStatus, filtersReady]);

  useEffect(() => {
    if (!refreshing) {
      setShowRefreshHint(false);
      return;
    }
    const timer = setTimeout(() => setShowRefreshHint(true), 350);
    return () => clearTimeout(timer);
  }, [refreshing]);

  useEffect(() => { load(); }, [load]);

  function handleTodoUpdate(updated: Todo) {
    // Cached snapshots are now behind the local state; drop them so a revisit
    // doesn't flash stale rows.
    invalidateTaskLists();
    setTodos((prev) => {
      const existing = prev.find((x) => x.id === updated.id);
      if (!existing) return prev;

      const merged = { ...existing, ...updated, _source: "todo" as const };

      // Reopening from Recently Completed → pin to top of My To-Dos as Open
      if (existing.status === "done" && updated.status === "open") {
        return [merged, ...prev.filter((x) => x.id !== updated.id)];
      }

      return prev.map((x) => (x.id === updated.id ? merged : x));
    });
  }

  function handleBoardTaskUpdate(updated: Task, milestone?: { name?: string; color?: string }) {
    invalidateTaskLists();
    setBoardTasks((prev) => {
      const existing = prev.find((x) => x.id === updated.id);
      if (!existing) {
        const projectMeta = prev.find((x) => x.project_id === updated.project_id);
        return [
          ...prev,
          {
            id: updated.id,
            title: updated.title,
            description: updated.description ?? undefined,
            status: updated.status,
            priority: updated.priority,
            assignee: updated.assignee ?? undefined,
            due_date: updated.due_date ?? undefined,
            project_id: updated.project_id,
            project_name: projectMeta?.project_name ?? "Project",
            company_name: projectMeta?.company_name,
            company_id: projectMeta?.company_id,
            company_logo_url: projectMeta?.company_logo_url,
            milestone_id: updated.milestone_id,
            milestone_name: milestone?.name,
            milestone_color: milestone?.color,
            parent_id: updated.parent_id,
            position: updated.position,
            approved: updated.approved,
            url: updated.url ?? undefined,
            created_at: updated.created_at,
            updated_at: updated.updated_at,
            _source: "task" as const,
          },
        ];
      }
      return prev.map((x) => {
        if (x.id !== updated.id) return x;
        return {
          ...x,
          title: updated.title,
          description: updated.description ?? undefined,
          status: updated.status,
          priority: updated.priority,
          assignee: updated.assignee ?? undefined,
          due_date: updated.due_date ?? undefined,
          milestone_id: updated.milestone_id,
          parent_id: updated.parent_id,
          position: updated.position,
          url: updated.url ?? undefined,
          milestone_name: milestone?.name ?? (updated.milestone_id ? x.milestone_name : undefined),
          milestone_color: milestone?.color ?? (updated.milestone_id ? x.milestone_color : undefined),
        };
      });
    });
  }

  function handleBoardTaskDelete(id: string) {
    const task = boardTasks.find((t) => t.id === id);
    requestDelete({
      title: "Delete task",
      description: (
        <>
          Are you sure you want to delete{" "}
          <span className="text-neutral-300">{task?.title ?? "this task"}</span>?
        </>
      ),
      confirmLabel: "Delete task",
      onConfirm: () => {
        fetch(`/api/tasks/${id}`, { method: "DELETE" });
        invalidateTaskLists();
        setBoardTasks((prev) => prev.filter((t) => t.id !== id));
      },
    });
  }

  function handleDelete(id: string) {
    const todo = todos.find((t) => t.id === id);
    requestDelete({
      title: "Delete task",
      description: (
        <>
          Are you sure you want to delete{" "}
          <span className="text-neutral-300">{todo?.title ?? "this task"}</span>?
        </>
      ),
      confirmLabel: "Delete task",
      onConfirm: () => {
        fetch(`/api/todos/${id}`, { method: "DELETE" });
        invalidateTaskLists();
        setTodos((prev) => prev.filter((t) => t.id !== id));
      },
    });
  }

  function openNewTask() {
    setEditingTodo(null);
    setFormDefaultProject(undefined);
    setFormOpen(true);
  }

  function openNewTaskForProject(projectId: string) {
    setEditingTodo(null);
    setFormDefaultProject(projectId);
    setFormOpen(true);
  }

  function openEditTask(todo: Todo) {
    setEditingTodo(todo);
    setFormDefaultProject(undefined);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingTodo(null);
    setFormDefaultProject(undefined);
  }

  const people = assigneeOptions(users, currentUser);
  const searchActive = !!normalizeTaskSearchQuery(search);

  // Personal = no company, no project. Company todos hang on the client.
  const personalTodos = todos.filter((t) => !t.company_id && !t.project_id);
  const companyTodos = todos.filter((t) => !!t.company_id && !t.project_id);
  const projectTodos = todos.filter((t) => !!t.project_id);

  const companyGroups = new Map<string, {
    name: string;
    logoUrl?: string;
    todos: Todo[];
  }>();
  for (const t of companyTodos) {
    const cid = t.company_id!;
    if (!companyGroups.has(cid)) {
      companyGroups.set(cid, {
        name: t.company_name || "Unknown company",
        logoUrl: t.company_logo_url,
        todos: [],
      });
    }
    companyGroups.get(cid)!.todos.push(t);
  }
  if (searchActive) {
    for (const [cid, group] of Array.from(companyGroups.entries())) {
      if (!matchesTaskSearch(search, group.name)) {
        group.todos = group.todos.filter((t) => todoMatchesSearch(t, search));
      }
      if (group.todos.length === 0) companyGroups.delete(cid);
    }
  }

  // Build unified project groups: combine todo-based and board-based tasks
  const projectGroups = new Map<string, {
    name: string;
    companyName?: string;
    companyLogoUrl?: string;
    todos: Todo[];
    boardTasks: ProjectBoardTask[];
  }>();

  for (const t of projectTodos) {
    const pid = t.project_id!;
    if (!projectGroups.has(pid)) {
      projectGroups.set(pid, {
        name: t.project_name || "Unknown project",
        companyName: t.project_company_name,
        companyLogoUrl: t.project_company_logo_url,
        todos: [], boardTasks: [],
      });
    }
    projectGroups.get(pid)!.todos.push(t);
  }

  for (const t of boardTasks) {
    const pid = t.project_id;
    if (!projectGroups.has(pid)) {
      projectGroups.set(pid, {
        name: t.project_name || "Unknown project",
        companyName: t.company_name,
        companyLogoUrl: t.company_logo_url,
        todos: [], boardTasks: [],
      });
    }
    const group = projectGroups.get(pid)!;
    if (!group.companyName && t.company_name) {
      group.companyName = t.company_name;
      group.companyLogoUrl = t.company_logo_url;
    }
    group.boardTasks.push(t);
  }

  if (searchActive) {
    for (const [pid, group] of Array.from(projectGroups.entries())) {
      const groupNameMatch = matchesTaskSearch(search, group.name, group.companyName);
      if (!groupNameMatch) {
        group.todos = group.todos.filter((t) => todoMatchesSearch(t, search));
        group.boardTasks = group.boardTasks.filter((t) => boardTaskMatchesSearch(t, search));
      }
      if (group.todos.length === 0 && group.boardTasks.length === 0) {
        projectGroups.delete(pid);
      }
    }
  }

  const searchedPersonalTodos = searchActive
    ? personalTodos.filter((t) => todoMatchesSearch(t, search))
    : personalTodos;

  // Further split personal to-dos
  const personalActive = filterStatus === "done"
    ? []
    : filterStatus === "backlog"
      ? sortTodos(searchedPersonalTodos.filter((t) => t.status === "backlog"), sortKey)
      : sortTodos(searchedPersonalTodos.filter((t) => t.status !== "done"), sortKey);
  const personalDone = sortCompletedLatest(searchedPersonalTodos.filter((t) => t.status === "done"));
  const personalDonePreview = personalDone.slice(0, 3);
  const showCompletedView = myTodosView === "completed" || filterStatus === "done";

  // Stats (include both sources) — based on unfiltered lists so header counts stay stable
  const totalOpen = todos.filter((t) => t.status === "open").length
    + boardTasks.filter((t) => !isDonePhase(t.milestone_name) && t.status === "open").length;
  const totalInProgress = todos.filter((t) => t.status === "in_progress").length
    + boardTasks.filter((t) => !isDonePhase(t.milestone_name) && t.status === "in_progress").length;
  const totalBacklog = todos.filter((t) => t.status === "backlog").length;
  const totalOverdue =
    todos.filter((t) => t.due_date && t.status !== "done" && t.status !== "backlog" && new Date(t.due_date) < new Date()).length
    + boardTasks.filter((t) => !isDonePhase(t.milestone_name) && t.due_date && new Date(t.due_date) < new Date()).length;
  const totalCompanyItems = Array.from(companyGroups.values()).reduce((sum, g) => sum + g.todos.length, 0);
  const totalProjectItems = Array.from(projectGroups.values()).reduce((sum, g) => sum + g.todos.length + g.boardTasks.length, 0);

  return (
    <div className="page-shell space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-neutral-100 flex items-center gap-2">
            Tasks
            {showRefreshHint && !loading && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-[#d4e052] animate-pulse"
                title="Refreshing"
                aria-label="Refreshing"
              />
            )}
          </h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {totalOpen} to do · {totalInProgress} in progress
            {totalBacklog > 0 && <span className="ml-2">· {totalBacklog} backlog</span>}
            {totalOverdue > 0 && <span className="text-red-400 ml-2">· {totalOverdue} overdue</span>}
          </p>
        </div>
        <Button onClick={openNewTask}
          className="w-full sm:w-auto bg-[#d4e052] hover:bg-[#c2ce45] text-neutral-950 font-medium gap-2">
          <Plus className="w-4 h-4" /> New task
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 sm:gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[10rem] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-600" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="pl-9 bg-neutral-900 border-neutral-700 text-neutral-100 placeholder:text-neutral-600 h-8 text-sm"
          />
        </div>
        <Select value={filterAssignee} onValueChange={(v) => setFilterAssignee(v ?? "all")}>
          <SelectTrigger className="w-40 bg-neutral-900 border-neutral-700 text-neutral-100 h-8 text-sm">
            <SelectValue>
              {filterAssignee === "all"
                ? "Everyone"
                : assigneeLabel(people, filterAssignee, currentUser)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-neutral-800 border-neutral-700">
            <SelectItem value="all" className="text-neutral-400">Everyone</SelectItem>
            {people.map((u) => (
              <SelectItem key={u.id} value={u.id} className="text-neutral-100">{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterCompany} onValueChange={(v) => setFilterCompany(v ?? "all")}>
          <SelectTrigger className="w-44 bg-neutral-900 border-neutral-700 text-neutral-100 h-8 text-sm">
            <SelectValue>
              {filterCompany === "all"
                ? "All companies"
                : namedOptionLabel(companies, filterCompany, "All companies")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-neutral-800 border-neutral-700">
            <SelectItem value="all" className="text-neutral-400">All companies</SelectItem>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-neutral-100">{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v ?? "active")}>
          <SelectTrigger className="w-36 bg-neutral-900 border-neutral-700 text-neutral-100 h-8 text-sm">
            <SelectValue>
              {statusFilterLabels[filterStatus] ?? "Active"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-neutral-800 border-neutral-700">
            <SelectItem value="active" className="text-neutral-100">Active</SelectItem>
            <SelectItem value="backlog" className="text-neutral-400">Backlog</SelectItem>
            <SelectItem value="all" className="text-neutral-400">All</SelectItem>
            <SelectItem value="done" className="text-stone-300">Done</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortKey} onValueChange={(v) => setSortKey((v ?? "smart") as TodoSortKey)}>
          <SelectTrigger
            aria-label="Sort tasks"
            className="w-44 bg-neutral-900 border-neutral-700 text-neutral-100 h-8 text-sm"
          >
            <SelectValue>
              <span className="flex items-center gap-1.5 min-w-0">
                <ArrowUpDown className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                <span className="truncate">{TODO_SORT_LABELS[sortKey]}</span>
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-neutral-800 border-neutral-700">
            {sortOptions.map((key) => (
              <SelectItem key={key} value={key} className="text-neutral-100">
                {TODO_SORT_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-neutral-900 rounded-lg animate-pulse border border-neutral-800" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {/* =========================================================== */}
          {/* SECTION 1: MY TO-DOS (personal, no project) */}
          {/* =========================================================== */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <ListTodo className="w-4 h-4 text-neutral-500" />
              <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">
                {showCompletedView ? "Completed To-Dos" : "My To-Dos"}
              </h2>
              <span className="text-xs text-neutral-600 font-mono ml-1">
                {showCompletedView ? personalDone.length : personalActive.length}
              </span>
              <div className="flex-1" />
              {showCompletedView ? (
                <button
                  type="button"
                  onClick={() => setMyTodosView("active")}
                  className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-200 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  My To-Dos
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setMyTodosView("completed")}
                  className="text-xs text-neutral-500 hover:text-neutral-200 transition-colors"
                >
                  Completed To-Dos
                  {personalDone.length > 0 && (
                    <span className="text-neutral-600 font-mono ml-1.5">{personalDone.length}</span>
                  )}
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              {showCompletedView ? (
                <>
                  {personalDone.map((t) => (
                    <TodoRow
                      key={t.id}
                      todo={t}
                      onUpdate={handleTodoUpdate}
                      onDelete={handleDelete}
                      onEdit={openEditTask}
                    />
                  ))}
                  {personalDone.length === 0 && (
                    <div className="py-8 text-center border border-dashed border-neutral-800 rounded-lg">
                      <CheckCircle2 className="w-6 h-6 text-neutral-700 mx-auto mb-2" />
                      <p className="text-neutral-600 text-xs">
                        {searchActive ? "No completed to-dos match your search" : "No completed to-dos yet"}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <QuickAddTodo
                    onAdd={(t) => {
                      invalidateTaskLists();
                      setTodos((prev) => [{ ...t, _source: "todo" as const }, ...prev]);
                    }}
                    currentUser={currentUser}
                  />
                  {personalActive.map((t) => (
                    <TodoRow key={t.id} todo={t} onUpdate={handleTodoUpdate} onDelete={handleDelete} onEdit={openEditTask} />
                  ))}
                  {personalDonePreview.length > 0 && (
                    <>
                      <div className="flex items-center gap-3 pt-2 pb-1">
                        <div className="flex-1 border-t border-neutral-800/60" />
                        <span className="text-[10px] text-neutral-600 uppercase tracking-widest shrink-0">
                          Recently completed
                        </span>
                        <div className="flex-1 border-t border-neutral-800/60" />
                      </div>
                      {personalDonePreview.map((t) => (
                        <TodoRow
                          key={t.id}
                          todo={t}
                          onUpdate={handleTodoUpdate}
                          onDelete={handleDelete}
                          onEdit={openEditTask}
                        />
                      ))}
                      {personalDone.length > 3 && (
                        <button
                          type="button"
                          onClick={() => setMyTodosView("completed")}
                          className="w-full py-2 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
                        >
                          View all {personalDone.length} completed to-dos
                        </button>
                      )}
                    </>
                  )}
                  {personalActive.length === 0 && personalDone.length === 0 && (
                    <div className="py-8 text-center border border-dashed border-neutral-800 rounded-lg">
                      <CheckCircle2 className="w-6 h-6 text-neutral-700 mx-auto mb-2" />
                      <p className="text-neutral-600 text-xs">
                        {searchActive ? "No personal to-dos match your search" : "No personal to-dos — all caught up!"}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          {companyGroups.size > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="w-4 h-4 text-neutral-500" />
                <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">
                  Companies
                </h2>
                <span className="text-xs text-neutral-600 font-mono ml-1">
                  {totalCompanyItems}
                </span>
              </div>
              <div className="space-y-3">
                {Array.from(companyGroups.entries())
                  .sort((a, b) => a[1].name.localeCompare(b[1].name))
                  .map(([cid, group]) => (
                    <CompanyGroup
                      key={cid}
                      companyName={group.name}
                      companyLogoUrl={group.logoUrl}
                      todos={group.todos}
                      filterStatus={filterStatus}
                      sortKey={sortKey}
                      onTodoUpdate={handleTodoUpdate}
                      onTodoDelete={handleDelete}
                      onTodoEdit={openEditTask}
                    />
                  ))}
              </div>
            </section>
          )}

          {/* =========================================================== */}
          {/* SECTION 2: PROJECT TASKS (grouped by project) */}
          {/* =========================================================== */}
          {(projectGroups.size > 0 || filterStatus !== "done") && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <FolderKanban className="w-4 h-4 text-neutral-500" />
                <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">
                  Project Tasks
                </h2>
                <span className="text-xs text-neutral-600 font-mono ml-1">
                  {totalProjectItems}
                </span>
              </div>

              {projectGroups.size > 0 ? (
                <div className="space-y-3">
                  {Array.from(projectGroups.entries()).map(([pid, group]) => (
                    <ProjectGroup
                      key={pid}
                      projectId={pid}
                      projectName={group.name}
                      companyName={group.companyName}
                      companyLogoUrl={group.companyLogoUrl}
                      todos={group.todos}
                      boardTasks={group.boardTasks}
                      milestones={milestonesByProject[pid]}
                      filterStatus={filterStatus}
                      sortKey={sortKey}
                      onTodoUpdate={handleTodoUpdate}
                      onTodoDelete={handleDelete}
                      onTodoEdit={openEditTask}
                      onBoardTaskUpdate={handleBoardTaskUpdate}
                      onBoardTaskDelete={handleBoardTaskDelete}
                      onNewTask={openNewTaskForProject}
                    />
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center border border-dashed border-neutral-800 rounded-lg">
                  <FolderKanban className="w-6 h-6 text-neutral-700 mx-auto mb-2" />
                  <p className="text-neutral-600 text-xs">
                    {searchActive ? "No project tasks match your search" : "No project tasks yet"}
                  </p>
                  {!searchActive && (
                    <p className="text-neutral-700 text-xs mt-1">Project-board work still shows here</p>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      <TodoFormDialog
        open={formOpen}
        onClose={closeForm}
        onSave={() => { load(); }}
        todo={editingTodo}
        users={users}
        companies={companies}
        projects={projects as Project[]}
        currentUser={currentUser}
        defaultProjectId={formDefaultProject}
        defaultCompanyId={filterCompany !== "all" ? filterCompany : undefined}
        onCompanyCreated={(company) => {
          setCompanies((prev) =>
            prev.some((c) => c.id === company.id)
              ? prev
              : [...prev, company].sort((a, b) => a.name.localeCompare(b.name)),
          );
        }}
      />

      {confirmDialog}
    </div>
  );
}
