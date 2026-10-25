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
  tone?: string | undefined;
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

/** A small line over the last values, for a tile; the label carries the numbers. */
export function Sparkline({
  values,
  label,
  color,
}: {
  values: number[];
  label: string;
  color: string;
}) {
  const w = 96;
  const h = 36;
  const max = Math.max(...values, 0);
  const x = (i: number) => (values.length < 2 ? w / 2 : (i / (values.length - 1)) * (w - 4) + 2);
  const y = (v: number) => (max === 0 ? h - 2 : h - 2 - (v / max) * (h - 6));
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const last = values[values.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="sparkline" role="img" aria-label={label}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" opacity="0.8" />
      {last !== undefined && <circle cx={x(values.length - 1)} cy={y(last)} r="2.5" fill={color} />}
    </svg>
  );
}

/** A number with its change and a sparkline beside it (Money → Overview). */
export function Tile({
  label,
  value,
  note,
  tone,
  trend,
  action,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: string | undefined;
  trend?: { values: number[]; label: string };
  /** A control in the corner, Edit for the budget. */
  action?: ReactNode;
}) {
  return (
    <section className="panel tile" aria-label={label}>
      <span className="k">{label}</span>
      <span className="num tile-value" style={{ color: tone }}>
        {value}
      </span>
      <span className="num muted tile-note">{note}</span>
      {action && <span className="tile-action">{action}</span>}
      {trend && (
        <Sparkline values={trend.values} label={trend.label} color={tone ?? "var(--muted)"} />
      )}
    </section>
  );
}

/** One cell per day of a month, shaded by the day's spending; today is outlined. */
export function DayStrip({
  values,
  labels,
  today,
  label,
}: {
  values: number[];
  labels: string[];
  /** The index of today, when the month is this one. */
  today?: number;
  label: string;
}) {
  const max = Math.max(...values, 0);
  return (
    <div className="day-strip" role="img" aria-label={label}>
      {values.map((v, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional (day of month)
          key={i}
          className={`day-cell${i === today ? " today" : ""}`}
          title={labels[i]}
        >
          <span
            className="fill"
            style={{ opacity: max === 0 ? 0 : 0.12 + (v / max) * 0.75 }}
            aria-hidden="true"
          />
          <span>{i + 1}</span>
        </span>
      ))}
    </div>
  );
}

/** One stacked column per slot, the series in the given order from the baseline up. */
export function StackedColumns({
  slots,
  series,
  label,
}: {
  slots: { label: string; values: number[]; total: number }[];
  series: { name: string; color: string }[];
  label: string;
}) {
  const max = Math.max(0, ...slots.map((s) => s.total));
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
      <div className="stacked" role="img" aria-label={label}>
        {slots.map((slot) => (
          <span key={slot.label} className="stack" title={`${slot.label}: ${slot.total}`}>
            {slot.values.map((v, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: the series is positional
                key={i}
                className="segment"
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
