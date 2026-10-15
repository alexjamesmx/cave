import { expect, test } from "@playwright/test";
import { offOriginRequests } from "./helpers.ts";

// Thursday 2026-10-15, 10:00 in Mexico City, the seeded timezone. Timers keep running.
const NOW = new Date("2026-10-15T16:00:00Z");

test("remind from the command bar, see it in the calendar and the Due card; Done moves a monthly one and Undo restores it", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext();
  const foreign = offOriginRequests(context, baseURL as string);
  const page = await context.newPage();
  await page.clock.setFixedTime(NOW);
  await page.goto("/");

  const bar = page.getByLabel("Capture or jump");
  await bar.fill("remind test tomorrow 9am");
  await expect(page.getByText("Reminder · Test · Fri Oct 16, 09:00")).toBeVisible();
  await bar.press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: "Saved · Reminder · Test" }),
  ).toBeVisible();

  // A date-less entry is refused with a hint, and nothing is saved.
  await bar.fill("remind call mom");
  await bar.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Add when" })).toBeVisible();

  const due = page.getByRole("region", { name: "Due" });
  await expect(due.getByText("Tomorrow")).toBeVisible();
  await expect(due.getByRole("link", { name: "Test" })).toBeVisible();

  // C opens the calendar when no field has focus.
  await bar.blur();
  await page.keyboard.press("c");
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(page.getByRole("heading", { name: "October 2026" })).toBeVisible();
  await expect(page.getByRole("button", { name: "09:00 Test" })).toBeVisible();
  const agenda = page.getByRole("region", { name: "Agenda" });
  await expect(agenda.getByRole("button", { name: "Test" })).toBeVisible();

  // A monthly reminder: Done moves it a month and leaves it open; Undo puts it back.
  await page.goto("/");
  await bar.fill("remind rent every month 15 9:00");
  await expect(page.getByText("Reminder · Rent · Sun Nov 15, 09:00 · monthly")).toBeVisible();
  await bar.press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: "Saved · Reminder · Rent" }),
  ).toBeVisible();

  await page.goto("/c/reminders");
  const row = page.getByRole("row").filter({ hasText: "Rent" });
  await expect(row.getByText("Nov 15 09:00")).toBeVisible();
  await row.getByRole("button", { name: "Done" }).click();
  await expect(row.getByText("Dec 15 09:00")).toBeVisible();
  await expect(row.getByRole("button", { name: "Undo" })).toBeVisible();
  await row.getByRole("button", { name: "Undo" }).click();
  await expect(row.getByText("Nov 15 09:00")).toBeVisible();
  await expect(row.getByRole("button", { name: "Done" })).toBeVisible();

  expect(foreign).toEqual([]);
});
