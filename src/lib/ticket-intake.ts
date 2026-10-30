/**
 * Branching intake for AI-mode projects. Shared by the client form and the
 * server, so labels, required fields and the stored shape stay in step.
 */

export type IntakeKind = "bug" | "feature";

export interface IntakeField {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
}

export const INTAKE_FIELDS: Record<IntakeKind, IntakeField[]> = {
  bug: [
    { key: "what_you_see", label: "What goes wrong?", placeholder: "What do you see happening?", required: true, multiline: true },
    { key: "url", label: "Page link", placeholder: "https://..." },
    { key: "expected", label: "What did you expect instead?", multiline: true },
    { key: "since_when", label: "Since when?", placeholder: "e.g. since yesterday, after the last update" },
  ],
  feature: [
    { key: "goal", label: "What do you want and why?", placeholder: "The goal behind the request", required: true, multiline: true },
    { key: "where", label: "Where on the site?", placeholder: "Page or section" },
    { key: "example", label: "Example", placeholder: "A link or description of something similar" },
    { key: "must_have", label: "Must have", multiline: true },
    { key: "nice_to_have", label: "Doesn't need", placeholder: "What can be left out", multiline: true },
    { key: "deadline", label: "Deadline", placeholder: "If there is one" },
  ],
};

export const INTAKE_KIND_LABELS: Record<IntakeKind, { title: string; hint: string }> = {
  bug: { title: "Something is broken", hint: "An error, or something that stopped working" },
  feature: { title: "Something new or different", hint: "A change, addition or new feature" },
};

const MAX_FIELD_LENGTH = 4000;

/** Keeps known keys only, trims and caps values. Returns the first missing required label, if any. */
export function cleanIntake(kind: IntakeKind, raw: unknown): { intake: Record<string, string>; missing?: string } {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const intake: Record<string, string> = {};
  let missing: string | undefined;
  for (const field of INTAKE_FIELDS[kind]) {
    const value = typeof source[field.key] === "string" ? (source[field.key] as string).trim().slice(0, MAX_FIELD_LENGTH) : "";
    if (value) intake[field.key] = value;
    else if (field.required && !missing) missing = field.label;
  }
  return { intake, missing };
}

/** Readable description so boards that don't know about intake still show the details. */
export function intakeDescription(kind: IntakeKind, intake: Record<string, string>) {
  return INTAKE_FIELDS[kind]
    .filter((field) => intake[field.key])
    .map((field) => `${field.label}\n${intake[field.key]}`)
    .join("\n\n");
}
