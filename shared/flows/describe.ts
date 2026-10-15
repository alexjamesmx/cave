import { type FlowDefinition, specOf } from "./registry.ts";

/** One line for the trigger, then one per step: the approval notice, the cards, the agent's view. */
export function describeFlow(def: FlowDefinition): string[] {
  const line = (kind: "trigger" | "step", part: { type: string }) =>
    specOf(kind, part.type)?.describe(part as Record<string, unknown>) ?? part.type;
  return [line("trigger", def.trigger), ...def.steps.map((s) => line("step", s))];
}
