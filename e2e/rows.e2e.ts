import { addMoney, archiveAccount, newAccount, openNew, ownerContext, pushed } from "./helpers.ts";
import { expect, type Locator, type Page, test } from "./test.ts";

/** A local `YYYY-MM-DDTHH:mm` `days` from now at 09:00, as the browser sees it. */
const localAt = (page: Page, days: number) =>
  page.evaluate((d) => {
    const at = new Date(Date.now() + d * 86_400_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T09:00`;
  }, days);

/** A click on a part of the row that isn't its title opens the drawer; so does Enter on the row. */
async function opensByClickAndKey(page: Page, row: Locator, part: Locator, drawer: string) {
  const aside = page.getByRole("complementary", { name: drawer });
  await part.click();
  await expect(aside).toBeVisible();
  await aside.getByRole("button", { name: "Close" }).click();
  await expect(aside).toHaveCount(0);
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(aside).toBeVisible();
  await aside.getByRole("button", { name: "Close" }).click();
}

test("a click anywhere on a row, or Enter, opens its item in every section", async ({
  browser,
}) => {
  const page = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/");

  // A subscription due tomorrow (Calendar, Money → Subscriptions), a task and an expense.
  const account = `Rows e2e card ${Date.now()}`;
  await openNew(page);
  await page.getByRole("button", { name: "Subscription", exact: true }).click();
  const pay = page.getByRole("form", { name: "New subscription" });
  await pay.getByLabel("Name").fill("Rows e2e bill");
  await pay.getByLabel("Amount").fill("120");
  await pay.getByLabel("Charged on").fill((await localAt(page, 1)).slice(0, 10));
  await newAccount(pay, account);
  await pay.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved · Rows e2e bill" })).toBeVisible();
  await openNew(page);
  await page.getByRole("button", { name: "Task", exact: true }).click();
  const task = page.getByRole("form", { name: "Task" });
  await task.getByLabel("Title").fill("Rows e2e task");
  await task.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved · Task" })).toBeVisible();
  await addMoney(page, { amount: 42, title: "Rows e2e coffee" });
  await expect(page.getByRole("status").filter({ hasText: "Rows e2e coffee" })).toBeVisible();

  // Calendar → Month's Upcoming.
  await page.goto("/calendar/month");
  const agenda = page
    .getByRole("region", { name: "Upcoming" })
    .locator("li", { hasText: "Rows e2e bill" });
  await opensByClickAndKey(page, agenda, agenda.locator(".agenda-time"), "Payments item");

  // Money → Subscriptions: a click on a row, or Enter, opens it in its form.
  await page.goto("/money/subscriptions");
  const row = page.getByRole("row").filter({ hasText: "Rows e2e bill" });
  const sheet = page.getByRole("dialog", { name: "Rows e2e bill" });
  await row.locator("td").nth(2).click();
  await expect(sheet.getByLabel("Name")).toHaveValue("Rows e2e bill");
  await sheet.getByRole("button", { name: "Close" }).click();
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Delete" }).click();
  await expect(row).toHaveCount(0);

  // Money → Transactions and Tasks → List: a table cell that isn't the title.
  await page.goto("/money/transactions");
  const coffee = page.locator("tr", { hasText: "Rows e2e coffee" });
  await opensByClickAndKey(page, coffee, coffee.locator("td").nth(1), "Money item");
  await page.goto("/tasks/list");
  const taskRow = page.locator("tr", { hasText: "Rows e2e task" });
  await opensByClickAndKey(page, taskRow, taskRow.locator("td").nth(1), "Tasks item");

  // Projects → Ideas.
  await page.goto("/projects/ideas");
  await page.getByLabel("New idea").fill("Rows e2e idea");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const idea = page.getByRole("listitem").filter({ hasText: "Rows e2e idea" });
  await opensByClickAndKey(page, idea, idea.locator(".chip").first(), "Ideas item");

  // Leave the shared database as found.
  for (const [path, name, drawer] of [
    ["/projects/ideas", "Rows e2e idea", "Ideas item"],
    ["/tasks/list", "Rows e2e task", "Tasks item"],
    ["/money/transactions", "Rows e2e coffee", "Money item"],
  ] as const) {
    await page.goto(path);
    await page.getByRole("button", { name, exact: true }).first().click();
    await pushed(page, () =>
      page
        .getByRole("complementary", { name: drawer })
        .getByRole("button", { name: "Delete" })
        .click(),
    );
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  }
  await archiveAccount(page, account);
});
