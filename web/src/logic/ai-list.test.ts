import { expect, test } from "bun:test";
import { formatStamp } from "../../../shared/hlc.ts";
import type { Doc } from "../../../shared/types.ts";
import { type AiView, listAi, viewFromSearch, viewToSearch } from "./ai-list.ts";

const item = (id: string, data: Record<string, unknown>, ms: number): Doc => ({
  id,
  kind: "item",
  collection: "ai",
  data,
  stamps: { _title: formatStamp(ms, 0, "t") },
  actor: "t",
});

const items = [
  item(
    "a",
    {
      _title: "deploy",
      kind: "skill",
      surface: "claude-code",
      scope: "repo",
      source: "repo:.claude/skills/deploy/SKILL.md",
      _body: "Ship it",
    },
    3,
  ),
  item(
    "b",
    {
      _title: "AGENTS.md",
      kind: "rule",
      surface: "any",
      scope: "repo",
      source: "repo:AGENTS.md",
      _body: "Run bun test",
    },
    1,
  ),
  item(
    "c",
    {
      _title: "Cave",
      kind: "connector",
      surface: "claude-app",
      scope: "account",
      source: "manual",
      status: "disabled",
      _body: "Bearer header",
    },
    2,
  ),
];
const ids = (view: Partial<AiView>) =>
  listAi(items, { sort: "kind", desc: false, ...view }).map((d) => d.id);

test("sorts by kind, title, last change or source, either way", () => {
  expect(ids({})).toEqual(["c", "b", "a"]);
  expect(ids({ sort: "title" })).toEqual(["b", "c", "a"]);
  expect(ids({ sort: "title", desc: true })).toEqual(["a", "c", "b"]);
  expect(ids({ sort: "changed" })).toEqual(["a", "c", "b"]);
  expect(ids({ sort: "source" })).toEqual(["c", "a", "b"]);
});

test("filters combine, and text looks in the title, source and content", () => {
  expect(ids({ scope: "repo" })).toEqual(["b", "a"]);
  expect(ids({ status: "active" })).toEqual(["b", "a"]);
  expect(ids({ status: "disabled", surface: "claude-app" })).toEqual(["c"]);
  expect(ids({ text: "BUN TEST" })).toEqual(["b"]);
  expect(ids({ text: "skills/deploy" })).toEqual(["a"]);
});

test("the view survives a trip through the URL; defaults stay out of it", () => {
  const view: AiView = { kind: "skill", text: "ship", sort: "changed", desc: true };
  expect(viewFromSearch(viewToSearch(view))).toEqual(view);
  expect(viewToSearch({ sort: "kind", desc: false })).toBe("");
  expect(viewFromSearch("?sort=nope")).toEqual({ sort: "kind", desc: false });
});
