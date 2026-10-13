import { useMemo } from "react";
import { leetcodeProgress } from "../logic/progress.ts";
import { titleOf } from "../logic/views.ts";
import { BarRow, Stat } from "../ui/charts.tsx";
import { FieldValue, OptionChip } from "../ui/fields.tsx";
import type { ViewProps } from "./types.ts";

export function ProgressDashboard({ collection, items, open }: ViewProps) {
  const fields = collection.data.fields;
  const difficulty = fields.find((f) => f.id === "difficulty");
  const status = fields.find((f) => f.id === "status");
  const solvedAt = fields.find((f) => f.id === "solved_at");
  const p = useMemo(
    () => leetcodeProgress(items, difficulty?.options?.map((o) => o.value) ?? []),
    [items, difficulty],
  );
  const solved = p.byStatus.get("solved") ?? 0;
  const colorOf = (d: string | null) =>
    difficulty?.options?.find((o) => o.value === d)?.color ?? "var(--muted)";

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="stats">
        <Stat label="Solved" value={solved} note={`of ${p.total}`} tone="var(--lime)" />
        {status?.options
          ?.filter((o) => o.value !== "solved")
          .map((o) => (
            <Stat key={o.value} label={o.value} value={p.byStatus.get(o.value) ?? 0} />
          ))}
      </div>
      <div className="split">
        <section className="panel" style={{ padding: 16, display: "grid", gap: 10 }}>
          <span className="k">Solved by difficulty</span>
          {p.byDifficulty.map((row) => (
            <BarRow
              key={row.difficulty ?? "__none"}
              label={row.difficulty ?? "no difficulty"}
              value={`${row.solved}/${row.total}`}
              share={row.total === 0 ? 0 : row.solved / row.total}
              color={colorOf(row.difficulty)}
            />
          ))}
        </section>
        <section className="panel" style={{ padding: 16, display: "grid", gap: 4 }}>
          <span className="k">Recently solved</span>
          {p.recentlySolved.length === 0 && <span className="muted">Nothing solved yet.</span>}
          {p.recentlySolved.slice(0, 8).map((doc) => (
            <button key={doc.id} type="button" className="entry" onClick={() => open(doc.id)}>
              <span style={{ flex: 1, textAlign: "left" }}>{titleOf(doc)}</span>
              {difficulty && <OptionChip field={difficulty} value={doc.data.difficulty} />}
              {solvedAt && <FieldValue field={solvedAt} value={doc.data.solved_at} />}
            </button>
          ))}
        </section>
      </div>
    </div>
  );
}
