import { parseStamp } from "../../../shared/hlc.ts";
import type { Doc } from "../../../shared/types.ts";

/** How the AI page shows its table: filters, a sort and its direction, kept in the URL. */
export interface AiView {
  kind?: string;
  surface?: string;
  scope?: string;
  status?: string;
  text?: string;
  sort: AiSort;
  desc: boolean;
}

const AI_SORTS = ["kind", "title", "changed", "source"] as const;
export type AiSort = (typeof AI_SORTS)[number];

const FILTERS = ["kind", "surface", "scope", "status", "text"] as const;
const text = (v: unknown) => (typeof v === "string" ? v : "");
const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const byChars = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** When an item last changed anywhere: its newest stamp. */
const changedAt = (d: Doc) => Math.max(0, ...Object.values(d.stamps).map((s) => parseStamp(s).ms));

export function viewFromSearch(search: string): AiView {
  const p = new URLSearchParams(search);
  const view: AiView = {
    sort: AI_SORTS.includes(p.get("sort") as AiSort) ? (p.get("sort") as AiSort) : "kind",
    desc: p.get("order") === "desc",
  };
  for (const k of FILTERS) {
    const v = p.get(k);
    if (v) view[k] = v;
  }
  return view;
}

export function viewToSearch(view: AiView): string {
  const p = new URLSearchParams();
  for (const k of FILTERS) if (view[k]) p.set(k, view[k] as string);
  if (view.sort !== "kind") p.set("sort", view.sort);
  if (view.desc) p.set("order", "desc");
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** The items a view shows, in its order; text matches the title, the source and the content. */
export function listAi(items: Doc[], view: AiView): Doc[] {
  const q = view.text ? norm(view.text) : "";
  const shown = items.filter(
    (d) =>
      (!view.kind || d.data.kind === view.kind) &&
      (!view.surface || d.data.surface === view.surface) &&
      (!view.scope || d.data.scope === view.scope) &&
      (!view.status || (d.data.status ?? "active") === view.status) &&
      (!q ||
        norm(`${text(d.data._title)} ${text(d.data.source)} ${text(d.data._body)}`).includes(q)),
  );
  const title = (d: Doc) => text(d.data._title) || d.id;
  const compare: Record<AiSort, (a: Doc, b: Doc) => number> = {
    kind: (a, b) =>
      text(a.data.kind).localeCompare(text(b.data.kind)) || title(a).localeCompare(title(b)),
    title: (a, b) => title(a).localeCompare(title(b)),
    // Newest first reads naturally; "desc" turns it to oldest first.
    changed: (a, b) => changedAt(b) - changedAt(a) || title(a).localeCompare(title(b)),
    // Paths sort by plain character order, the same on every machine.
    source: (a, b) =>
      byChars(text(a.data.source), text(b.data.source)) || title(a).localeCompare(title(b)),
  };
  const sorted = [...shown].sort(compare[view.sort]);
  return view.desc ? sorted.reverse() : sorted;
}
