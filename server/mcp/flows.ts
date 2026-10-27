import { fieldsOf } from "../../shared/fields.ts";
import { describeFlow } from "../../shared/flows/describe.ts";
import { type FlowDefinition, isSensitive, parseDefinition } from "../../shared/flows/registry.ts";
import { FLOWS } from "../../shared/flows/seed.ts";
import type { Doc } from "../../shared/types.ts";
import { type AgentWriter, visibleCollectionDoc, type WriteResult } from "../agent-writer.ts";
import type { Agent } from "../agents.ts";
import type { Store } from "../store.ts";
import type { ToolOutcome } from "./read.ts";

export const MAX_ON_FLOWS = 20;

export interface SaveFlowArgs {
  id?: string | undefined;
  title: string;
  description?: string | undefined;
  status?: "on" | "draft" | "off" | undefined;
  definition: unknown;
}

const live = (store: Store) => store.itemsOf(FLOWS).filter((d) => d.data._deleted !== true);

/**
 * Whether a stored flow is within this agent's reach: an agent sees and replaces only flows
 * whose every collection and field it may see. One that doesn't parse is reachable only by an
 * agent without an allowlist.
 */
function reachable(store: Store, agent: Agent, flow: Doc): boolean {
  const parsed = parseDefinition(flow.data.definition);
  return parsed.ok ? !reachError(store, agent, parsed.value) : agent.collections === null;
}

/** The flows within the agent's reach, owner's included: agents edit flows by id. */
export function listFlows(store: Store, agent: Agent): ToolOutcome {
  return {
    ok: true,
    value: {
      flows: live(store)
        .filter((d) => reachable(store, agent, d))
        .map((d) => {
          const parsed = parseDefinition(d.data.definition);
          return {
            id: d.id,
            title: d.data._title ?? null,
            status: d.data.status ?? null,
            author: d.data.author ?? null,
            definition: d.data.definition ?? null,
            steps: parsed.ok ? describeFlow(parsed.value) : [],
          };
        }),
    },
  };
}

// Each collection a flow reads or writes must be one this agent may see, and each field it
// names one the collection has: a flow is never a way around the allowlist.
function reachError(store: Store, agent: Agent, def: FlowDefinition): string | undefined {
  const t = def.trigger;
  // The digest reads every collection, so it is for agents that can read them all.
  if (agent.collections !== null && def.steps.some((s) => s.type === "digest"))
    return "the digest step needs access to every collection";
  const triggerCollection = "collection" in t ? t.collection : undefined;
  const fieldIds = (collection: string) => {
    const doc = visibleCollectionDoc(store, agent, collection);
    return doc ? new Set(["title", ...fieldsOf(doc).map((f) => f.id)]) : undefined;
  };
  const check = (collection: string, fields: string[]) => {
    const ids = fieldIds(collection);
    if (!ids) return `collection ${collection} not found`;
    const unknown = fields.find((f) => !ids.has(f));
    return unknown ? `unknown field ${unknown} in ${collection}` : undefined;
  };
  if (t.type === "item-added")
    return (
      check(
        t.collection,
        (t.where ?? []).map((c) => c.field),
      ) ?? stepsError(def, triggerCollection, check)
    );
  if (t.type === "item-changed")
    return check(t.collection, [t.field]) ?? stepsError(def, triggerCollection, check);
  if (t.type === "budget-reached") return check("money", []) ?? stepsError(def, undefined, check);
  if (t.type === "date-arrives")
    return (
      check(t.collection, [t.field, ...(t.where ?? []).map((c) => c.field)]) ??
      stepsError(def, triggerCollection, check)
    );
  return stepsError(def, undefined, check);
}

function stepsError(
  def: FlowDefinition,
  triggerCollection: string | undefined,
  check: (collection: string, fields: string[]) => string | undefined,
): string | undefined {
  for (const step of def.steps) {
    const error =
      step.type === "create"
        ? check(step.collection, Object.keys(step.fields ?? {}))
        : step.type === "update-trigger-item"
          ? triggerCollection
            ? check(triggerCollection, Object.keys(step.fields))
            : "update-trigger-item needs an item trigger"
          : step.type === "if"
            ? triggerCollection
              ? check(
                  triggerCollection,
                  step.all.map((c) => c.field),
                )
              : undefined
            : undefined;
    if (error) return error;
  }
  return undefined;
}

/**
 * Creates or replaces a flow. A flow with a sensitive step waits for the owner as
 * `pending-approval`, and an agent never takes one out of that state into `on`.
 */
export function saveFlow(
  store: Store,
  agent: Agent,
  writer: AgentWriter,
  args: SaveFlowArgs,
): WriteResult & { status?: string } {
  const parsed = parseDefinition(args.definition);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const def = parsed.value;
  const reach = reachError(store, agent, def);
  if (reach) return { ok: false, error: reach };
  if (!args.title.trim()) return { ok: false, error: "title is required" };

  const current = args.id ? store.get(args.id) : undefined;
  if (
    args.id &&
    (current?.collection !== FLOWS ||
      current.data._deleted === true ||
      !reachable(store, agent, current))
  )
    return { ok: false, error: `flow ${args.id} not found` };

  const asked = args.status ?? "on";
  const status =
    asked === "on" && (isSensitive(def) || current?.data.status === "pending-approval")
      ? "pending-approval"
      : asked;
  if (status === "on") {
    const on = live(store).filter(
      (d) => d.id !== args.id && d.data.status === "on" && d.data.author === agent.name,
    );
    if (on.length >= MAX_ON_FLOWS)
      return { ok: false, error: `at most ${MAX_ON_FLOWS} flows on per agent; turn one off first` };
  }

  const data: Record<string, unknown> = {
    _title: args.title.trim(),
    status,
    definition: def,
    author: agent.name,
    ...(args.description === undefined ? {} : { _body: args.description }),
  };
  const result = writer.writeFlow(current, data);
  return result.ok ? { ...result, status } : result;
}
