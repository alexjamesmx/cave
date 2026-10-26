import { type CSSProperties, type FormEvent, useState } from "react";
import { newId } from "../../../shared/ids.ts";
import {
  AREAS,
  type Area,
  areaOf,
  type BlockKind,
  blocksForDay,
  DAY_NAMES,
  duration,
  endOf,
  KINDS,
  MAX_BLOCKS,
  minutesByArea,
  parseRoutine,
  type RoutineBlock,
  type Routine as RoutineValue,
  routineOf,
  weekdayOf,
  withBlock,
  withoutBlock,
} from "../../../shared/routine.ts";
import { useCave } from "../app/context.ts";
import { useToday } from "../app/hooks.ts";
import { useDoc } from "../store/queries.ts";
import { Icon } from "../ui/icon.tsx";
import { Sheet } from "../ui/Sheet.tsx";

const SETTINGS = { id: "settings", kind: "setting" as const, collection: null };

export const AREA_LOOK: Record<Area, { label: string; icon: string; color: string }> = {
  body: { label: "Body", icon: "dumbbell", color: "var(--orange)" },
  learn: { label: "Learn", icon: "graduation-cap", color: "var(--wait)" },
  rest: { label: "Rest", icon: "moon", color: "var(--vio)" },
  fun: { label: "Fun", icon: "party-popper", color: "var(--warn)" },
  other: { label: "Other", icon: "circle", color: "var(--muted)" },
};

const KIND_LABEL: Record<BlockKind, string> = {
  fixed: "On set days",
  daily: "Every day",
  weekly: "Some times a week",
};

const timeOf = (b: RoutineBlock) => (b.start ? `${b.start}–${endOf(b)}` : duration(b.minutes));
const look = (b: RoutineBlock) => ({ "--area": AREA_LOOK[areaOf(b)].color }) as CSSProperties;

type Editing = { id: string } | { day?: number };

/**
 * Calendar → Routine (Week until after M13): the week the owner aims for, as a board. A column
 * per weekday holds the blocks for that day, a strip above holds the "some times a week" ones,
 * and each block is coloured by its area. A guide only: it has no dates and counts nothing.
 */
