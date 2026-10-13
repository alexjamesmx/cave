const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// ULID for new docs, `imp-<sha1>` for vault imports, short slugs for seeded and setting docs.
const DOC_ID_RE = /^(?:[0-9A-HJKMNP-TV-Z]{26}|imp-[0-9a-f]{40}|(?!imp-)[a-z0-9][a-z0-9_-]{0,63})$/;
// No `:` so a device id can sit at the end of a stamp.
const DEVICE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function newId(now: number = Date.now()): string {
  let time = "";
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const random = crypto.getRandomValues(new Uint8Array(16));
  let rest = "";
  for (const byte of random) rest += CROCKFORD[byte % 32];
  return time + rest;
}

export function isDocId(value: unknown): value is string {
  return typeof value === "string" && DOC_ID_RE.test(value);
}

export function isDeviceId(value: unknown): value is string {
  return typeof value === "string" && DEVICE_ID_RE.test(value);
}
