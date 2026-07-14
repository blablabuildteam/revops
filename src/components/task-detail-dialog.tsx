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
import { Task, TaskComment, TASK_ASSIGNEES, TaskPriority } from "@/lib/types";
import { formatDateTime, toDateInputValue } from "@/lib/format";

export type TaskDetailDialogApi = {
  updateTask: (id: string, data: Partial<Task>) => Promise<Task>;
  getTaskComments: (taskId: string) => Promise<TaskComment[]>;
  createTaskComment: (taskId: string, body: string) => Promise<TaskComment>;
};

export function TaskDetailDialog({
  task,
  open,
  onClose,
  onSave,
  api,
}: {
  task: Task | null;
  open: boolean;
  onClose: () => void;
  onSave: (t: Task) => void;
  api: TaskDetailDialogApi;
}) {
  const [form, setForm] = useState({
    title: "",
    due_date: "",
    assignee: "",
    description: "",
    url: "",
    priority: "low" as TaskPriority,
  });
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (task && open) {
      setForm({
        title: task.title,
        due_date: toDateInputValue(task.due_date),
        assignee: task.assignee ?? "",
        description: task.description ?? "",
        url: task.url ?? "",
        priority: task.priority ?? "low",
      });
      setCommentDraft("");
      setCommentsLoading(true);
      api.getTaskComments(task.id)
        .then(setComments)
        .catch(() => setComments([]))
        .finally(() => setCommentsLoading(false));
    }
  }, [task?.id, open, api]);

  useEffect(() => {
    if (open && comments.length > 0) {
      commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [comments, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!task) return;
    const title = form.title.trim();
    if (!title) return;
    setLoading(true);
    try {
      const updated = await api.updateTask(task.id, {
        title,
        due_date: form.due_date || null,
        assignee: form.assignee || null,
        description: form.description || null,
        url: form.url || null,
        priority: form.priority,
      });
      onSave({ ...updated, comment_count: task.comment_count ?? comments.length });
      onClose();
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

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-neutral-900 border-neutral-700 text-neutral-100 max-w-5xl w-[95vw] p-0 gap-0 overflow-hidden">
        <div className="flex flex-col md:flex-row h-[min(85vh,760px)] min-h-[520px]">
          <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden">
            <DialogHeader className="px-8 pt-8 pb-5 border-b border-neutral-800 shrink-0">
              <DialogTitle className="text-neutral-100 pr-8">Edit task</DialogTitle>
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
                    className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                    <Select
                      value={form.assignee || "none"}
                      onValueChange={(v) => setForm((f) => ({ ...f, assignee: v === "none" ? "" : (v ?? "") }))}
                    >
                      <SelectTrigger className="bg-neutral-800 border-neutral-700 text-neutral-100 w-full">
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
                <div className="space-y-2">
                  <Label className="text-neutral-400 text-xs">Notes</Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Add notes or details..."
                    rows={5}
                    className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600 resize-none"
                  />
                </div>
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
                  disabled={loading || !form.title.trim()}
                  className="bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950"
                >
                  {loading ? "Saving..." : "Save"}
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
              {commentsLoading ? (
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
                    <p className="text-sm text-neutral-300 whitespace-pre-wrap break-words">{comment.body}</p>
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
                placeholder="Write a comment..."
                rows={3}
                className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600 resize-none text-sm"
                onKeyDown={(e) => {
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
                  disabled={postingComment || !commentDraft.trim()}
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
