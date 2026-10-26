import { z } from "zod";
import { isSenderName, MAX_RECIPIENTS, parseRecipients } from "../notifications.ts";
import { templateErrors } from "./templates.ts";

/**
 * Flow triggers and steps, each described once by its parameters. The validation schema,
 * the MCP tool's schema and the editor's forms are all built from these, so a new trigger or
 * step is one entry here, its engine handler, and its tests.
 */

export const OPS = ["=", "!=", ">", ">=", "<", "<=", "contains", "empty", "not-empty"] as const;
type Op = (typeof OPS)[number];
export const EVERY = ["day", "week", "month", "year"] as const;
const OPEN = ["trigger-item", "created-item", "calendar"] as const;

/** A parameter's kind decides both its schema and the editor's input for it. */
type ParamKind =
  | "collection"
  | "field"
  | "value"
  | "template"
  | "recipients"
  | "name"
  | "time"
  | "int"
  | "enum"
  | "conditions"
  | "fields";

export interface ParamSpec {
  key: string;
  label: string;
  kind: ParamKind;
  optional?: boolean;
  /** For `enum`. */
  options?: readonly string[];
  /** For `int`; for `template`, the longest text (500 by default). */
  min?: number;
  max?: number;
  /** For `template`: a multi-line text, such as an email's message. */
  long?: boolean;
}

interface TypeSpec {
  type: string;
  label: string;
  params: ParamSpec[];
  /** Reaches outside creating new things: changes existing items, or leaves the Cave. */
  sensitive: boolean;
  describe(params: Record<string, unknown>): string;
}

const ID = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "an id");
const SCALAR = z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]);
const template = (max = 500) =>
  z
    .string()
    .max(max)
    .superRefine((value, ctx) => {
      for (const error of templateErrors(value)) ctx.addIssue({ code: "custom", message: error });
    });
const TEMPLATE = template();
const CONDITION = z
  .object({ field: ID, op: z.enum(OPS), value: SCALAR.optional() })
  .strict()
  .refine((c) => c.op === "empty" || c.op === "not-empty" || c.value !== undefined, {
    message: "this operator needs a value",
  });
const FIELD_VALUES = z.record(ID, z.union([TEMPLATE, z.number().finite(), z.boolean(), z.null()]));

function paramSchema(p: ParamSpec): z.ZodType {
  switch (p.kind) {
    case "collection":
    case "field":
      return ID;
    case "value":
      return SCALAR;
    case "template":
      return template(p.max);
    case "recipients":
      return z
        .string()
        .max(400)
        .refine((v) => parseRecipients(v) !== undefined, {
          message: `up to ${MAX_RECIPIENTS} email addresses, separated by commas`,
        });
    case "name":
      return z.string().refine(isSenderName, { message: "a short name, one line" });
    case "time":
      return z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:mm");
    case "int":
      return z
        .number()
        .int()
        .min(p.min ?? 0)
        .max(p.max ?? Number.MAX_SAFE_INTEGER);
    case "enum":
      return z.enum(p.options as [string, ...string[]]);
    case "conditions":
      return z.array(CONDITION).max(10);
    case "fields":
      return FIELD_VALUES;
  }
}

/** The zod schema of one trigger or step: `{ type, ...params }`, nothing else allowed. */
export function schemaOf(spec: TypeSpec) {
  const shape: Record<string, z.ZodType> = { type: z.literal(spec.type) };
  for (const p of spec.params)
    shape[p.key] = p.optional ? paramSchema(p).optional() : paramSchema(p);
  return z.object(shape).strict();
}

const conditionsText = (all: unknown) =>
  ((all as { field: string; op: string; value?: unknown }[] | undefined) ?? [])
    .map((c) => `${c.field} ${c.op}${c.value === undefined ? "" : ` ${String(c.value)}`}`)
    .join(" and ");

export const TRIGGERS: TypeSpec[] = [
  {
    type: "schedule",
    label: "On a schedule",
    sensitive: false,
    params: [
      { key: "every", label: "Every", kind: "enum", options: EVERY },
      { key: "at", label: "At", kind: "time" },
      {
        key: "weekday",
        label: "Weekday (0 = Sunday)",
        kind: "int",
        min: 0,
        max: 6,
        optional: true,
      },
      { key: "day", label: "Day of the month", kind: "int", min: 1, max: 31, optional: true },
      { key: "month", label: "Month", kind: "int", min: 1, max: 12, optional: true },
    ],
    describe: (p) =>
      `Every ${p.every}${p.month ? ` in month ${p.month}` : ""}${p.day ? ` on day ${p.day}` : ""}${
        p.weekday !== undefined ? ` on weekday ${p.weekday}` : ""
      } at ${p.at}`,
  },
  {
    type: "item-added",
    label: "When an item is added",
    sensitive: false,
    params: [
      { key: "collection", label: "Collection", kind: "collection" },
      { key: "where", label: "Where", kind: "conditions", optional: true },
    ],
    describe: (p) =>
      `When an item is added to ${p.collection}${p.where ? ` where ${conditionsText(p.where)}` : ""}`,
  },
  {
    type: "item-changed",
    label: "When a field changes",
    sensitive: false,
    params: [
      { key: "collection", label: "Collection", kind: "collection" },
      { key: "field", label: "Field", kind: "field" },
      { key: "to", label: "To", kind: "value", optional: true },
    ],
    describe: (p) =>
      `When ${p.field} changes in ${p.collection}${p.to === undefined ? "" : ` to ${String(p.to)}`}`,
  },
];

