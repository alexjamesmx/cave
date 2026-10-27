import { budgetLine, budgetOf } from "../../shared/budget.ts";
import { transferCategories } from "../../shared/categories.ts";
import { daysInMonth, localDate, monthOf } from "../../shared/dates.ts";
import { fieldsOf } from "../../shared/fields.ts";
import { FLOWS } from "../../shared/flows/seed.ts";
import { monthSummary } from "../../shared/money.ts";
import { isActive, PAYMENTS } from "../../shared/payments.ts";
import { isLive, openQuestions } from "../../shared/project-status.ts";
import { PARTS } from "../../shared/projects.ts";
import type { Zone } from "../../shared/recurrence.ts";
import type { Doc } from "../../shared/types.ts";
import type { Store } from "../store.ts";
import { dueList } from "./due-list.ts";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const titleOf = (d: Doc) =>
  typeof d.data._title === "string" && d.data._title ? d.data._title : "Untitled";
const timeOf = (due: string) => (due.length > 10 ? ` ${due.slice(11, 16)}` : "");

/** The digest's lines for `today`: Needs you, what is due, payments, the budget. Empty when nothing. */
export function digestLines(store: Store, zone: Zone, now: number): string[] {
  const today = localDate(new Date(now), zone.timeZone);
  const lines: string[] = [];
  const questions = openQuestions(store.itemsOf("tasks"));
  const blocked = store.itemsOf(PARTS).filter((p) => isLive(p) && p.data.status === "blocked");
  const waiting = store
    .itemsOf(FLOWS)
    .filter((f) => isLive(f) && f.data.status === "pending-approval");
  if (questions.length + blocked.length + waiting.length > 0) {
    lines.push("Needs you");
    for (const q of questions) lines.push(`  ? ${titleOf(q)}`);
    for (const p of blocked) lines.push(`  Blocked: ${titleOf(p)}`);
    for (const f of waiting) lines.push(`  Flow waiting for approval: ${titleOf(f)}`);
  }
  const due = dueList(store, zone, now).filter((e) => e.group !== "Tomorrow");
  if (due.length > 0) {
    lines.push("Due");
    for (const e of due)
      lines.push(
        `  ${e.group === "Overdue" ? "Overdue" : "Today"}${timeOf(e.due)} · ${titleOf(e.doc)}`,
      );
  }
  const payments = store
    .itemsOf(PAYMENTS)
    .filter(
      (p) => isActive(p) && typeof p.data.due === "string" && p.data.due.slice(0, 10) === today,
    );
  if (payments.length > 0) {
    lines.push("Payments due today");
    for (const p of payments) {
      const amount = p.data.amount;
      lines.push(
        `  ${titleOf(p)}${typeof amount === "number" ? ` · ${p.data.approx === true ? "about " : ""}${money(amount)}` : ""}`,
      );
    }
  }
  const limit = budgetOf(store.get("settings")?.data).monthlyLimit;
  if (limit !== undefined) {
    const month = monthOf(today);
    const categories = fieldsOf(store.get("money")).find((f) => f.id === "category");
    const s = monthSummary(store.itemsOf("money"), month, today, transferCategories(categories));
    const line = budgetLine(limit, s.spent, s.daysElapsed, daysInMonth(month));
    lines.push(
      `Budget: ${money(line.spent)} of ${money(line.limit)}, ${
        line.left >= 0 ? `${money(line.left)} left` : `${money(-line.left)} over`
      }${line.pace === undefined ? "" : `, at this rate ${money(line.pace)}`}`,
    );
  }
  return lines;
}
