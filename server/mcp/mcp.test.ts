import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { localDateTime } from "../../shared/dates.ts";
import { seedDocs } from "../../shared/seed.ts";
import type { Change } from "../../shared/types.ts";
import { undoPatch } from "../../shared/undo.ts";
import { openLocalDb } from "../../web/src/store/db.ts";
import { LocalStore } from "../../web/src/store/local-store.ts";
import { httpTransport, syncOnce } from "../../web/src/store/sync.ts";
import { type CallLog, createCallLog } from "../agent-calls.ts";
import { type AgentRegistry, createAgentRegistry } from "../agents.ts";
import { serveCave } from "../app.ts";
import { openDb } from "../db.ts";
import type { ActivityEntry } from "../owner-api.ts";
import { createStore, type Store } from "../store.ts";

let server: ReturnType<typeof serveCave>;
let store: Store;
let calls: CallLog;
let registry: AgentRegistry;
let vault: string;
const tokens: Record<string, string> = {};
const clients: Client[] = [];

beforeAll(() => {
  const db = openDb(":memory:");
  store = createStore(db);
  store.seedIfEmpty(seedDocs(), 1);
  registry = createAgentRegistry(db);
  calls = createCallLog(db);
  vault = mkdtempSync(join(tmpdir(), "cave-vault-"));
  const mint = (name: string, scopes: string[], collections: string[] | null = null) => {
    const added = registry.add(name, scopes, collections, Date.now());
    if (!added.ok) throw new Error(added.error);
    tokens[name] = added.value.token;
  };
  mint("claude", ["read", "write"]);
  mint("reader", ["read"]);
  mint("money-only", ["read", "write"], ["money"]);
  mint("gone", ["read"]);
  registry.revoke("gone", Date.now());
  server = serveCave({
    hostname: "127.0.0.1",
    port: 0,
    store,
    token: undefined,
    now: Date.now,
    agents: {
      registry,
      calls,
      vaultPath: vault,
    },
  });
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
});

afterAll(() => {
  server.stop(true);
  rmSync(vault, { recursive: true, force: true });
});

const mcpUrl = () => new URL("/mcp", server.url);

async function connect(agent: string, era: "modern" | "legacy" = "modern"): Promise<Client> {
  const client = new Client(
    { name: "cave-test", version: "1.0.0" },
    era === "modern" ? { versionNegotiation: { mode: { pin: "2026-07-28" } } } : {},
  );
  const transport = new StreamableHTTPClientTransport(mcpUrl(), {
    requestInit: { headers: { authorization: `Bearer ${tokens[agent]}` } },
  });
  await client.connect(transport);
  clients.push(client);
  return client;
}

type ToolResult = {
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  content: { type: string; text?: string }[];
};

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  return (await client.callTool({ name, arguments: args })) as ToolResult;
}
const textOf = (result: ToolResult) => result.content[0]?.text ?? "";

async function device(name: string) {
  const db = openLocalDb(`cave-${name}-${crypto.randomUUID()}`, { indexedDB, IDBKeyRange });
  const local = await LocalStore.open({ db, deviceId: name });
  const sync = () => syncOnce(local, httpTransport(new URL("/api/sync", server.url).href, local));
  await sync();
  return { local, sync };
}

const rawPost = (headers: Record<string, string>, body: unknown) =>
  fetch(mcpUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify(body),
  });

const ping = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };

test("no token, a wrong one or a revoked one gets 401", async () => {
  expect((await rawPost({}, ping)).status).toBe(401);
  expect((await rawPost({ authorization: "Bearer cave_nope" }, ping)).status).toBe(401);
  expect((await rawPost({ authorization: `Bearer ${tokens.gone}` }, ping)).status).toBe(401);
});

test("a foreign Origin gets 403 even with a valid token", async () => {
  const res = await rawPost(
    { authorization: `Bearer ${tokens.claude}`, origin: "https://evil.example" },
    ping,
  );
  expect(res.status).toBe(403);
});

test("a Host header that is not an allowed name gets 403", async () => {
  const res = await rawPost(
    { authorization: `Bearer ${tokens.claude}`, host: "evil.example" },
    ping,
  );
  expect(res.status).toBe(403);
});

