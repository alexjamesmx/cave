import { expect, test } from "bun:test";
import type { Doc } from "../../../shared/types.ts";
import { parseExport, planImport } from "./import-plan.ts";

const doc = (id: string, data: Record<string, unknown>, kind: Doc["kind"] = "item"): Doc => ({
  id,
  kind,
  collection: kind === "item" ? "tasks" : null,
  data,
  stamps: Object.fromEntries(Object.keys(data).map((k) => [k, "1:0001:dev"])),
  actor: "user:dev",
});

test("parseExport accepts a format 1 file and refuses anything else with a reason", () => {
  const file = { format: 1, exportedAt: "2026-10-23T10:00:00.000Z", docs: [doc("t1", { a: 1 })] };
  const ok = parseExport(JSON.stringify(file));
  expect(ok.ok).toBe(true);
  if (ok.ok) expect(ok.file.docs.map((d) => d.id)).toEqual(["t1"]);
  expect(parseExport("nope")).toEqual({ ok: false, error: "Not a JSON file." });
  expect(parseExport(JSON.stringify({ format: 2, docs: [] }))).toEqual({
    ok: false,
    error: "Not a Cave export (format 1).",
  });
  expect(parseExport(JSON.stringify({ format: 1 }))).toEqual({
    ok: false,
    error: "The export has no docs list.",
  });
  expect(parseExport(JSON.stringify({ format: 1, docs: [{ id: "x", kind: "thing" }] }))).toEqual({
    ok: false,
    error: "Doc 1 is not a Cave doc.",
  });
});

test("planImport writes only keys that differ, new docs whole, settings and collections first", () => {
  const local = new Map<string, Doc>([
    ["t1", doc("t1", { title: "Old", status: "todo" })],
    ["t2", doc("t2", { title: "Same" })],
  ]);
  const plan = planImport(
    [
      doc("t1", { title: "New", status: "todo" }),
      doc("t2", { title: "Same" }),
      doc("t3", { title: "Added", _deleted: true }),
      doc("tasks", { name: "Tasks" }, "collection"),
      doc("settings", { ownerName: "Alex" }, "setting"),
    ],
    local,
  );
  expect(plan.unchanged).toBe(1);
  expect(plan.writes.map((w) => [w.target.id, w.isNew, w.patch])).toEqual([
    ["settings", true, { ownerName: "Alex" }],
    ["tasks", true, { name: "Tasks" }],
    ["t1", false, { title: "New" }],
    ["t3", true, { title: "Added", _deleted: true }],
  ]);
});
