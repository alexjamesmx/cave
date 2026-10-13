import type { ReactNode } from "react";

export function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: string;
}) {
  return (
    <div className="panel stat">
      <span className="k">{label}</span>
      <span className="num" style={{ fontSize: 26, fontWeight: 700, color: tone }}>
        {value}
      </span>
      {note && (
        <span className="num muted" style={{ fontSize: 11 }}>
          {note}
        </span>
      )}
    </div>
  );
}

/** One labelled horizontal bar; the label and value carry identity, the colour only echoes it. */
export function BarRow({
  label,
  value,
  share,
  color,
}: {
  label: ReactNode;
  value: ReactNode;
  share: number;
  color: string;
}) {
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <span className="bar-track" aria-hidden="true">
        <span
          className="bar-fill"
          style={{ width: `${Math.max(share * 100, 1)}%`, background: color }}
        />
      </span>
      <span className="num">{value}</span>
    </div>
  );
}

/** Vertical bars on a shared baseline, one per slot; each bar's title is its tooltip. */
export function Columns({
  values,
  labels,
  color,
  highlight,
  label,
}: {
  values: number[];
  labels: string[];
  color: string;
  highlight?: number;
  label: string;
}) {
  const max = Math.max(...values, 0);
  return (
    <div className="columns" role="img" aria-label={label}>
      {values.map((v, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: slots are positional (day of month)
          key={i}
          className="column"
          title={labels[i]}
          style={{
            height: max === 0 ? 0 : `${(v / max) * 100}%`,
            background: color,
            opacity: highlight === undefined || i === highlight ? 1 : 0.55,
          }}
        />
      ))}
    </div>
  );
}
