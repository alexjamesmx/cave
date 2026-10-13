import { isStamp } from "../shared/hlc.ts";
import { isDeviceId, isDocId } from "../shared/ids.ts";
import { type Doc, KINDS, type Kind, type SyncRequest } from "../shared/types.ts";

/** Keeps one request under the body limit even after a long offline period; clients batch. */
export const MAX_PUSH_DOCS = 1000;

// Field ids and the reserved `_title`-style keys. `__proto__` would match, so it is refused
// explicitly: merging it with plain assignment would replace the object's prototype.
const DATA_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export function parseSyncRequest(body: unknown): Result<SyncRequest> {
  if (!isRecord(body)) return fail("body must be an object");
  const { deviceId, cursor, changes } = body;
  if (!isDeviceId(deviceId)) return fail("bad deviceId");
  if (!Number.isSafeInteger(cursor) || (cursor as number) < 0) return fail("bad cursor");
  if (!Array.isArray(changes)) return fail("changes must be an array");
  if (changes.length > MAX_PUSH_DOCS) return fail(`at most ${MAX_PUSH_DOCS} changes per request`);

  const docs: Doc[] = [];
  for (const [i, raw] of changes.entries()) {
    const doc = parseDoc(raw);
    if (!doc.ok) return fail(`changes[${i}]: ${doc.error}`);
    docs.push(doc.value);
  }
  return { ok: true, value: { deviceId, cursor: cursor as number, changes: docs } };
}

function parseDoc(raw: unknown): Result<Doc> {
  if (!isRecord(raw)) return fail("doc must be an object");
  const { id, kind, collection, data, stamps } = raw;
  if (!isDocId(id)) return fail("bad id");
  if (!KINDS.includes(kind as Kind)) return fail("unknown kind");
  if (collection !== null && !isDocId(collection)) return fail("bad collection");
  if (!isRecord(data) || !isRecord(stamps)) return fail("data and stamps must be objects");

  const keys = Object.keys(data);
  if (keys.length !== Object.keys(stamps).length) return fail("data and stamps keys differ");
  for (const key of keys) {
    if (!DATA_KEY_RE.test(key) || key === "__proto__") return fail(`bad key ${key}`);
    if (!isStamp(stamps[key])) return fail(`bad stamp for ${key}`);
  }
  // Server sets `actor` from the authenticated caller; whatever the client sent is dropped.
  return {
    ok: true,
    value: { id, kind: kind as Kind, collection, data, stamps: stamps as Doc["stamps"], actor: "" },
  };
}
