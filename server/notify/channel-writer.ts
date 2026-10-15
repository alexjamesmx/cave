import { Hlc } from "../../shared/hlc.ts";
import { newId } from "../../shared/ids.ts";
import type { Doc } from "../../shared/types.ts";
import type { Store } from "../store.ts";

/**
 * Writes a channel makes on the owner's behalf (Telegram's Done, Snooze, `/remind`): ordinary
 * stamped writes with actor `channel:<id>`, so they sync, show in history and can be undone.
 */
export function createChannelWriter(store: Store, channel: string, now: () => number) {
  const clock = new Hlc(`channel-${channel}`, now);
  const actor = `channel:${channel}`;
  const apply = (current: Doc | undefined, doc: Omit<Doc, "stamps" | "actor">) => {
    // Observing the stored stamps first orders this edit after everything the server holds.
    for (const stamp of Object.values(current?.stamps ?? {})) clock.observe(stamp);
    const stamps = Object.fromEntries(Object.keys(doc.data).map((key) => [key, clock.next()]));
    store.applyChanges([{ ...doc, stamps, actor }], actor, now());
  };
  return {
    update(doc: Doc, patch: Record<string, unknown>) {
      apply(doc, { id: doc.id, kind: doc.kind, collection: doc.collection, data: patch });
    },
    create(collection: string, data: Record<string, unknown>): string {
      const id = newId(now());
      apply(undefined, {
        id,
        kind: "item",
        collection,
        data: { _created: new Date(now()).toISOString(), ...data },
      });
      return id;
    },
  };
}
export type ChannelWriter = ReturnType<typeof createChannelWriter>;
