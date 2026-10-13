import { fieldsOf, formatFieldErrors, validateFields } from "../shared/fields.ts";
import { isStamp, parseStamp } from "../shared/hlc.ts";
import { isDeviceId, isDocId } from "../shared/ids.ts";
import { mergeDoc } from "../shared/merge.ts";
import { type Doc, KINDS, type Kind, type SyncRequest } from "../shared/types.ts";

/** Keeps one request under the body limit even after a long offline period; clients batch. */
export const MAX_PUSH_DOCS = 1000;

/** A stamp further ahead than this would outrank honest edits and drag every clock forward. */
export const MAX_CLOCK_AHEAD_MS = 10 * 60_000;

// Field ids and the reserved `_title`-style keys. `__proto__` would match, so it is refused
// explicitly: merging it with plain assignment would replace the object's prototype.
const DATA_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export const isDataKey = (key: string) => DATA_KEY_RE.test(key) && key !== "__proto__";

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
  if ((kind === "item") !== (collection !== null)) {
    return fail("an item needs a collection; collections and settings must not have one");
  }
  if (!isRecord(data) || !isRecord(stamps)) return fail("data and stamps must be objects");

  const keys = Object.keys(data);
  if (keys.length !== Object.keys(stamps).length) return fail("data and stamps keys differ");
  for (const key of keys) {
    if (!isDataKey(key)) return fail(`bad key ${key}`);
    if (!isStamp(stamps[key])) return fail(`bad stamp for ${key}`);
  }
  // Server sets `actor` from the authenticated caller; whatever the client sent is dropped.
  return {
    ok: true,
    value: { id, kind: kind as Kind, collection, data, stamps: stamps as Doc["stamps"], actor: "" },
  };
}

export function isClockAhead(docs: Doc[], now: number): boolean {
  return docs.some((doc) =>
    Object.values(doc.stamps).some((stamp) => parseStamp(stamp).ms > now + MAX_CLOCK_AHEAD_MS),
  );
}

/**
 * Checks item values against their collection's fields, using a collection doc from the
 * same request merged over the stored one, so a new field and its first value can arrive
 * together. Items of a collection the server has not seen yet are not checked: the
 * client's outbox does not promise to push collections first.
 */
export function fieldValueError(
  docs: Doc[],
  lookup: (id: string) => Doc | undefined,
): string | undefined {
  const collections = new Map<string, Doc>();
  for (const doc of docs) {
    if (doc.kind === "collection") collections.set(doc.id, mergeDoc(lookup(doc.id), doc).doc);
  }
  for (const [i, doc] of docs.entries()) {
    if (doc.kind !== "item" || doc.collection === null) continue;
    const collection = collections.get(doc.collection) ?? lookup(doc.collection);
    if (!collection) continue;
    const errors = validateFields(fieldsOf(collection), doc.data);
    if (errors.length > 0) return `changes[${i}]: ${formatFieldErrors(errors)}`;
  }
  return undefined;
}
