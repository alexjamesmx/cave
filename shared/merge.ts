import type { Doc } from "./types.ts";

interface MergeResult {
  doc: Doc;
  /** Keys whose value or stamp came from `incoming`; empty means `local` is unchanged. */
  changed: string[];
}

/**
 * Per-key last-writer-wins. Server and client both use this, so a doc converges to the
 * same state whatever order changes arrive in. `id`, `kind` and `collection` are fixed
 * at creation and taken from `local`.
 */
export function mergeDoc(local: Doc | undefined, incoming: Doc): MergeResult {
  if (!local) {
    return { doc: structuredClone(incoming), changed: Object.keys(incoming.stamps) };
  }

  const data = { ...local.data };
  const stamps = { ...local.stamps };
  const changed: string[] = [];

  for (const [key, stamp] of Object.entries(incoming.stamps)) {
    const current = stamps[key];
    if (current !== undefined && !wins(stamp, incoming.data[key], current, data[key])) continue;
    data[key] = structuredClone(incoming.data[key]);
    stamps[key] = stamp;
    changed.push(key);
  }

  if (changed.length === 0) return { doc: local, changed };
  return { doc: { ...local, data, stamps, actor: incoming.actor }, changed };
}

// Equal stamps with different values only come from a misbehaving client, but a
// deterministic tie-break keeps the merge commutative even then.
function wins(stamp: string, value: unknown, currentStamp: string, currentValue: unknown): boolean {
  if (stamp !== currentStamp) return stamp > currentStamp;
  return JSON.stringify(value) > JSON.stringify(currentValue);
}
