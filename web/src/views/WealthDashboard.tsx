import { useMemo } from "react";
import { formatMoney } from "../logic/format.ts";
import { titleOf } from "../logic/views.ts";
import { wealthSummary } from "../logic/wealth.ts";
import { BarRow, Stat } from "../ui/charts.tsx";
import { FieldValue } from "../ui/fields.tsx";
import type { ViewProps } from "./types.ts";

export function WealthDashboard({ collection, items, open }: ViewProps) {
  const s = useMemo(() => wealthSummary(items), [items]);
  const type = collection.data.fields.find((f) => f.id === "type");
  const value = collection.data.fields.find((f) => f.id === "value");
  const updated = collection.data.fields.find((f) => f.id === "updated");
  const colorOf = (t: string | null) =>
    type?.options?.find((o) => o.value === t)?.color ?? "var(--muted)";
  const largest = Math.max(...s.byType.map((r) => r.value), 0);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="stats">
        <Stat
          label="Net worth"
          value={formatMoney(s.net)}
          tone={s.net < 0 ? "var(--expense)" : "var(--lime)"}
        />
        <Stat label="Assets" value={formatMoney(s.assets)} />
        <Stat label="Debt" value={formatMoney(s.debt)} tone="var(--expense)" />
      </div>
      {s.missingValue.length > 0 && (
        <p role="status" className="panel banner" style={{ margin: 0 }}>
          {s.missingValue.length} row{s.missingValue.length === 1 ? "" : "s"} without a value
          {s.missingValue.length === 1 ? " is" : " are"} not counted.
        </p>
      )}
      <section className="panel" style={{ padding: 16, display: "grid", gap: 10 }}>
        <span className="k">By type</span>
        {s.byType.map((row) => (
          <BarRow
            key={row.type ?? "__none"}
            label={row.type ?? "no type"}
            value={formatMoney(row.value)}
            share={largest === 0 ? 0 : row.value / largest}
            color={colorOf(row.type)}
          />
        ))}
      </section>
      <section className="panel" style={{ padding: 16, display: "grid", gap: 4 }}>
        <span className="k">Accounts</span>
        {items.map((doc) => (
          <button key={doc.id} type="button" className="entry" onClick={() => open(doc.id)}>
            <span style={{ flex: 1, textAlign: "left" }}>{titleOf(doc)}</span>
            {updated && <FieldValue field={updated} value={doc.data.updated} />}
            {value && <FieldValue field={value} value={doc.data.value} />}
          </button>
        ))}
      </section>
    </div>
  );
}
