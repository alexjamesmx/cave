import type { Database } from "bun:sqlite";
import { z } from "zod";
import type { Proposal } from "../shared/money-review.ts";

/**
 * The category review's server side: one stored review, not changes. The CLI submits
 * proposals; the owner's device applies the approved ones as ordinary writes and records the
 * decisions here, so a later review never asks again about what the owner already decided.
 * It lives in `meta`, so no schema migration.
 */

const KEY = "money_review";
const MAX_PROPOSALS = 20_000;

export interface Batch {
  id: string;
  at: number;
  /** Each entry's category before and after; `null` is uncategorized. */
  changes: { id: string; before: string | null; after: string | null }[];
  undone: boolean;
}

export interface Review {
  createdAt: number | null;
  proposals: Proposal[];
  /** The category the owner settled each decided entry on (kept, approved or picked). */
  decided: Record<string, string | null>;
  batches: Batch[];
}

const EMPTY: Review = { createdAt: null, proposals: [], decided: {}, batches: [] };

const Category = z.string().min(1).max(64).nullable();
const ProposalSchema = z
  .object({
    id: z.string().min(1).max(64),
    from: Category,
    to: Category,
    rule: z.string().max(200),
    date: z.string().max(40),
    title: z.string().max(500),
    amount: z.number().finite().nullable(),
    direction: z.string().max(20).nullable(),
  })
  .strict();
const SubmitSchema = z.object({ proposals: z.array(ProposalSchema).max(MAX_PROPOSALS) }).strict();
const DecideSchema = z
  .object({
    decisions: z
      .array(z.object({ id: z.string().min(1).max(64), category: Category }).strict())
      .min(1)
      .max(MAX_PROPOSALS),
    batch: z
      .object({
        id: z.string().min(1).max(64),
        changes: z
          .array(z.object({ id: z.string().min(1).max(64), before: Category, after: Category }))
          .max(MAX_PROPOSALS),
      })
      .strict(),
  })
  .strict();

export function createMoneyReview(db: Database, now: () => number) {
  const read = db.query<{ value: string }, []>(`SELECT value FROM meta WHERE key = '${KEY}'`);
  const write = db.query<void, [string]>(
    `INSERT INTO meta (key, value) VALUES ('${KEY}', ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
  );
  const load = (): Review => {
    const row = read.get();
    return row ? { ...EMPTY, ...(JSON.parse(row.value) as Review) } : structuredClone(EMPTY);
  };
  const save = (review: Review) => write.run(JSON.stringify(review));

  return {
    load,
    /** A new set of proposals replaces the pending ones, minus anything already decided. */
    submit(proposals: Proposal[]): { kept: number; skipped: number } {
      const review = load();
      const fresh = proposals.filter(
        (p) => !(p.id in review.decided) || review.decided[p.id] !== p.from,
      );
      save({ ...review, createdAt: now(), proposals: fresh });
      return { kept: fresh.length, skipped: proposals.length - fresh.length };
    },
    /** Records what the owner's device already wrote, and the batch its Undo reverses. */
    decide(input: z.infer<typeof DecideSchema>): Review {
      const review = load();
      const ids = new Set(input.decisions.map((d) => d.id));
      for (const d of input.decisions) review.decided[d.id] = d.category;
      review.proposals = review.proposals.filter((p) => !ids.has(p.id));
      if (input.batch.changes.length > 0)
        review.batches = [
          { id: input.batch.id, at: now(), changes: input.batch.changes, undone: false },
          ...review.batches,
        ].slice(0, 20);
      save(review);
      return review;
    },
    /** After the device wrote the old categories back: the batch's entries are undecided again. */
    undo(batchId: string): Review | undefined {
      const review = load();
      const batch = review.batches.find((b) => b.id === batchId && !b.undone);
      if (!batch) return undefined;
      batch.undone = true;
      for (const c of batch.changes) delete review.decided[c.id];
      save(review);
      return review;
    },
  };
}
type MoneyReview = ReturnType<typeof createMoneyReview>;

const bad = (message: string) => Response.json({ error: message }, { status: 400 });

async function body(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

/** The owner's routes; `app.ts` puts each behind the owner rule. */
export function moneyReviewRoutes(review: MoneyReview) {
  return {
    get: () => Response.json(review.load()),
    async submit(req: Request) {
      const parsed = SubmitSchema.safeParse(await body(req));
      if (!parsed.success) return bad("invalid proposals");
      return Response.json(review.submit(parsed.data.proposals as Proposal[]));
    },
    async decide(req: Request) {
      const parsed = DecideSchema.safeParse(await body(req));
      if (!parsed.success) return bad("invalid decisions");
      return Response.json(review.decide(parsed.data));
    },
    async undo(req: Request) {
      const parsed = z
        .object({ batch: z.string().min(1).max(64) })
        .strict()
        .safeParse(await body(req));
      if (!parsed.success) return bad("invalid batch");
      const after = review.undo(parsed.data.batch);
      return after
        ? Response.json(after)
        : Response.json({ error: "no such batch" }, { status: 404 });
    },
  };
}
export type MoneyReviewRoutes = ReturnType<typeof moneyReviewRoutes>;
