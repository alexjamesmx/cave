import { useCallback, useEffect, useMemo, useState } from "react";
import { categoriesFor, optionText } from "../../../shared/categories.ts";
import { newId } from "../../../shared/ids.ts";
import type { Proposal } from "../../../shared/money-review.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { ownerGet, ownerPost } from "../app/owner-api.ts";
import { collectionPath } from "../app/router.ts";
import { formatMoney } from "../logic/format.ts";
import { useCollections, useItems } from "../store/queries.ts";

interface Batch {
  id: string;
  at: number;
  changes: { id: string; before: string | null; after: string | null }[];
  undone: boolean;
}
interface Review {
  createdAt: number | null;
  proposals: Proposal[];
  batches: Batch[];
}

const categoryOf = (doc: Doc | undefined): string | null =>
  typeof doc?.data.category === "string" && doc.data.category ? doc.data.category : null;

/**
 * The category review: proposals from `bun run money-review`, grouped by change. Nothing is
 * written until the owner approves; an approval is one batch of ordinary writes, with one Undo.
 */
export function ReviewCategories() {
  const cave = useCave();
  const { local } = cave;
  const collections = useCollections(local.db);
  const money = useItems(local.db, "money");
  const [review, setReview] = useState<Review | "offline">();
  const [picked, setPicked] = useState<Record<string, string | null>>({});
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setReview((await ownerGet<Review>("/api/money-review")) ?? "offline");
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const options =
    collections?.find((c) => c.id === "money")?.data.fields.find((f) => f.id === "category")
      ?.options ?? [];
  const label = (value: string | null) => {
    if (value === null) return "Uncategorized";
    const o = options.find((x) => x.value === value);
    return o ? optionText(o) : value;
  };
  const docs = useMemo(() => new Map((money ?? []).map((d) => [d.id, d])), [money]);
  const proposals = typeof review === "object" ? review.proposals : [];
  const target = (p: Proposal) => (p.id in picked ? (picked[p.id] ?? null) : p.to);
  const groups = useMemo(() => {
    const map = new Map<string, Proposal[]>();
    for (const p of proposals) {
      const key = `${p.from ?? ""}→${p.to ?? ""}`;
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return [...map.values()].sort((a, b) => b.length - a.length);
  }, [proposals]);

  /** Writes each row's category (or keeps it), then records the decisions and the batch. */
  const decide = async (rows: Proposal[], keep: boolean) => {
    setBusy(true);
    try {
      const decisions: { id: string; category: string | null }[] = [];
      const changes: Batch["changes"] = [];
      let stale = 0;
      for (const p of rows) {
        const doc = docs.get(p.id);
        // Changed since the review was built: the owner's newer choice stands.
        if (!doc || doc.data._deleted === true || categoryOf(doc) !== p.from) {
          stale++;
          continue;
        }
        const to = keep ? p.from : target(p);
        if (to !== p.from) {
          await local.write({ id: p.id, kind: "item", collection: "money" }, { category: to });
          changes.push({ id: p.id, before: p.from, after: to });
        }
        decisions.push({ id: p.id, category: to });
      }
      if (decisions.length === 0) {
        setMessage(`Nothing to do: ${stale} changed since the review was built.`);
        return;
      }
      const saved = await ownerPost<Review>("/api/money-review/decide", {
        decisions,
        batch: { id: newId(), changes },
      });
      if (!saved) {
        setMessage("Saved on this device; the review couldn't be updated. Try again online.");
        return;
      }
      setReview(saved);
      setMessage(
        `${keep ? "Kept" : "Applied"} ${decisions.length}${stale ? ` · ${stale} skipped: changed since` : ""}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const undo = async (batch: Batch) => {
    setBusy(true);
    try {
      if (!(await cave.syncAndWait())) return setMessage("Undo needs a sync first.");
      let kept = 0;
      for (const c of batch.changes) {
        const doc = await local.get(c.id);
        if (!doc || categoryOf(doc) !== c.after) {
          kept++;
          continue;
        }
        await local.write({ id: c.id, kind: "item", collection: "money" }, { category: c.before });
      }
      const saved = await ownerPost<Review>("/api/money-review/undo", { batch: batch.id });
      if (saved) setReview(saved);
      setMessage(`Undone${kept ? ` · ${kept} kept: changed since` : ""}`);
    } finally {
      setBusy(false);
    }
  };

  const lastBatch = typeof review === "object" ? review.batches.find((b) => !b.undone) : undefined;

  return (
    <>
      <header style={{ display: "grid", gap: 6 }}>
        <h1 style={{ margin: 0, fontSize: 32, letterSpacing: "-0.03em" }}>Review categories</h1>
        <p className="muted" style={{ margin: 0 }}>
          Proposals from <span className="num">bun run money-review</span>. Nothing changes until
          you approve it; each approval has one Undo.{" "}
          <a href={collectionPath("money")}>Back to Money</a>
        </p>
      </header>
      {review === "offline" && <p className="muted">The review needs the server.</p>}
      <p role="status" className="muted" style={{ margin: 0, minHeight: 20 }}>
        {message}
      </p>
      {lastBatch && lastBatch.changes.length > 0 && (
        <div className="panel banner">
          <span>
            Last approval: {lastBatch.changes.length} change
            {lastBatch.changes.length === 1 ? "" : "s"},{" "}
            {new Date(lastBatch.at).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </span>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void undo(lastBatch)}
          >
            Undo last approval
          </button>
        </div>
      )}
      {typeof review === "object" && proposals.length === 0 && (
        <p className="muted">Nothing to review. Run the review again after adding entries.</p>
      )}
      {proposals.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() => void decide(proposals, false)}
          >
            Approve all ({proposals.length})
          </button>
        </div>
      )}
      {groups.map((rows) => {
        const first = rows[0] as Proposal;
        return (
          <section
            key={`${first.from}→${first.to}`}
            className="panel"
            aria-label={`${label(first.from)} to ${label(first.to)}`}
            style={{ padding: 16, display: "grid", gap: 8 }}
          >
            <header style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <strong style={{ flex: 1 }}>
                {label(first.from)} → {label(first.to)}{" "}
                <span className="num muted">{rows.length}</span>
              </strong>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void decide(rows, true)}
              >
                Keep group
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={busy}
                onClick={() => void decide(rows, false)}
              >
                Approve group
              </button>
            </header>
            <span className="muted" style={{ fontSize: 13 }}>
              {[...new Set(rows.map((r) => r.rule))].join(" · ")}
            </span>
            {rows.map((p) => {
              const changed = categoryOf(docs.get(p.id)) !== p.from;
              const choices = categoriesFor(
                options,
                p.direction === "income" ? "income" : "expense",
              );
              return (
                <div key={p.id} className="system-row">
                  <span className="num muted">{p.date.slice(0, 10)}</span>
                  <span style={{ flex: 1, minWidth: 140 }}>{p.title || "Untitled"}</span>
                  <span className="num">{p.amount === null ? "—" : formatMoney(p.amount)}</span>
                  {changed ? (
                    <span className="muted">changed since</span>
                  ) : (
                    <>
                      <select
                        className="input"
                        aria-label={`Category for ${p.title || p.id}`}
                        value={target(p) ?? ""}
                        onChange={(e) => setPicked({ ...picked, [p.id]: e.target.value || null })}
                      >
                        <option value="">Uncategorized</option>
                        {choices.map((o) => (
                          <option key={o.value} value={o.value}>
                            {optionText(o)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={() => void decide([p], true)}
                      >
                        Keep
                      </button>
                      <button
                        type="button"
                        className="btn primary"
                        disabled={busy}
                        onClick={() => void decide([p], false)}
                      >
                        Approve
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
    </>
  );
}