export function Routine() {
  const { local } = useCave();
  const routine = routineOf(useDoc(local.db, "settings")?.data);
  const weekday = weekdayOf(useToday());
  const [editing, setEditing] = useState<Editing>();
  const [error, setError] = useState<string>();
  const weekly = routine.blocks.filter((b) => b.kind === "weekly");
  const areas = minutesByArea(routine);

  const save = async (next: RoutineValue) => {
    const parsed = parseRoutine(next);
    if (!parsed.ok) {
      setError(parsed.error);
      return false;
    }
    setError(undefined);
    await local.write(SETTINGS, { routine: parsed.value });
    return true;
  };
  const selected =
    editing && "id" in editing ? routine.blocks.find((b) => b.id === editing.id) : undefined;
  const close = () => {
    setEditing(undefined);
    setError(undefined);
  };

  const card = (b: RoutineBlock) => (
    <li key={b.id}>
      <button
        type="button"
        className="routine-block"
        style={look(b)}
        onClick={() => setEditing({ id: b.id })}
      >
        <span className="num routine-time">{timeOf(b)}</span>
        <span className="routine-title">{b.title}</span>
      </button>
    </li>
  );

  return (
    <div className="routine-page">
      <header className="routine-head">
        {areas.length === 0 && (
          <span className="muted routine-areas">
            A guide for your week, not a schedule. Add the first block.
          </span>
        )}
        <ul className="routine-areas" aria-label="Hours a week by area">
          {areas.map(({ area, minutes }) => (
            <li
              key={area}
              className="routine-area"
              style={{ "--area": AREA_LOOK[area].color } as CSSProperties}
            >
              <Icon name={AREA_LOOK[area].icon} size={14} />
              {AREA_LOOK[area].label}
              <span className="num muted">{duration(minutes)}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn primary"
          disabled={routine.blocks.length >= MAX_BLOCKS}
          onClick={() => setEditing({})}
        >
          <Icon name="plus" size={15} /> Add block
        </button>
      </header>
      {weekly.length > 0 && (
        <section className="panel routine-weekly" aria-label="Some times a week">
          <span className="k">Any day</span>
          <ul>
            {weekly.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  className="routine-block"
                  style={look(b)}
                  onClick={() => setEditing({ id: b.id })}
                >
                  <span className="routine-title">{b.title}</span>
                  <span className="num routine-time">
                    {b.perWeek}× · {duration(b.minutes)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="routine-board">
        {DAY_NAMES.map((name, i) => (
          <section
            key={name}
            className={`routine-day${i === weekday ? " today" : ""}`}
            aria-label={name}
          >
            <header>
              <span className="k">{name}</span>
              <button
                type="button"
                className="btn routine-add"
                aria-label={`Add a block on ${name}`}
                disabled={routine.blocks.length >= MAX_BLOCKS}
                onClick={() => setEditing({ day: i })}
              >
                <Icon name="plus" size={13} />
              </button>
            </header>
            <ul>{blocksForDay(routine, i).map(card)}</ul>
          </section>
        ))}
      </div>
      {editing && (
        <Sheet title={selected ? "Edit block" : "New block"} onClose={close}>
          <BlockForm
            block={selected}
            day={"day" in editing ? editing.day : undefined}
            error={error}
            onSave={async (block) => {
              if (await save(withBlock(routine, block))) close();
            }}
            onDelete={
              selected
                ? async () => {
                    if (await save(withoutBlock(routine, selected.id))) close();
                  }
                : undefined
            }
          />
        </Sheet>
      )}
    </div>
  );
}

function BlockForm({
  block,
  day,
  error,
  onSave,
  onDelete,
}: {
  block: RoutineBlock | undefined;
  /** A new block added from a day's +: on that day. */
  day: number | undefined;
  error: string | undefined;
  onSave(block: RoutineBlock): Promise<void>;
  onDelete: (() => Promise<void>) | undefined;
}) {
  const [title, setTitle] = useState(block?.title ?? "");
  const [area, setArea] = useState<Area>(block ? areaOf(block) : "body");
  const [kind, setKind] = useState<BlockKind>(
    block?.kind ?? (day === undefined ? "daily" : "fixed"),
  );
  const [minutes, setMinutes] = useState(String(block?.minutes ?? 60));
  const [start, setStart] = useState(block?.start ?? "");
  const [days, setDays] = useState<number[]>(
    block?.days ?? (day === undefined ? [0, 1, 2, 3, 4] : [day]),
  );
  const [perWeek, setPerWeek] = useState(String(block?.perWeek ?? 2));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void onSave({
      id: block?.id ?? newId(),
      title: title.trim(),
      kind,
      minutes: Number(minutes),
      area,
      ...(start && kind !== "weekly" ? { start } : {}),
      ...(kind === "fixed" ? { days } : {}),
      ...(kind === "weekly" ? { perWeek: Number(perWeek) } : {}),
    });
  };
  return (
    <form
      onSubmit={submit}
      className="routine-form"
      aria-label={block ? "Edit block" : "New block"}
    >
      <label className="quick-field">
        <span className="k">Title</span>
        <input
          className="input"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <fieldset className="chips routine-area-pick">
        <legend className="k">Area</legend>
        {AREAS.map((a) => (
          <button
            key={a}
            type="button"
            className="btn"
            aria-pressed={area === a}
            style={{ "--area": AREA_LOOK[a].color } as CSSProperties}
            onClick={() => setArea(a)}
          >
            <Icon name={AREA_LOOK[a].icon} size={14} /> {AREA_LOOK[a].label}
          </button>
        ))}
      </fieldset>
      <fieldset className="chips">
        <legend className="k">When</legend>
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            className="btn"
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </fieldset>
      {kind === "fixed" && (
        <fieldset className="chips">
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
        {kind === "weekly" ? (
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
        ) : (
          <label className="quick-field">
            <span className="k">{kind === "fixed" ? "Start" : "Start (optional)"}</span>
            <input
              className="input"
              type="time"
              required={kind === "fixed"}
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
        )}
      </div>
      {error && (
        <p role="alert" className="error" style={{ margin: 0 }}>
          {error}
        </p>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="btn primary">
          {block ? "Save" : "Add"}
        </button>
        {onDelete && (
          <button
            type="button"
            className="btn"
            style={{ marginLeft: "auto" }}
            onClick={() => void onDelete()}
          >
            <Icon name="trash" size={14} /> Delete
          </button>
        )}
      </div>
    </form>
  );
}
