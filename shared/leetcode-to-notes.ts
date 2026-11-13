import { valueText } from "./field-text.ts";
import { fieldsOf, isSafeUrl, resolveFields } from "./fields.ts";
import { LEETCODE_TOPIC, NOTES } from "./notes.ts";
import type { Field } from "./schema.ts";
import type { Doc, Kind } from "./types.ts";

type SeedDoc = { id: string; kind: Kind; collection?: string; data: Record<string, unknown> };
type Get = (id: string) => Doc | undefined;

/** The collection LeetCode kept from M2 to M14. */
const LEETCODE = "leetcode";

/** The one note every problem is written into; fixed, so the migration can never write two. */
export const LEETCODE_NOTE = "note-leetcode";

/** Keys the line shows in its own place, and the refs to retired Projects (archived by 24). */
const PLACED = new Set(["number", "difficulty", "topic", "status", "project", "part"]);

/** Statuses the checkbox already says: still open, or done. */
const BOXED = new Set(["queued", "solved"]);

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Text that stays plain on one Markdown line: line breaks flattened, and every character that
 * would start a mark, a link, a wikilink, code or a tag escaped (`==` is the Cave's highlight).
 */
export function inline(text: string): string {
  return text
    .replace(/\s*\n\s*/g, " ")
    .replace(/[\\`*_[\]<~]/g, "\\$&")
    .replace(/=(?==)|(?<==)=/g, "\\=");
}

// A destination with a space or an unbalanced parenthesis would end the link early.
const IN_LINK: Record<string, string> = { "(": "%28", ")": "%29" };
const linkTarget = (url: string) =>
  url.replace(/[\s()<>\\]/g, (c) => IN_LINK[c] ?? encodeURIComponent(c));

/** `text` without a leading zero-padded `number` and its separator: "0013 Roman" → "Roman". */
function withoutNumber(text: string, number: unknown): string {
  const match = /^0*(\d+)(?:\s*[.:)\-–—]\s*|\s+)(?=\S)/.exec(text);
  return match && Number(match[1]) === number ? text.slice(match[0].length) : text;
}

const nameOf = (problem: Doc) =>
  withoutNumber(str(problem.data._title), problem.data.number) || "Untitled problem";

const same = (a: string, b: string) =>
  a.replace(/\s+/g, " ").toLowerCase() === b.replace(/\s+/g, " ").toLowerCase();

/** The problem's own text, unless it is only a heading repeating its name, as most are. */
function ownText(problem: Doc, name: string): string {
  const raw = typeof problem.data._body === "string" ? problem.data._body : "";
  // Leading blank lines go; a first line's own indent stays, it can mean code.
  const body = raw
    .replace(/\r\n?/g, "\n")
    .replace(/^(?:[ \t]*\n)+/, "")
    .trimEnd();
  // One line only: `.` stops at a line break and `$` is the end of the text.
  const heading = /^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?$/.exec(body);
  if (!heading) return body;
  const text = (heading[1] ?? "").trim();
  const repeats = [text, withoutNumber(text, problem.data.number)].some((t) => same(t, name));
  return repeats ? "" : body;
}

/**
 * One problem as a task line: `- [x] ` when solved, else `- [ ] `, then its number, its name
 * (a link when it has a safe URL), its difficulty, any status the box doesn't say, and every
 * other non-empty field as `Name: value`. Its own text follows, indented into the item.
 */
function problemLine(problem: Doc, fields: readonly Field[], get: Get): string {
  const { data } = problem;
  const fieldOf = (id: string) => fields.find((f) => f.id === id);
  const shown = (id: string) => valueText(fieldOf(id), data[id], get);
  const name = nameOf(problem);
  const url = str(data.url);
  const linked = isSafeUrl(url);
  const skip = (key: string) => PLACED.has(key) || (linked && key === "url");
  const named = new Set(fields.map((f) => f.id));
  const extras = [
    ...fields.filter((f) => !skip(f.id)).map((f) => [f.name || f.id, f.id] as const),
    ...Object.keys(data)
      .filter((k) => !k.startsWith("_") && !named.has(k) && !skip(k))
      .sort()
      .map((k) => [k, k] as const),
  ].flatMap(([label, key]) => {
    const text = shown(key);
    return text === undefined ? [] : [`${inline(label)}: ${inline(text)}`];
  });
  const plain = (s: string | undefined) => (s === undefined ? [] : [inline(s)]);
  const parts = [
    ...plain(shown("number")),
    linked ? `[${inline(name)}](${linkTarget(url)})` : inline(name),
    ...plain(shown("difficulty")),
    ...plain(BOXED.has(str(data.status)) ? undefined : shown("status")),
    ...extras,
  ];
  const line = `- [${data.status === "solved" ? "x" : " "}] ${parts.join(" · ")}`;
  const own = ownText(problem, name);
  if (!own) return line;
  // A blank line, then two spaces: the text is the item's own block, not more of its line.
  const indented = own.split("\n").map((l) => (l.trim() ? `  ${l}` : ""));
  return [line, "", ...indented].join("\n");
}

const byCreatedThenNumber = (a: Doc, b: Doc) => {
  const [ca, cb] = [str(a.data._created), str(b.data._created)];
  if (ca !== cb) return !ca ? 1 : !cb ? -1 : ca < cb ? -1 : 1;
  const num = (d: Doc) => (typeof d.data.number === "number" ? d.data.number : Infinity);
  return num(a) - num(b) || a.id.localeCompare(b.id);
};

/**
 * The LeetCode note's Markdown: the problems by creation, then number, in one `##` group per
 * topic (case ignored, in order of first appearance; none is Other), a task line each.
 */
export function leetcodeBody(problems: readonly Doc[], fields: readonly Field[], get: Get): string {
  const groups = new Map<string, { heading: string; lines: string[] }>();
  for (const problem of [...problems].sort(byCreatedThenNumber)) {
    const topic = str(problem.data.topic).replace(/\s+/g, " ") || "Other";
    const key = topic.toLowerCase();
    const group = groups.get(key) ?? {
      heading: topic.charAt(0).toUpperCase() + topic.slice(1),
      lines: [],
    };
    group.lines.push(problemLine(problem, fields, get));
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((g) => [`## ${inline(g.heading)}`, "", ...g.lines].join("\n"))
    .join("\n\n");
}

/**
 * Seed migration 27 (M15): LeetCode is one note. Every live problem becomes a task line in the
 * note "LeetCode" (topic LeetCode), every field it had kept on its line, so nothing is lost; the
 * problems and the collection are marked deleted, never removed, as migrations 24 and 26 did,
 * so undo still works. A note already at `note-leetcode` is the owner's and is never written
 * over. Pending proposals naming a problem are left alone: one note now stands for every
 * problem, so pointing a delete at it would delete them all. A database with no live
 * `leetcode` collection gets nothing, so a second run, or a fresh seed, writes nothing.
 */
export function leetcodeToNotesMigration(
  get: Get,
  items: (collection: string) => Doc[],
): SeedDoc[] {
  const collection = get(LEETCODE);
  if (collection?.kind !== "collection" || collection.data._deleted === true) return [];
  const fields = resolveFields(fieldsOf(collection), get);
  const problems = items(LEETCODE).filter((p) => p.data._deleted !== true);
  const docs: SeedDoc[] = [];
  if (problems.length > 0 && !get(LEETCODE_NOTE)) {
    const created = problems
      .map((p) => str(p.data._created))
      .filter(Boolean)
      .sort()[0];
    docs.push({
      id: LEETCODE_NOTE,
      kind: "item",
      collection: NOTES,
      data: {
        _title: "LeetCode",
        _body: leetcodeBody(problems, fields, get),
        ...(created ? { _created: created } : {}),
        folder: LEETCODE_TOPIC,
        source: "owner",
      },
    });
  }
  for (const p of problems)
    docs.push({ id: p.id, kind: "item", collection: LEETCODE, data: { _deleted: true } });
  docs.push({ id: LEETCODE, kind: "collection", data: { _deleted: true } });
  return docs;
}
