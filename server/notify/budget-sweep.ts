import { budgetKey, budgetLine, budgetOf, crossed, type Threshold } from "../../shared/budget.ts";
import { transferCategories } from "../../shared/categories.ts";
import { daysInMonth, localDate, monthOf } from "../../shared/dates.ts";
import { fieldsOf } from "../../shared/fields.ts";
import { monthSummary } from "../../shared/money.ts";
import { every, type Job } from "../jobs/scheduler.ts";
import type { Store } from "../store.ts";
import type { Notifier, SentLog } from "./notifier.ts";
import type { Notification } from "./types.ts";

const HOUR_MS = 60 * 60 * 1000;
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * The title says which line was crossed and nothing more, so a titles-only channel gives no
 * amount away; the numbers wait in the details.
 */
function budgetNotification(
  month: string,
  threshold: Threshold,
  line: ReturnType<typeof budgetLine>,
): Notification {
  return {
    key: budgetKey(month, threshold),
    kind: "budget",
    title: threshold === 1 ? "Budget · over this month's limit" : "Budget · 80% spent this month",
    details: [
      `${money(line.spent)} of ${money(line.limit)}`,
      line.left >= 0 ? `${money(line.left)} left` : `${money(-line.left)} over`,
      ...(line.pace !== undefined ? [`At this rate: ${money(line.pace)} by month end`] : []),
    ],
    path: "/money/overview",
    tag: `budget:${month}`,
  };
}

interface BudgetSweepOptions {
  store: Store;
  notifier: Notifier;
  sent: SentLog;
  timeZone: () => string | undefined;
}

/**
 * Every hour: with a monthly limit set, the month's spending (the same `monthSummary` the app
 * and `money_month` use) is checked against 80 % and 100 % of it, and each crossing notifies
 * once per month. Nothing is sent without a limit, and nothing is ever "missed": a crossing
 * seen late still tells.
 */
export function createBudgetSweep({ store, notifier, sent, timeZone }: BudgetSweepOptions): Job {
  return {
    id: "budget",
    label: "Budget notifications",
    describeSchedule: () => "every hour",
    nextRun: every(HOUR_MS),
    async run({ now }) {
      const limit = budgetOf(store.get("settings")?.data).monthlyLimit;
      if (limit === undefined)
        return { result: "skipped", summary: "no monthly limit set", didSomething: false };
      const today = localDate(new Date(now), timeZone());
      const month = monthOf(today);
      const categories = fieldsOf(store.get("money")).find((f) => f.id === "category");
      const s = monthSummary(store.itemsOf("money"), month, today, transferCategories(categories));
      const line = budgetLine(limit, s.spent, s.daysElapsed, daysInMonth(month));
      let delivered = 0;
      for (const threshold of crossed(limit, s.spent)) {
        const key = budgetKey(month, threshold);
        if (sent.wasSent(key)) continue;
        const result = await notifier.notify(budgetNotification(month, threshold, line));
        sent.markSent(key, null, now, result);
        delivered += 1;
      }
      return {
        result: "ok",
        summary: `${delivered} sent · ${money(s.spent)} of ${money(limit)}`,
        didSomething: delivered > 0,
      };
    },
  };
}
