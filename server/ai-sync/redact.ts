/**
 * What `ai-sync` removes before anything leaves the laptop: every value under a key that names
 * a secret, and every string that looks like a credential, wherever it appears. Redacted values
 * show as `‹redacted›` and are never written back to a file.
 */

export const REDACTED = "‹redacted›";

/** Keys whose values are secrets, or hold them (`env` blocks). */
const SECRET_KEY = /token|key|secret|password|passwd|authorization|credential|cookie|^env$/i;

/** Strings that look like a credential on their own. */
const CREDENTIAL = [
  /\b(sk|pk|rk)-[A-Za-z0-9_-]{16,}/g, // OpenAI, Anthropic (sk-ant-…) and similar
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bcave_[A-Za-z0-9_-]{16,}/g, // Cave agent tokens
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, // Slack
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key ids
  /\b\d{8,10}:[A-Za-z0-9_-]{30,}/g, // Telegram bot tokens
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWTs
  /\b[a-f0-9]{32,}\b/gi, // long hex
  /(?<![A-Za-z0-9/+_-])[A-Za-z0-9+/_-]{40,}={0,2}(?![A-Za-z0-9/+_-])/g, // long base64
];

/** Paths and URLs are long but not secret; they keep their shape unless a pattern above hits. */
const looksLikePath = (s: string) => /[\\/]/.test(s) && /\.[a-z0-9]{1,6}$|[\\/]$/i.test(s);

export function redactText(text: string): string {
  let out = text;
  for (const re of CREDENTIAL)
    out = out.replace(re, (match) => (looksLikePath(match) ? match : REDACTED));
  return out;
}

/** A parsed JSON value with every secret-named key's value and every credential string replaced. */
export function redactValue(value: unknown, key = ""): unknown {
  if (key && SECRET_KEY.test(key)) {
    if (value === null || value === undefined || value === "") return value;
    if (typeof value === "object")
      return Array.isArray(value)
        ? value.map(() => REDACTED)
        : Object.fromEntries(Object.keys(value).map((k) => [k, REDACTED]));
    return REDACTED;
  }
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map((v) => redactValue(v));
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactValue(v, k)]));
  return value;
}

/** A file's text, redacted by its kind: JSON structurally, everything else line by line. */
export function redactFile(path: string, text: string): string {
  if (/\.json$/i.test(path)) {
    try {
      return `${JSON.stringify(redactValue(JSON.parse(text)), null, 2)}\n`;
    } catch {
      return redactText(text);
    }
  }
  return redactText(text);
}

export const hasRedaction = (text: string) => text.includes(REDACTED);
