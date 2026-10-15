const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/;

// Offset of `timeZone` from UTC at instant `ms`, in ms, read back through Intl.
export function offsetAt(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(ms);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * Converts a local `YYYY-MM-DD[THH:mm[:ss]]` in `timeZone` to a UTC ISO string. The second
 * pass settles times near a DST change; a time skipped by DST resolves to the later offset.
 */
export function localToUtcIso(local: string, timeZone: string): string | undefined {
  const m = LOCAL_RE.exec(local);
  if (!m) return undefined;
  const [y, mo, d, h, mi, s] = m.slice(1).map((part) => Number(part ?? 0)) as number[];
  const wall = Date.UTC(y as number, (mo as number) - 1, d, h, mi, s);
  let ms = wall - offsetAt(wall, timeZone);
  ms = wall - offsetAt(ms, timeZone);
  return new Date(ms).toISOString();
}
