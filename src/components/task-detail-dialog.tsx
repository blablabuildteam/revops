"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Milestone, Task, TaskComment, TaskAttachment, TaskPriority, resolvePhaseColor } from "@/lib/types";
import { AssigneeSelect } from "@/components/assignee-select";
import { formatDateTime, toDateInputValue } from "@/lib/format";
import { TaskAttachments, TaskAttachmentsApi } from "@/components/task-attachments";
import { useUndoToast } from "@/components/mutation-provider";
import { useSessionOptional } from "@/components/session-provider";
import { LinkifiedText } from "@/components/linkified-text";
import { NotesField } from "@/components/notes-field";

export type TaskDetailDialogApi = TaskAttachmentsApi & {
  updateTask: (id: string, data: Partial<Task>) => Promise<Task>;
  createTask?: (data: Partial<Task>) => Promise<Task>;
  getTaskComments: (taskId: string) => Promise<TaskComment[]>;
  createTaskComment: (taskId: string, body: string) => Promise<TaskComment>;
};

const emptyForm = {
  title: "",
  due_date: "",
  assignee: "",
  description: "",
  url: "",
  priority: "low" as TaskPriority,
  milestone_id: "",
};

function isDonePhase(name: string) {
  return name.toLowerCase() === "done";
}

function defaultMilestoneId(milestones: Milestone[]) {
  return milestones.find((m) => m.name.toLowerCase() === "open")?.id
    ?? milestones.find((m) => !isDonePhase(m.name))?.id
    ?? milestones[0]?.id
    ?? "";
}

