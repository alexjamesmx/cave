import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { Status } from "../../../server/owner-api.ts";
import { transferCategories } from "../../../shared/categories.ts";
import { monthName, monthOf } from "../../../shared/dates.ts";
import { FLOWS } from "../../../shared/flows/seed.ts";
import { monthSummary } from "../../../shared/money.ts";
import { NOTES } from "../../../shared/notes.ts";
import { PAYMENTS, upcomingPayments } from "../../../shared/payments.ts";
import type { Doc } from "../../../shared/types.ts";
import { useCave } from "../app/context.ts";
import { useReminderZone, useTimeZone, useToday } from "../app/hooks.ts";
import { ownerGet } from "../app/owner-api.ts";
import { collectionPath, isTyping } from "../app/router.ts";
import { useSignal } from "../app/signal.ts";
import { withActiveFields } from "../logic/field-edits.ts";
import { formatMoney } from "../logic/format.ts";
import { greeting } from "../logic/greeting.ts";
import { entriesByDay, habitsThisWeek } from "../logic/habits.ts";
import { lastStamp, recentNotes } from "../logic/notes.ts";
import { titleOf } from "../logic/views.ts";
import { wealthSummary } from "../logic/wealth.ts";
import { useAllItems, useCollections, useDoc, useItems } from "../store/queries.ts";
import { AskBox } from "../ui/AskBox.tsx";
import { DueCard } from "../ui/DueCard.tsx";
import { Icon } from "../ui/icon.tsx";
import { MoneyForm } from "../ui/MoneyForm.tsx";
import { PaymentForm } from "../ui/PaymentForm.tsx";
import { type QuickKind, ReminderForm, TaskForm } from "../ui/QuickForms.tsx";
import { NoteForm } from "./Notes.tsx";
import { RadarCard } from "./Radar.tsx";

const CLOSED = new Set(["done", "dropped"]);
const DAY_MS = 24 * 60 * 60 * 1000;
const QUICK: { kind: QuickKind; label: string; icon: string }[] = [
  { kind: "expense", label: "Expense", icon: "wallet" },
  { kind: "task", label: "Task", icon: "square-check" },
  { kind: "reminder", label: "Reminder", icon: "bell" },
  { kind: "payment", label: "Payment", icon: "calendar-clock" },
  { kind: "note", label: "Note", icon: "notebook-pen" },
];

const when = (ms: number | null | undefined) =>
  ms ? new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

/** Home: ask or tell the Cave anything, a few quick forms, and everything at a glance. */
export function Home() {
  const { local } = useCave();
  const stored = useCollections(local.db);
  const collections = useMemo(() => stored?.map(withActiveFields), [stored]);
  const timeZone = useTimeZone();
  const settings = useDoc(local.db, "settings");
  const [quick, setQuick] = useState<QuickKind>();
  const [saved, setSaved] = useState<string>();
  // N opens the quick note, as C opens the calendar; never while typing or with a modifier.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target))
        return;
      e.preventDefault();
      setQuick("note");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const date = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(new Date());
  const done = (message: string) => {
    setSaved(message);
    setQuick(undefined);
  };

  return (
    <>
      <section className="hero">
        <span className="k">
          {greeting(new Date(), timeZone, settings?.data.ownerName)} · {date}
        </span>
        <h1>What's the move?</h1>
        <div style={{ width: "100%", maxWidth: 760, display: "grid", gap: 10 }}>
          <AskBox />
          <fieldset className="quick-actions">
            <legend className="sr">Quick actions</legend>
            {QUICK.map((q) => (
              <button
                key={q.kind}
                type="button"
                className={`btn${quick === q.kind ? " primary" : ""}`}
                aria-expanded={quick === q.kind}
                onClick={() => setQuick(quick === q.kind ? undefined : q.kind)}
              >
                <Icon name={q.icon} size={15} /> {q.label}
              </button>
            ))}
          </fieldset>
          {quick === "expense" && <MoneyForm onSaved={(_id, message) => done(message)} />}
          {collections && quick === "task" && <TaskForm collections={collections} onDone={done} />}
          {quick === "payment" && <PaymentForm onSaved={done} />}
          {quick === "note" && <NoteForm onDone={done} />}
          {collections && quick === "reminder" && (
            <ReminderForm collections={collections} onDone={done} />
          )}
          <p role="status" className="muted" style={{ margin: 0, minHeight: 20 }}>
            {saved}
          </p>
        </div>
      </section>
      {collections && <DueCard collections={collections} />}
      {collections && <Glance />}
      <RadarCard />
      <RecentNotes />
    </>
  );
}

/** The five notes changed most recently, on any device. */
function RecentNotes() {
  const notes = useItems(useCave().local.db, NOTES);
  const recent = recentNotes(notes ?? [], lastStamp);
  if (recent.length === 0) return null;
  return (
    <section
      className="panel"
      aria-label="Recent notes"
      style={{ padding: 16, display: "grid", gap: 6 }}
    >
      <span className="k">Recent notes</span>
      {recent.map((n) => (
        <a key={n.id} className="link" href={`/projects/notes/${encodeURIComponent(n.id)}`}>
          {titleOf(n)}
        </a>
      ))}
    </section>
  );
}

