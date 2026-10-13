import type { Doc } from "../../../shared/types.ts";

export interface Progress {
  total: number;
  byStatus: Map<string | null, number>;
  /** Solved and total per difficulty, in the field's option order. */
  byDifficulty: { difficulty: string | null; solved: number; total: number }[];
  recentlySolved: Doc[];
}

const str = (v: unknown) => (typeof v === "string" ? v : null);

export function leetcodeProgress(docs: Doc[], difficulties: string[]): Progress {
  const byStatus = new Map<string | null, number>();
  const diff = new Map<string | null, { solved: number; total: number }>(
    difficulties.map((d) => [d, { solved: 0, total: 0 }]),
  );
  for (const doc of docs) {
    const status = str(doc.data.status);
    byStatus.set(status, (byStatus.get(status) ?? 0) + 1);
    const key = str(doc.data.difficulty);
    const row = diff.get(key) ?? { solved: 0, total: 0 };
    row.total++;
    if (status === "solved") row.solved++;
    diff.set(key, row);
  }
  const solvedAt = (d: Doc) => str(d.data.solved_at) ?? "";
  return {
    total: docs.length,
    byStatus,
    byDifficulty: [...diff].map(([difficulty, row]) => ({ difficulty, ...row })),
    recentlySolved: docs
      .filter((d) => d.data.status === "solved")
      .sort((a, b) => solvedAt(b).localeCompare(solvedAt(a))),
  };
}