test("agent tokens are refused by the owner API", async () => {
  const res = await fetch(new URL("/api/agents", server.url), {
    headers: { authorization: `Bearer ${tokens.claude}` },
  });
  expect(res.status).toBe(401);
  const agents = (await (await fetch(new URL("/api/agents", server.url))).json()) as {
    agents: Record<string, unknown>[];
  };
  expect(agents.agents.map((a) => a.name)).toEqual(["claude", "gone", "money-only", "reader"]);
  expect(JSON.stringify(agents)).not.toContain("hash");
});

test("a 2025-era client (initialize handshake) is answered", async () => {
  const legacy = await connect("claude", "legacy");
  const tools = await legacy.listTools();
  expect(tools.tools.length).toBeGreaterThan(0);
});

test("tools are listed in a fixed order and follow the agent's scopes", async () => {
  const names = async (agent: string) =>
    (await (await connect(agent)).listTools()).tools.map((t) => t.name);
  expect(await names("claude")).toEqual([
    "list_collections",
    "query",
    "get",
    "money_month",
    "create",
    "update",
    "propose_delete",
    "add_note",
  ]);
  expect(await names("reader")).toEqual(["list_collections", "query", "get", "money_month"]);
  const tools = (await (await connect("reader")).listTools()).tools;
  expect(tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true);
});

test("the allowlist hides collections everywhere", async () => {
  const client = await connect("money-only");
  const listed = (await call(client, "list_collections")).structuredContent as {
    collections: { id: string }[];
  };
  expect(listed.collections.map((c) => c.id)).toEqual(["money"]);
  expect(textOf(await call(client, "query", { collection: "tasks" }))).toBe(
    "collection tasks not found",
  );
  expect(textOf(await call(client, "create", { collection: "tasks", title: "x" }))).toBe(
    "collection tasks not found",
  );
  const all = (await call(await connect("claude"), "list_collections")).structuredContent as {
    collections: { id: string }[];
  };
  expect(all.collections.map((c) => c.id)).not.toContain("proposals");
});

test("create refuses a guessed category and an attempt to set _deleted", async () => {
  const client = await connect("claude");
  const guessed = await call(client, "create", {
    collection: "money",
    title: "Lunch",
    fields: { amount: 87.5, direction: "expense", category: "lunch" },
  });
  expect(guessed.isError).toBe(true);
  expect(textOf(guessed)).toContain("field category: must be one of");
  const deleted = await call(client, "create", {
    collection: "money",
    title: "x",
    fields: { _deleted: true },
  });
  expect(textOf(deleted)).toBe("_deleted cannot be set by an agent");
});

test("an agent write reaches a device with actor agent:<name> and shows in history", async () => {
  const client = await connect("claude");
  const created = await call(client, "create", {
    collection: "money",
    title: "Lunch",
    fields: { amount: 87.5, direction: "expense", category: "food", date: "2026-10-13T13:00" },
  });
  const { id } = created.structuredContent as { id: string };
  const phone = await device("phone");
  expect((await phone.local.get(id))?.actor).toBe("agent:claude");
  const history = (await (await fetch(new URL(`/api/history/${id}`, server.url))).json()) as {
    changes: Change[];
  };
  expect(history.changes.map((c) => c.actor)).toEqual(["agent:claude"]);

  const found = (await call(client, "query", { collection: "money", text: "lunch" }))
    .structuredContent as { items: { id: string }[] };
  expect(found.items.map((i) => i.id)).toContain(id);
  const month = (await call(client, "money_month", { month: "2026-10" })).structuredContent;
  expect(month).toMatchObject({ spent: 87.5, spentCount: 1, incomplete: 0, undated: 0 });
});

