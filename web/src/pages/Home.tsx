import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { dayOf, monthName, monthOf } from "../../../shared/dates.ts";
import { FieldValueError } from "../../../shared/fields.ts";
import { monthSummary } from "../../../shared/money.ts";
import type { Doc } from "../../../shared/types.ts";
import { runCommand } from "../app/commands.ts";
import { useCave } from "../app/context.ts";
import { useTimeZone, useToday } from "../app/hooks.ts";
import { collectionPath, navigate } from "../app/router.ts";
import { type CommandContext, parseCommand } from "../logic/command.ts";
import { withActiveFields } from "../logic/field-edits.ts";
import { formatMoney } from "../logic/format.ts";
import { greeting } from "../logic/greeting.ts";
import { entriesByDay, habitsDone } from "../logic/habits.ts";
import { wealthSummary } from "../logic/wealth.ts";
import { useLive } from "../store/live.ts";
import { type CollectionDoc, useCollections, useDoc } from "../store/queries.ts";
import { Icon } from "../ui/icon.tsx";

const EXAMPLES = ["205 tacos #food", "+15040 paycheck", "todo call the bank", "gym", "> money"];
const CLOSED = new Set(["done", "dropped"]);

export function Home() {
  const { local } = useCave();
  const stored = useCollections(local.db);
  const collections = useMemo(() => stored?.map(withActiveFields), [stored]);
  const today = useToday();
  const timeZone = useTimeZone();
  const settings = useDoc(local.db, "settings");
  const items = useLive(
    async () =>
      (await local.db.docs.where("kind").equals("item").toArray()).filter(
        (d) => d.data._deleted !== true,
      ),
    [local.db],
  );
  const byCollection = useMemo(() => {
    const map = new Map<string, Doc[]>();
    for (const doc of items ?? []) {
      const key = doc.collection as string;
      const list = map.get(key);
      if (list) list.push(doc);
      else map.set(key, [doc]);
    }
    return map;
  }, [items]);
  const of = (id: string) => byCollection.get(id) ?? [];
  const find = (id: string) => collections?.find((c) => c.id === id);

  const date = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(new Date());

  const money = monthSummary(of("money"), monthOf(today), today);
  const openTasks = of("tasks").filter((d) => !CLOSED.has(String(d.data.status))).length;
  const habits = (find("journal")?.data.fields ?? []).filter((f) => f.type === "checkbox");
  const doneToday = habitsDone(
    entriesByDay(of("journal")).get(today),
    habits.map((h) => h.id),
  );
  const wealth = wealthSummary(of("wealth"));
  const leetcode = of("leetcode");
  const solved = leetcode.filter((d) => d.data.status === "solved").length;
  const dueReminders = of("reminders").filter((d) => {
    const day = dayOf(d.data.due);
    return d.data.done !== true && day !== undefined && day <= today;
  }).length;

  return (
    <>
      <section className="hero">
        <span className="k">
          {greeting(new Date(), timeZone, settings?.data.ownerName)} · {date}
        </span>
        <h1>What's the move?</h1>
        {collections && <CommandBar collections={collections} />}
      </section>
      <section className="tiles" aria-label="Today">
        <Tile
          href={collectionPath("money")}
          icon="wallet"
          color="var(--income)"
          label={`Spent · ${monthName(monthOf(today))}`}
        >
          <span className="num big">−{formatMoney(money.spent)}</span>
          <span className="num muted">
            {money.spentCount} entries
            {money.incomplete.length > 0 && ` · ${money.incomplete.length} need an amount`}
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
        <Tile
          href={collectionPath("journal")}
          icon="notebook"
          color="var(--violet)"
          label="Habits today"
        >
          <span className="num big">
            {doneToday.length}/{habits.length}
          </span>
          <span className="muted">{doneToday.join(", ") || "none yet"}</span>
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
        <Tile
          href={collectionPath("reminders")}
          icon="bell"
          color="var(--expense)"
          label="Reminders due"
        >
          <span className="num big">{dueReminders}</span>
          <span className="muted">today or earlier</span>
        </Tile>
      </section>
    </>
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

function CommandBar({ collections }: { collections: CollectionDoc[] }) {
  const { local } = useCave();
  const timeZone = useTimeZone();
  const [input, setInput] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string }>();

  const ctx: CommandContext = useMemo(() => {
    const fields = (id: string) => collections.find((c) => c.id === id)?.data.fields ?? [];
    return {
      categories:
        fields("money")
          .find((f) => f.id === "category")
          ?.options?.map((o) => o.value) ?? [],
      habits: fields("journal")
        .filter((f) => f.type === "checkbox")
        .map(({ id, name }) => ({ id, name })),
      targets: [
        ...collections
          .filter((c) => !c.data.hidden)
          .map((c) => ({ id: c.id, name: c.data.name, path: collectionPath(c.id) })),
        { id: "agents", name: "Agents", path: "/agents" },
        { id: "settings", name: "Settings", path: "/settings" },
      ],
    };
  }, [collections]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const outcome = await runCommand(parseCommand(input, ctx), {
        local,
        timeZone,
        now: new Date(),
      });
      if (outcome.path) navigate(outcome.path);
      setResult(outcome);
      if (outcome.ok) setInput("");
    } catch (error) {
      if (!(error instanceof FieldValueError)) throw error;
      setResult({ ok: false, message: error.message });
    }
  };

  return (
    <div style={{ width: "100%", maxWidth: 760, display: "grid", gap: 10 }}>
      <form className="panel command" onSubmit={submit}>
        <span className="ico" style={{ background: "var(--lime)", color: "var(--on-lime)" }}>
          <Icon name="zap" size={18} strokeWidth={2.2} />
        </span>
        <label htmlFor="command" className="sr">
          Capture or jump
        </label>
        <input
          id="command"
          autoComplete="off"
          placeholder="Capture or jump…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
      </form>
      <p
        role="status"
        className={result?.ok === false ? "error" : "muted"}
        style={{ margin: 0, minHeight: 20 }}
      >
        {result?.message}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
        {EXAMPLES.map((example) => (
          <button key={example} type="button" className="slash" onClick={() => setInput(example)}>
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}