/** Live: every number re-reads as data syncs in. */
function Glance() {
  const cave = useCave();
  const { local } = cave;
  const collections = useCollections(local.db);
  const items = useAllItems(local.db);
  const today = useToday();
  const zone = useReminderZone();
  const status = useSignal(cave.status);
  const [server, setServer] = useState<
    { deploy: Status["deploy"]; flowRuns: number } | "offline"
  >();

  useEffect(() => {
    let live = true;
    void Promise.all([
      ownerGet<Status>("/api/status"),
      ownerGet<{ flowRuns: { lastAt: number }[] }>("/api/system"),
    ]).then(([s, system]) => {
      if (!live) return;
      if (!s || !system) return setServer("offline");
      setServer({
        deploy: s.deploy,
        flowRuns: system.flowRuns.filter((r) => r.lastAt > Date.now() - DAY_MS).length,
      });
    });
    return () => {
      live = false;
    };
  }, []);

  const of = useMemo(() => {
    const map = new Map<string, Doc[]>();
    for (const doc of items ?? []) {
      const list = map.get(doc.collection as string);
      if (list) list.push(doc);
      else map.set(doc.collection as string, [doc]);
    }
    return (id: string) => map.get(id) ?? [];
  }, [items]);

  const categories = collections
    ?.find((c) => c.id === "money")
    ?.data.fields.find((f) => f.id === "category");
  const money = monthSummary(of("money"), monthOf(today), today, transferCategories(categories));
  const openTasks = of("tasks").filter((d) => !CLOSED.has(String(d.data.status))).length;
  const habits = (collections?.find((c) => c.id === "journal")?.data.fields ?? [])
    .filter((f) => f.type === "checkbox" && f.archived !== true)
    .map((f) => f.id);
  const week = habitsThisWeek(entriesByDay(of("journal")), habits, today);
  const waiting = of(FLOWS).filter((f) => f.data.status === "pending-approval").length;
  const wealth = wealthSummary(of("wealth"));
  const payments = of(PAYMENTS);
  const nowMs = Date.now();
  const dueSoon = upcomingPayments(payments, nowMs, nowMs + 7 * DAY_MS, zone);
  const dueSoonTotal = dueSoon.reduce((sum, p) => {
    const amount = payments.find((d) => d.id === p.id)?.data.amount;
    return sum + (typeof amount === "number" ? amount : 0);
  }, 0);
  const leetcode = of("leetcode");
  const solved = leetcode.filter((d) => d.data.status === "solved").length;

  return (
    <section className="tiles" aria-label="Glance">
      <Tile
        href={collectionPath("money")}
        icon="wallet"
        color="var(--income)"
        label={`Spent · ${monthName(monthOf(today))}`}
      >
        <span className="num big">−{formatMoney(money.spent)}</span>
        <span className="num muted">
          {money.burnPerDay === undefined ? "—" : `${formatMoney(money.burnPerDay)} a day`} ·{" "}
          {money.spentCount} entries
          {money.incomplete.length > 0 && ` · ${money.incomplete.length} need an amount`}
        </span>
      </Tile>
      <Tile
        href={collectionPath("journal")}
        icon="notebook"
        color="var(--violet)"
        label="Habits this week"
      >
        <span className="num big">
          {week.done}/{week.possible}
        </span>
        <span className="muted">check-offs since Monday</span>
      </Tile>
      <Tile href="/flows" icon="workflow" color="var(--violet)" label="Flows">
        <span className="num big">{waiting}</span>
        <span className="muted">
          waiting for approval ·{" "}
          {typeof server === "object" ? `${server.flowRuns} ran in 24 h` : "runs need the server"}
        </span>
      </Tile>
      <Tile
        href={collectionPath(PAYMENTS)}
        icon="calendar-clock"
        color="var(--orange)"
        label="Payments · 7 days"
      >
        <span className="num big">{formatMoney(dueSoonTotal)}</span>
        <span className="num muted">
          {dueSoon.length} due
          {dueSoon.some((p) => p.overdue) &&
            ` · ${dueSoon.filter((p) => p.overdue).length} overdue`}
        </span>
      </Tile>
      <Tile
        href={collectionPath("tasks")}
        icon="square-check"
        color="var(--lime)"
        label="Open tasks"
      >
        <span className="num big">{openTasks}</span>
        <span className="num muted">{of("tasks").length - openTasks} closed</span>
      </Tile>
      <Tile href={collectionPath("wealth")} icon="landmark" color="var(--cyan)" label="Net worth">
        <span className="num big">{formatMoney(wealth.net)}</span>
        <span className="num muted">{of("wealth").length} accounts</span>
      </Tile>
      <Tile href={collectionPath("leetcode")} icon="code" color="var(--orange)" label="LeetCode">
        <span className="num big">
          {solved}/{leetcode.length}
        </span>
        <span className="muted">solved</span>
      </Tile>
      <Tile href="/settings/system" icon="activity" color="var(--cyan)" label="Sync and deploy">
        <span className="num">synced {when(status.lastSyncedAt ?? null)}</span>
        <span className="num muted">
          {typeof server === "object"
            ? server.deploy
              ? `deploy ${server.deploy.result} · ${when(Date.parse(server.deploy.at))}`
              : "no deploy recorded"
            : server === "offline"
              ? "deploy: offline"
              : "…"}
        </span>
      </Tile>
    </section>
  );
}

function Tile({
  href,
  icon,
  color,
  label,
  children,
}: {
  href: string;
  icon: string;
  color: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <a href={href} className="panel tile">
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name={icon} size={16} color={color} />
        <span className="k">{label}</span>
      </span>
      {children}
    </a>
  );
}