test("propose_delete, then the owner approves on a device", async () => {
  const client = await connect("claude");
  const created = await call(client, "create", { collection: "tasks", title: "Duplicate" });
  const { id } = created.structuredContent as { id: string };
  const proposed = await call(client, "propose_delete", { id, reason: "Same as another task" });
  const proposal = (proposed.structuredContent as { id: string }).id;
  expect(store.get(id)?.data._deleted).toBeUndefined();

  const laptop = await device("laptop");
  expect((await laptop.local.get(proposal))?.data).toMatchObject({
    target: id,
    status: "pending",
  });
  await laptop.local.write({ id, kind: "item", collection: "tasks" }, { _deleted: true });
  await laptop.local.write(
    { id: proposal, kind: "item", collection: "proposals" },
    { status: "approved", decided: localDateTime(new Date(), "America/Mexico_City") },
  );
  await laptop.sync();
  expect(store.get(id)?.data._deleted).toBe(true);
  expect(store.get(proposal)?.data.status).toBe("approved");
  expect(textOf(await call(client, "get", { id }))).toBe(`item ${id} not found`);
});

test("undo restores an agent's edit unless the key changed since", async () => {
  const client = await connect("claude");
  const created = await call(client, "create", {
    collection: "tasks",
    title: "Ship",
    fields: { status: "todo", area: "work" },
  });
  const { id } = created.structuredContent as { id: string };
  await call(client, "update", { id, fields: { status: "done", area: "life" } });

  const activity = (await (await fetch(new URL("/api/activity", server.url))).json()) as {
    entries: ActivityEntry[];
  };
  const edit = activity.entries.find((e) => e.tool === "update" && e.args.includes(id));
  const change = edit?.changes[0];
  if (!change) throw new Error("update not in activity");
  expect(change.keys.sort()).toEqual(["area", "status"]);

  const laptop = await device("laptop2");
  // The owner changes `area` after the agent did; undo must leave it alone.
  await laptop.local.write({ id, kind: "item", collection: "tasks" }, { area: "home" });
  const plan = undoPatch(change, await laptop.local.get(id));
  expect(plan).toEqual({
    patch: { status: "todo" },
    skipped: [{ key: "area", reason: "changed since" }],
  });
  await laptop.local.write({ id, kind: "item", collection: "tasks" }, plan.patch);
  await laptop.sync();
  expect(store.get(id)?.data).toMatchObject({ status: "todo", area: "home" });
});

test("add_note writes under Inbox/ and never overwrites", async () => {
  const client = await connect("claude");
  const first = await call(client, "add_note", { title: "Ideas: v0.2?", body: "One" });
  const second = await call(client, "add_note", { title: "Ideas: v0.2?", body: "Two" });
  const a = (first.structuredContent as { path: string }).path;
  const b = (second.structuredContent as { path: string }).path;
  expect(a).toMatch(/^Inbox\/\d{4}-\d{2}-\d{2} \d{4} Ideas v0 2\.md$/);
  // Same minute and title: the second note gets a suffix.
  if (a.slice(6, 21) === b.slice(6, 21)) expect(b).toBe(a.replace(".md", " 2.md"));
  expect(b).not.toBe(a);
  const text = readFileSync(join(vault, a), "utf8");
  expect(text).toContain("source: agent:claude");
  expect(text).toContain("# Ideas: v0.2?\n\nOne");
  expect(readFileSync(join(vault, b), "utf8")).toContain("Two");

  writeFileSync(join(vault, "Inbox", "keep.md"), "owner's note");
  expect(readdirSync(join(vault, "Inbox"))).toContain("keep.md");
  expect(readFileSync(join(vault, "Inbox", "keep.md"), "utf8")).toBe("owner's note");
});

test("every call is logged, reads and refusals included", async () => {
  const before = calls.page(undefined, 1000).filter((c) => c.agent === "reader").length;
  const client = await connect("reader");
  await call(client, "list_collections");
  await call(client, "query", { collection: "nope" });
  await call(client, "money_month", { month: "2026-10" });
  const logged = calls.page(undefined, 1000).filter((c) => c.agent === "reader");
  expect(logged.length - before).toBe(3);
  expect(logged.slice(0, 3).map((c) => [c.tool, c.ok])).toEqual([
    ["money_month", true],
    ["query", false],
    ["list_collections", true],
  ]);
  expect(logged[1]?.error).toBe("collection nope not found");
});
