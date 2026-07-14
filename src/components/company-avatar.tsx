"use client";

import { useRef, useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZE = {
  sm: { box: "w-5 h-5", icon: "w-2.5 h-2.5", text: "text-[9px]" },
  md: { box: "w-8 h-8", icon: "w-4 h-4", text: "text-xs" },
  lg: { box: "w-10 h-10", icon: "w-5 h-5", text: "text-sm" },
} as const;

type Size = keyof typeof SIZE;

type CompanyAvatarProps = {
  id?: string;
  name: string;
  logoUrl?: string | null;
  size?: Size;
  uploadable?: boolean;
  onLogoChange?: (logoUrl: string) => void;
  className?: string;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function CompanyAvatar({
  id,
  name,
  logoUrl,
  size = "md",
  uploadable = false,
  onLogoChange,
  className,
}: CompanyAvatarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = SIZE[size];

  async function handleFile(file: File) {
    if (!id || !uploadable) return;

    setError(null);

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Image must be under 2MB");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/companies/${id}/logo`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed");
        return;
      }
      onLogoChange?.(data.logo_url);
    } catch {
      setError("Upload failed — try again");
    } finally {
      setUploading(false);
    }
  }

  const content = uploading ? (
    <Loader2 className={cn(s.icon, "text-neutral-500 animate-spin")} />
  ) : logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logoUrl} alt={name} className="w-full h-full object-cover" />
  ) : name ? (
    <span className={cn("font-medium text-neutral-500", s.text)}>
      {initials(name)}
    </span>
  ) : (
    <Building2 className={cn(s.icon, "text-neutral-500")} />
  );

  const box = (
    <div
      className={cn(
        s.box,
        "rounded bg-neutral-800 flex items-center justify-center shrink-0 overflow-hidden",
        uploadable && !uploading && "cursor-pointer hover:ring-2 hover:ring-neutral-600 transition-shadow",
        error && "ring-2 ring-red-500/60",
        className,
      )}
    >
      {content}
    </div>
  );

  if (!uploadable || !id) return box;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        title={error || "Click to upload logo"}
        className="shrink-0"
      >
        {box}
      </button>
      {error && (
        <p className="absolute top-full left-0 mt-1 text-[10px] text-red-400 whitespace-nowrap z-10">
          {error}
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
