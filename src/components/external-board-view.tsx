"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AssigneeNamesProvider,
  collectAssigneeNames,
} from "@/components/assignee-select";
import { EditStatusesDialog } from "@/components/edit-statuses-dialog";
import { TaskDetailDialog } from "@/components/task-detail-dialog";
import { TaskFilterBar, useTaskFilters, applyTaskFilters } from "@/components/task-filter-bar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  BoardApiContext,
  ProjectTaskBoardPanel,
  buildEditBoardApi,
} from "@/components/project-task-board";
import {
  createEditBoardMilestone,
  deleteEditBoardTask,
  getEditBoardProject,
  type EditBoardProject,
} from "@/lib/edit-board-api";
import { Task, CUSTOM_PHASE_DEFAULT_COLOR } from "@/lib/types";

function upsertTask(prev: Task[], updated: Task): Task[] {
  const idx = prev.findIndex((t) => t.id === updated.id);
  if (idx === -1) return [...prev, updated];
  return prev.map((t) => (t.id === updated.id ? updated : t));
}

function PhaseColorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <label
      title="Phase color"
      className="group relative h-8 w-8 shrink-0 cursor-pointer rounded-lg border border-neutral-700 p-[3px] transition-colors hover:border-neutral-500"
      style={{
        background: "conic-gradient(from 0deg, #ef4444, #f59e0b, #eab308, #84cc16, #22c55e, #06b6d4, #3b82f6, #a855f7, #ef4444)",
      }}
    >
      <span className="flex h-full w-full items-center justify-center rounded-[5px] bg-neutral-950/90">
        <span
          className="h-3.5 w-3.5 rounded-full border border-neutral-600 shadow-sm transition-transform group-hover:scale-110"
          style={{ backgroundColor: value }}
        />
      </span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  );
}

function flattenTasks(project: EditBoardProject): Task[] {
  const fromMilestones = project.milestones.flatMap((m) => m.tasks ?? []);
  return [...fromMilestones, ...(project.unassigned_tasks ?? [])];
}

