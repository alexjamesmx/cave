import type { Repeat } from "../../../shared/reminders.ts";
import { parseReminder, preview, type WhenContext } from "../../../shared/when.ts";

export type Command =
  | {
      kind: "money";
      amount: number;
      direction: "income" | "expense";
      /** Only from a known `#tag`; otherwise left for the dropdown or the owner. */
      category: string | undefined;
      title: string;
    }
  | { kind: "task"; title: string }
  | {
      kind: "reminder";
      title: string;
      due: string;
      repeat: Repeat;
      /** "Reminder · Pay rent · Thu Oct 22, 09:00 · monthly", shown before it is saved. */
      preview: string;
    }
  | { kind: "habit"; habit: string }
  | { kind: "ask"; question: string }
  | { kind: "jump"; path: string }
  | { kind: "reject"; hint: string };

export interface CommandContext {
  categories: string[];
  habits: { id: string; name: string }[];
  /** Jump targets: anything whose name or id starts with the query. */
  targets: { name: string; id: string; path: string }[];
  /** Now, the settings timezone and the reminder time, for `remind`. */
  when: WhenContext;
}

const MONEY_START = /^\+?\$?\d/;
const MONEY_RE = /^(\+)?\$?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)(?=\s|$)\s*(.*)$/;
const TAG_RE = /(^|\s)#([\p{L}\p{N}_-]+)(?=\s|$)/gu;

const HINT =
  "Try “205 tacos”, “+15040 paycheck”, “todo call the bank”, “remind stretch in 2h”, a habit like “gym”, or “> money”.";

const norm = (s: string) => s.trim().toLowerCase();

function parseMoney(input: string, ctx: CommandContext): Command {
  const m = MONEY_RE.exec(input);
  if (!m)
    return { kind: "reject", hint: "Start with an amount, like “205 tacos” or “$12.50 uber”." };
  const amount = Number((m[2] as string).replaceAll(",", ""));
  const known = new Set(ctx.categories);
  const tags = [...(m[3] ?? "").matchAll(TAG_RE)].map((t) => t[2] as string);
  const categories = [...new Set(tags.filter((t) => known.has(t)))];
  if (categories.length > 1) {
    return { kind: "reject", hint: `Pick one category, not ${categories.join(" and ")}.` };
  }
  const category = categories[0];
  const title = (m[3] ?? "")
    .replace(TAG_RE, (whole, lead: string, tag: string) => (tag === category ? lead : whole))
    .replace(/\s+/g, " ")
    .trim();
  return { kind: "money", amount, direction: m[1] ? "income" : "expense", category, title };
}

/** Command bar grammar, tried in order; anything else is rejected with a hint. */
export function parseCommand(raw: string, ctx: CommandContext): Command {
  const input = raw.trim();
  if (!input) return { kind: "reject", hint: HINT };
  if (MONEY_START.test(input)) return parseMoney(input, ctx);

  const todo = /^todo\s+(.+)$/i.exec(input);
  if (todo) return { kind: "task", title: (todo[1] as string).trim() };

  const remind = /^remind(?:\s+(.*))?$/i.exec(input);
  if (remind) {
    const parsed = parseReminder(remind[1] ?? "", ctx.when);
    if (!parsed.ok) return { kind: "reject", hint: parsed.hint };
    const { title, due, repeat } = parsed;
    return { kind: "reminder", title, due, repeat, preview: preview(parsed, ctx.when) };
  }

  const habit = ctx.habits.find((h) => norm(h.id) === norm(input) || norm(h.name) === norm(input));
  if (habit) return { kind: "habit", habit: habit.id };

  const ask = /^\?\s*(.+)$/.exec(input);
  if (ask) return { kind: "ask", question: (ask[1] as string).trim() };

  const jump = /^>\s*(.+)$/.exec(input);
  if (jump) {
    const q = norm(jump[1] as string);
    const target =
      ctx.targets.find((t) => norm(t.id) === q || norm(t.name) === q) ??
      ctx.targets.find((t) => norm(t.id).startsWith(q) || norm(t.name).startsWith(q));
    return target
      ? { kind: "jump", path: target.path }
      : { kind: "reject", hint: `No page “${q}”.` };
  }
  return { kind: "reject", hint: HINT };
}
