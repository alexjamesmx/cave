import { dayOf } from "./dates.ts";
import type { Doc } from "./types.ts";

/**
 * Turns the money history into subscription proposals (M7c part 6): the same title, amounts
 * within ±15% of their median, at monthly or yearly spacing. Past charges stay transactions;
 * a proposal links them to a subscription payment, new or existing. Nothing is written until
 * the owner approves, and each value is filled in only when the history shows it.
 */

export interface ProposedCharge {
  id: string;
  day: string;
  amount: number;
}

export interface SubscriptionProposal {
  key: string;
  title: string;
  /** An existing subscription payment the charges attach to; otherwise a new one is proposed. */
  attachTo?: string;
  /** For a new payment: the latest charge. */
  amount: number;
  /** Only with at least three regular intervals. */
  repeat?: "monthly" | "yearly";
  /** Only when it follows from the repeat and the last charge; else "Needs date". */
  due?: string;
  /** Only when every charge has the same one. */
  account?: string;
  /** Oldest first. */
  charges: ProposedCharge[];
}

const TOLERANCE = 0.15;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHLY = { min: 25, max: 35 } as const;
const YEARLY = { min: 350, max: 380 } as const;

export const normTitle = (s: unknown) =>
  typeof s === "string"
    ? s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim()
    : "";

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
};

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

function addPeriod(day: string, repeat: "monthly" | "yearly"): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const months = repeat === "monthly" ? 1 : 12;
  const index = y * 12 + (m - 1) + months;
  const ny = Math.floor(index / 12);
  const nm = (index % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** Charges three regular intervals apart at least: enough to say how often it repeats. */
const REPEAT_AFTER = 3;

export function subscriptionProposals(
  money: readonly Doc[],
  payments: readonly Doc[],
  dismissed: ReadonlySet<string> = new Set(),
): SubscriptionProposal[] {
  const live = payments.filter((p) => p.data._deleted !== true);
  const subscriptions = new Map(
    live.filter((p) => p.data.kind === "subscription").map((p) => [normTitle(p.data._title), p.id]),
  );
  // A payment of another kind with the same title is the owner's call; it is left alone.
  const otherKinds = new Set(
    live.filter((p) => p.data.kind !== "subscription").map((p) => normTitle(p.data._title)),
  );
  const groups = new Map<string, { doc: Doc; day: string; amount: number }[]>();
  for (const doc of money) {
    if (doc.data._deleted === true || doc.data.direction !== "expense") continue;
    if (typeof doc.data.payment === "string" && doc.data.payment) continue;
    const key = normTitle(doc.data._title);
    const day = dayOf(doc.data.date);
    const amount = doc.data.amount;
    if (!key || !day || typeof amount !== "number" || amount <= 0) continue;
    if (dismissed.has(key) || otherKinds.has(key)) continue;
    groups.set(key, [...(groups.get(key) ?? []), { doc, day, amount }]);
  }

  const found: SubscriptionProposal[] = [];
  for (const [key, all] of groups) {
    const mid = median(all.map((e) => e.amount));
    const near = all
      .filter((e) => Math.abs(e.amount - mid) <= mid * TOLERANCE)
      .sort((a, b) => a.day.localeCompare(b.day));
    const attachTo = subscriptions.get(key);
    const gaps = near.slice(1).map((e, i) => daysBetween((near[i] as { day: string }).day, e.day));
    const within = (p: { min: number; max: number }) => gaps.every((g) => g >= p.min && g <= p.max);
    const spacing = within(MONTHLY) ? "monthly" : within(YEARLY) ? "yearly" : undefined;
    // A title that already is a subscription payment needs no pattern: even one charge attaches.
    if (!attachTo && (near.length < 2 || !spacing)) continue;
    const last = near.at(-1) as { doc: Doc; day: string; amount: number };
    const repeat = spacing && gaps.length >= REPEAT_AFTER ? spacing : undefined;
    const accounts = new Set(near.map((e) => e.doc.data.account));
    const [account] = [...accounts];
    found.push({
      key,
      title:
        typeof last.doc.data._title === "string" && last.doc.data._title
          ? last.doc.data._title
          : key,
      ...(attachTo ? { attachTo } : {}),
      amount: last.amount,
      ...(repeat ? { repeat, due: addPeriod(last.day, repeat) } : {}),
      ...(accounts.size === 1 && typeof account === "string" && account ? { account } : {}),
      charges: near.map((e) => ({ id: e.doc.id, day: e.day, amount: e.amount })),
    });
  }
  return found.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

export interface ApprovalWrite {
  id: string;
  collection: "payments" | "money";
  patch: Record<string, unknown>;
}

/**
 * What approving a proposal writes, in order: the payment (unless the charges attach to an
 * existing one), then `payment` on each approved charge. Charges left out are not touched.
 */
export function approvalWrites(
  p: SubscriptionProposal,
  approved: ReadonlySet<string>,
  newId: () => string,
): ApprovalWrite[] {
  const charges = p.charges.filter((c) => approved.has(c.id));
  if (charges.length === 0) return [];
  const payment = p.attachTo ?? newId();
  const create: ApprovalWrite[] = p.attachTo
    ? []
    : [
        {
          id: payment,
          collection: "payments",
          patch: {
            _title: p.title,
            kind: "subscription",
            amount: p.amount,
            approx: false,
            active: true,
            ...(p.repeat ? { repeat: p.repeat } : {}),
            ...(p.due ? { due: p.due } : {}),
            ...(p.account ? { account: p.account } : {}),
          },
        },
      ];
  return [
    ...create,
    ...charges.map((c) => ({ id: c.id, collection: "money" as const, patch: { payment } })),
  ];
}

/** `settings.subscriptionsDismissed`: titles the owner said are not a subscription. */
export function dismissedOf(settings: Record<string, unknown> | undefined): Set<string> {
  const raw = settings?.subscriptionsDismissed;
  return new Set(Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string") : []);
}
