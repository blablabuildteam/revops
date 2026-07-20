"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { Plus } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUsers } from "@/hooks/use-api-data";
import { TASK_ASSIGNEES } from "@/lib/types";
import { cn } from "@/lib/utils";

const ADD_USER_VALUE = "__bb_add_user__";
const CUSTOM_ASSIGNEES_KEY = "bb-custom-assignees";

export type AssigneeUser = {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
};

const ExtraAssigneeNamesContext = createContext<string[]>([]);

export function AssigneeNamesProvider({
  names,
  children,
}: {
  names: string[];
  children: ReactNode;
}) {
  const value = useMemo(
    () => [...new Set(names.map((n) => n.trim()).filter(Boolean))],
    [names],
  );
  return (
    <ExtraAssigneeNamesContext.Provider value={value}>
      {children}
    </ExtraAssigneeNamesContext.Provider>
  );
}

export function useExtraAssigneeNames() {
  return useContext(ExtraAssigneeNamesContext);
}

export function collectAssigneeNames(
  tasks: Array<{ assignee?: string | null }>,
): string[] {
  return [
    ...new Set(
      tasks
        .map((t) => t.assignee?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  ];
}

function readCustomAssignees(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_ASSIGNEES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((name): name is string => typeof name === "string")
      .map((name) => name.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function writeCustomAssignees(names: string[]) {
  window.localStorage.setItem(CUSTOM_ASSIGNEES_KEY, JSON.stringify(names));
  window.dispatchEvent(new Event("bb-custom-assignees"));
}

export function useCustomAssignees() {
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    setNames(readCustomAssignees());
    const sync = () => setNames(readCustomAssignees());
    window.addEventListener("bb-custom-assignees", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("bb-custom-assignees", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const add = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return "";
    const existing = readCustomAssignees();
    const match = existing.find(
      (n) => n.toLowerCase() === trimmed.toLowerCase(),
    );
    if (match) return match;
    writeCustomAssignees([...existing, trimmed]);
    return trimmed;
  }, []);

  return { names, add };
}

export function buildAssigneeNames({
  users,
  custom = [],
  extra = [],
}: {
  users: AssigneeUser[];
  custom?: string[];
  extra?: string[];
}): string[] {
  const names = new Set<string>();

  for (const user of users) {
    if (user.name?.trim()) names.add(user.name.trim());
  }

  // External boards can't load /api/users — keep workspace defaults available.
  if (users.length === 0) {
    for (const name of TASK_ASSIGNEES) names.add(name);
  }

  for (const name of custom) {
    if (name.trim()) names.add(name.trim());
  }
  for (const name of extra) {
    if (name.trim()) names.add(name.trim());
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

export function useAssigneeUsers() {
  const { data: users = [] } = useUsers();
  return users;
}

export function useAssigneeOptions(extraNames: string[] = []) {
  const users = useAssigneeUsers();
  const { names: custom, add } = useCustomAssignees();
  const boardNames = useExtraAssigneeNames();
  const names = useMemo(
    () =>
      buildAssigneeNames({
        users,
        custom,
        extra: [...boardNames, ...extraNames],
      }),
    [users, custom, boardNames, extraNames],
  );
  return { users, names, addCustom: add };
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
  names,
  noneLabel = "—",
  itemClassName,
  showAddUser = true,
}: {
  users: AssigneeUser[];
  names?: string[];
  noneLabel?: string;
  itemClassName?: string;
  showAddUser?: boolean;
}) {
  const options =
    names ??
    buildAssigneeNames({
      users,
      extra: users.length === 0 ? [...TASK_ASSIGNEES] : [],
    });

  return (
    <>
      <SelectItem value="none" className={cn("text-neutral-500 text-xs", itemClassName)}>
        {noneLabel}
      </SelectItem>
      {options.map((name) => (
        <SelectItem key={name} value={name} className={cn("text-neutral-100 text-xs", itemClassName)}>
          <AssigneeLabel name={name} users={users} />
        </SelectItem>
      ))}
      {showAddUser && (
        <SelectItem
          value={ADD_USER_VALUE}
          className={cn("text-[#e8ff47] text-xs", itemClassName)}
        >
          <span className="flex items-center gap-1.5">
            <Plus className="size-3.5" />
            Add User
          </span>
        </SelectItem>
      )}
    </>
  );
}

function AddUserDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (name: string) => void;
}) {
  const [name, setName] = useState("");

  useEffect(() => {
    if (open) setName("");
  }, [open]);

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-neutral-900 border-neutral-700 max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-neutral-100">Add User</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-3"
        >
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="bg-neutral-800 border-neutral-700 text-neutral-100"
          />
          <DialogFooter className="bg-transparent border-0 p-0 -mx-0 -mb-0 sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-neutral-400"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim()}
              className="bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 font-medium"
            >
              Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AssigneeSelect({
  value,
  onValueChange,
  noneLabel = "—",
  placeholder,
  extraNames,
  triggerClassName,
  contentClassName,
  itemClassName,
  size = "default",
  triggerProps,
}: {
  value?: string | null;
  onValueChange: (value: string | null) => void;
  noneLabel?: string;
  placeholder?: string;
  extraNames?: string[];
  triggerClassName?: string;
  contentClassName?: string;
  itemClassName?: string;
  size?: "sm" | "default";
  triggerProps?: ComponentProps<typeof SelectTrigger>;
}) {
  const { users, names, addCustom } = useAssigneeOptions(extraNames);
  const [addOpen, setAddOpen] = useState(false);

  const options = useMemo(() => {
    if (!value?.trim()) return names;
    if (names.some((n) => n === value)) return names;
    return buildAssigneeNames({
      users,
      custom: names,
      extra: [value],
    });
  }, [names, users, value]);

  return (
    <>
      <Select
        value={value || "none"}
        onValueChange={(v) => {
          if (v === ADD_USER_VALUE) {
            setAddOpen(true);
            return;
          }
          onValueChange(!v || v === "none" ? null : v);
        }}
      >
        <SelectTrigger
          size={size}
          className={triggerClassName}
          {...triggerProps}
        >
          <SelectValue placeholder={placeholder ?? noneLabel}>
            <AssigneeLabel
              name={value}
              users={users}
              placeholder={placeholder ?? noneLabel}
            />
          </SelectValue>
        </SelectTrigger>
        <SelectContent className={cn("bg-neutral-800 border-neutral-700", contentClassName)}>
          <AssigneeSelectItems
            users={users}
            names={options}
            noneLabel={noneLabel}
            itemClassName={itemClassName}
          />
        </SelectContent>
      </Select>
      <AddUserDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdd={(name) => {
          const saved = addCustom(name);
          onValueChange(saved || name.trim());
        }}
      />
    </>
  );
}

/** For bulk actions / cases that only need items + add-user handling. */
export function useAssigneeSelectChange(
  onValueChange: (value: string | null) => void,
) {
  const { add } = useCustomAssignees();
  const [addOpen, setAddOpen] = useState(false);

  const handleValueChange = useCallback(
    (v: string | null) => {
      if (v === ADD_USER_VALUE) {
        setAddOpen(true);
        return;
      }
      onValueChange(!v || v === "none" ? null : v);
    },
    [onValueChange],
  );

  const addUserDialog = (
    <AddUserDialog
      open={addOpen}
      onOpenChange={setAddOpen}
      onAdd={(name) => {
        const saved = add(name);
        onValueChange(saved || name.trim());
      }}
    />
  );

  return { handleValueChange, addUserDialog, ADD_USER_VALUE };
}
