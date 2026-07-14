"use client";

import { MessageSquare } from "lucide-react";

export function TaskCommentIndicator({ count }: { count?: number }) {
  if (!count || count <= 0) {
    return <span aria-hidden className="block" />;
  }

  return (
    <div
      className="flex items-center justify-center text-neutral-500"
      title={`${count} comment${count === 1 ? "" : "s"}`}
    >
      <MessageSquare className="w-3.5 h-3.5 shrink-0" />
    </div>
  );
}
