/**
 * Masks credentials that clients sometimes paste into tickets ("WW: ...", API keys)
 * before ticket text leaves revops for the agent runtime or Grok Bots.
 * Best-effort: it catches labelled passwords and well-known key formats, not every secret.
 */

const LABELLED = /\b(ww|wachtwoord|wachtw|password|passwd|pass|pwd|pw|pincode|pin|api[ _-]?key|secret|token)(\s*[:=]\s*)(\S+)/gi;

const KEY_FORMATS = [
  /\bsk-[A-Za-z0-9_-]{16,}/g, // OpenAI / Anthropic style
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\brvk_[0-9a-f]{8}_[\w-]+/g, // revops agent keys
  /\bxox[abpr]-[\w-]+/g, // Slack
  /\bshp(at|ss|ca|pa)_[0-9a-fA-F]{20,}/g, // Shopify
];

export function redactSecrets(text: string): string;
export function redactSecrets(text: string | null | undefined): string | null | undefined;
export function redactSecrets(text: string | null | undefined) {
  if (!text) return text;
  let out = text.replace(LABELLED, (_m, label: string, sep: string) => `${label}${sep}[redacted]`);
  for (const pattern of KEY_FORMATS) out = out.replace(pattern, "[redacted]");
  return out;
}

export function redactRecord(record: Record<string, string> | null | undefined) {
  if (!record) return record;
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, redactSecrets(v)]));
}
