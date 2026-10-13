import type { Database } from "bun:sqlite";
import { mergeDoc } from "../shared/merge.ts";
import type { Doc, Kind, Stamp } from "../shared/types.ts";

interface DocRow {
  id: string;
  kind: Kind;
  collection: string | null;
  data: string;
  stamps: string;
  seq: number;
  actor: string;
}

interface ChangeRow {
  seq: number;
  id: string;
  actor: string;
  at: number;
  keys: string;
  before: string;
}

/** A key's value and stamp before a change; `null` when the key did not exist yet. */
export type Before = Record<string, { value: unknown; stamp: Stamp } | null>;

export interface Change {
  seq: number;
  id: string;
  actor: string;
  at: number;
  keys: string[];
  /** `null` for rows written before previous values were recorded. */
  before: Before | null;
}

export interface Store {
  /** Merges docs in one IMMEDIATE transaction; returns the ids that changed. */
  applyChanges(docs: Doc[], actor: string, at: number): string[];
  changesSince(cursor: number, limit: number): { seq: number; doc: Doc }[];
  get(id: string): Doc | undefined;
  seqOf(id: string): number | undefined;
  changeLog(): Change[];
  seedIfEmpty(docs: Doc[], at: number): boolean;
}

const toDoc = (row: DocRow): Doc => ({
  id: row.id,
  kind: row.kind,
  collection: row.collection,
  data: JSON.parse(row.data),
  stamps: JSON.parse(row.stamps),
  actor: row.actor,
});

export function createStore(db: Database): Store {
  const selectDoc = db.query<DocRow, [string]>("SELECT * FROM docs WHERE id = ?");
  const selectSince = db.query<DocRow, [number, number]>(
    "SELECT * FROM docs WHERE seq > ? ORDER BY seq LIMIT ?",
  );
  const countDocs = db.query<{ n: number }, []>("SELECT count(*) AS n FROM docs");
  const selectChanges = db.query<ChangeRow, []>("SELECT * FROM changes ORDER BY seq");
  const insertChange = db.query<{ seq: number }, [string, string, number, string, string]>(
    "INSERT INTO changes (id, actor, at, keys, before) VALUES (?, ?, ?, ?, ?) RETURNING seq",
  );
  const upsertDoc = db.query<never, [string, Kind, string | null, string, string, number, string]>(
    `INSERT INTO docs (id, kind, collection, data, stamps, seq, actor) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET data = excluded.data, stamps = excluded.stamps,
       seq = excluded.seq, actor = excluded.actor`,
  );

  // seq comes from the changes log, so a doc's seq and its newest log row always match.
  const merge = db.transaction((docs: Doc[], actor: string, at: number): string[] => {
    const touched: string[] = [];
    for (const incoming of docs) {
      const row = selectDoc.get(incoming.id);
      const local = row ? toDoc(row) : undefined;
      const { doc, changed } = mergeDoc(local, { ...incoming, actor });
      if (changed.length === 0) continue;
      const change = insertChange.get(
        doc.id,
        actor,
        at,
        JSON.stringify(changed),
        JSON.stringify(previous(local, changed)),
      );
      if (!change) throw new Error("changes insert returned no seq");
      upsertDoc.run(
        doc.id,
        doc.kind,
        doc.collection,
        JSON.stringify(doc.data),
        JSON.stringify(doc.stamps),
        change.seq,
        actor,
      );
      touched.push(doc.id);
    }
    return touched;
  });

  const seed = db.transaction((docs: Doc[], at: number): boolean => {
    if ((countDocs.get()?.n ?? 0) > 0) return false;
    merge(docs, "seed", at);
    return true;
  });

  return {
    applyChanges: (docs, actor, at) => merge.immediate(docs, actor, at),
    changesSince: (cursor, limit) =>
      selectSince.all(cursor, limit).map((row) => ({ seq: row.seq, doc: toDoc(row) })),
    get: (id) => {
      const row = selectDoc.get(id);
      return row ? toDoc(row) : undefined;
    },
    seqOf: (id) => selectDoc.get(id)?.seq,
    changeLog: () =>
      selectChanges
        .all()
        .map((row) => ({ ...row, keys: JSON.parse(row.keys), before: JSON.parse(row.before) })),
    seedIfEmpty: (docs, at) => seed.immediate(docs, at),
  };
}

function previous(local: Doc | undefined, keys: string[]): Before {
  return Object.fromEntries(
    keys.map((key) => {
      const stamp = local?.stamps[key];
      return [key, stamp === undefined ? null : { value: local?.data[key], stamp }];
    }),
  );
}
