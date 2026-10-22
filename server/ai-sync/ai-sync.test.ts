import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Doc } from "../../shared/types.ts";
import { applyEdits } from "./apply.ts";
import { collectAi, pathOf, type Roots } from "./collect.ts";
import { aiId, hashOf, planSync } from "./plan.ts";
import { REDACTED } from "./redact.ts";

const join2 = (...p: string[]) => p.join("");
const SECRET = join2("gh", "p_", "Q1w2E3r4T5".repeat(4));
let roots: Roots;
let dir: string;

const put = (path: string, text: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cave-ai-"));
  roots = { repo: join(dir, "repo"), home: join(dir, "home") };
  put(join(roots.repo, "AGENTS.md"), "# Rules\nRun bun test.\n");
  put(
    join(roots.repo, ".mcp.json"),
    JSON.stringify({ mcpServers: { github: { command: "npx", env: { TOKEN: SECRET } } } }),
  );
  put(
    join(roots.repo, ".claude", "skills", "deploy", "SKILL.md"),
    "---\nname: deploy\n---\nShip it.\n",
  );
  put(join(roots.home, ".claude", "CLAUDE.md"), `Be concise. My key is ${SECRET}.\n`);
  put(
    join(roots.home, ".claude", "skills", "notes", "SKILL.md"),
    "---\nname: notes\n---\nTake notes.\n",
  );
  const plugin = join(roots.home, ".claude", "plugins", "cache", "x", "caveman", "1");
  put(
    join(plugin, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "caveman", apiKey: SECRET }),
  );
  put(join(plugin, "skills", "compress", "SKILL.md"), "x");
  put(
    join(roots.home, ".claude", "plugins", "installed_plugins.json"),
    JSON.stringify({ plugins: { "caveman@caveman": [{ installPath: plugin }] } }),
  );
  put(
    join(roots.home, ".claude", "projects", "C--proj-jarvis", "memory", "rules.md"),
    "Commit rules.\n",
  );
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("collects rules, MCP servers, skills, plugins and memory, with no secret anywhere", () => {
  const items = collectAi(roots);
  expect(items.map((i) => [i.source, i.kind, i.scope])).toEqual([
    ["repo:AGENTS.md", "rule", "repo"],
    ["repo:.mcp.json#github", "mcp-server", "repo"],
    ["repo:.claude/skills/deploy/SKILL.md", "skill", "repo"],
    ["~/.claude/CLAUDE.md", "rule", "user"],
    ["~/.claude/skills/notes/SKILL.md", "skill", "user"],
    ["~/.claude/plugins/caveman@caveman", "plugin", "user"],
    ["~/.claude/projects/C--proj-jarvis/memory/rules.md", "memory", "user"],
  ]);
  const all = JSON.stringify(items);
  expect(all).not.toContain(SECRET);
  expect(items.find((i) => i.kind === "plugin")?.body).toContain("Skills: compress");
  expect(items.find((i) => i.source === "~/.claude/CLAUDE.md")?.body).toBe(
    `Be concise. My key is ${REDACTED}.\n`,
  );
  expect(pathOf("repo:AGENTS.md", roots)).toBe(join(roots.repo, "AGENTS.md"));
  expect(pathOf("repo:.mcp.json#github", roots)).toBeUndefined();
  expect(pathOf("~/.claude/plugins/caveman@caveman", roots)).toBeUndefined();
});

const doc = (source: string, data: Record<string, unknown>): Doc => ({
  id: aiId(source),
  kind: "item",
  collection: "ai",
  data: { source, ...data },
  stamps: {},
  actor: "test",
});

test("the plan pushes new and changed files, waits on Cave edits, and never deletes", () => {
  const items = collectAi(roots);
  const first = planSync(items, []);
  expect(first.push).toHaveLength(items.length);
  // Re-running against what the first run stored changes nothing.
  const stored = first.push.map((p) => ({ ...doc(String(p.data.source), p.data), id: p.id }));
  expect(planSync(items, stored)).toMatchObject({
    push: [],
    edited: [],
    conflicts: [],
    unchanged: items.length,
  });

  const agents = stored.find((d) => d.data.source === "repo:AGENTS.md") as Doc;
  const skill = stored.find((d) => d.data.source === "repo:.claude/skills/deploy/SKILL.md") as Doc;
  const memory = stored.find((d) => d.data.kind === "memory") as Doc;
  const edited = { ...agents, data: { ...agents.data, _body: "# Rules\nRun bun test first.\n" } };
  const deleted = { ...memory, data: { ...memory.data, _deleted: true } };
  // The skill changed on disk and in the Cave: a conflict, left alone.
  const both = { ...skill, data: { ...skill.data, _body: "Ship it carefully.\n" } };
  const changed = items.map((i) =>
    i.source === skill.data.source ? { ...i, body: "Ship it now.\n" } : i,
  );
  const plan = planSync(
    changed,
    stored.map((d) =>
      d.id === agents.id ? edited : d.id === memory.id ? deleted : d.id === skill.id ? both : d,
    ),
  );
  expect(plan.edited.map((d) => d.data.source)).toEqual(["repo:AGENTS.md"]);
  expect(plan.conflicts.map((d) => d.data.source)).toEqual([skill.data.source]);
  expect(plan.deleted.map((d) => d.data.source)).toEqual([memory.data.source]);
  expect(plan.push).toEqual([]);

  // A file that changed while the Cave didn't is pushed with its new hash.
  const pushed = planSync(changed, stored);
  expect(pushed.push).toEqual([
    { id: skill.id, data: { _body: "Ship it now.\n", _syncHash: hashOf("Ship it now.\n") } },
  ]);
});