export const STEPS: TypeSpec[] = [
  {
    type: "if",
    label: "If",
    sensitive: false,
    params: [{ key: "all", label: "All of", kind: "conditions" }],
    describe: (p) => `If ${conditionsText(p.all)}, else stop`,
  },
  {
    type: "create",
    label: "Create an item",
    sensitive: false,
    params: [
      { key: "collection", label: "Collection", kind: "collection" },
      { key: "title", label: "Title", kind: "template" },
      { key: "fields", label: "Fields", kind: "fields", optional: true },
    ],
    describe: (p) => `Create “${p.title}” in ${p.collection}`,
  },
  {
    type: "update-trigger-item",
    label: "Change the trigger item",
    sensitive: true,
    params: [{ key: "fields", label: "Fields", kind: "fields" }],
    describe: (p) => `Change the trigger item: ${Object.keys(p.fields ?? {}).join(", ")}`,
  },
  {
    type: "notify",
    label: "Notify",
    sensitive: false,
    params: [
      { key: "title", label: "Title", kind: "template" },
      { key: "body", label: "Body", kind: "template", optional: true },
      { key: "open", label: "Opens", kind: "enum", options: OPEN },
    ],
    describe: (p) => `Notify “${p.title}”`,
  },
  {
    type: "email",
    label: "Send an email",
    // It can write to anyone, so an agent's flow with it waits for the owner.
    sensitive: true,
    params: [
      { key: "to", label: "To", kind: "recipients", optional: true },
      { key: "fromName", label: "From name", kind: "name", optional: true },
      { key: "subject", label: "Subject", kind: "template" },
      { key: "body", label: "Message", kind: "template", max: 4000, long: true },
    ],
    describe: (p) => `Email “${p.subject}” to ${typeof p.to === "string" && p.to ? p.to : "you"}`,
  },
];

const union = (specs: TypeSpec[]) =>
  z.discriminatedUnion(
    "type",
    specs.map(schemaOf) as unknown as [
      ReturnType<typeof schemaOf>,
      ...ReturnType<typeof schemaOf>[],
    ],
  );

export const MAX_STEPS = 10;

/**
 * A flow definition, version 1: a closed set with no expressions and no code. A weekly
 * schedule names its weekday, a monthly one its day, a yearly one its month and day.
 */
export const FlowDefinitionSchema = z
  .object({
    version: z.literal(1),
    trigger: union(TRIGGERS),
    steps: z.array(union(STEPS)).min(1).max(MAX_STEPS),
  })
  .strict()
  .superRefine((def, ctx) => {
    const t = def.trigger as Record<string, unknown>;
    if (t.type !== "schedule") return;
    const need = { week: ["weekday"], month: ["day"], year: ["month", "day"], day: [] }[
      t.every as (typeof EVERY)[number]
    ];
    for (const key of need)
      if (t[key] === undefined)
        ctx.addIssue({
          code: "custom",
          path: ["trigger", key],
          message: `every ${t.every} needs ${key}`,
        });
  });

export interface Condition {
  field: string;
  op: Op;
  value?: string | number | boolean | null;
}
export type Trigger =
  | {
      type: "schedule";
      every: (typeof EVERY)[number];
      at: string;
      weekday?: number;
      day?: number;
      month?: number;
    }
  | { type: "item-added"; collection: string; where?: Condition[] }
  | {
      type: "item-changed";
      collection: string;
      field: string;
      to?: string | number | boolean | null;
    };
export type FieldValues = Record<string, string | number | boolean | null>;
export type Step =
  | { type: "if"; all: Condition[] }
  | { type: "create"; collection: string; title: string; fields?: FieldValues }
  | { type: "update-trigger-item"; fields: FieldValues }
  | { type: "notify"; title: string; body?: string; open: (typeof OPEN)[number] }
  | { type: "email"; to?: string; fromName?: string; subject: string; body: string };
export interface FlowDefinition {
  version: 1;
  trigger: Trigger;
  steps: Step[];
}

export function parseDefinition(
  value: unknown,
): { ok: true; value: FlowDefinition } | { ok: false; error: string } {
  const result = FlowDefinitionSchema.safeParse(value);
  if (result.success) return { ok: true, value: result.data as FlowDefinition };
  const issue = result.error.issues[0];
  return { ok: false, error: `${issue?.path.join(".") || "definition"}: ${issue?.message}` };
}

/** Any sensitive step makes the whole flow wait for the owner's approval. */
export const isSensitive = (def: FlowDefinition) =>
  def.steps.some((s) => STEPS.find((spec) => spec.type === s.type)?.sensitive === true);

export const specOf = (kind: "trigger" | "step", type: string) =>
  (kind === "trigger" ? TRIGGERS : STEPS).find((s) => s.type === type);
