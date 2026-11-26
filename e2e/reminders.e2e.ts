import { addReminder, mcpClient, offOriginRequests, ownerContext } from "./helpers.ts";
import { expect, type Locator, type Page, test } from "./test.ts";

// Thursday 2026-10-15, 10:00 in Mexico City, the seeded timezone. Timers keep running.
const NOW = new Date("2026-10-15T16:00:00Z");

const TASK = "File the form e2e";
const BILL = "Pay the card e2e";

const region = (scope: Page | Locator, name: string | RegExp) =>
  scope.getByRole("region", { name, exact: typeof name === "string" });
/** The group headings of a list, with their counts ("Overdue 2"). */
const headings = (list: Locator) => list.locator("h3").allTextContents();
const toast = (page: Page, text: string) => page.getByRole("status").filter({ hasText: text });

/** Opens a reminder from the list and deletes it (it stays in the history). */
async function deleteReminder(page: Page, list: Locator, title: string) {
  await list.getByRole("button", { name: title, exact: true }).click();
  await page
    .getByRole("dialog", { name: "Reminder" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(list.getByRole("button", { name: title, exact: true })).toHaveCount(0);
}

test("Month and Upcoming, the quick add, the Agenda with the same counts, ✓ on a reminder and a task, and a lead-up", async ({
  browser,
  baseURL,
}) => {
  const context = await ownerContext(browser, { viewport: { width: 1360, height: 900 } });
  const foreign = offOriginRequests(context, baseURL as string);
  const page = await context.newPage();
  page.on("dialog", (dialog) => void dialog.accept());
  await page.clock.setFixedTime(NOW);

  // A task overdue since yesterday and a bill in three days that starts reminding a week
  // before, as an agent adds them.
  const agent = await mcpClient(baseURL as string, "agenda-e2e");
  for (const [collection, title, fields] of [
    ["tasks", TASK, { status: "todo", due: "2026-10-14" }],
    ["reminders", BILL, { due: "2026-10-18T09:00", repeat: "monthly", lead_days: 7, done: false }],
  ] as const) {
    const created = await agent.callTool({
      name: "create",
      arguments: { collection, title, fields },
    });
    expect(created.isError).toBeFalsy();
  }
  await agent.close();

  await page.goto("/");
  await addReminder(page, { title: "Test", date: "2026-10-16", time: "09:00" });

  // C opens Month: typed pills in the grid, Upcoming beside it.
  await page.locator("body").focus();
  await page.keyboard.press("c");
  await expect(page).toHaveURL(/\/calendar\/month$/);
  await expect(page.getByRole("heading", { name: "October 2026" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Legend" })).toHaveText(/Reminder.*Task/);
  const month = region(page, "Month");
  await expect(month.getByRole("button", { name: `09:00 ${BILL}`, exact: true })).toBeVisible();
  await expect(month.getByRole("button", { name: TASK, exact: true })).toBeVisible();
  const upcoming = region(page, "Upcoming");
  await expect(
    region(upcoming, "Tomorrow").getByRole("button", { name: "Test", exact: true }),
  ).toBeVisible();
  // Overdue holds the task, not only reminders; the bill in its lead-up is in Today.
  const overdue = region(upcoming, "Overdue");
  await expect(overdue.getByRole("button", { name: TASK, exact: true })).toBeVisible();
  await expect(
    region(upcoming, /^Today/)
      .getByRole("listitem")
      .filter({ hasText: BILL }),
  ).toContainText("In 3 days");

  // A click on a reminder edits it in the sheet.
  await month.getByRole("button", { name: "09:00 Test", exact: true }).click();
  let sheet = page.getByRole("dialog", { name: "Reminder" });
  await expect(sheet.getByLabel("Title")).toHaveValue("Test");
  await sheet.getByLabel("Title").fill("Test edited");
  await sheet.getByLabel("Time").fill("10:30");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(month.getByRole("button", { name: "10:30 Test edited", exact: true })).toBeVisible();

  // A click on a day's number adds one on that day; Delete removes it (kept in the history).
  await page.getByRole("button", { name: /New reminder on .*Oct 20/ }).click();
  sheet = page.getByRole("dialog", { name: "New reminder" });
  await expect(sheet.getByLabel("Date")).toHaveValue("2026-10-20");
  await sheet.getByLabel("Title").fill("Dentist");
  await sheet.getByLabel("Time").fill("17:30");
  await sheet.getByRole("button", { name: "Save" }).click();
  await month.getByRole("button", { name: "17:30 Dentist", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Reminder" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(month.getByRole("button", { name: "17:30 Dentist", exact: true })).toHaveCount(0);

  // The quick add: Enter saves for today, at the next hour since 09:00 has passed; Tomorrow
  // takes the reminder time again.
  const quick = upcoming.getByLabel("Remind me to");
  await expect(upcoming.getByLabel("Time")).toHaveValue("11:00");
  await quick.fill("Call the plumber e2e");
  await quick.press("Enter");
  await expect(quick).toHaveValue("");
  await expect(
    region(upcoming, /^Today/).getByRole("button", { name: "Call the plumber e2e", exact: true }),
  ).toBeVisible();
  await upcoming.getByRole("button", { name: "Tomorrow", exact: true }).click();
  await expect(upcoming.getByLabel("Time")).toHaveValue("09:00");
  await quick.fill("Water the plants e2e");
  await quick.press("Enter");
  await expect(
    region(upcoming, "Tomorrow").getByRole("button", { name: "Water the plants e2e", exact: true }),
  ).toBeVisible();

  // The Agenda (Reminders was its old name) lists the same groups with the same counts.
  const shown = await headings(upcoming);
  expect(shown[0]).toMatch(/^Overdue \d+$/);
  await page.goto("/c/reminders");
  await expect(page).toHaveURL(/\/calendar\/agenda$/);
  const agenda = region(page, "Agenda");
  await expect.poll(() => headings(agenda)).toEqual(shown);

  // ✓ on a monthly reminder moves it a month and leaves it open; Undo puts it back.
  await addReminder(page, {
    title: "Rent e2e",
    date: "2026-11-15",
    time: "09:00",
    repeat: "Every month",
  });
  const rent = agenda.getByRole("listitem").filter({ hasText: "Rent e2e" });
  await expect(rent).toContainText("Nov 15 · every month");
  await rent.getByRole("button", { name: "Done: Rent e2e" }).click();
  await expect(rent).toContainText("Dec 15");
  await toast(page, "Done · Rent e2e").getByRole("button", { name: "Undo" }).click();
  await expect(rent).toContainText("Nov 15");

  // ✓ on a task marks it done: it leaves the list and shows under Done.
  await agenda.getByRole("button", { name: `Done: ${TASK}` }).click();
  await expect(agenda.getByRole("button", { name: TASK, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /^Done \d/ }).click();
  await expect(page).toHaveURL(/chip=done/);
  await agenda.getByRole("button", { name: TASK, exact: true }).click();
  const drawer = page.getByRole("complementary", { name: "Tasks item" });
  await expect(drawer.getByLabel("Completed")).not.toHaveValue("");
  await drawer.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: /^Upcoming/ }).click();

  // The lead-up in the reminder's sheet: the agent's week shows; one day before is not yet,
  // so the bill moves to This week; Off keeps it there.
  await agenda.getByRole("button", { name: BILL, exact: true }).click();
  sheet = page.getByRole("dialog", { name: "Reminder" });
  await expect(sheet.getByLabel("Start reminding")).toHaveValue("7");
  await expect(sheet.getByLabel("How often")).toHaveValue("1");
  await sheet.getByLabel("How often").selectOption({ label: "Every 2 days" });
  await sheet.getByRole("button", { name: "Save" }).click();
  await agenda.getByRole("button", { name: BILL, exact: true }).click();
  await expect(sheet.getByLabel("How often")).toHaveValue("2");
  await sheet.getByLabel("Start reminding").selectOption({ label: "1 day before" });
  await expect(sheet.getByLabel("How often")).toHaveValue("1");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(
    region(agenda, "This week").getByRole("button", { name: BILL, exact: true }),
  ).toBeVisible();
  await agenda.getByRole("button", { name: BILL, exact: true }).click();
  await sheet.getByLabel("Start reminding").selectOption({ label: "Off" });
  await expect(sheet.getByLabel("How often")).toHaveCount(0);
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toHaveCount(0);

  // Snooze in a reminder's sheet: an hour from now is still today.
  await agenda.getByRole("button", { name: "Test edited", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Reminder" })
    .getByRole("button", { name: "1 hour" })
    .click();
  await expect(
    region(agenda, /^Today/)
      .getByRole("listitem")
      .filter({ hasText: "Test edited" }),
  ).toContainText("11:00");

  // Leave the shared database as found.
  for (const title of [
    "Test edited",
    "Call the plumber e2e",
    "Water the plants e2e",
    "Rent e2e",
    BILL,
  ])
    await deleteReminder(page, agenda, title);

  expect(foreign).toEqual([]);
});
