import type { CSSProperties } from "react";
import {
  type AgendaGroup,
  type AgendaGroupId,
  type AgendaItem,
  type AgendaType,
  groupName,
  whenLabel,
} from "../logic/agenda.ts";
import { REPEAT_LABEL } from "./ReminderForm.tsx";
import { rowOpen } from "./row-open.ts";

/** Each type's mark and colour, as the month grid's legend shows them. */
export const TYPE_LOOK: Record<AgendaType, { emoji: string; color: string; label: string }> = {
  reminder: { emoji: "🔔", color: "var(--s-rose)", label: "Reminder" },
  task: { emoji: "✅", color: "var(--s-blue)", label: "Task" },
  payment: { emoji: "💳", color: "var(--s-green)", label: "Payment" },
};

const CHECK_LABEL: Record<AgendaType, string> = {
  reminder: "Done",
  task: "Done",
  payment: "Mark paid",
};

interface RowProps {
  item: AgendaItem;
  group: AgendaGroupId;
  today: string;
  open(item: AgendaItem): void;
  /** ✓; absent for items already done. */
  done?: ((item: AgendaItem) => void) | undefined;
}

/**
 * One item: its type's tile, the title on one line ending in "…", when it is due (and its
 * repeat), and ✓. A click anywhere on the row, or Enter, opens it.
 */
export function AgendaRow({ item, group, today, open, done }: RowProps) {
  const look = TYPE_LOOK[item.type];
  return (
    <li
      className={`agenda-row${done ? "" : " done"}`}
      style={{ "--c": look.color } as CSSProperties}
      {...rowOpen(() => open(item))}
    >
      <span className="agenda-type" aria-hidden="true" data-emoji={look.emoji} />
      <span className="agenda-main">
        <button type="button" className="link agenda-title" onClick={() => open(item)}>
          {item.title}
        </button>
        <span className="agenda-sub">
          <span className="num agenda-time">{whenLabel(item, group, today)}</span>
          {item.repeat !== "none" && (
            <span className="agenda-repeat"> · {REPEAT_LABEL[item.repeat].toLowerCase()}</span>
          )}
        </span>
      </span>
      {done && (
        <button
          type="button"
          className="agenda-check"
          aria-label={`${CHECK_LABEL[item.type]}: ${item.title}`}
          onClick={() => done(item)}
        >
          ✓
        </button>
      )}
    </li>
  );
}

/** The agenda's groups under their headings, each with its count. */
export function AgendaGroups({
  groups,
  today,
  open,
  done,
}: {
  groups: AgendaGroup[];
  today: string;
  open(item: AgendaItem): void;
  done(item: AgendaItem): void;
}) {
  if (groups.length === 0) return <p className="muted agenda-empty">Nothing coming up.</p>;
  return groups.map((g) => (
    <section
      key={g.id}
      className="agenda-group"
      data-group={g.id}
      aria-label={groupName(g.id, today)}
    >
      <h3>
        {groupName(g.id, today)} <span className="num">{g.items.length}</span>
      </h3>
      <ul>
        {g.items.map((it) => (
          <AgendaRow
            key={`${it.type}-${it.id}`}
            item={it}
            group={g.id}
            today={today}
            open={open}
            done={done}
          />
        ))}
      </ul>
    </section>
  ));
}
