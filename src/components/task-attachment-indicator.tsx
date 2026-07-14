"use client";

import { Paperclip } from "lucide-react";

export function TaskAttachmentIndicator({ hasAttachments }: { hasAttachments?: boolean }) {
  if (!hasAttachments) {
    return <span aria-hidden className="block" />;
  }

  return (
    <div
      className="flex items-center justify-center text-neutral-500"
      title="Has attachments"
    >
      <Paperclip className="w-3.5 h-3.5 shrink-0" />
    </div>
  );
}
