import { type FormEvent, useState } from "react";
import { habitId } from "../../../shared/diary.ts";
import { newId } from "../../../shared/ids.ts";
import {
  type BlockKind,
  blocksForDay,
  DAY_NAMES,
  duration,
  endOf,
  freeMinutes,
  KINDS,
  MAX_BLOCKS,
  parseRoutine,
  type RoutineBlock,
  routineOf,
  weekDays,
  weeklyCounts,
  withBlock,
  withoutBlock,
} from "../../../shared/routine.ts";
import { useCave } from "../app/context.ts";
import { useToday } from "../app/hooks.ts";
import { editFields } from "../app/lists.ts";
import { entriesByDay } from "../logic/habits.ts";
import { useCollections, useDoc, useItems } from "../store/queries.ts";
import { Icon } from "../ui/icon.tsx";

const SETTINGS = { id: "settings", kind: "setting" as const, collection: null };
const KIND_LABEL: Record<BlockKind, string> = {
  fixed: "Fixed (days and a start)",
  daily: "Daily",
  weekly: "Weekly (n times a week)",
};

/**
 * Calendar → Week (M12 part 7): the shape of a week as a list per day (fixed and daily blocks
 * in time order, the free time left), a "This week" pool for the weekly blocks with their
 * counters from the diary's habits, and a block editor beside it. Nothing here notifies.
 */
