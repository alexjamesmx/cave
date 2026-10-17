import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { localDateTime } from "../../shared/dates.ts";
import { formatStamp } from "../../shared/hlc.ts";
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
  mint("other", ["read", "write"]);
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
  expect(agents.agents.map((a) => a.name)).toEqual([
    "claude",
    "gone",
    "money-only",
    "other",
    "reader",
  ]);
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
    "get_project",
    "list_flows",
    "create",
    "update",
    "propose_delete",
    "mark_paid",
    "save_flow",
    "start_run",
    "log_step",
    "finish_run",
    "add_note",
  ]);
  expect(await names("reader")).toEqual([
    "list_collections",
    "query",
    "get",
    "money_month",
    "get_project",
    "list_flows",
  ]);
  const tools = (await (await connect("reader")).listTools()).tools;
  expect(tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true);
  // Only update changes existing values; the other write tools only add.
  const writes = (await (await connect("claude")).listTools()).tools.filter(
    (t) => t.annotations?.readOnlyHint === false,
  );
  expect(writes.map((t) => [t.name, t.annotations?.destructiveHint])).toEqual([
    ["create", false],
    ["update", true],
    ["propose_delete", false],
    ["mark_paid", false],
    ["save_flow", true],
    ["start_run", false],
    ["log_step", false],
    ["finish_run", false],
    ["add_note", false],
  ]);
});

test("get_project: parts as a tree, open tasks and linked items; refs are checked", async () => {
  const client = await connect("claude");
  const created = async (collection: string, title: string, fields: Record<string, unknown>) => {
    const r = await call(client, "create", { collection, title, fields });
    expect([textOf(r), r.isError]).toEqual([expect.any(String), undefined]);
    return (r.structuredContent as { id: string }).id;
  };
  const project = await created("projects", "Garden", { status: "active", template: "generic" });
  const bed = await created("parts", "Beds", { project, status: "active", order: 1 });
  await created("parts", "Soil", { project, parent: bed, status: "planned" });
  await created("tasks", "Buy seeds", { project, part: bed, status: "todo" });
  await created("tasks", "Old task", { project, status: "done" });
  await created("ideas", "Raised beds", { project });

  const bad = await call(client, "create", {
    collection: "tasks",
    title: "x",
    fields: { project: bed },
  });
  expect(textOf(bad)).toContain(`points to an item in parts, not projects`);
  expect(
    textOf(
      await call(client, "create", {
        collection: "tasks",
        title: "x",
        fields: { project: "nope" },
      }),
    ),
  ).toContain("points to no item in projects");

  const got = (await call(client, "get_project", { id: project })).structuredContent as {
    project: { title: string };
    parts: { title: string; children: { title: string }[] }[];
    openTasks: { title: string }[];
    items: Record<string, { count: number }>;
    runs: unknown[];
  };
  expect(got.project.title).toBe("Garden");
  expect(got.parts.map((p) => [p.title, p.children.map((c) => c.title)])).toEqual([
    ["Beds", ["Soil"]],
  ]);
  expect(got.openTasks.map((t) => t.title)).toEqual(["Buy seeds"]);
  expect(Object.fromEntries(Object.entries(got.items).map(([c, v]) => [c, v.count]))).toEqual({
    ideas: 1,
    tasks: 2,
  });
  expect(got.runs).toEqual([]);
  expect(textOf(await call(client, "get_project", { id: bed }))).toBe(`project ${bed} not found`);
  expect(textOf(await call(await connect("money-only"), "get_project", { id: project }))).toBe(
    `project ${project} not found`,
  );
});

test("an agent edits a project's map through update, with the app's checks", async () => {
  const client = await connect("claude");
  const created = await call(client, "create", {
    collection: "projects",
    title: "Mapped",
    fields: { status: "active" },
  });
  const project = (created.structuredContent as { id: string }).id;
  const map = {
    version: 1,
    positions: { [project]: { x: 0, y: 0 } },
    notes: [{ id: "n1", text: "Plan first", x: 10, y: 10 }],
    groups: [],
    edges: [{ id: "e1", from: project, to: "n1" }],
  };
  const ok = await call(client, "update", { id: project, fields: { map } });
  expect(ok.isError).toBeUndefined();
  const html = await call(client, "update", {
    id: project,
    fields: { map: { ...map, notes: [{ id: "n1", text: "<script>x</script>", x: 0, y: 0 }] } },
  });
  expect(textOf(html)).toContain("must be plain text, not HTML");
  const dangling = await call(client, "update", {
    id: project,
    fields: { map: { ...map, edges: [{ id: "e1", from: project, to: "nowhere" }] } },
  });
  expect(textOf(dangling)).toContain("joins a node the map doesn't place");
});