/** What a run read: item ids to the source each came from. */
const readMap = () => new Map(collectAi(roots).map((i) => [aiId(i.source), i.source]));

test("apply writes after a yes, refuses redacted bodies, and moves deleted files to .ai-trash/", () => {
  const agents = doc("repo:AGENTS.md", {
    _title: "AGENTS.md",
    _body: "# Rules\nRun bun test first.\n",
  });
  const claude = doc("~/.claude/CLAUDE.md", {
    _title: "CLAUDE.md",
    _body: `Be brief. ${REDACTED}\n`,
  });
  const mcp = doc("repo:.mcp.json#github", { _title: "github", _body: "{}" });
  const memoryPath = join(
    roots.home,
    ".claude",
    "projects",
    "C--proj-jarvis",
    "memory",
    "rules.md",
  );
  const memory = doc("~/.claude/projects/C--proj-jarvis/memory/rules.md", {
    _title: "rules",
    _deleted: true,
  });
  const asked: string[] = [];
  const read = readMap();
  const result = applyEdits(
    [agents, claude, mcp],
    [memory],
    roots,
    (q) => {
      asked.push(q);
      return true;
    },
    () => {},
    read,
  );
  expect(readFileSync(join(roots.repo, "AGENTS.md"), "utf8")).toBe(
    "# Rules\nRun bun test first.\n",
  );
  expect(readFileSync(join(roots.home, ".claude", "CLAUDE.md"), "utf8")).toContain(SECRET);
  expect(result.skipped.map((s) => s.title)).toEqual(["CLAUDE.md", "github"]);
  expect(existsSync(memoryPath)).toBe(false);
  expect(readdirSync(join(dirname(memoryPath), ".ai-trash"))).toHaveLength(1);
  expect(asked).toHaveLength(2);

  // A no leaves the file as it was.
  const later = doc("repo:AGENTS.md", { _title: "AGENTS.md", _body: "changed\n" });
  const no = applyEdits(
    [later],
    [],
    roots,
    () => false,
    () => {},
    read,
  );
  expect(no.written).toEqual([]);
  expect(readFileSync(join(roots.repo, "AGENTS.md"), "utf8")).toBe(
    "# Rules\nRun bun test first.\n",
  );
});

test("an edited source never decides where apply writes: only files this run read, inside the repo or ~/.claude", () => {
  const read = readMap();
  // An item that was read, whose stored source someone pointed at another file.
  const forged = {
    ...doc("repo:AGENTS.md", { _title: "AGENTS.md", _body: "pwned\n" }),
    data: { source: "~/.bashrc", _title: "AGENTS.md", _body: "pwned\n" },
  };
  // An item this run never read, with a source that climbs out of the repository.
  const outside = doc("repo:../outside.txt", { _title: "outside", _body: "pwned\n" });
  const asked: string[] = [];
  const result = applyEdits(
    [forged, outside],
    [],
    roots,
    (q) => {
      asked.push(q);
      return true;
    },
    () => {},
    read,
  );
  // The forged one goes to the file it was read from, never to ~/.bashrc.
  expect(asked).toEqual([`Write this to ${join(roots.repo, "AGENTS.md")}?`]);
  expect(existsSync(join(roots.home, ".bashrc"))).toBe(false);
  expect(existsSync(join(dir, "outside.txt"))).toBe(false);
  expect(result.skipped.map((s) => s.title)).toEqual(["outside"]);

  expect(pathOf("repo:../outside.txt", roots)).toBeUndefined();
  expect(pathOf("repo:docs/../../outside.txt", roots)).toBeUndefined();
  expect(pathOf("~/.bashrc", roots)).toBeUndefined();
  expect(pathOf("~/../etc/passwd", roots)).toBeUndefined();
  expect(pathOf("~/.claude/CLAUDE.md", roots)).toBe(join(roots.home, ".claude", "CLAUDE.md"));
});
