import { fieldsOf } from "./fields.ts";
import { REMINDER_TITLE } from "./flows/built-in.ts";
import type { Field } from "./schema.ts";
import type { Doc, Kind } from "./types.ts";

type SeedDoc = { id: string; kind: Kind; collection?: string; data: Record<string, unknown> };
type Get = (id: string) => Doc | undefined;

/** The collection payments lived in from M7b to M15. */
const PAYMENTS = "payments";
const REMINDERS = "reminders";
const FLOW_REMINDERS = "flow-reminders";
const FLOW_PAYMENTS = "flow-payments";

/** A transaction's payment (M7c, seed migration 11); archived by migration 28, values kept. */
export const MONEY_PAYMENT_REF: Field = {
  id: "payment",
  name: "Payment",
  type: "ref",
  config: { collection: PAYMENTS },
};

/** Seed migration 11: money gains the `payment` ref when it hasn't one. Items are untouched. */
export function paymentLinkMigration(get: Get): SeedDoc[] {
  const money = get("money");
  const fields = money?.kind === "collection" ? money.data.fields : undefined;
  if (!Array.isArray(fields) || money?.data._deleted === true) return [];
  if ((fields as Field[]).some((f) => f.id === MONEY_PAYMENT_REF.id)) return [];
  return [{ id: "money", kind: "collection", data: { fields: [...fields, MONEY_PAYMENT_REF] } }];
}

/** A reminder's lead-up (`shared/lead.ts`), set in its form. */
export const LEAD_FIELDS: Field[] = [
  { id: "lead_days", name: "Start reminding", type: "number" },
  { id: "lead_every", name: "Every", type: "number" },
];

const KIND_LABEL: Record<string, string> = {
  subscription: "Subscription",
  card: "Card",
  bill: "Bill",
  loan: "Loan",
  other: "Other",
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/**
 * The reminder a payment becomes: its title, date and repeat, its kind as the note, done when
 * it was inactive. Amount, category and account stay on the deleted payment: a reminder is
 * not money, and an agent allowed reminders but not payments must not read them.
 */
function reminderFrom(p: Doc): SeedDoc {
  const d = p.data;
  const active = d.active !== false;
  const kind = KIND_LABEL[String(d.kind)];
  return {
    id: `rem-${p.id}`,
    kind: "item",
    collection: REMINDERS,
    data: {
      _title: str(d._title) ?? "Payment",
      ...(kind ? { _body: kind } : {}),
      ...(str(d._created) ? { _created: d._created } : {}),
      ...(str(d.due) ? { due: d.due } : {}),
      ...(str(d._repeatFrom) ? { _repeatFrom: d._repeatFrom } : {}),
      repeat: str(d.repeat) ?? "none",
      done: !active,
      // Bills used to warn the day before; subscriptions didn't.
      ...(active && d.kind !== "subscription" ? { lead_days: 1, lead_every: 1 } : {}),
    },
  };
}

/** The reminders collection with the lead-up fields, when it lacks them. */
function leadFields(get: Get): SeedDoc[] {
  const reminders = get(REMINDERS);
  if (reminders?.kind !== "collection" || reminders.data._deleted === true) return [];
  const fields = fieldsOf(reminders);
  const missing = LEAD_FIELDS.filter((l) => !fields.some((f) => f.id === l.id));
  return missing.length > 0
    ? [{ id: REMINDERS, kind: "collection", data: { fields: [...fields, ...missing] } }]
    : [];
}

/** The reminder flow's title gains `{{lead}}`, unless the owner changed it. */
function reminderTitle(get: Get): SeedDoc[] {
  const flow = get(FLOW_REMINDERS);
  const definition = flow?.data.definition as { steps?: { title?: string }[] } | undefined;
  const step = definition?.steps?.[0];
  if (flow?.data._deleted === true || !definition?.steps || step?.title !== "{{item.title}}")
    return [];
  const steps = definition.steps.map((s, i) => (i === 0 ? { ...s, title: REMINDER_TITLE } : s));
  return [
    {
      id: FLOW_REMINDERS,
      kind: "item",
      collection: "flows",
      data: { definition: { ...definition, steps } },
    },
  ];
}

/**
 * Seed migration 28 (M16): payments retire, subscriptions included; each live one becomes a
 * reminder (`rem-<id>`) and is marked deleted, so undo still works. The collection and the
 * bill flow are marked deleted and money's `payment` ref is archived, its values kept.
 * Reminders gain the lead-up fields and the reminder flow says how far a date is. A database
 * without a live `payments` collection only gets those last two, so a second run writes nothing.
 */
export function paymentsToRemindersMigration(
  get: Get,
  items: (collection: string) => Doc[],
): SeedDoc[] {
  const docs = [...leadFields(get), ...reminderTitle(get)];
  const payments = get(PAYMENTS);
  if (payments?.kind !== "collection" || payments.data._deleted === true) return docs;
  for (const p of items(PAYMENTS).filter((p) => p.data._deleted !== true)) {
    // A doc already at the reminder's id is someone else's: that payment stays as it is.
    if (get(`rem-${p.id}`)) continue;
    docs.push(reminderFrom(p));
    docs.push({ id: p.id, kind: "item", collection: PAYMENTS, data: { _deleted: true } });
  }
  docs.push({ id: PAYMENTS, kind: "collection", data: { _deleted: true } });
  const flow = get(FLOW_PAYMENTS);
  if (flow && flow.data._deleted !== true)
    docs.push({ id: FLOW_PAYMENTS, kind: "item", collection: "flows", data: { _deleted: true } });
  const money = get("money");
  const moneyFields = money?.kind === "collection" ? fieldsOf(money) : [];
  if (moneyFields.some((f) => f.id === MONEY_PAYMENT_REF.id && f.archived !== true))
    docs.push({
      id: "money",
      kind: "collection",
      data: {
        fields: moneyFields.map((f) =>
          f.id === MONEY_PAYMENT_REF.id ? { ...f, archived: true } : f,
        ),
      },
    });
  return docs;
}
