import type { Field } from "../../../shared/schema.ts";
import { useCave } from "../app/context.ts";
import { editFields } from "../app/lists.ts";
import { Icon } from "./icon.tsx";

/**
 * Edit habits (M13): rename one, archive it (its ticks stay on every day, it leaves the diary
 * and the streaks) or restore an archived one. Habits are the journal's checkbox fields.
 */
export function HabitEditor({ fields, onDone }: { fields: Field[]; onDone(): void }) {
  const { local } = useCave();
  const habits = fields.filter((f) => f.type === "checkbox");
  const live = habits.filter((f) => f.archived !== true);
  const archived = habits.filter((f) => f.archived === true);
  const change = (id: string, patch: Partial<Field>) =>
    void editFields(local, "journal", (all) =>
      all.map((f) => {
        if (f.id !== id) return f;
        const next = { ...f, ...patch };
        if (patch.archived === false) delete next.archived;
        return next;
      }),
    );

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <ul className="habit-edit" aria-label="Edit habits">
        {live.map((h) => (
          <li key={h.id}>
            <input
              className="input"
              aria-label={`Name of ${h.name}`}
              defaultValue={h.name}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name && name !== h.name) change(h.id, { name });
              }}
            />
            <button
              type="button"
              className="btn"
              aria-label={`Archive ${h.name}`}
              onClick={() => change(h.id, { archived: true })}
            >
              <Icon name="archive" size={14} /> Archive
            </button>
          </li>
        ))}
      </ul>
      {archived.length > 0 && (
        <ul className="habit-edit" aria-label="Archived habits">
          {archived.map((h) => (
            <li key={h.id}>
              <span className="muted" style={{ flex: 1 }}>
                {h.name}
              </span>
              <button
                type="button"
                className="btn"
                aria-label={`Restore ${h.name}`}
                onClick={() => change(h.id, { archived: false })}
              >
                <Icon name="archive-restore" size={14} /> Restore
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="btn primary"
        onClick={onDone}
        style={{ justifySelf: "start" }}
      >
        Done
      </button>
    </div>
  );
}
