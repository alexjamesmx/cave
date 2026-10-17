import { transferCategories } from "../../shared/categories.ts";
import { dayOf, localDate } from "../../shared/dates.ts";
import { activeFields, fieldsOf, offeredOptions, resolvedFieldsOf } from "../../shared/fields.ts";
import { monthSummary, undatedSummary } from "../../shared/money.ts";
import type { CollectionData, Field } from "../../shared/schema.ts";
import type { Doc } from "../../shared/types.ts";
import { visibleCollectionDoc } from "../agent-writer.ts";
import type { Agent } from "../agents.ts";
import type { Store } from "../store.ts";

export type ToolOutcome =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string };

export const QUERY_LIMIT = 50;
export const QUERY_MAX = 200;
const EXCERPT_CHARS = 280;
const HISTORY = 20;

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const text = (v: unknown) => (typeof v === "string" ? v : "");

/** A collection the agent may see, with its active fields; anything else is "not found". */
function visibleCollection(store: Store, agent: Agent, id: string) {
  const doc = visibleCollectionDoc(store, agent, id);
  if (!doc) return undefined;
  return {
    doc,
    data: doc.data as CollectionData,
    fields: activeFields(resolvedFieldsOf(doc, store.get)),
  };
}

const fieldValues = (doc: Doc, fields: Field[]) =>
  Object.fromEntries(
    fields.filter((f) => doc.data[f.id] !== undefined).map((f) => [f.id, doc.data[f.id]]),
  );

const describeField = (f: Field) => ({
  id: f.id,
  name: f.name,
  type: f.type,
  ...(f.options ? { options: offeredOptions(f).map((o) => o.value) } : {}),
  ...(f.config?.withTime ? { withTime: true } : {}),
});

export function listCollections(store: Store, agent: Agent): ToolOutcome {
  const collections = store
    .collections()
    .map((doc) => visibleCollection(store, agent, doc.id))
    .filter((c) => c !== undefined)
    .sort((a, b) => a.data.order - b.data.order)
    .map((c) => ({
      id: c.doc.id,
      name: c.data.name,
      fields: c.fields.map(describeField),
      items: store.itemsOf(c.doc.id).length,
    }));
  return { ok: true, value: { collections } };
}

export interface QueryInput {
  collection: string;
  where?: Record<string, string | number | boolean | null> | undefined;
  from?: string | undefined;
  to?: string | undefined;
  text?: string | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
}

export function query(store: Store, agent: Agent, input: QueryInput): ToolOutcome {
  const c = visibleCollection(store, agent, input.collection);
  if (!c) return fail(`collection ${input.collection} not found`);
  for (const key of Object.keys(input.where ?? {})) {
    if (!c.fields.some((f) => f.id === key)) return fail(`unknown field ${key}`);
  }
  const offset = input.cursor === undefined ? 0 : Number(input.cursor);
  if (!Number.isSafeInteger(offset) || offset < 0) return fail("bad cursor");
  const limit = Math.min(input.limit ?? QUERY_LIMIT, QUERY_MAX);
  const dateField = c.fields.find((f) => f.type === "date")?.id;
  const needle = input.text?.toLowerCase();

  const matches = store
    .itemsOf(c.doc.id)
    .filter((doc) =>
      Object.entries(input.where ?? {}).every(([key, value]) => (doc.data[key] ?? null) === value),
    )
    .filter((doc) => {
      if (!input.from && !input.to) return true;
      const day = dateField ? dayOf(doc.data[dateField]) : undefined;
      if (!day) return false;
      return (!input.from || day >= input.from) && (!input.to || day <= input.to);
    })
    .filter(
      (doc) =>
        !needle ||
        text(doc.data._title).toLowerCase().includes(needle) ||
        text(doc.data._body).toLowerCase().includes(needle),
    );
  const sortKey = (doc: Doc) =>
    `${(dateField && text(doc.data[dateField])) || ""}|${text(doc.data._created)}|${doc.id}`;
  matches.sort((a, b) => sortKey(b).localeCompare(sortKey(a)));

  const page = matches.slice(offset, offset + limit);
  const items = page.map((doc) => ({
    id: doc.id,
    title: text(doc.data._title),
    fields: fieldValues(doc, c.fields),
    ...(doc.data._body ? { excerpt: text(doc.data._body).slice(0, EXCERPT_CHARS) } : {}),
  }));
  const next = offset + page.length < matches.length ? String(offset + page.length) : null;
  return { ok: true, value: { total: matches.length, items, nextCursor: next } };
}

export function getItem(store: Store, agent: Agent, id: string): ToolOutcome {
  const doc = store.get(id);
  const c = doc?.collection ? visibleCollection(store, agent, doc.collection) : undefined;
  if (doc?.kind !== "item" || doc.data._deleted === true || !c) {
    return fail(`item ${id} not found`);
  }
  const changes = store
    .changesFor(id, HISTORY)
    .map(({ seq, actor, at, keys }) => ({ seq, actor, at: new Date(at).toISOString(), keys }));
  return {
    ok: true,
    value: {
      id,
      collection: doc.collection,
      title: text(doc.data._title),
      body: text(doc.data._body),
      created: text(doc.data._created),
      data: doc.data,
      changes,
    },
  };
}

export function moneyMonth(store: Store, agent: Agent, month: string, now: number): ToolOutcome {
  if (!visibleCollection(store, agent, "money")) return fail("collection money not found");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return fail("month must be YYYY-MM");
  const timeZone = store.get("settings")?.data.timezone;
  const today = localDate(new Date(now), typeof timeZone === "string" ? timeZone : undefined);
  const entries = store.itemsOf("money");
  const categories = fieldsOf(store.get("money")).find((f) => f.id === "category");
  const s = monthSummary(entries, month, today, transferCategories(categories));
  const undated = undatedSummary(entries);
  const brief = (e: (typeof s.expenses)[number]) => ({
    id: e.doc.id,
    title: text(e.doc.data._title),
    day: e.day,
    amount: e.amount,
    category: e.category,
  });
  return {
    ok: true,
    value: {
      month,
      income: s.income,
      spent: s.spent,
      net: s.net,
      incomeCount: s.incomeCount,
      spentCount: s.spentCount,
      burnPerDay: s.burnPerDay ?? null,
      byCategory: s.byCategory,
      largestExpenses: s.expenses.slice(0, 10).map(brief),
      incomplete: s.incomplete.length,
      // Undated transactions belong to no month: reported apart, never counted by guess.
      undated: undated.count,
      undatedAmount: undated.amount,
      transferred: s.transferred,
      transferCount: s.transfers.length,
    },
  };
}
