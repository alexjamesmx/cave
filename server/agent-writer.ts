import { activeFields, fieldsOf, formatFieldErrors, validateFields } from "../shared/fields.ts";
import { Hlc } from "../shared/hlc.ts";
import { newId } from "../shared/ids.ts";
import type { Doc } from "../shared/types.ts";
import type { Agent } from "./agents.ts";
import type { Store } from "./store.ts";

export const MAX_TITLE_CHARS = 500;
export const MAX_BODY_BYTES = 100 * 1024;
export const PROPOSALS = "proposals";

export interface AgentPatch {
  title?: string | undefined;
  body?: string | undefined;
  fields?: Record<string, unknown> | undefined;
}

export type WriteResult = { ok: true; id: string; seqs: number[] } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const live = (doc: Doc | undefined): doc is Doc => doc !== undefined && doc.data._deleted !== true;

/** Whether an agent may see a collection: inside its allowlist and not the proposals queue. */
export const canSee = (agent: Agent, collection: string) =>
  collection !== PROPOSALS &&
  (agent.collections === null || agent.collections.includes(collection));

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
    if (!canSee(this.agent, collection)) return fail(`collection ${collection} not found`);
    const target = this.store.get(collection);
    if (target?.kind !== "collection" || !live(target)) {
      return fail(`collection ${collection} not found`);
    }
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

  private visibleItem(id: string): { ok: true; value: Doc } | { ok: false; error: string } {
    const doc = this.store.get(id);
    if (
      !live(doc) ||
      doc.kind !== "item" ||
      !doc.collection ||
      !canSee(this.agent, doc.collection)
    ) {
      return fail(`item ${id} not found`);
    }
    return { ok: true, value: doc };
  }

  private toData(
    collection: Doc | undefined,
    patch: AgentPatch,
  ): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
    const all = fieldsOf(collection);
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
    const errors = validateFields(active, data);
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
