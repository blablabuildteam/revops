"use client";

import { UserAvatar } from "@/components/user-avatar";
import { SelectItem } from "@/components/ui/select";
import { useUsers } from "@/hooks/use-api-data";
import { TASK_ASSIGNEES } from "@/lib/types";
import { cn } from "@/lib/utils";

export type AssigneeUser = {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
};

export function useAssigneeUsers() {
  const { data: users = [] } = useUsers();
  return users;
}

export function avatarForName(users: AssigneeUser[], name: string) {
  return users.find((u) => u.name === name)?.avatar_url ?? null;
}

export function AssigneeLabel({
  name,
  users,
  placeholder = "—",
  className,
}: {
  name?: string | null;
  users: AssigneeUser[];
  placeholder?: string;
  className?: string;
}) {
  if (!name) {
    return <span className={cn("text-neutral-400 truncate", className)}>{placeholder}</span>;
  }

  return (
    <span className={cn("flex items-center gap-1.5 min-w-0", className)}>
      <UserAvatar name={name} avatarUrl={avatarForName(users, name)} size="sm" />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function AssigneeSelectItems({
  users,
  noneLabel = "—",
  itemClassName,
}: {
  users: AssigneeUser[];
  noneLabel?: string;
  itemClassName?: string;
}) {
  return (
    <>
      <SelectItem value="none" className={cn("text-neutral-500 text-xs", itemClassName)}>
        {noneLabel}
      </SelectItem>
      {TASK_ASSIGNEES.map((name) => (
        <SelectItem key={name} value={name} className={cn("text-neutral-100 text-xs", itemClassName)}>
          <AssigneeLabel name={name} users={users} />
        </SelectItem>
      ))}
    </>
  );
}
