import { homedir } from "node:os";
import { join } from "node:path";
import { formatStamp } from "../../shared/hlc.ts";
import type { Doc } from "../../shared/types.ts";
import { applyEdits } from "./apply.ts";
import { type AiItem, collectAi } from "./collect.ts";
import { hashOf, planSync } from "./plan.ts";

/**
 * `bun run ai-sync`: reads the repository's and this laptop's AI rules, skills, MCP servers,
 * plugins and memory, removes every secret, and pushes them to the Cave's `ai` collection
 * (the hosted server: `CAVE_REMOTE_URL`, `CAVE_REMOTE_TOKEN`; `--local` for this machine).
 * `--apply` writes items edited in the Cave back to their files, asking before each one.
 * Contents are never printed, except the diff `--apply` asks about.
 */

const local = process.argv.includes("--local");
const apply = process.argv.includes("--apply");
const base = local ? `http://127.0.0.1:${process.env.PORT ?? 3000}` : process.env.CAVE_REMOTE_URL;
const token = local ? process.env.CAVE_TOKEN : process.env.CAVE_REMOTE_TOKEN;
if (!base || (!local && !token)) {
  console.error(
    "Set CAVE_REMOTE_URL and CAVE_REMOTE_TOKEN (in the laptop's .env), or pass --local",
  );
  process.exit(1);
}
const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
const roots = { repo: process.cwd(), home: process.env.AI_SYNC_HOME ?? homedir() };

async function get<T>(path: string): Promise<T> {
  const res = await fetch(new URL(path, base), { headers });
  if (!res.ok) throw new Error(`GET ${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

let counter = 0;
/** Writes as a device would: stamped keys through `/api/sync`, so they sync and can be undone. */
async function push(changes: { id: string; data: Record<string, unknown> }[]) {
  if (changes.length === 0) return;
  const now = Date.now();
  const docs: Doc[] = changes.map(({ id, data }) => {
    const stamp = formatStamp(now, counter++, "ai-sync");
    return {
      id,
      kind: "item",
      collection: "ai",
      data,
      stamps: Object.fromEntries(Object.keys(data).map((k) => [k, stamp])),
      actor: "user:ai-sync",
    };
  });
  const res = await fetch(new URL("/api/sync", base), {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ deviceId: "ai-sync", cursor: Number.MAX_SAFE_INTEGER, changes: docs }),
  });
  if (!res.ok) throw new Error(`sync: HTTP ${res.status}`);
  const { rejected } = (await res.json()) as { rejected: { id: string; error: string }[] };
  for (const r of rejected) console.error(`  refused ${r.id}: ${r.error}`);
}

/** The Cave's own agents, as items: their names, scopes and last call; never a token. */
async function agentItems(): Promise<AiItem[]> {
  const { agents } = await get<{
    agents: {
      name: string;
      scopes: string[];
      collections: string[] | null;
      revoked: number | null;
      lastCall: number | null;
    }[];
  }>("/api/agents");
  return agents.map((a) => ({
    source: `cave:agents/${a.name}`,
    title: a.name,
    kind: "agent",
    surface: "any",
    scope: "account",
    body: [
      `Scopes: ${a.scopes.join(", ")}`,
      `Collections: ${a.collections ? a.collections.join(", ") : "all"}`,
      `Status: ${a.revoked ? "revoked" : "active"}`,
      `Last call: ${a.lastCall ? new Date(a.lastCall).toISOString() : "never"}`,
      "",
    ].join("\n"),
  }));
}

const { docs } = await get<{ docs: Doc[] }>("/api/export");
const items = [...collectAi(roots), ...(await agentItems())];
const plan = planSync(items, docs);

if (!apply) {
  await push(plan.push);
  console.log(`${items.length} items read from ${join(roots.repo)} and ${roots.home}.`);
  console.log(`Pushed ${plan.push.length}; ${plan.unchanged} unchanged.`);
  if (plan.edited.length)
    console.log(`${plan.edited.length} edited in the Cave: run with --apply to write them back.`);
  if (plan.deleted.length)
    console.log(
      `${plan.deleted.length} deleted in the Cave: --apply offers to move their files to .ai-trash/.`,
    );
  for (const c of plan.conflicts)
    console.log(
      `Changed in both places, left alone: ${String(c.data._title)} (${String(c.data.source)})`,
    );
  process.exit(0);
}

const ask = (question: string) => (prompt(`${question} [y/N]`) ?? "").trim().toLowerCase() === "y";
const done = applyEdits(plan.edited, plan.deleted, roots, ask, (line) => console.log(line));
// Written files now match the Cave: record that, so the next sync sees both sides in step.
await push(done.written.map((w) => ({ id: w.id, data: { _syncHash: hashOf(w.body) } })));
console.log(`Wrote ${done.written.length}; moved ${done.trashed.length} to .ai-trash/.`);
for (const s of done.skipped) console.log(`Skipped ${s.title}: ${s.why}`);
