import { Hlc } from "../../../shared/hlc.ts";
import { mergeDoc } from "../../../shared/merge.ts";
import type { Doc, Kind } from "../../../shared/types.ts";
import type { LocalDb, OutboxRow } from "./db.ts";

export interface WriteTarget {
  id: string;
  kind: Kind;
  collection: string | null;
}

export interface PendingChange {
  row: OutboxRow;
  doc: Doc;
}

interface OpenOptions {
  db: LocalDb;
  deviceId: string;
  now?: () => number;
  /** Called after each committed local write; the sync scheduler debounces on it. */
  onWrite?: () => void;
}

/** The device's full local copy: stamped writes, the outbox, and applying pulled docs. */
export class LocalStore {
  private constructor(
    readonly db: LocalDb,
    readonly deviceId: string,
    private readonly clock: Hlc,
    private readonly onWrite: (() => void) | undefined,
  ) {}

  static async open({ db, deviceId, now = Date.now, onWrite }: OpenOptions): Promise<LocalStore> {
    const saved = await db.meta.get("clock");
    const clock = new Hlc(deviceId, now, saved?.key === "clock" ? saved.value : undefined);
    return new LocalStore(db, deviceId, clock, onWrite);
  }

  get(id: string): Promise<Doc | undefined> {
    return this.db.docs.get(id);
  }

  async cursor(): Promise<number> {
    const row = await this.db.meta.get("cursor");
    return row?.key === "cursor" ? row.value : 0;
  }

  async write(target: WriteTarget, patch: Record<string, unknown>): Promise<Doc> {
    const { db } = this;
    const doc = await db.transaction("rw", db.docs, db.outbox, db.meta, async () => {
      const stamps = Object.fromEntries(Object.keys(patch).map((key) => [key, this.clock.next()]));
      const incoming: Doc = { ...target, data: patch, stamps, actor: `user:${this.deviceId}` };
      const { doc } = mergeDoc(await db.docs.get(target.id), incoming);
      const pending = await db.outbox.get(target.id);
      await db.docs.put(doc);
      await db.outbox.put({ id: target.id, rev: (pending?.rev ?? 0) + 1 });
      await db.meta.put({ key: "clock", value: this.clock.state });
      return doc;
    });
    this.onWrite?.();
    return doc;
  }

  /** Snapshot of the outbox with the docs to send, read in one transaction. */
  pending(): Promise<PendingChange[]> {
    const { db } = this;
    return db.transaction("r", db.docs, db.outbox, async () => {
      const rows = await db.outbox.toArray();
      const docs = await db.docs.bulkGet(rows.map((r) => r.id));
      return rows.flatMap((row, i) => {
        const doc = docs[i];
        return doc ? [{ row, doc }] : [];
      });
    });
  }

  /**
   * Merges a pulled page, moves the clock past every stamp seen, stores the cursor and
   * drops outbox rows the server acknowledged, unless they were written again meanwhile.
   */
  async applyPulled(pulled: Doc[], cursor: number, acknowledged: OutboxRow[]): Promise<void> {
    const { db } = this;
    await db.transaction("rw", db.docs, db.outbox, db.meta, async () => {
      const locals = await db.docs.bulkGet(pulled.map((d) => d.id));
      const updates: Doc[] = [];
      let newest = "";
      pulled.forEach((incoming, i) => {
        for (const stamp of Object.values(incoming.stamps)) if (stamp > newest) newest = stamp;
        const { doc, changed } = mergeDoc(locals[i], incoming);
        if (changed.length > 0) updates.push(doc);
      });
      if (newest) this.clock.observe(newest);
      await db.docs.bulkPut(updates);

      const current = await db.outbox.bulkGet(acknowledged.map((r) => r.id));
      const done = acknowledged.filter((row, i) => current[i]?.rev === row.rev).map((r) => r.id);
      await db.outbox.bulkDelete(done);

      await db.meta.bulkPut([
        { key: "cursor", value: cursor },
        { key: "clock", value: this.clock.state },
      ]);
    });
  }
}
