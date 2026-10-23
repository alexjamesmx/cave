import type { FlowDefinition } from "../../../../shared/flows/registry.ts";
import { specOf } from "../../../../shared/flows/registry.ts";
import type { Selection } from "../../logic/flow-edit.ts";
import { Icon } from "../icon.tsx";

const LOOK: Record<string, { icon: string; color: string }> = {
  schedule: { icon: "clock", color: "var(--lime)" },
  "item-added": { icon: "circle-plus", color: "var(--income)" },
  "item-changed": { icon: "pencil", color: "var(--cyan)" },
  if: { icon: "split", color: "var(--gold)" },
  create: { icon: "square-plus", color: "var(--cyan)" },
  "update-trigger-item": { icon: "pen-line", color: "var(--orange)" },
  notify: { icon: "bell", color: "var(--expense)" },
};

/** The trigger and its steps, top to bottom; an `if` branches to "else stop". */
export function FlowCards({
  def,
  selected,
  onSelect,
  onAdd,
}: {
  def: FlowDefinition;
  selected: Selection;
  onSelect(selection: Selection): void;
  onAdd?(): void;
}) {
  const card = (kind: "trigger" | "step", part: { type: string }, selection: Selection) => {
    const spec = specOf(kind, part.type);
    const look = LOOK[part.type] ?? { icon: "circle", color: "var(--muted)" };
    return (
      <button
        type="button"
        className={`flow-card${selected === selection ? " on" : ""}`}
        aria-pressed={selected === selection}
        onClick={() => onSelect(selection)}
      >
        <span className="ico" style={{ background: "var(--on)", color: look.color }}>
          <Icon name={look.icon} size={19} />
        </span>
        <span style={{ display: "grid", gap: 2, minWidth: 0, textAlign: "left" }}>
          <span className="k">{spec?.label ?? part.type}</span>
          <span className="flow-card-text">
            {spec?.describe(part as Record<string, unknown>) ?? part.type}
          </span>
        </span>
        {spec?.sensitive && (
          <span className="chip" style={{ background: "#f5c4511f", color: "var(--gold)" }}>
            needs approval
          </span>
        )}
      </button>
    );
  };

  return (
    <ol className="flow-cards" aria-label="Trigger and steps">
      <li>{card("trigger", def.trigger, "trigger")}</li>
      {def.steps.map((step, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: steps are identified by position
        <li key={i}>
          <span className="flow-wire" aria-hidden="true" />
          {card("step", step, i)}
          {step.type === "if" && <span className="flow-branch">else stop</span>}
        </li>
      ))}
      {onAdd && (
        <li>
          <span className="flow-wire" aria-hidden="true" />
          <button type="button" className="btn" onClick={onAdd}>
            <Icon name="plus" size={15} /> Add a step
          </button>
        </li>
      )}
    </ol>
  );
}
