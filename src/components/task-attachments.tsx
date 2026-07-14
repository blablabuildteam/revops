"use client";

import { useRef, useState } from "react";
import { Download, File, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TaskAttachment } from "@/lib/types";
import { cn } from "@/lib/utils";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type TaskAttachmentsApi = {
  getTaskAttachments: (taskId: string) => Promise<TaskAttachment[]>;
  uploadTaskAttachment: (taskId: string, file: File) => Promise<TaskAttachment>;
  deleteTaskAttachment: (taskId: string, attachmentId: string) => Promise<void>;
};

export function TaskAttachments({
  taskId,
  attachments,
  loading,
  onChange,
  api,
}: {
  taskId: string;
  attachments: TaskAttachment[];
  loading: boolean;
  onChange: (attachments: TaskAttachment[]) => void;
  api: TaskAttachmentsApi;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | File[]) {
    const file = Array.from(files)[0];
    if (!file) return;

    setError(null);
    if (file.size > MAX_FILE_SIZE) {
      setError("File must be under 10MB");
      return;
    }

    setUploading(true);
    try {
      const attachment = await api.uploadTaskAttachment(taskId, file);
      onChange([...attachments, attachment]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(attachmentId: string) {
    setError(null);
    setDeletingId(attachmentId);
    try {
      await api.deleteTaskAttachment(taskId, attachmentId);
      onChange(attachments.filter((a) => a.id !== attachmentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-2">
      <Label className="text-neutral-400 text-xs">Attachments</Label>

      <div
        role="button"
        tabIndex={0}
        onClick={() => !uploading && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!uploading) inputRef.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(false);
          if (!uploading && e.dataTransfer.files.length > 0) {
            void handleFiles(e.dataTransfer.files);
          }
        }}
        className={cn(
          "relative flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 transition-colors cursor-pointer",
          dragging
            ? "border-[#e8ff47] bg-[#e8ff47]/5"
            : "border-neutral-700 bg-neutral-800/40 hover:border-neutral-600 hover:bg-neutral-800/70",
          uploading && "pointer-events-none opacity-60",
        )}
      >
        {uploading ? (
          <Loader2 className="w-5 h-5 text-neutral-500 animate-spin" />
        ) : (
          <Upload className="w-5 h-5 text-neutral-500" />
        )}
        <div className="text-center">
          <p className="text-sm text-neutral-300">
            {uploading ? "Uploading..." : "Click or drag a file here"}
          </p>
          <p className="text-xs text-neutral-600 mt-1">Max 10MB</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFiles([file]);
            e.target.value = "";
          }}
        />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {loading ? (
        <p className="text-xs text-neutral-600">Loading attachments...</p>
      ) : attachments.length > 0 ? (
        <ul className="space-y-2">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2"
            >
              <File className="w-4 h-4 text-neutral-500 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-neutral-200 truncate">{attachment.file_name}</p>
                <p className="text-[10px] text-neutral-600">
                  {formatFileSize(attachment.file_size)} · {attachment.uploaded_by_name}
                </p>
              </div>
              <a
                href={attachment.file_url}
                download={attachment.file_name}
                target="_blank"
                rel="noopener noreferrer"
                title="Download attachment"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:text-[#e8ff47] hover:bg-neutral-800 shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
              </a>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={deletingId === attachment.id}
                onClick={() => void handleDelete(attachment.id)}
                className="h-8 w-8 text-neutral-500 hover:text-red-400 shrink-0"
                title="Remove attachment"
              >
                {deletingId === attachment.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-neutral-600 flex items-center gap-1.5">
          <Paperclip className="w-3 h-3" />
          No attachments yet
        </p>
      )}
    </div>
  );
}
