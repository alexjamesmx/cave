import { localDateTime } from "../shared/dates.ts";
import {
  activeFields,
  fieldsOf,
  formatFieldErrors,
  resolvedFieldsOf,
  validateFields,
} from "../shared/fields.ts";
import { FLOWS } from "../shared/flows/seed.ts";
import { Hlc } from "../shared/hlc.ts";
import { newId } from "../shared/ids.ts";
import { PAYMENTS, paidPatch } from "../shared/payments.ts";
import { complete, repeatOf, zoneOf } from "../shared/reminders.ts";
import { RUNS } from "../shared/runs.ts";
import type { CollectionData } from "../shared/schema.ts";
import { completeTask } from "../shared/tasks.ts";
import type { Doc } from "../shared/types.ts";
import type { Agent } from "./agents.ts";
import type { Store } from "./store.ts";

export const MAX_TITLE_CHARS = 500;
export const MAX_BODY_BYTES = 100 * 1024;
export const PROPOSALS = "proposals";
const REMINDERS = "reminders";

export interface AgentPatch {
  title?: string | undefined;
  body?: string | undefined;
  fields?: Record<string, unknown> | undefined;
}

export type WriteResult = { ok: true; id: string; seqs: number[] } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const live = (doc: Doc | undefined): doc is Doc => doc !== undefined && doc.data._deleted !== true;

/**
 * The one visibility rule for agents, on every read and write path: a live collection,
 * inside the agent's allowlist, not hidden and not the proposals queue. Anything else is
 * answered as "not found".
 */
export function visibleCollectionDoc(store: Store, agent: Agent, id: string): Doc | undefined {
  const doc = store.get(id);
  if (doc?.kind !== "collection" || doc.data._deleted === true) return undefined;
  if (id === PROPOSALS || (doc.data as CollectionData).hidden === true) return undefined;
  if (agent.collections !== null && !agent.collections.includes(id)) return undefined;
  return doc;
}

/**
 * Turns an agent's patch into a stamped doc and stores it as `agent:<name>`. Devices get it
 * through the normal pull. Agents write only active fields, `_title` and `_body`; anything
 * else is refused with a reason the agent can pass on.
 */
export class AgentWriter {
  constructor(
    private readonly store: Store,
    private readonly agent: Agent,
    private readonly clock: Hlc,
    private readonly now: () => number,
  ) {}

  /** One clock per agent for the life of the process, so its stamps never repeat. */
  static clockFor(clocks: Map<string, Hlc>, agent: Agent, now: () => number): Hlc {
    let clock = clocks.get(agent.name);
    if (!clock) {
      clock = new Hlc(`agent-${agent.name}`, now);
      clocks.set(agent.name, clock);
    }
    return clock;
  }

  create(collection: string, patch: AgentPatch): WriteResult {
    const target = visibleCollectionDoc(this.store, this.agent, collection);
    if (!target) return fail(`collection ${collection} not found`);
    if (!patch.title?.trim()) return fail("title is required");
    const data = this.toData(target, patch);
    if (!data.ok) return data;
    const now = this.now();
    const id = newId(now);
    return this.apply(undefined, {
      id,
      kind: "item",
      collection,
      data: { _created: new Date(now).toISOString(), ...data.value },
    });
  }

  update(id: string, patch: AgentPatch): WriteResult {
    const doc = this.visibleItem(id);
    if (!doc.ok) return doc;
    const collection = this.store.get(doc.value.collection as string);
    const data = this.toData(collection, patch);
    if (!data.ok) return data;
    if (doc.value.collection === REMINDERS) data.value = this.completing(doc.value, data.value);
    if (doc.value.collection === "tasks") data.value = this.completingTask(doc.value, data.value);
    // Only keys whose value actually changes are written, so the log shows real edits.
    const changed = Object.fromEntries(
      Object.entries(data.value).filter(
        ([key, value]) => JSON.stringify(doc.value.data[key]) !== JSON.stringify(value),
      ),
    );
    if (Object.keys(changed).length === 0) return { ok: true, id, seqs: [] };
    return this.apply(doc.value, { ...doc.value, data: changed });
  }

  /** The only way an agent asks for a delete: a pending proposal the owner decides on. */
  proposeDelete(id: string, reason: string): WriteResult {
    const doc = this.visibleItem(id);
    if (!doc.ok) return doc;
    if (!reason.trim()) return fail("reason is required");
    const title = typeof doc.value.data._title === "string" ? doc.value.data._title : id;
    const data = {
      _title: `Delete “${title}”`.slice(0, MAX_TITLE_CHARS),
      target: id,
      action: "delete",
      reason: reason.trim(),
      agent: this.agent.name,
      status: "pending",
    };
    const errors = validateFields(fieldsOf(this.store.get(PROPOSALS)), data);
    if (errors.length > 0) return fail(formatFieldErrors(errors));
    const now = this.now();
    return this.apply(undefined, {
      id: newId(now),
      kind: "item",
      collection: PROPOSALS,
      data: { _created: new Date(now).toISOString(), ...data },
    });
  }

  /**
   * The flows collection is hidden from every other write; `save_flow` decides the status
   * and checks the flow's reach first, then writes here.
   */
  writeFlow(current: Doc | undefined, data: Record<string, unknown>): WriteResult {
    const errors = validateFields(activeFields(fieldsOf(this.store.get(FLOWS))), data);
    if (errors.length > 0) return fail(formatFieldErrors(errors));
    if (current) {
      const changed = Object.fromEntries(
        Object.entries(data).filter(
          ([key, value]) => JSON.stringify(current.data[key]) !== JSON.stringify(value),
        ),
      );
      if (Object.keys(changed).length === 0) return { ok: true, id: current.id, seqs: [] };
      return this.apply(current, { ...current, data: changed });
    }
    const now = this.now();
    return this.apply(undefined, {
      id: newId(now),
      kind: "item",
      collection: FLOWS,
      data: { _created: new Date(now).toISOString(), ...data },
    });
  }

