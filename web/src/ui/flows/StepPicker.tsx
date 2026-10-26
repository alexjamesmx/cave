import { STEPS } from "../../../../shared/flows/registry.ts";
import { Icon } from "../icon.tsx";
import { lookOf } from "./look.ts";

/** What the canvas's + offers: one button per step type, beside the canvas. */
export function StepPicker({ onPick, onCancel }: { onPick(type: string): void; onCancel(): void }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <span className="k">Add a step</span>
      <div className="flow-step-types" role="menu" aria-label="Step types">
        {STEPS.map((s) => {
          const look = lookOf(s.type);
          return (
            <button
              key={s.type}
              type="button"
              role="menuitem"
              className="flow-add-item"
              onClick={() => onPick(s.type)}
            >
              <span className="ico" style={{ background: "var(--on)", color: look.color }}>
                <Icon name={look.icon} size={16} />
              </span>
              {s.label}
            </button>
          );
        })}
      </div>
      <button type="button" className="btn" onClick={onCancel} style={{ justifySelf: "start" }}>
        Cancel
      </button>
    </div>
  );
}
