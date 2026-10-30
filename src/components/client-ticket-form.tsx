"use client";

import { useState } from "react";
import { ArrowLeft, Bug, Check, ImagePlus, Send, Sparkles } from "lucide-react";
import { submitClientTicket } from "@/lib/api";
import { INTAKE_FIELDS, INTAKE_KIND_LABELS, type IntakeKind } from "@/lib/ticket-intake";

const inputClass =
  "w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-neutral-600";

/** Branching request form for AI-mode projects: pick a kind, then that kind's fields. */
export function ClientTicketForm({ token, onSubmitted }: { token: string; onSubmitted?: () => void }) {
  const [kind, setKind] = useState<IntakeKind | null>(null);
  const [title, setTitle] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setKind(null);
    setTitle("");
    setValues({});
    setScreenshot(null);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!kind) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitClientTicket(token, { ticket_type: kind, title: title.trim(), intake: values }, screenshot);
      setSubmitted(true);
      reset();
      onSubmitted?.();
      setTimeout(() => setSubmitted(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex items-center gap-2 text-stone-300 p-4">
        <Check className="w-4 h-4" />
        <span className="text-sm">Request submitted — we&apos;ll review it shortly!</span>
      </div>
    );
  }

  if (!kind) {
    return (
      <div className="p-4 grid gap-3 sm:grid-cols-2">
        {(["bug", "feature"] as const).map((k) => {
          const Icon = k === "bug" ? Bug : Sparkles;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className="text-left border border-neutral-700 hover:border-[#d4e052]/60 rounded-lg p-4 transition-colors"
            >
              <Icon className="w-4 h-4 text-[#d4e052] mb-2" />
              <p className="text-sm font-medium text-neutral-200">{INTAKE_KIND_LABELS[k].title}</p>
              <p className="text-xs text-neutral-500 mt-1">{INTAKE_KIND_LABELS[k].hint}</p>
            </button>
          );
        })}
      </div>
    );
  }

  const fields = INTAKE_FIELDS[kind];
  const missingRequired = !title.trim() || fields.some((f) => f.required && !values[f.key]?.trim());

  return (
    <form onSubmit={handleSubmit} className="p-4 space-y-3">
      <button
        type="button"
        onClick={reset}
        className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {INTAKE_KIND_LABELS[kind].title}
      </button>

      <label className="block space-y-1">
        <span className="text-xs text-neutral-400">Short title *</span>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder={kind === "bug" ? "e.g. Contact form doesn't send" : "e.g. Add a FAQ to the product page"}
          className={inputClass}
        />
      </label>

      {fields.map((field) => (
        <label key={field.key} className="block space-y-1">
          <span className="text-xs text-neutral-400">
            {field.label}
            {field.required ? " *" : ""}
          </span>
          {field.multiline ? (
            <textarea
              required={field.required}
              value={values[field.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
              placeholder={field.placeholder}
              rows={2}
              className={`${inputClass} resize-none`}
            />
          ) : (
            <input
              required={field.required}
              value={values[field.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
              placeholder={field.placeholder}
              className={inputClass}
            />
          )}
        </label>
      ))}

      {kind === "bug" && (
        <label className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer w-fit">
          <ImagePlus className="w-4 h-4" />
          <span>{screenshot ? screenshot.name : "Add a screenshot (optional)"}</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setScreenshot(e.target.files?.[0] ?? null)}
          />
        </label>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting || missingRequired}
        className="flex items-center gap-2 text-sm bg-[#d4e052] hover:bg-[#c2ce45] text-neutral-950 font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
      >
        <Send className="w-3.5 h-3.5" />
        {submitting ? "Sending..." : "Submit request"}
      </button>
    </form>
  );
}
