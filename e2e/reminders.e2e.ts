import { addReminder, offOriginRequests, ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

// Thursday 2026-10-15, 10:00 in Mexico City, the seeded timezone. Timers keep running.
const NOW = new Date("2026-10-15T16:00:00Z");

test("reminders: added from New, edited, added and deleted from a day in Month, in Upcoming; Done moves a monthly one and Undo restores it", async ({
  browser,
  baseURL,
}) => {
  const context = await ownerContext(browser, { viewport: { width: 1360, height: 900 } });
  const foreign = offOriginRequests(context, baseURL as string);
  const page = await context.newPage();
  page.on("dialog", (dialog) => void dialog.accept());
  await page.clock.setFixedTime(NOW);
  await page.goto("/");

  await addReminder(page, { title: "Test", date: "2026-10-16", time: "09:00" });

  // C opens the calendar when no field has focus.
  await page.locator("body").focus();
  await page.keyboard.press("c");
  await expect(page).toHaveURL(/\/calendar\/month$/);
  await expect(page.getByRole("heading", { name: "October 2026" })).toBeVisible();
  const agenda = page.getByRole("region", { name: "Upcoming" });
  await expect(agenda.getByRole("button", { name: "Test" })).toBeVisible();
  await expect(agenda.getByText("Oct 16", { exact: true })).toBeVisible();

  // A click on a reminder edits it in the sheet.
  await page.getByRole("button", { name: "09:00 Test" }).click();
  let sheet = page.getByRole("dialog", { name: "Reminder" });
  await expect(sheet.getByLabel("Title")).toHaveValue("Test");
  await sheet.getByLabel("Title").fill("Test edited");
  await sheet.getByLabel("Time").fill("10:30");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("button", { name: "10:30 Test edited" })).toBeVisible();

  // A click on a day's number adds one on that day; Delete removes it (kept in the history).
  await page.getByRole("button", { name: /New reminder on .*Oct 20/ }).click();
  sheet = page.getByRole("dialog", { name: "New reminder" });
  await expect(sheet.getByLabel("Date")).toHaveValue("2026-10-20");
  await sheet.getByLabel("Title").fill("Dentist");
  await sheet.getByLabel("Time").fill("17:30");
  await sheet.getByRole("button", { name: "Save" }).click();
  await page.getByRole("button", { name: "17:30 Dentist" }).click();
  await page
    .getByRole("dialog", { name: "Reminder" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page.getByRole("button", { name: "17:30 Dentist" })).toHaveCount(0);

  // Upcoming's New reminder opens the same form on today.
  await agenda.getByRole("button", { name: "New reminder" }).click();
  sheet = page.getByRole("dialog", { name: "New reminder" });
  await expect(sheet.getByLabel("Date")).toHaveValue("2026-10-15");
  await page.keyboard.press("Escape");

  // A monthly reminder: Done moves it a month and leaves it open; Undo puts it back.
  await addReminder(page, {
    title: "Rent",
    date: "2026-11-15",
    time: "09:00",
    repeat: "Every month",
  });
  await page.goto("/c/reminders");
  await expect(page).toHaveURL(/\/calendar\/reminders$/);
  const table = page.getByRole("table", { name: "Reminders" });
  const row = table.getByRole("row").filter({ hasText: "Rent" });
  const heading = (day: string) => table.getByRole("rowheader", { name: new RegExp(`^${day} `) });
  await expect(heading("Nov 15")).toBeVisible();
  await expect(row).toContainText("Every month");
  await row.getByRole("button", { name: "Done" }).click();
  await expect(heading("Dec 15")).toBeVisible();
  await expect(heading("Nov 15")).toHaveCount(0);
  await row.getByRole("button", { name: "Undo" }).click();
  await expect(heading("Nov 15")).toBeVisible();

  // The table: chips with counts, search, the repeat filter; a row opens the form.
  await page.getByRole("button", { name: /^Overdue/ }).click();
  await expect(page).toHaveURL(/chip=overdue/);
  await page.getByRole("button", { name: /^Upcoming/ }).click();
  await page.getByLabel("Search reminders").fill("rent");
  await expect(table.getByRole("row").filter({ hasText: "Test edited" })).toHaveCount(0);
  await page.getByLabel("Repeat filter").selectOption({ label: "Every month" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Rent" }).click();
  await expect(page.getByRole("dialog", { name: "Reminder" }).getByLabel("Title")).toHaveValue(
    "Rent",
  );
  await page
    .getByRole("dialog", { name: "Reminder" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(row).toHaveCount(0);

  expect(foreign).toEqual([]);
});