  /**
   * The runs collection is hidden from every other write; the run tools check that the
   * agent owns the run and that it is open, then write here. Refs are checked as on any write.
   */
  writeRun(current: Doc | undefined, data: Record<string, unknown>): WriteResult {
    const errors = validateFields(activeFields(fieldsOf(this.store.get(RUNS))), data, {
      refTarget: (id) => this.store.get(id),
    });
    if (errors.length > 0) return fail(formatFieldErrors(errors));
    if (current) return this.apply(current, { ...current, data });
    const now = this.now();
    return this.apply(undefined, {
      id: newId(now),
      kind: "item",
      collection: RUNS,
      data: { _created: new Date(now).toISOString(), ...data },
    });
  }

  /**
   * `done: true` on a repeating reminder completes it the way the app's Done does: `due`
   * moves to the next occurrence and the reminder stays open. A `due` in the same patch
   * starts the series from itself.
   */
  private completing(doc: Doc, data: Record<string, unknown>): Record<string, unknown> {
    const { done, ...rest } = data;
    const merged = { ...doc.data, ...rest };
    if (done !== true || repeatOf(merged) === "none") return data;
    if (rest.due !== undefined) delete merged._repeatFrom;
    const fallback = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const zone = zoneOf(this.store.get("settings")?.data, fallback);
    return { ...rest, ...complete({ data: merged, stamps: doc.stamps }, this.now(), zone) };
  }

  /**
   * "Paid" on a payment: the expense (validated like any agent create), then the payment's
   * next date from the recurrence engine, which may set `_repeatFrom`. One call, two writes.
   */
  markPaid(
    id: string,
    expense: { amount: number; date: string },
  ): WriteResult & {
    expense?: string;
    next?: Record<string, unknown>;
  } {
    const payment = this.visibleItem(id);
    if (!payment.ok) return payment;
    if (payment.value.collection !== PAYMENTS) return fail(`item ${id} is not a payment`);
    const d = payment.value.data;
    const text = (v: unknown) => (typeof v === "string" && v ? v : undefined);
    const created = this.create("money", {
      title: text(d._title) ?? "Payment",
      fields: {
        amount: expense.amount,
        direction: "expense",
        date: expense.date,
        ...(text(d.category) ? { category: d.category } : {}),
        ...(text(d.account) ? { account: d.account } : {}),
      },
    });
    if (!created.ok) return created;
    const fallback = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const zone = zoneOf(this.store.get("settings")?.data, fallback);
    const next = paidPatch(payment.value, this.now(), zone);
    const moved = this.apply(payment.value, { ...payment.value, data: next });
    if (!moved.ok) return moved;
    return { ok: true, id, seqs: [...created.seqs, ...moved.seqs], expense: created.id, next };
  }

  /** `status: "done"` on a repeating task moves it to its next date and keeps it open. */
  private completingTask(doc: Doc, data: Record<string, unknown>): Record<string, unknown> {
    const { status, ...rest } = data;
    const merged = { ...doc.data, ...rest };
    if (status !== "done" || repeatOf(merged) === "none") return data;
    const fallback = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const zone = zoneOf(this.store.get("settings")?.data, fallback);
    const nowLocal = localDateTime(new Date(this.now()), zone.timeZone);
    return {
      ...rest,
      ...completeTask({ data: merged, stamps: doc.stamps }, this.now(), zone, nowLocal),
    };
  }

  private visibleItem(id: string): { ok: true; value: Doc } | { ok: false; error: string } {
    const doc = this.store.get(id);
    if (
      !live(doc) ||
      doc.kind !== "item" ||
      !doc.collection ||
      !visibleCollectionDoc(this.store, this.agent, doc.collection)
    ) {
      return fail(`item ${id} not found`);
    }
    return { ok: true, value: doc };
  }

  private toData(
    collection: Doc | undefined,
    patch: AgentPatch,
  ): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
    const all = resolvedFieldsOf(collection, (id) => this.store.get(id));
    const active = activeFields(all);
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch.fields ?? {})) {
      if (key.startsWith("_")) return fail(`${key} cannot be set by an agent`);
      if (!active.some((f) => f.id === key)) {
        const archived = all.some((f) => f.id === key);
        return fail(archived ? `field ${key} was removed by the owner` : `unknown field ${key}`);
      }
      data[key] = value;
    }
    if (patch.title !== undefined) {
      if (patch.title.length > MAX_TITLE_CHARS) {
        return fail(`title is longer than ${MAX_TITLE_CHARS} characters`);
      }
      data._title = patch.title;
    }
    if (patch.body !== undefined) {
      if (new TextEncoder().encode(patch.body).length > MAX_BODY_BYTES) {
        return fail("body is larger than 100 kB");
      }
      data._body = patch.body;
    }
    const errors = validateFields(active, data, { refTarget: (id) => this.store.get(id) });
    if (errors.length > 0) return fail(formatFieldErrors(errors));
    return { ok: true, value: data };
  }

  // Observing the stored stamps first orders this edit after everything the server holds.
  private apply(current: Doc | undefined, doc: Omit<Doc, "stamps" | "actor">): WriteResult {
    for (const stamp of Object.values(current?.stamps ?? {})) this.clock.observe(stamp);
    const stamps = Object.fromEntries(Object.keys(doc.data).map((key) => [key, this.clock.next()]));
    const actor = `agent:${this.agent.name}`;
    const applied = this.store.applyChanges([{ ...doc, stamps, actor }], actor, this.now());
    return { ok: true, id: doc.id, seqs: applied.map((a) => a.seq) };
  }
}