export function TaskDetailDialog({
  task,
  open,
  onClose,
  onSave,
  api,
  milestones = [],
  defaultMilestoneId: defaultMilestoneIdProp,
}: {
  task: Task | null;
  open: boolean;
  onClose: () => void;
  onSave: (t: Task) => void;
  api: TaskDetailDialogApi;
  /** Phases shown in create mode. */
  milestones?: Milestone[];
  defaultMilestoneId?: string;
}) {
  const isCreate = open && !task;
  const session = useSessionOptional();
  const currentUserName = session?.user?.name?.trim() ?? "";
  const [form, setForm] = useState(emptyForm);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const withUndo = useUndoToast();
  const selectedMilestone = milestones.find((m) => m.id === form.milestone_id);

  useEffect(() => {
    if (!open) return;

    if (task) {
      setForm({
        title: task.title,
        due_date: toDateInputValue(task.due_date),
        assignee: task.assignee ?? "",
        description: task.description ?? "",
        url: task.url ?? "",
        priority: task.priority ?? "low",
        milestone_id: task.milestone_id ?? "",
      });
      setCommentDraft("");
      setPendingFiles([]);
      setCommentsLoading(true);
      setAttachmentsLoading(true);
      api.getTaskComments(task.id)
        .then(setComments)
        .catch(() => setComments([]))
        .finally(() => setCommentsLoading(false));
      api.getTaskAttachments(task.id)
        .then(setAttachments)
        .catch(() => setAttachments([]))
        .finally(() => setAttachmentsLoading(false));
      return;
    }

    setForm({
      ...emptyForm,
      milestone_id: defaultMilestoneIdProp || defaultMilestoneId(milestones),
      assignee: currentUserName,
    });
    setCommentDraft("");
    setComments([]);
    setAttachments([]);
    setPendingFiles([]);
    setCommentsLoading(false);
    setAttachmentsLoading(false);
  // Only re-init when the dialog opens or the edited task changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, open]);

  // Prefill responsible once session is ready (may load after dialog opens).
  useEffect(() => {
    if (!isCreate || !currentUserName) return;
    setForm((f) => (f.assignee ? f : { ...f, assignee: currentUserName }));
  }, [isCreate, currentUserName]);

  useEffect(() => {
    if (open && !isCreate && comments.length > 0) {
      commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [comments, open, isCreate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const title = form.title.trim();
    if (!title) return;
    setLoading(true);
    try {
      if (isCreate) {
        if (!api.createTask) return;
        const created = await api.createTask({
          title,
          due_date: form.due_date || null,
          assignee: form.assignee || null,
          description: form.description || null,
          url: form.url || null,
          priority: form.priority,
          milestone_id: form.milestone_id || undefined,
        });
        let uploaded = 0;
        for (const file of pendingFiles) {
          try {
            await api.uploadTaskAttachment(created.id, file);
            uploaded += 1;
          } catch {
            // Task already exists; keep going so remaining files still upload.
          }
        }
        onSave({ ...created, has_attachments: uploaded > 0 });
        onClose();
        return;
      }

      if (!task) return;
      const snapshot = {
        title: task.title,
        due_date: task.due_date ?? null,
        assignee: task.assignee ?? null,
        description: task.description ?? null,
        url: task.url ?? null,
        priority: task.priority ?? "low",
      };
      await withUndo({
        label: "Updated",
        run: async () => {
          const updated = await api.updateTask(task.id, {
            title,
            due_date: form.due_date || null,
            assignee: form.assignee || null,
            description: form.description || null,
            url: form.url || null,
            priority: form.priority,
          });
          onSave({ ...updated, comment_count: task.comment_count ?? comments.length, has_attachments: attachments.length > 0 });
          onClose();
        },
        undo: async () => {
          const reverted = await api.updateTask(task.id, snapshot);
          onSave({ ...reverted, comment_count: task.comment_count ?? comments.length, has_attachments: attachments.length > 0 });
        },
      });
    } finally {
      setLoading(false);
    }
  }

  async function handlePostComment(e: React.FormEvent) {
    e.preventDefault();
    if (!task) return;
    const body = commentDraft.trim();
    if (!body) return;
    setPostingComment(true);
    try {
      const comment = await api.createTaskComment(task.id, body);
      setComments((prev) => [...prev, comment]);
      setCommentDraft("");
      onSave({
        ...task,
        comment_count: (task.comment_count ?? comments.length) + 1,
      });
    } finally {
      setPostingComment(false);
    }
  }

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-neutral-900 border-neutral-700 text-neutral-100 max-w-5xl w-[95vw] p-0 gap-0 overflow-hidden">
        <div className="flex flex-col md:flex-row h-[min(85vh,760px)] min-h-[520px]">
          <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden">
            <DialogHeader className="px-8 pt-8 pb-5 border-b border-neutral-800 shrink-0">
              <DialogTitle className="text-neutral-100 pr-8">
                {isCreate ? "New task" : "Edit task"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto overscroll-contain px-8 py-6 space-y-5 min-h-0">
                <div className="space-y-2">
                  <Label className="text-neutral-400 text-xs">Title</Label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Task title..."
                    required
                    autoFocus={isCreate}
                    className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600"
                  />
                </div>
                <div className={`grid grid-cols-1 gap-4 ${isCreate && milestones.length > 0 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}>
                  {isCreate && milestones.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-neutral-400 text-xs">Phase</Label>
                      <Select
                        value={form.milestone_id || undefined}
                        onValueChange={(v) => setForm((f) => ({ ...f, milestone_id: v ?? "" }))}
                      >
                        <SelectTrigger className="bg-neutral-800 border-neutral-700 text-neutral-100 w-full">
                          <SelectValue placeholder="Choose phase">
                            {selectedMilestone ? (
                              <span className="flex items-center gap-2">
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{
                                    backgroundColor: resolvePhaseColor(
                                      selectedMilestone.name,
                                      selectedMilestone.color,
                                    ),
                                  }}
                                />
                                {selectedMilestone.name}
                              </span>
                            ) : null}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="bg-neutral-800 border-neutral-700">
                          {milestones.map((m) => (
                            <SelectItem key={m.id} value={m.id} className="text-neutral-100">
                              <span className="flex items-center gap-2">
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: resolvePhaseColor(m.name, m.color) }}
                                />
                                {m.name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label className="text-neutral-400 text-xs">Date</Label>
                    <DatePicker
                      value={form.due_date}
                      onChange={(v) => setForm((f) => ({ ...f, due_date: v }))}
                      className="bg-neutral-800 border-neutral-700 text-neutral-100 w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-neutral-400 text-xs">Responsible</Label>
                    <AssigneeSelect
                      value={form.assignee || null}
                      onValueChange={(v) => setForm((f) => ({ ...f, assignee: v ?? "" }))}
                      noneLabel="Nobody"
                      placeholder="Choose person"
                      triggerClassName="bg-neutral-800 border-neutral-700 text-neutral-100 w-full"
                      itemClassName="text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-neutral-400 text-xs">Priority</Label>
                    <Select
                      value={form.priority}
                      onValueChange={(v) => setForm((f) => ({ ...f, priority: (v ?? "low") as TaskPriority }))}
                    >
                      <SelectTrigger className="bg-neutral-800 border-neutral-700 text-neutral-100 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-neutral-800 border-neutral-700">
                        <SelectItem value="high" className="text-red-400">High</SelectItem>
                        <SelectItem value="medium" className="text-amber-400">Medium</SelectItem>
                        <SelectItem value="low" className="text-neutral-400">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-neutral-400 text-xs">URL</Label>
                  <Input
                    type="url"
                    value={form.url}
                    onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                    placeholder="https://..."
                    className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600"
                  />
                </div>
                <NotesField
                  value={form.description}
                  onChange={(description) => setForm((f) => ({ ...f, description }))}
                />
                {isCreate ? (
                  <TaskAttachments
                    mode="pending"
                    files={pendingFiles}
                    onChange={setPendingFiles}
                  />
                ) : task ? (
                  <TaskAttachments
                    taskId={task.id}
                    attachments={attachments}
                    loading={attachmentsLoading}
                    onChange={(next) => {
                      setAttachments(next);
                      onSave({ ...task, has_attachments: next.length > 0 });
                    }}
                    api={api}
                  />
                ) : null}
              </div>
              <DialogFooter className="bg-transparent border-t border-neutral-800 px-8 py-5 mt-auto shrink-0 mx-0 mb-0 rounded-none">
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
                  disabled={loading || !form.title.trim() || (isCreate && !api.createTask)}
                  className="bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950"
                >
                  {loading
                    ? (isCreate
                      ? (pendingFiles.length > 0 ? "Adding & uploading..." : "Adding...")
                      : "Saving...")
                    : (isCreate ? "Add task" : "Save")}
                </Button>
              </DialogFooter>
            </form>
          </div>

          <div className="md:w-[380px] shrink-0 border-t md:border-t-0 md:border-l border-neutral-800 flex flex-col min-h-0 overflow-hidden bg-neutral-950/40 max-h-[42vh] md:max-h-none md:h-full">
            <div className="px-6 py-5 border-b border-neutral-800 shrink-0">
              <h3 className="text-sm font-medium text-neutral-200">Comments</h3>
              <p className="text-xs text-neutral-500 mt-1">Discuss this task with your team</p>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-4 space-y-3">
              {isCreate ? (
                <p className="text-xs text-neutral-600">Save the task to start the conversation.</p>
              ) : commentsLoading ? (
                <p className="text-xs text-neutral-600">Loading comments...</p>
              ) : comments.length === 0 ? (
                <p className="text-xs text-neutral-600">No comments yet. Start the conversation below.</p>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="rounded-lg bg-neutral-900/80 border border-neutral-800 px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3 mb-1.5">
                      <span className="text-xs font-medium text-neutral-200">{comment.author_name}</span>
                      <time className="text-[10px] text-neutral-600 shrink-0" dateTime={comment.created_at}>
                        {formatDateTime(comment.created_at)}
                      </time>
                    </div>
                    <LinkifiedText text={comment.body} emptyLabel="(empty comment)" />
                  </div>
                ))
              )}
              <div ref={commentsEndRef} />
            </div>

            <form
              onSubmit={handlePostComment}
              className="border-t border-neutral-800 px-6 py-5 space-y-3 shrink-0 bg-neutral-950/60"
            >
              <Textarea
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                placeholder={isCreate ? "Save the task to comment..." : "Write a comment..."}
                rows={3}
                disabled={isCreate}
                className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600 resize-none text-sm disabled:opacity-50"
                onKeyDown={(e) => {
                  if (isCreate) return;
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void handlePostComment(e);
                  }
                }}
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] text-neutral-600">⌘+Enter to send</span>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isCreate || postingComment || !commentDraft.trim()}
                  className="bg-neutral-800 hover:bg-neutral-700 text-neutral-100 border border-neutral-700"
                >
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  {postingComment ? "Sending..." : "Comment"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