export function ExternalProjectBoard({ editToken }: { editToken: string }) {
  const boardApi = useMemo(() => buildEditBoardApi(editToken), [editToken]);
  const [project, setProject] = useState<EditBoardProject | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [newMilestoneName, setNewMilestoneName] = useState("");
  const [newMilestoneColor, setNewMilestoneColor] = useState(CUSTOM_PHASE_DEFAULT_COLOR);
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [editStatusesOpen, setEditStatusesOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const { filters, addFilter, updateFilter, removeFilter, clearFilters } = useTaskFilters();

  async function reload() {
    try {
      const p = await getEditBoardProject(editToken);
      setProject(p);
      setTasks(flattenTasks(p));
      setLoading(false);
    } catch {
      setNotFound(true);
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editToken]);

  function handleTaskUpdate(updated: Task) {
    setTasks((prev) => upsertTask(prev, updated));
  }

  async function handleTaskDelete(id: string) {
    await deleteEditBoardTask(editToken, id);
    setTasks((prev) => prev.filter((t) => t.id !== id && t.parent_id !== id));
  }

  async function handleAddMilestone(e: React.FormEvent) {
    e.preventDefault();
    if (!newMilestoneName.trim() || !project) return;
    setAddingMilestone(true);
    try {
      await createEditBoardMilestone(editToken, {
        name: newMilestoneName.trim(),
        color: newMilestoneColor,
        position: project.milestones.length,
      });
      setNewMilestoneName("");
      setNewMilestoneColor(CUSTOM_PHASE_DEFAULT_COLOR);
      await reload();
    } finally {
      setAddingMilestone(false);
    }
  }

  const boardAssigneeNames = useMemo(() => collectAssigneeNames(tasks), [tasks]);

  const createApi = useMemo(() => ({
    ...boardApi,
    createTask: (data: Partial<Task>) => boardApi.createTask(project?.id ?? "", data),
  }), [boardApi, project?.id]);

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
          <h1 className="text-xl font-semibold text-neutral-300 mb-2">Board access not found</h1>
          <p className="text-sm text-neutral-600">This link is invalid or access has been removed.</p>
        </div>
      </div>
    );
  }

  return (
    <BoardApiContext.Provider value={boardApi}>
      <AssigneeNamesProvider names={boardAssigneeNames}>
      <div className="min-h-screen bg-neutral-950 text-neutral-100">
        <div className="border-b border-neutral-800 bg-neutral-950/90 sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-6 py-4">
            <p className="text-xs text-[#e8ff47] tracking-[0.2em] uppercase font-bold mb-1">blablabuild</p>
            <h1 className="text-xl font-semibold text-neutral-100">{project.name}</h1>
            {project.description && (
              <p className="text-sm text-neutral-500 mt-1">{project.description}</p>
            )}
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-end gap-2 mb-3">
            <Popover>
              <PopoverTrigger
                className={`flex items-center gap-1.5 text-xs py-1.5 px-2.5 rounded-lg border transition-colors cursor-pointer ${
                  filters.length > 0
                    ? "border-[#e8ff47]/30 text-[#e8ff47]"
                    : "border-neutral-700 text-neutral-400 hover:text-neutral-200"
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                Filter{filters.filter((f) => f.value).length > 0 && ` (${filters.filter((f) => f.value).length})`}
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto min-w-[320px] p-3">
                <TaskFilterBar
                  filters={filters}
                  milestones={project.milestones}
                  onAddFilter={addFilter}
                  onUpdateFilter={updateFilter}
                  onRemoveFilter={removeFilter}
                  onClearFilters={clearFilters}
                />
              </PopoverContent>
            </Popover>
            <button
              onClick={() => setEditStatusesOpen(true)}
              className="flex items-center gap-2 text-xs border border-neutral-700 px-3 py-2 rounded-lg text-neutral-400 hover:text-neutral-200 hover:border-neutral-600 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit statuses
            </button>
            <Button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 font-medium gap-2 h-8 text-xs px-3"
            >
              <Plus className="w-3.5 h-3.5" />
              Add task
            </Button>
          </div>

          <ProjectTaskBoardPanel
            projectId={project.id}
            tasks={applyTaskFilters(tasks, filters, project.milestones)}
            filterStatus="all"
            showAllPhases
            hideToolbar
            milestonesOverride={project.milestones}
            onTaskUpdate={handleTaskUpdate}
            onTaskDelete={handleTaskDelete}
          />

          <form onSubmit={handleAddMilestone} className="flex items-center gap-3 mt-6">
            <PhaseColorInput value={newMilestoneColor} onChange={setNewMilestoneColor} />
            <Input
              value={newMilestoneName}
              onChange={(e) => setNewMilestoneName(e.target.value)}
              placeholder="Add new phase..."
              className="bg-neutral-900 border-neutral-700 text-neutral-100 placeholder:text-neutral-600 flex-1"
            />
            <Button
              type="submit"
              disabled={addingMilestone || !newMilestoneName.trim()}
              className="bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 font-medium gap-2 shrink-0"
            >
              <Plus className="w-4 h-4" /> Phase
            </Button>
          </form>

          <TaskDetailDialog
            task={null}
            open={createOpen}
            onClose={() => setCreateOpen(false)}
            onSave={handleTaskUpdate}
            api={createApi}
            milestones={project.milestones}
          />

          <EditStatusesDialog
            open={editStatusesOpen}
            onOpenChange={setEditStatusesOpen}
            projectId={project.id}
            milestones={project.milestones}
            editToken={editToken}
            onSave={(updated) => {
              setProject((prev) => prev ? {
                ...prev,
                milestones: updated.map((m) => ({
                  ...m,
                  tasks: prev.milestones.find((ms) => ms.id === m.id)?.tasks ?? [],
                })),
              } : prev);
            }}
          />
        </div>
      </div>
      </AssigneeNamesProvider>
    </BoardApiContext.Provider>
  );
}
