import { fillReminder, offOriginRequests, ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

// Thursday 2026-10-15, 10:00 in Mexico City, the seeded timezone. Timers keep running.
const NOW = new Date("2026-10-15T16:00:00Z");

test("a reminder from Home's form, seen in in the calendar and the Due card; Done moves a monthly one and Undo restores it", async ({
  browser,
  baseURL,
}) => {
  const context = await ownerContext(browser);
  const foreign = offOriginRequests(context, baseURL as string);
  const page = await context.newPage();
  await page.clock.setFixedTime(NOW);
  await page.goto("/");

  // A "When" that isn't a date shows a hint and can't be saved.
  let form = await fillReminder(page, "Call mom", "soon");
  await expect(form.getByText("Add when")).toBeVisible();
  await expect(form.getByRole("button", { name: "Save" })).toBeDisabled();

  form = await fillReminder(page, "Test", "tomorrow 9am");
  await expect(form.getByText("Reminder · Test · Fri Oct 16, 09:00")).toBeVisible();
  await form.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved · Reminder · Test" }),
  ).toBeVisible();

  const due = page.getByRole("region", { name: "Due" });
  await expect(due.getByText("Tomorrow")).toBeVisible();
  await expect(due.getByRole("button", { name: "Test", exact: true })).toBeVisible();

  // C opens the calendar when no field has focus.
  await page.locator("body").focus();
  await page.keyboard.press("c");
  await expect(page).toHaveURL(/\/calendar\/month$/);
  await expect(page.getByRole("heading", { name: "October 2026" })).toBeVisible();
  await expect(page.getByRole("button", { name: "09:00 Test" })).toBeVisible();
  const agenda = page.getByRole("region", { name: "Agenda" });
  await expect(agenda.getByRole("button", { name: "Test" })).toBeVisible();

  // A monthly reminder: Done moves it a month and leaves it open; Undo puts it back.
  await page.goto("/");
  form = await fillReminder(page, "Rent", "every month 15 9:00");
  await expect(form.getByText("Reminder · Rent · Sun Nov 15, 09:00 · monthly")).toBeVisible();
  await form.getByRole("button", { name: "Save" }).click();
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
