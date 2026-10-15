import { activeFields, fieldsOf, formatFieldErrors, validateFields } from "../../shared/fields.ts";
import { Hlc } from "../../shared/hlc.ts";
import { newId } from "../../shared/ids.ts";
import type { Doc } from "../../shared/types.ts";
import type { Store } from "../store.ts";

export type WriteResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * A flow's writes, validated like an agent's and stamped with actor `flow:<id>`, so they sync,
 * show in history, can be undone, and never trigger another flow.
 */
export function createFlowWriter(store: Store, flowId: string, now: () => number) {
  const clock = new Hlc(`flow-${flowId}`, now);
  const actor = `flow:${flowId}`;

  function check(collection: string, data: Record<string, unknown>): string | undefined {
    const target = store.get(collection);
    if (target?.kind !== "collection" || target.data._deleted === true)
      return `collection ${collection} not found`;
    const errors = validateFields(activeFields(fieldsOf(target)), data);
    return errors.length > 0 ? formatFieldErrors(errors) : undefined;
  }

  function apply(current: Doc | undefined, doc: Omit<Doc, "stamps" | "actor">): string {
    for (const stamp of Object.values(current?.stamps ?? {})) clock.observe(stamp);
    const stamps = Object.fromEntries(Object.keys(doc.data).map((key) => [key, clock.next()]));
    store.applyChanges([{ ...doc, stamps, actor }], actor, now());
    return doc.id;
  }

  return {
    create(collection: string, data: Record<string, unknown>): WriteResult {
      const error = check(collection, data);
      if (error) return { ok: false, error };
      const id = newId(now());
      apply(undefined, {
        id,
        kind: "item",
        collection,
        data: { _created: new Date(now()).toISOString(), ...data },
      });
      return { ok: true, id };
    },
    update(doc: Doc, data: Record<string, unknown>): WriteResult {
      const error = check(doc.collection as string, data);
      if (error) return { ok: false, error };
      return {
        ok: true,
        id: apply(doc, { id: doc.id, kind: doc.kind, collection: doc.collection, data }),
      };
    },
  };
}
export type FlowWriter = ReturnType<typeof createFlowWriter>;