test("runs: start, steps and finish; only the agent that started a run can touch it", async () => {
  const client = await connect("claude");
  const created = await call(client, "create", {
    collection: "projects",
    title: "Run host",
    fields: { status: "active" },
  });
  const project = (created.structuredContent as { id: string }).id;
  const started = await call(client, "start_run", { project, title: "Build part 4" });
  expect(started.isError).toBeUndefined();
  const id = (started.structuredContent as { id: string }).id;
  expect(store.get(id)?.data).toMatchObject({
    project,
    agent: "claude",
    status: "running",
    steps: [],
  });

  expect(
    (await call(client, "log_step", { run: id, title: "Tests written", status: "done" })).isError,
  ).toBeUndefined();
  await call(client, "log_step", {
    run: id,
    title: "Waiting for review",
    status: "waiting",
    detail: "PR #20",
  });
  expect(store.get(id)?.data.status).toBe("waiting");
  expect(
    (store.get(id)?.data.steps as { title: string }[] | undefined)?.map((s) => s.title),
  ).toEqual(["Tests written", "Waiting for review"]);

  // Another agent, and generic writes, can't reach it.
  const other = await connect("other");
  expect(textOf(await call(other, "log_step", { run: id, title: "x", status: "done" }))).toBe(
    `run ${id} not found`,
  );
  expect(textOf(await call(client, "update", { id, fields: { status: "done" } }))).toBe(
    `item ${id} not found`,
  );
  expect(textOf(await call(client, "create", { collection: "runs", title: "x" }))).toBe(
    "collection runs not found",
  );
  expect(textOf(await call(client, "start_run", { project: "nope", title: "x" }))).toBe(
    "project nope not found",
  );
  expect(
    textOf(await call(await connect("money-only"), "start_run", { project, title: "x" })),
  ).toBe(`project ${project} not found`);
  expect(
    textOf(await call(client, "log_step", { run: id, title: "<b>x</b>", status: "done" })),
  ).toContain("plain text");

  const finished = await call(client, "finish_run", {
    run: id,
    status: "done",
    summary: "Shipped.",
  });
  expect(finished.isError).toBeUndefined();
  expect(store.get(id)?.data).toMatchObject({ status: "done", _body: "Shipped." });
  expect(textOf(await call(client, "log_step", { run: id, title: "late", status: "done" }))).toBe(
    `run ${id} is finished`,
  );
});

test("a run keeps at most 200 steps", async () => {
  const client = await connect("claude");
  const created = await call(client, "create", {
    collection: "projects",
    title: "Long run",
    fields: { status: "active" },
  });
  const project = (created.structuredContent as { id: string }).id;
  const id = (
    (await call(client, "start_run", { project, title: "Many" })).structuredContent as {
      id: string;
    }
  ).id;
  const doc = store.get(id);
  if (!doc) throw new Error("no run");
  const steps = Array.from({ length: 200 }, (_, i) => ({
    title: `s${i}`,
    status: "done",
    at: new Date(0).toISOString(),
  }));
  store.applyChanges(
    [
      {
        ...doc,
        data: { steps },
        stamps: { steps: formatStamp(Date.now(), 9999, "test") },
        actor: "test",
      },
    ],
    "test",
    Date.now(),
  );
  expect(
    textOf(await call(client, "log_step", { run: id, title: "one more", status: "done" })),
  ).toContain("200 steps already");
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

test("flows change only through save_flow; create and update can't reach them", async () => {
  const client = await connect("claude");
  expect(textOf(await call(client, "create", { collection: "flows", title: "x" }))).toBe(
    "collection flows not found",
  );
  expect(textOf(await call(client, "update", { id: "flow-rent", fields: { status: "on" } }))).toBe(
    "item flow-rent not found",
  );
  const saved = await call(client, "save_flow", {
    title: "Plan the week",
    definition: {
      version: 1,
      trigger: { type: "schedule", every: "week", weekday: 1, at: "08:00" },
      steps: [{ type: "create", collection: "tasks", title: "Plan the week" }],
    },
  });
  expect(saved.structuredContent).toMatchObject({ status: "on" });
  const bad = await call(client, "save_flow", {
    title: "x",
    definition: { version: 1, trigger: { type: "webhook" }, steps: [] },
  });
  expect(bad.isError).toBe(true);
  const { flows } = (await call(client, "list_flows")).structuredContent as {
    flows: { title: string; status: string; author: string; steps: string[] }[];
  };
  expect(flows.find((f) => f.title === "Plan the week")).toMatchObject({
    status: "on",
    author: "claude",
    steps: ["Every week on weekday 1 at 08:00", "Create “Plan the week” in tasks"],
  });
});

test("mark_paid logs the expense and moves the payment to next month; a varying amount must be given", async () => {
  const client = await connect("claude");
  const card = await call(client, "create", {
    collection: "payments",
    title: "Nu card",
    fields: {
      kind: "card",
      amount: 3000,
      approx: true,
      due: "2026-10-22T09:00",
      repeat: "monthly",
      active: true,
    },
  });
  const { id } = card.structuredContent as { id: string };
  const refused = await call(client, "mark_paid", { id });
  expect(textOf(refused)).toContain("amount varies");
  const paid = await call(client, "mark_paid", { id, amount: 2875.5, date: "2026-09-21T18:00" });
  const { expense, next } = paid.structuredContent as { expense: string; next: { due: string } };
  expect(next.due).toBe("2026-11-22T09:00");
  expect(store.get(expense)?.data).toMatchObject({
    _title: "Nu card",
    amount: 2875.5,
    direction: "expense",
    date: "2026-09-21T18:00",
  });
  expect(store.get(id)?.data.due).toBe("2026-11-22T09:00");
  expect(textOf(await call(client, "mark_paid", { id: expense }))).toBe(
    `item ${expense} is not a payment`,
  );
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

  // A transaction without a date is in no month: reported apart, with its amount.
  const undated = await call(client, "create", {
    collection: "money",
    title: "Cash somewhere",
    fields: { amount: 300, direction: "expense" },
  });
  expect(undated.isError).toBeUndefined();
  const after = (await call(client, "money_month", { month: "2026-10" })).structuredContent;
  expect(after).toMatchObject({ spent: 87.5, undated: 1, undatedAmount: 300 });
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
