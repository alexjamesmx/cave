import type { Doc } from "../shared/types.ts";
import { SCHEMA_VERSION } from "./db.ts";
import { seedVersionOf } from "./seed-migrations.ts";
import type { Store } from "./store.ts";

export interface CaveExport {
  format: 1;
  exportedAt: string;
  schemaVersion: number;
  seedVersion: number;
  /** Every doc as stored, deleted ones included, with stamps. Agent tokens and calls stay out. */
  docs: Doc[];
}

export function exportAll(store: Store, now: number): CaveExport {
  return {
    format: 1,
    exportedAt: new Date(now).toISOString(),
    schemaVersion: SCHEMA_VERSION,
    seedVersion: seedVersionOf(store),
    docs: store.allDocs(),
  };
}

/** `cave-2026-10-13T140512.json`, UTC. */
export const exportName = (now: number) =>
  `cave-${new Date(now).toISOString().slice(0, 19).replace(/:/g, "")}.json`;

/** `GET /api/export`: the same file as `bun run export`, as a download. */
export function exportHandler(store: Store, now: () => number) {
  return (): Response => {
    const at = now();
    return Response.json(exportAll(store, at), {
      headers: { "content-disposition": `attachment; filename="${exportName(at)}"` },
    });
  };
}
