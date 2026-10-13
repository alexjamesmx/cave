import {
  FieldValueError,
  fieldsOf,
  type ValidateOptions,
  validateFields,
} from "../../../shared/fields.ts";
import { Hlc, parseStamp } from "../../../shared/hlc.ts";
import { mergeDoc } from "../../../shared/merge.ts";
import type { Doc, Kind, Rejection } from "../../../shared/types.ts";
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

/** Within this gap the device clock counts as right again and the recovery offset goes. */
export const CLOCK_AGREES_MS = 60_000;

const PUSH_ORDER: Record<Kind, number> = { setting: 0, collection: 1, item: 2 };

/** The device's full local copy: stamped writes, the outbox, and applying pulled docs. */
export class LocalStore {
  private readonly clock: Hlc;
  private offset = 0;

  private constructor(
    readonly db: LocalDb,
    readonly deviceId: string,
    private readonly deviceNow: () => number,
    private readonly onWrite: (() => void) | undefined,
  ) {
    this.clock = new Hlc(deviceId, () => this.now());
  }

  static async open({ db, deviceId, now = Date.now, onWrite }: OpenOptions): Promise<LocalStore> {
    const store = new LocalStore(db, deviceId, now, onWrite);
    await db.transaction("r", db.meta, () => store.loadSharedClock());
    return store;
  }

  /** Device time corrected by clock recovery, if the owner ran it. */
  now(): number {
    return this.deviceNow() + this.offset;
  }

  /** The device clock as it is, without the recovery offset. */
  rawNow(): number {
    return this.deviceNow();
  }

  get(id: string): Promise<Doc | undefined> {
    return this.db.docs.get(id);
  }

  async cursor(): Promise<number> {
    const row = await this.db.meta.get("cursor");
    return row?.key === "cursor" ? row.value : 0;
  }

  /**
   * `options.selectMembership: false` is for undo only: it restores a value whose option the
   * owner removed since, as sync already accepts such values. Type checks always apply.
   */
  async write(
    target: WriteTarget,
    patch: Record<string, unknown>,
    options: ValidateOptions = {},
  ): Promise<Doc> {
    const { db } = this;
    const doc = await db.transaction("rw", db.docs, db.outbox, db.meta, async () => {
      await this.loadSharedClock();
      if (target.kind === "item" && target.collection) {
        const errors = validateFields(
          fieldsOf(await db.docs.get(target.collection)),
          patch,
          options,
        );
        if (errors.length > 0) throw new FieldValueError(errors);
      }
      const local = await db.docs.get(target.id);
      const data = local ? patch : { _created: new Date(this.now()).toISOString(), ...patch };
      const stamps = Object.fromEntries(Object.keys(data).map((key) => [key, this.clock.next()]));
      const incoming: Doc = { ...target, data, stamps, actor: `user:${this.deviceId}` };
      const { doc } = mergeDoc(local, incoming);
      const pending = await db.outbox.get(target.id);
      await db.docs.put(doc);
      await db.outbox.put({ id: target.id, rev: (pending?.rev ?? 0) + 1 });
      await db.meta.put({ key: "clock", value: this.clock.state });
      return doc;
    });
    this.onWrite?.();
    return doc;
  }

  /**
   * Every tab of this device holds its own copy of the clock, and every change to it is
   * saved in the rw transaction that made it, so the saved clock is always the newest.
   * Loading it at the start of each transaction lets IndexedDB serialise the tabs: no two
   * issue the same stamp, and a clock recovery in one tab reaches the others.
   */
  private async loadSharedClock(): Promise<void> {
    const [clock, offset] = await this.db.meta.bulkGet(["clock", "clockOffset"]);
    if (clock?.key === "clock") this.clock.reset(clock.value);
    this.offset = offset?.key === "clockOffset" ? offset.value : 0;
  }

