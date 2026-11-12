import { useToday } from "../app/hooks.ts";
import { setSearch, useSearch } from "../app/router.ts";
import { type AgendaItem, agendaCounts } from "../logic/agenda.ts";
import { AgendaGroups, AgendaRow } from "../ui/AgendaList.tsx";
import { QuickReminder } from "../ui/QuickReminder.tsx";
import { useAgenda } from "../ui/useAgenda.ts";
import { useAgendaActions } from "../ui/useAgendaActions.tsx";

/**
 * Calendar → Agenda (M14, was Reminders): one list of everything with a date, reminders, open
 * tasks and payments, in the same groups and counts as Month's Upcoming, with the same quick
 * add. ✓ marks a reminder or a task done and a payment paid; a row opens its editor. Done
 * (`?chip=done`) lists what was done.
 */
export function Agenda() {
  const data = useAgenda();
  const actions = useAgendaActions();
  const today = useToday();
  const showDone = new URLSearchParams(useSearch()).get("chip") === "done";
  if (!data) return null;
  const open = (it: AgendaItem) => actions.open(it.type, it.id);

  return (
    <div className="agenda-page">
      <fieldset className="agenda-pills">
        <legend className="sr">Show</legend>
        <button
          type="button"
          className="pill"
          aria-pressed={!showDone}
          onClick={() => setSearch("")}
        >
          Upcoming <span className="num muted">{agendaCounts(data.groups).all}</span>
        </button>
        <button
          type="button"
          className="pill"
          aria-pressed={showDone}
          onClick={() => setSearch("?chip=done")}
        >
          Done <span className="num muted">{data.done.length}</span>
        </button>
      </fieldset>
      <section className="panel agenda-panel" aria-label="Agenda">
        <QuickReminder />
        {showDone ? (
          <section className="agenda-group" aria-label="Done">
            {data.done.length === 0 && <p className="muted agenda-empty">Nothing done yet.</p>}
            <ul>
              {data.done.map((it) => (
                <AgendaRow
                  key={`${it.type}-${it.id}`}
                  item={it}
                  group="later"
                  today={today}
                  open={open}
                />
              ))}
            </ul>
          </section>
        ) : (
          <AgendaGroups groups={data.groups} today={today} open={open} done={actions.done} />
        )}
      </section>
      {actions.overlay}
    </div>
  );
}
