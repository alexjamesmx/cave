import { readFileSync } from "node:fs";

/** One `cave-offsite` run, as `deploy/cave-offsite` writes it into `status.json`. */
export interface OffsiteRun {
  at: string;
  ok: boolean;
  /** restic's short snapshot id; empty when the run failed before one existed. */
  snapshot: string;
  docs: number | null;
  /** The daily backup file it backed up or restored. */
  file: string;
  /** A fixed phrase from the script; empty when ok. */
  error: string;
  /** Backup runs only: the last successful backup, kept across failed runs. */
  lastOkAt?: string;
}

export interface OffsiteStatus {
  backup: OffsiteRun | null;
  check: OffsiteRun | null;
}

const SNAPSHOT = /^[0-9a-f]{0,64}$/;
const FILE = /^(cave-[0-9T-]+\.db)?$/;
// The script's own phrases: letters, digits, spaces and a little punctuation, never a path.
const ERROR = /^[A-Za-z0-9 ,.'-]{0,120}$/;
const isTime = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));

function parseRun(value: unknown): OffsiteRun | null {
  if (typeof value !== "object" || value === null) return null;
  const { at, ok, snapshot, docs, file, error, lastOkAt } = value as Record<string, unknown>;
  if (!isTime(at) || typeof ok !== "boolean") return null;
  if (typeof snapshot !== "string" || !SNAPSHOT.test(snapshot)) return null;
  if (docs !== null && (typeof docs !== "number" || !Number.isInteger(docs) || docs < 0))
    return null;
  if (typeof file !== "string" || !FILE.test(file)) return null;
  if (typeof error !== "string" || !ERROR.test(error)) return null;
  if (lastOkAt !== undefined && !isTime(lastOkAt)) return null;
  return {
    at,
    ok,
    snapshot,
    docs,
    file,
    error,
    ...(lastOkAt === undefined ? {} : { lastOkAt }),
  };
}

/**
 * `status.json` from `cave-offsite`. `null` means not set up: no path, or no file yet. A file
 * that is there but can't be read or parsed counts as set up with nothing known, so it alerts.
 */
export function readOffsiteStatus(path: string | undefined): OffsiteStatus | null {
  if (!path) return null;
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    return { backup: null, check: null };
  }
  try {
    const value = JSON.parse(text) as { backup?: unknown; check?: unknown } | null;
    return { backup: parseRun(value?.backup), check: parseRun(value?.check) };
  } catch {
    return { backup: null, check: null };
  }
}

/** The newest off-box backup older than this raises one notification. */
export const STALE_MS = 48 * 60 * 60 * 1000;

/** When the last backup run that succeeded finished, if any did. */
export const lastOkAt = (s: OffsiteStatus): string | undefined =>
  s.backup?.ok ? s.backup.at : s.backup?.lastOkAt;

/**
 * What to tell the owner about the off-box copies, titles only. The key names the episode, so
 * a stale copy or a failed check is told once, not every hour; not set up tells nothing.
 */
export function offsiteAlert(
  s: OffsiteStatus | null,
  now: number,
): { key: string; title: string } | undefined {
  if (!s) return undefined;
  if (s.check && !s.check.ok)
    return { key: `offsite:check:${s.check.at}`, title: "Off-box backup check failed" };
  const last = lastOkAt(s);
  if (last === undefined || now - Date.parse(last) > STALE_MS)
    return {
      key: `offsite:stale:${last ?? "never"}`,
      title: "Off-box backup is more than 48 hours old",
    };
  return undefined;
}
