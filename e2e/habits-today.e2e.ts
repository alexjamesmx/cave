import { ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

// 23:58 on Tue 2026-09-01 in Mexico City (UTC-6), the seeded timezone. A day in the past, so
// the entry's stamps are never ahead of the server's clock.
const BEFORE_MIDNIGHT = new Date("2026-09-02T05:58:00Z");
const AFTER_MIDNIGHT = new Date("2026-09-02T06:01:00Z");

test("a diary left open past midnight shows the new day's empty habits; yesterday keeps its check", async ({
  browser,
}) => {
  const page = await (await ownerContext(browser)).newPage();
  await page.clock.install({ time: BEFORE_MIDNIGHT });
  await page.goto("/notes/write");
  const label = (text: string) => page.getByText(text, { exact: true });
  await expect(label("Today Sep 1 2026")).toBeVisible();
  const habit = page.locator("button.chip[aria-pressed=false]").first();
  const name = (await habit.textContent()) ?? "";
  await habit.click();
  const checked = page.getByRole("button", { name, exact: true });
  await expect(checked).toHaveAttribute("aria-pressed", "true");

  // A phone keeps the app in memory with its timers suspended: the time jumps past midnight
  // without a tick, and the page only learns of it when it becomes visible again.
  await page.clock.setSystemTime(AFTER_MIDNIGHT);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(label("Today Sep 2 2026")).toBeVisible();
  await expect(checked).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("button", { name: "Previous day" }).click();
  await expect(label("Sep 1 2026")).toBeVisible();
  await expect(checked).toHaveAttribute("aria-pressed", "true");

  // A day picked by hand stays put when the clock moves on.
  await page.clock.setSystemTime(new Date("2026-09-03T06:01:00Z"));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(label("Sep 1 2026")).toBeVisible();
  await expect(checked).toHaveAttribute("aria-pressed", "true");

  // Leave the shared database as found.
  await checked.click();
  await expect(checked).toHaveAttribute("aria-pressed", "false");
});