  /**
   * After the server refused a stamp as too far ahead: from now on local time follows the
   * server's, and every key stamped later than `serverTime` is stamped again so it can sync.
   * The offset is measured against the device time when that answer arrived, not when the
   * owner confirms, so time spent reading the banner does not leave the device behind.
   * Returns how many docs were re-stamped.
   */
  async recoverClock(serverTime: number, rawDeviceTimeAtResponse: number): Promise<number> {
    const { db } = this;
    return db.transaction("rw", db.docs, db.outbox, db.meta, async () => {
      this.offset = serverTime - rawDeviceTimeAtResponse;
      this.clock.reset({ ms: serverTime, counter: 0 });
      const restamped: Doc[] = [];
      await db.docs.each((doc) => {
        const ahead = Object.keys(doc.stamps).filter(
          (key) => parseStamp(doc.stamps[key] as string).ms > serverTime,
        );
        if (ahead.length === 0) return;
        const stamps = { ...doc.stamps };
        for (const key of ahead) stamps[key] = this.clock.next();
        restamped.push({ ...doc, stamps });
      });
      const pending = await db.outbox.bulkGet(restamped.map((d) => d.id));
      await db.docs.bulkPut(restamped);
      await db.outbox.bulkPut(
        restamped.map((d, i) => ({ id: d.id, rev: (pending[i]?.rev ?? 0) + 1 })),
      );
      await db.meta.bulkPut([
        { key: "clock", value: this.clock.state },
        { key: "clockOffset", value: this.offset },
      ]);
      return restamped.length;
    });
  }

  /**
   * Once the device clock agrees with the server again (the owner fixed it), the recovery
   * offset would only pull local time away from the truth, so it is dropped.
   */
  async settleClock(serverTime: number, rawDeviceTimeAtResponse: number): Promise<void> {
    const { db } = this;
    await db.transaction("rw", db.meta, async () => {
      await this.loadSharedClock();
      if (this.offset === 0) return;
      if (Math.abs(rawDeviceTimeAtResponse - serverTime) > CLOCK_AGREES_MS) return;
      this.offset = 0;
      await db.meta.delete("clockOffset");
    });
  }

  /**
   * Snapshot of the outbox with the docs to send, read in one transaction. Settings go
   * first, then collections, then items, so the server can check a new item against a
   * collection created in the same sync.
   */
  pending(): Promise<PendingChange[]> {
    const { db } = this;
    return db.transaction("r", db.docs, db.outbox, async () => {
      const rows = await db.outbox.toArray();
      const docs = await db.docs.bulkGet(rows.map((r) => r.id));
      const pending = rows.flatMap((row, i) => {
        const doc = docs[i];
        return doc ? [{ row, doc }] : [];
      });
      return pending.sort((a, b) => PUSH_ORDER[a.doc.kind] - PUSH_ORDER[b.doc.kind]);
    });
  }

  /**
   * Records the server database this copy syncs with. When it changes (the server was
   * restored from a backup), the cursor may point past the server's log and this copy may
   * hold edits the backup lacks, so every doc goes back in the outbox and the cursor
   * restarts at 0. Merge is idempotent, so pushing docs the server already has is harmless.
   * Returns true when it rebased.
   */
  async adoptServer(dbId: string): Promise<boolean> {
    const { db } = this;
    return db.transaction("rw", db.docs, db.outbox, db.meta, async () => {
      const known = await db.meta.get("dbId");
      if (known?.key === "dbId" && known.value === dbId) return false;
      await db.meta.put({ key: "dbId", value: dbId });
      if (known === undefined) return false;
      const ids = (await db.docs.toCollection().primaryKeys()) as string[];
      const pending = await db.outbox.bulkGet(ids);
      await db.outbox.bulkPut(ids.map((id, i) => ({ id, rev: (pending[i]?.rev ?? 0) + 1 })));
      await db.meta.put({ key: "cursor", value: 0 });
      return true;
    });
  }

  /**
   * Merges a pulled page, moves the clock past every stamp seen, stores the cursor and
   * drops outbox rows the server acknowledged, unless they were written again meanwhile.
   */
  async applyPulled(
    pulled: Doc[],
    cursor: number,
    acknowledged: OutboxRow[],
    rejected: Rejection[] = [],
  ): Promise<void> {
    const { db } = this;
    await db.transaction("rw", [db.docs, db.outbox, db.meta, db.rejected], async () => {
      await this.loadSharedClock();
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

      // A rejected doc keeps its outbox row, so fixing the value pushes it again.
      const refused = new Set(rejected.map((r) => r.id));
      const accepted = acknowledged.filter((row) => !refused.has(row.id));
      const current = await db.outbox.bulkGet(accepted.map((r) => r.id));
      const done = accepted.filter((row, i) => current[i]?.rev === row.rev).map((r) => r.id);
      await db.outbox.bulkDelete(done);
      await db.rejected.bulkDelete(accepted.map((r) => r.id));
      await db.rejected.bulkPut(rejected);

      await db.meta.bulkPut([
        { key: "cursor", value: cursor },
        { key: "clock", value: this.clock.state },
      ]);
    });
  }
}
