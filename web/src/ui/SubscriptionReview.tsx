import { useMemo, useState } from "react";
import { newId } from "../../../shared/ids.ts";
import {
  approvalWrites,
  dismissedOf,
  type SubscriptionProposal,
  subscriptionProposals,
} from "../../../shared/subscription-finder.ts";
import { useCave } from "../app/context.ts";
import { formatMoney } from "../logic/format.ts";
import { useDoc, useItems } from "../store/queries.ts";

/**
 * Subscriptions found in the money history, one proposal each. Nothing is written until the
 * owner approves: then the payment is created (or the existing one kept) and each approved
 * charge gets its `payment`. "Not a subscription" is remembered in settings.
 */
export function SubscriptionReview() {
  const { db } = useCave().local;
  const money = useItems(db, "money");
  const payments = useItems(db, "payments");
  const settings = useDoc(db, "settings");
  const dismissed = useMemo(() => dismissedOf(settings?.data), [settings]);
  const proposals = useMemo(
    () => (money && payments ? subscriptionProposals(money, payments, dismissed) : []),
    [money, payments, dismissed],
  );
  const [message, setMessage] = useState<string>();
  if (!money || !payments) return null;

  return (
    <section
      className="panel"
      aria-label="Subscriptions"
      style={{ padding: 16, display: "grid", gap: 12 }}
    >
      <h2 style={{ margin: 0, fontSize: 18 }}>Subscriptions from your history</h2>
      <p className="muted" style={{ margin: 0 }}>
        Past charges stay transactions; approving links them to their subscription in Payments. Only
        what the history shows is filled in.
      </p>
      <p role="status" className="muted" style={{ margin: 0, minHeight: 20 }}>
        {message}
      </p>
      {proposals.length === 0 && <span className="muted">Nothing to review.</span>}
      {proposals.map((p) => (
        <Proposal
          key={p.key}
          proposal={p}
          payments={payments}
          dismissed={dismissed}
          onDone={setMessage}
        />
      ))}
    </section>
  );
}

function Proposal({
  proposal: p,
  payments,
  dismissed,
  onDone,
}: {
  proposal: SubscriptionProposal;
  payments: { id: string; data: Record<string, unknown> }[];
  dismissed: ReadonlySet<string>;
  onDone(message: string): void;
}) {
  const { local } = useCave();
  const [approved, setApproved] = useState(() => new Set(p.charges.map((c) => c.id)));
  const [busy, setBusy] = useState(false);
  const existing = p.attachTo ? payments.find((x) => x.id === p.attachTo) : undefined;
  const toggle = (id: string) => {
    const next = new Set(approved);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setApproved(next);
  };

  const approve = async () => {
    setBusy(true);
    try {
      for (const w of approvalWrites(p, approved, () => newId()))
        await local.write({ id: w.id, kind: "item", collection: w.collection }, w.patch);
      onDone(
        `${p.attachTo ? "Linked" : "Added"} · ${p.title}: ${approved.size} charge${approved.size === 1 ? "" : "s"} linked`,
      );
    } finally {
      setBusy(false);
    }
  };
  const notASubscription = () =>
    void local
      .write(
        { id: "settings", kind: "setting", collection: null },
        { subscriptionsDismissed: [...dismissed, p.key] },
      )
      .then(() => onDone(`Not a subscription · ${p.title}`));

  return (
    <article aria-label={p.title} className="field-card" style={{ display: "grid", gap: 8 }}>
      <header style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
        <strong style={{ flex: 1 }}>{p.title}</strong>
        {existing ? (
          <span className="muted">Attach to the payment “{String(existing.data._title)}”</span>
        ) : (
          <span className="muted">
            New subscription · {formatMoney(p.amount)} · {p.repeat ?? "repeat not clear yet"} ·{" "}
            {p.due ? `next ${p.due}` : "Needs date"}
            {p.account ? ` · ${p.account}` : ""}
          </span>
        )}
      </header>
      <ul style={{ margin: 0, padding: 0, display: "grid", gap: 4 }}>
        {p.charges.map((c) => (
          <li key={c.id} style={{ listStyle: "none" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={approved.has(c.id)}
                onChange={() => toggle(c.id)}
                style={{ accentColor: "var(--lime)" }}
              />
              <span className="num">{c.day}</span>
              <span className="num" style={{ marginLeft: "auto" }}>
                {formatMoney(c.amount)}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn primary"
          disabled={busy || approved.size === 0}
          onClick={() => void approve()}
        >
          Approve {approved.size} of {p.charges.length}
        </button>
        <button type="button" className="btn" onClick={notASubscription}>
          Not a subscription
        </button>
      </div>
    </article>
  );
}
