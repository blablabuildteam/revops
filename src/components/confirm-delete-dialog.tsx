"use client";

import { type ReactNode, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const dialogClass = "bg-neutral-900 border-neutral-700 text-neutral-100 max-w-md";
const footerClass = "bg-transparent border-neutral-800";

interface ConfirmDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  deleting?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  deleting: externalDeleting,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  const [internalDeleting, setInternalDeleting] = useState(false);
  const deleting = externalDeleting ?? internalDeleting;

  async function handleConfirm() {
    if (externalDeleting === undefined) setInternalDeleting(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      if (externalDeleting === undefined) setInternalDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogClass}>
        <DialogHeader>
          <DialogTitle className="text-neutral-100">{title}</DialogTitle>
          <DialogDescription className="text-neutral-500">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className={footerClass}>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
            className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={deleting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {deleting ? "Deleting..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface ConfirmDeleteOptions {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
}

export function useConfirmDelete() {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmDeleteOptions | null>(null);

  const requestDelete = useCallback((opts: ConfirmDeleteOptions) => {
    setOptions(opts);
    setOpen(true);
  }, []);

  const confirmDialog = (
    <ConfirmDeleteDialog
      open={open}
      onOpenChange={setOpen}
      title={options?.title ?? "Delete"}
      description={options?.description ?? "Are you sure you want to delete this?"}
      confirmLabel={options?.confirmLabel}
      onConfirm={options?.onConfirm ?? (() => {})}
    />
  );

  return { requestDelete, confirmDialog };
}
