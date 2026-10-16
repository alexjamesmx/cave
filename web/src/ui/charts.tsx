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

/**
 * Two series side by side per slot on one shared axis, with a legend; each bar's title is its
 * tooltip. Colour echoes the legend; the legend's text carries the identity.
 */
export function PairColumns({
  slots,
  series,
  label,
}: {
  slots: { label: string; values: [number, number] }[];
  series: [{ name: string; color: string }, { name: string; color: string }];
  label: string;
}) {
  const max = Math.max(0, ...slots.flatMap((s) => s.values));
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className="legend" aria-hidden="true">
        {series.map((s) => (
          <span key={s.name}>
            <span className="legend-swatch" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      <div className="columns pair-columns" role="img" aria-label={label}>
        {slots.map((slot) => (
          <span key={slot.label} className="pair-slot">
            {slot.values.map((v, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: the pair is positional
                key={i}
                className="column"
                title={`${slot.label} · ${series[i]?.name}: ${v}`}
                style={{
                  height: max === 0 ? 0 : `${(v / max) * 100}%`,
                  background: series[i]?.color,
                }}
              />
            ))}
          </span>
        ))}
      </div>
      <div className="slot-labels num muted" aria-hidden="true">
        {slots.map((s) => (
          <span key={s.label}>{s.label}</span>
        ))}
      </div>
    </div>
  );
}

/** A share (0–1) over time on its own 0–100% axis; months without a value leave a gap. */
export function RateLine({
  values,
  labels,
  label,
  color,
}: {
  values: (number | undefined)[];
  labels: string[];
  label: string;
  color: string;
}) {
  // Wide enough to fill a panel without stretching the markers.
  const w = 1000;
  const h = 120;
  const x = (i: number) => (values.length < 2 ? w / 2 : (i / (values.length - 1)) * (w - 12) + 6);
  const y = (v: number) => h - 6 - Math.max(0, Math.min(1, v)) * (h - 12);
  const runs: string[] = [];
  let run: string[] = [];
  values.forEach((v, i) => {
    if (v === undefined) {
      if (run.length) runs.push(run.join(" "));
      run = [];
    } else run.push(`${x(i)},${y(v)}`);
  });
  if (run.length) runs.push(run.join(" "));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="rate-line">
      <line x1="0" x2={w} y1={y(0)} y2={y(0)} stroke="var(--border)" strokeWidth="1" />
      <line x1="0" x2={w} y1={y(0.5)} y2={y(0.5)} stroke="var(--line)" strokeWidth="1" />
      {runs.map((points) => (
        <polyline key={points} points={points} fill="none" stroke={color} strokeWidth="2" />
      ))}
      {values.map((v, i) =>
        v === undefined ? null : (
          <circle
            key={labels[i] ?? i}
            cx={x(i)}
            cy={y(v)}
            r="4"
            fill={color}
            stroke="var(--panel)"
            strokeWidth="2"
          >
            <title>{`${labels[i]}: ${Math.round(v * 100)}%`}</title>
          </circle>
        ),
      )}
    </svg>
  );
}
