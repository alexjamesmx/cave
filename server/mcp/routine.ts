import { fieldsOf } from "../../shared/fields.ts";
import { DAY_NAMES, routineOf } from "../../shared/routine.ts";
import { visibleCollectionDoc } from "../agent-writer.ts";
import type { Agent } from "../agents.ts";
import type { Store } from "../store.ts";
import type { ToolOutcome } from "./read.ts";

/** The routine and the diary's habits; the routine only for agents that can see everything. */
export function getRoutine(store: Store, agent: Agent): ToolOutcome {
  const journal = visibleCollectionDoc(store, agent, "journal");
  const habits = journal
    ? fieldsOf(journal)
        .filter((f) => f.type === "checkbox" && f.archived !== true)
        .map((f) => ({ id: f.id, name: f.name }))
    : [];
  if (agent.collections !== null) return { ok: true, value: { habits } };
  return {
    ok: true,
    value: {
      days: DAY_NAMES,
      blocks: routineOf(store.get("settings")?.data).blocks,
      habits,
    },
  };
}
