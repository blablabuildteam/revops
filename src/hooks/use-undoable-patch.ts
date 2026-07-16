"use client";

import { useCallback } from "react";
import { useUndoToast } from "@/components/mutation-provider";

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if ((a == null || a === "") && (b == null || b === "")) return true;
  return false;
}

export function useUndoablePatch<T extends { id: string }>() {
  const withUndo = useUndoToast();

  return useCallback(
    async (opts: {
      item: T;
      patch: Partial<T>;
      apply: (id: string, patch: Partial<T>) => Promise<T>;
      onSuccess: (item: T) => void;
      label?: string;
    }) => {
      const { item, patch, apply, onSuccess, label = "Updated" } = opts;
      const changed = Object.keys(patch).some(
        (key) => !valuesEqual(patch[key as keyof T], item[key as keyof T]),
      );
      if (!changed) return;

      const previous = Object.fromEntries(
        Object.keys(patch).map((key) => [key, item[key as keyof T]]),
      ) as Partial<T>;

      await withUndo({
        label,
        run: async () => {
          onSuccess(await apply(item.id, patch));
        },
        undo: async () => {
          onSuccess(await apply(item.id, previous));
        },
      });
    },
    [withUndo],
  );
}
