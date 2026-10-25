import { budgetLine, budgetOf } from "../../shared/budget.ts";
import { transferCategories } from "../../shared/categories.ts";
import { daysInMonth, localDate, monthOf, shortDay } from "../../shared/dates.ts";
import { fieldsOf } from "../../shared/fields.ts";
import { FLOWS } from "../../shared/flows/seed.ts";
import { monthSummary } from "../../shared/money.ts";
import type { NotificationSettings } from "../../shared/notifications.ts";
import { isActive, PAYMENTS } from "../../shared/payments.ts";
import { isLive, openQuestions } from "../../shared/project-status.ts";
import { PARTS } from "../../shared/projects.ts";
import { dueInstant, type Zone } from "../../shared/recurrence.ts";
import type { Doc } from "../../shared/types.ts";
import { every, type Job } from "../jobs/scheduler.ts";
import type { Store } from "../store.ts";
import { dueList } from "./due-list.ts";
import type { Notifier, SentLog } from "./notifier.ts";
import type { Notification } from "./types.ts";

const CHECK_MS = 5 * 60 * 1000;
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

interface DigestOptions {
  store: Store;
  notifier: Notifier;
  sent: SentLog;
  zone: () => Zone;
  settings: () => NotificationSettings;
}

/**
 * The daily digest (M12 part 3): once a day at `settings.notifications.digest` in the owner's
 * zone, one email with what the day holds: questions, blocked parts and flows waiting, what is
 * due today or overdue, payments due today, and the budget line. Email only: it is the one
 * channel that reads well at this length. Nothing is sent without a time or without email
 * ready, and a day with nothing in it sends nothing.
 */
export function createDigestJob({ store, notifier, sent, zone, settings }: DigestOptions): Job {
  return {
    id: "digest",
    label: "Daily digest",
    describeSchedule: () => {
      const at = settings().digest;
      return at ? `every day at ${at}` : "off (no digest time)";
    },
    nextRun: every(CHECK_MS),
    async run({ now }) {
      const at = settings().digest;
      if (!at) return { result: "skipped", summary: "no digest time set", didSomething: false };
      const z = zone();
      const today = localDate(new Date(now), z.timeZone);
      const instant = dueInstant(`${today}T${at}`, z);
      if (instant === undefined || now < instant)
        return { result: "skipped", summary: `waiting for ${at}`, didSomething: false };
      const key = `digest:${today}`;
      if (sent.wasSent(key)) return { result: "ok", summary: "sent today", didSomething: false };
      const email = notifier.statuses().find((c) => c.id === "email");
      if (!email?.status.ready)
        return { result: "skipped", summary: "email is not ready", didSomething: false };
      const lines = digestLines(store, z, now);
      if (lines.length === 0) {
        sent.markSent(key, null, now, { delivered: 0, failed: 0 });
        return { result: "ok", summary: "nothing to tell today", didSomething: false };
      }
      const n: Notification = {
        key,
        kind: "digest",
        title: `Your day · ${shortDay(today)}`,
        details: lines,
        path: "/projects/scene",
      };
      const result = await notifier.notify(n, ["email"]);
      sent.markSent(key, null, now, result);
      return {
        result: result.failed > 0 && result.delivered === 0 ? "failed" : "ok",
        summary: `${result.delivered} sent, ${lines.length} lines`,
        didSomething: true,
      };
    },
  };
}
