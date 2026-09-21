"use client";

import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function TaskEnteredDate({
  createdAt,
  className,
}: {
  createdAt?: string | null;
  className?: string;
}) {
  if (!createdAt) {
    return <span className={cn("text-xs text-neutral-700", className)}>—</span>;
  }

  return (
    <time
      dateTime={createdAt}
      title={formatDateTime(createdAt)}
      className={cn("text-xs text-neutral-500 font-mono tabular-nums", className)}
    >
      {formatDate(createdAt)}
    </time>
  );
}