export function Week() {
  const { local } = useCave();
  const today = useToday();
  const settings = useDoc(local.db, "settings");
  const routine = routineOf(settings?.data);
  const journal = useItems(local.db, "journal");
  const collections = useCollections(local.db);
  const habits = (collections?.find((c) => c.id === "journal")?.data.fields ?? []).filter(
    (f) => f.type === "checkbox" && f.archived !== true,
  );
  const [editing, setEditing] = useState<string | "new">();
  const [error, setError] = useState<string>();
  const days = weekDays(today);
  const counts = weeklyCounts(routine, entriesByDay(journal ?? []), days);

  const save = async (next: typeof routine) => {
    const parsed = parseRoutine(next);
    if (!parsed.ok) return setError(parsed.error);
    setError(undefined);
    await local.write(SETTINGS, { routine: parsed.value });
    return true;
  };
  const selected =
    editing && editing !== "new" ? routine.blocks.find((b) => b.id === editing) : undefined;

  return (
    <div className="week-page">
      <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
        <section
          className="panel"
          aria-label="This week"
          style={{ padding: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
        >
          <span className="k">This week</span>
          {counts.length === 0 && <span className="muted">No weekly blocks yet.</span>}
          {counts.map(({ block, done, of }) => (
            <button
              key={block.id}
              type="button"
              className="chip week-counter"
              aria-pressed={editing === block.id}
              style={{
                background: done >= of && of > 0 ? "rgba(143, 208, 160, 0.18)" : "var(--on)",
              }}
              onClick={() => setEditing(block.id)}
            >
              {block.title} · {block.habit ? `${done} of ${of}` : `${of} a week`}
            </button>
          ))}
          <span className="muted" style={{ marginLeft: "auto", fontSize: 13 }}>
            Awake {routine.day.start} to {routine.day.end}
          </span>
          <button type="button" className="btn primary" onClick={() => setEditing("new")}>
            <Icon name="plus" size={15} /> Add block
          </button>
        </section>
        <div className="week-grid">
          {days.map((day, i) => {
            const blocks = blocksForDay(routine, i);
            return (
              <section
                key={day}
                className={`panel week-day${day === today ? " today" : ""}`}
                aria-label={DAY_NAMES[i]}
              >
                <header>
                  <span className="k">{DAY_NAMES[i]}</span>
                  <span className="num muted" style={{ fontSize: 12 }}>
                    {Number(day.slice(8))}
                  </span>
                </header>
                <ul className="week-blocks">
                  {blocks.map((b) => (
                    <li key={b.id}>
                      <button
                        type="button"
                        className={`week-block${b.kind === "fixed" ? " fixed" : ""}`}
                        aria-pressed={editing === b.id}
                        onClick={() => setEditing(b.id)}
                      >
                        <span className="num muted">
                          {b.start ? `${b.start}–${endOf(b)}` : duration(b.minutes)}
                        </span>
                        <span>{b.title}</span>
                        {b.habit && <Icon name="circle-check" size={12} aria-label="tracked" />}
                      </button>
                    </li>
                  ))}
                </ul>
                <span className="num muted" style={{ fontSize: 12 }}>
                  free {duration(freeMinutes(routine, i))}
                </span>
              </section>
            );
          })}
        </div>
      </div>
      <aside aria-label="Block settings" className="panel week-editor">
        {editing ? (
          <BlockForm
            key={editing}
            block={selected}
            habits={habits.map((f) => ({ id: f.id, name: f.name }))}
            canAdd={routine.blocks.length < MAX_BLOCKS}
            error={error}
            onSave={async (block) => {
              if (await save(withBlock(routine, block))) setEditing(block.id);
            }}
            onDelete={
              selected
                ? async () => {
                    if (await save(withoutBlock(routine, selected.id))) setEditing(undefined);
                  }
                : undefined
            }
            onTrack={async (block, title) => {
              const id = habitId(title);
              if (!habits.some((f) => f.id === id))
                await editFields(local, "journal", (fields) => [
                  ...fields,
                  { id, name: title.trim(), type: "checkbox" },
                ]);
              if (await save(withBlock(routine, { ...block, habit: id }))) {
                setEditing(block.id);
                return id;
              }
              return undefined;
            }}
          />
        ) : (
          <>
            <span className="k">Day window</span>
            <div className="quick-row">
              {(["start", "end"] as const).map((k) => (
                <label key={k} className="quick-field">
                  <span className="k">{k === "start" ? "Awake from" : "Until"}</span>
                  <input
                    className="input"
                    type="time"
                    aria-label={k === "start" ? "Awake from" : "Until"}
                    value={routine.day[k]}
                    onChange={(e) =>
                      void save({ ...routine, day: { ...routine.day, [k]: e.target.value } })
                    }
                  />
                </label>
              ))}
            </div>
            {error && (
              <p role="alert" className="error" style={{ margin: 0 }}>
                {error}
              </p>
            )}
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Click a block to edit it. A block with a habit counts when you tick it in the Diary;
              one without is a plan, never counted.
            </p>
          </>
        )}
      </aside>
    </div>
  );
}

function BlockForm({
  block,
  habits,
  canAdd,
  error,
  onSave,
  onDelete,
  onTrack,
}: {
  block: RoutineBlock | undefined;
  habits: { id: string; name: string }[];
  canAdd: boolean;
  error: string | undefined;
  onSave(block: RoutineBlock): Promise<void>;
  onDelete: (() => Promise<void>) | undefined;
  /** Links a new habit named after the block; resolves to its field id once saved. */
  onTrack(block: RoutineBlock, title: string): Promise<string | undefined>;
}) {
  const [title, setTitle] = useState(block?.title ?? "");
  const [kind, setKind] = useState<BlockKind>(block?.kind ?? "daily");
  const [minutes, setMinutes] = useState(String(block?.minutes ?? 60));
  const [start, setStart] = useState(block?.start ?? "");
  const [days, setDays] = useState<number[]>(block?.days ?? [0, 1, 2, 3, 4]);
  const [perWeek, setPerWeek] = useState(String(block?.perWeek ?? 2));
  const [habit, setHabit] = useState(block?.habit ?? "");
  const build = (): RoutineBlock => ({
    id: block?.id ?? newId(),
    title: title.trim(),
    kind,
    minutes: Number(minutes),
    ...(habit ? { habit } : {}),
    ...(start && kind !== "weekly" ? { start } : {}),
    ...(kind === "fixed" ? { days } : {}),
    ...(kind === "weekly" ? { perWeek: Number(perWeek) } : {}),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!block && !canAdd) return;
    void onSave(build());
  };
  return (
    <form
      onSubmit={submit}
      style={{ display: "grid", gap: 10 }}
      aria-label={block ? "Edit block" : "New block"}
    >
      <span className="k">{block ? "Edit block" : "New block"}</span>
      <label className="quick-field">
        <span className="k">Title</span>
        <input
          className="input"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="quick-field">
        <span className="k">Kind</span>
        <select
          className="input"
          value={kind}
          onChange={(e) => setKind(e.target.value as BlockKind)}
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
      <div className="quick-row">
        <label className="quick-field">
          <span className="k">Minutes</span>
          <input
            className="input num"
            type="number"
            min="5"
            max="960"
            step="5"
            required
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </label>
        {kind !== "weekly" && (
          <label className="quick-field">
            <span className="k">{kind === "fixed" ? "Start" : "Preferred start"}</span>
            <input
              className="input"
              type="time"
              required={kind === "fixed"}
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
        )}
        {kind === "weekly" && (
          <label className="quick-field">
            <span className="k">Times a week</span>
            <input
              className="input num"
              type="number"
              min="1"
              max="7"
              required
              value={perWeek}
              onChange={(e) => setPerWeek(e.target.value)}
            />
          </label>
        )}
      </div>
      {kind === "fixed" && (
        <fieldset className="chips" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="k">Days</legend>
          {DAY_NAMES.map((name, i) => (
            <button
              key={name}
              type="button"
              className="btn"
              aria-pressed={days.includes(i)}
              onClick={() =>
                setDays(days.includes(i) ? days.filter((d) => d !== i) : [...days, i].sort())
              }
            >
              {name}
            </button>
          ))}
        </fieldset>
      )}
      <label className="quick-field">
        <span className="k">Habit</span>
        <select className="input" value={habit} onChange={(e) => setHabit(e.target.value)}>
          <option value="">None (a plan, not counted)</option>
          {habits.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
      </label>
      {!habit && title.trim() && (
        <button
          type="button"
          className="btn"
          onClick={() =>
            void onTrack(build(), title).then((id) => {
              if (id) setHabit(id);
            })
          }
          disabled={!block && !canAdd}
        >
          <Icon name="circle-check" size={14} /> Track as a habit
        </button>
      )}
      {error && (
        <p role="alert" className="error" style={{ margin: 0 }}>
          {error}
        </p>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="btn primary" disabled={!block && !canAdd}>
          {block ? "Save" : "Add"}
        </button>
        {onDelete && (
          <button type="button" className="btn" onClick={() => void onDelete()}>
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
