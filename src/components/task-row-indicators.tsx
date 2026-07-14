"use client";

import { Task } from "@/lib/types";
import { TaskAttachmentIndicator } from "@/components/task-attachment-indicator";
import { TaskCommentIndicator } from "@/components/task-comment-indicator";

export function TaskRowIndicators({ task }: { task: Task }) {
  return (
    <div className="flex items-center justify-center gap-1">
      <TaskCommentIndicator count={task.comment_count} />
      <TaskAttachmentIndicator hasAttachments={task.has_attachments} />
    </div>
  );
}
