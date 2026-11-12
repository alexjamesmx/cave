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
