"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  GripVertical,
  Trash2,
  X,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Milestone,
  resolvePhaseColor,
  CUSTOM_PHASE_DEFAULT_COLOR,
} from "@/lib/types";
import { batchUpdateMilestones } from "@/lib/api";

interface StatusEntry {
  _key: string;
  id?: string;
  name: string;
  color: string;
}

let keyCounter = 0;
function nextKey() {
  return `new-${++keyCounter}`;
}

function toEntries(milestones: Milestone[]): StatusEntry[] {
  return [...milestones]
    .sort((a, b) => a.position - b.position)
    .map((m) => ({
      _key: m.id,
      id: m.id,
      name: m.name,
      color: resolvePhaseColor(m.name, m.color),
    }));
}

function SortableStatusRow({
  entry,
  onNameChange,
  onColorChange,
  onRemove,
  canRemove,
}: {
  entry: StatusEntry;
  onNameChange: (key: string, name: string) => void;
  onColorChange: (key: string, color: string) => void;
  onRemove: (key: string) => void;
  canRemove: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry._key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors ${
        isDragging
          ? "border-[#e8ff47]/30 bg-neutral-800/80"
          : "border-neutral-700/60 bg-neutral-800/40 hover:border-neutral-600"
      }`}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing touch-none text-neutral-600 hover:text-neutral-400 p-0.5"
        {...listeners}
        {...attributes}
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <label
        className="relative h-7 w-7 shrink-0 cursor-pointer rounded-md border border-neutral-700 transition-colors hover:border-neutral-500 flex items-center justify-center"
      >
        <span
          className="h-3.5 w-3.5 rounded-full border border-neutral-600/50"
          style={{ backgroundColor: entry.color }}
        />
        <input
          type="color"
          value={entry.color}
          onChange={(e) => onColorChange(entry._key, e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>

      <Input
        value={entry.name}
        onChange={(e) => onNameChange(entry._key, e.target.value)}
        placeholder="Status name..."
        className="h-7 flex-1 text-sm bg-transparent border-none shadow-none text-neutral-100 placeholder:text-neutral-600 focus-visible:ring-0 px-1"
      />

      {canRemove && (
        <button
          type="button"
          onClick={() => onRemove(entry._key)}
          className="text-neutral-700 hover:text-red-400 transition-colors p-1 rounded hover:bg-neutral-800"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

export function EditStatusesDialog({
  open,
  onOpenChange,
  projectId,
  milestones,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  milestones: Milestone[];
  onSave: (updated: Milestone[]) => void;
}) {
  const [entries, setEntries] = useState<StatusEntry[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setEntries(toEntries(milestones));
    }
  }, [open, milestones]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setEntries((prev) => {
      const oldIndex = prev.findIndex((e) => e._key === active.id);
      const newIndex = prev.findIndex((e) => e._key === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  function handleNameChange(key: string, name: string) {
    setEntries((prev) =>
      prev.map((e) => (e._key === key ? { ...e, name } : e)),
    );
  }

  function handleColorChange(key: string, color: string) {
    setEntries((prev) =>
      prev.map((e) => (e._key === key ? { ...e, color } : e)),
    );
  }

  function handleRemove(key: string) {
    setEntries((prev) => prev.filter((e) => e._key !== key));
  }

  function handleAdd() {
    setEntries((prev) => [
      ...prev,
      {
        _key: nextKey(),
        name: "",
        color: CUSTOM_PHASE_DEFAULT_COLOR,
      },
    ]);
  }

  async function handleSave() {
    const valid = entries.filter((e) => e.name.trim());
    if (valid.length === 0) return;

    setSaving(true);
    try {
      const payload = valid.map((e, i) => ({
        id: e.id,
        name: e.name.trim(),
        color: e.color,
        position: i,
      }));
      const updated = await batchUpdateMilestones(projectId, payload);
      onSave(updated);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  const hasValidEntry = entries.some((e) => e.name.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-neutral-900 border-neutral-700 text-neutral-100 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-neutral-100 pr-6">
            Edit task statuses
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={entries.map((e) => e._key)}
              strategy={verticalListSortingStrategy}
            >
              {entries.map((entry) => (
                <SortableStatusRow
                  key={entry._key}
                  entry={entry}
                  onNameChange={handleNameChange}
                  onColorChange={handleColorChange}
                  onRemove={handleRemove}
                  canRemove={entries.length > 1}
                />
              ))}
            </SortableContext>
          </DndContext>

          {entries.length === 0 && (
            <p className="text-xs text-neutral-600 py-4 text-center">
              No statuses yet. Add one below.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-2 text-xs text-neutral-500 hover:text-neutral-300 transition-colors px-1 py-1.5 w-full"
        >
          <Plus className="w-3.5 h-3.5" /> Add status
        </button>

        <DialogFooter className="bg-transparent border-neutral-800 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="text-neutral-400 hover:text-neutral-200"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasValidEntry}
            className="bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950"
          >
            {saving ? "Saving..." : "Apply changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
