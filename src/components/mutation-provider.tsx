"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

const UNDO_TTL_MS = 8000;

type UndoEntry = {
  id: number;
  label: string;
  revert: () => void | Promise<void>;
};

type RunUndoableOpts<T> = {
  label: string;
  apply: () => Promise<T>;
  revert: () => void | Promise<void>;
  optimistic?: () => void;
  rollbackOptimistic?: () => void;
};

type MutationContextValue = {
  pendingCount: number;
  begin: () => void;
  end: () => void;
  pushUndo: (opts: { label: string; revert: () => void | Promise<void> }) => void;
  undo: () => Promise<void>;
  clearUndo: () => void;
  toast: UndoEntry | null;
  runUndoableMutation: <T>(opts: RunUndoableOpts<T>) => Promise<T>;
};

const MutationContext = createContext<MutationContextValue | null>(null);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("[contenteditable='true']"));
}

export function useMutationFeedback() {
  const ctx = useContext(MutationContext);
  if (!ctx) {
    throw new Error("useMutationFeedback must be used within MutationProvider");
  }
  return ctx;
}

export function useMutationFeedbackOptional() {
  return useContext(MutationContext);
}

export function MutationProvider({ children }: { children: ReactNode }) {
  const [pendingCount, setPendingCount] = useState(0);
  const [toast, setToast] = useState<UndoEntry | null>(null);
  const toastRef = useRef<UndoEntry | null>(null);
  const ttlRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(0);
  const undoingRef = useRef(false);

  const clearUndo = useCallback(() => {
    if (ttlRef.current) {
      clearTimeout(ttlRef.current);
      ttlRef.current = null;
    }
    toastRef.current = null;
    setToast(null);
  }, []);

  const begin = useCallback(() => {
    setPendingCount((n) => n + 1);
  }, []);

  const end = useCallback(() => {
    setPendingCount((n) => Math.max(0, n - 1));
  }, []);

  const pushUndo = useCallback(
    (opts: { label: string; revert: () => void | Promise<void> }) => {
      if (ttlRef.current) clearTimeout(ttlRef.current);
      const entry: UndoEntry = {
        id: ++idRef.current,
        label: opts.label,
        revert: opts.revert,
      };
      toastRef.current = entry;
      setToast(entry);
      ttlRef.current = setTimeout(() => {
        if (toastRef.current?.id === entry.id) {
          toastRef.current = null;
          setToast(null);
        }
        ttlRef.current = null;
      }, UNDO_TTL_MS);
    },
    [],
  );

  const undo = useCallback(async () => {
    const entry = toastRef.current;
    if (!entry || undoingRef.current) return;
    undoingRef.current = true;
    clearUndo();
    begin();
    try {
      await entry.revert();
    } finally {
      end();
      undoingRef.current = false;
    }
  }, [begin, clearUndo, end]);

  const runUndoableMutation = useCallback(
    async <T,>(opts: RunUndoableOpts<T>): Promise<T> => {
      opts.optimistic?.();
      begin();
      try {
        const result = await opts.apply();
        pushUndo({
          label: opts.label,
          revert: opts.revert,
        });
        return result;
      } catch (err) {
        opts.rollbackOptimistic?.();
        clearUndo();
        throw err;
      } finally {
        end();
      }
    },
    [begin, clearUndo, end, pushUndo],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z" || e.shiftKey) {
        return;
      }
      if (isEditableTarget(e.target)) return;
      if (!toastRef.current) return;
      e.preventDefault();
      void undo();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo]);

  useEffect(() => {
    return () => {
      if (ttlRef.current) clearTimeout(ttlRef.current);
    };
  }, []);

  const value = useMemo(
    () => ({
      pendingCount,
      begin,
      end,
      pushUndo,
      undo,
      clearUndo,
      toast,
      runUndoableMutation,
    }),
    [pendingCount, begin, end, pushUndo, undo, clearUndo, toast, runUndoableMutation],
  );

  return (
    <MutationContext.Provider value={value}>
      <MutationProgressBar active={pendingCount > 0} />
      {children}
      <UndoToast toast={toast} onUndo={() => void undo()} />
    </MutationContext.Provider>
  );
}

function MutationProgressBar({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      className="fixed top-0 left-0 right-0 z-[200] h-0.5 pointer-events-none overflow-hidden bg-transparent"
      aria-hidden
    >
      <div className="mutation-progress-bar h-full w-1/3 rounded-full bg-[var(--bb-accent)]" />
    </div>
  );
}

function UndoToast({
  toast,
  onUndo,
}: {
  toast: UndoEntry | null;
  onUndo: () => void;
}) {
  const [modLabel, setModLabel] = useState("⌘");

  useEffect(() => {
    const mac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
    setModLabel(mac ? "⌘" : "Ctrl+");
  }, []);

  return (
    <div
      className={cn(
        "fixed bottom-5 left-5 z-[200] transition-all duration-200",
        toast
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-2 pointer-events-none",
      )}
      aria-live="polite"
    >
      {toast && (
        <div className="flex items-center gap-3 rounded-xl border border-black/10 bg-white px-3.5 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
          <span className="text-sm font-medium text-[#1a1a1a] whitespace-nowrap">
            {toast.label}
          </span>
          <button
            type="button"
            onClick={onUndo}
            className="inline-flex items-center rounded-lg border border-[#d4d4d4] bg-white px-2.5 py-1 text-sm font-medium text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors"
          >
            Undo {modLabel}Z
          </button>
        </div>
      )}
    </div>
  );
}
