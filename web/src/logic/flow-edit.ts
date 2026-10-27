import {
  type FlowDefinition,
  MAX_STEPS,
  type Step,
  type Trigger,
} from "../../../shared/flows/registry.ts";
import type { Field } from "../../../shared/schema.ts";

/** Which part of a flow the editor shows: the trigger, or one step by index. */
export type Selection = "trigger" | number;

/** A new trigger or step of one type, filled with values that already validate. */
export function blankPart(kind: "trigger", type: string, collection: string): Trigger;
export function blankPart(kind: "step", type: string, collection: string): Step;
export function blankPart(
  kind: "trigger" | "step",
  type: string,
  collection: string,
): Trigger | Step {
  switch (type) {
    case "schedule":
      return { type, every: "day", at: "09:00" };
    case "item-added":
      return { type, collection };
    case "item-changed":
      return { type, collection, field: "title" };
    case "date-arrives":
      return { type, collection, field: "due" };
    case "if":
      return { type, all: [{ field: "title", op: "not-empty" }] };
    case "create":
      return { type, collection, title: "New item" };
    case "update-trigger-item":
      return { type, fields: {} };
    case "notify":
      return { type, title: "Cave", open: kind === "step" ? "trigger-item" : "calendar" };
    case "email":
      return { type, subject: "From the Cave", body: "" };
    default:
      throw new Error(`unknown ${kind} type ${type}`);
  }
}

export const blankFlow = (): FlowDefinition => ({
  version: 1,
  trigger: blankPart("trigger", "schedule", "tasks"),
  steps: [{ type: "notify", title: "Cave", open: "calendar" }],
});

/** One parameter set or, with `undefined`, removed: optional ones disappear when cleared. */
export function withParam<T extends Trigger | Step>(part: T, key: string, value: unknown): T {
  const next = { ...part } as Record<string, unknown>;
  if (value === undefined || value === "") delete next[key];
  else next[key] = value;
  return next as T;
}

export function replaceStep(def: FlowDefinition, index: number, step: Step): FlowDefinition {
  return { ...def, steps: def.steps.map((s, i) => (i === index ? step : s)) };
}

export function addStep(def: FlowDefinition, step: Step): FlowDefinition {
  return def.steps.length >= MAX_STEPS ? def : { ...def, steps: [...def.steps, step] };
}

/** A flow keeps at least one step, so the last one can't be removed. */
export function removeStep(def: FlowDefinition, index: number): FlowDefinition {
  return def.steps.length <= 1 ? def : { ...def, steps: def.steps.filter((_, i) => i !== index) };
}

export function moveStep(def: FlowDefinition, index: number, by: -1 | 1): FlowDefinition {
  const to = index + by;
  if (to < 0 || to >= def.steps.length) return def;
  const steps = [...def.steps];
  [steps[index], steps[to]] = [steps[to] as Step, steps[index] as Step];
  return { ...def, steps };
}

/** The trigger's collection: conditions and "change the trigger item" name its fields. */
export const triggerCollection = (def: FlowDefinition) =>
  def.trigger.type === "schedule" ? undefined : def.trigger.collection;

/** What `{{…}}` a flow's text may use, for the picker: the trigger item's fields first. */
export function templateTokens(def: FlowDefinition, fields: Field[]): string[] {
  const item = triggerCollection(def)
    ? [
        "item.title",
        ...fields.map((f) => `item.${f.id}`),
        ...fields
          .filter((f) => f.type === "number" || f.type === "money")
          .map((f) => `item.${f.id}|pct:20`),
      ]
    : [];
  return [...item, "today", "month"];
}

/** "Copy of …" a flow: a draft by the owner, so it never runs before it is turned on. */
export function copyData(data: Record<string, unknown>): Record<string, unknown> {
  return {
    _title: `Copy of ${String(data._title ?? "flow")}`,
    ...(typeof data._body === "string" ? { _body: data._body } : {}),
    status: "draft",
    definition: data.definition,
    author: "owner",
  };
}
