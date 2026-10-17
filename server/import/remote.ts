import { type Doc, SYNC_PAGE_SIZE, type SyncResponse } from "../../shared/types.ts";
import { type ImportReport, planImport } from "./importer.ts";

/** The import acts as its own device, so the change log says where the docs came from. */
export const IMPORT_DEVICE = "vault-import";
const PUSH_PAGE = 200;

interface Remote {
  url: string;
  token: string;
}

async function sync(remote: Remote, cursor: number, changes: Doc[]): Promise<SyncResponse> {
  const res = await fetch(new URL("/api/sync", remote.url), {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${remote.token}` },
    body: JSON.stringify({ deviceId: IMPORT_DEVICE, cursor, changes }),
  });
  if (!res.ok) throw new Error(`sync answered ${res.status}`);
  return (await res.json()) as SyncResponse;
}

/** Every doc the server holds, newest version of each, through ordinary pulls from cursor 0. */
export async function pullAll(remote: Remote): Promise<Map<string, Doc>> {
  const docs = new Map<string, Doc>();
  let cursor = 0;
  for (;;) {
    const page = await sync(remote, cursor, []);
    for (const doc of page.changes) docs.set(doc.id, doc);
    if (page.changes.length < SYNC_PAGE_SIZE || page.cursor === cursor) return docs;
    cursor = page.cursor;
  }
}

/**
 * `bun run import --remote`: plans the vault import against the hosted server's ids and,
 * unless `dryRun`, pushes only the new docs in pages, stamped at time 0 so any later edit wins.
 * Add-only like the local import: an id the server has is never sent.
 */
export async function importRemote(
  root: string,
  remote: Remote,
  dryRun: boolean,
): Promise<{ report: ImportReport; pushed: number; refused: number }> {
  const existing = await pullAll(remote);
  const { report, docs } = await planImport({ root, get: (id) => existing.get(id), stampAt: 0 });
  if (dryRun) return { report, pushed: 0, refused: 0 };
  let pushed = 0;
  let refused = 0;
  for (let i = 0; i < docs.length; i += PUSH_PAGE) {
    const page = docs.slice(i, i + PUSH_PAGE);
    const answer = await sync(remote, Number.MAX_SAFE_INTEGER, page);
    refused += answer.rejected.length;
    pushed += page.length - answer.rejected.length;
    for (const r of answer.rejected)
      report.problems.push(`${r.id}: refused by the server: ${r.error}`);
  }
  return { report, pushed, refused };
}
