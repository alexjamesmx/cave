import { addMoney, archiveAccount, newAccount, ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("Money → Subscriptions: one table; a new one adds to the month and year, its real charge fills Spent and Since; a row opens it to pause, resume and delete", async ({
  browser,
}) => {
  const page = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  page.on("dialog", (dialog) => void dialog.accept());
  const name = `Streaming ${Date.now()}`;
  const account = `E2E card ${Date.now()}`;

  // A charge already paid, under Subscriptions with the same name.
  await page.goto("/");
  await addMoney(page, { amount: 149, title: name, category: "Subscriptions" });
  await expect(page.getByRole("status").filter({ hasText: name })).toBeVisible();

  await page.goto("/money/subscriptions");
  const totals = page.locator(".subs-totals");
  const before = await totals.textContent();
  await page.getByRole("button", { name: "New subscription" }).click();
  const form = page.getByRole("form", { name: "New subscription" });
  await form.getByLabel("Name").fill(name);
  await form.getByLabel("Amount").fill("1200");
  await form.getByLabel("Every").selectOption("yearly");
  await form.getByLabel("Charged on").fill("2026-11-05");
  await newAccount(form, account);
  await form.getByRole("button", { name: "Save" }).click();

  // One row: a year's amount is $100 a month, and the charge fills Spent and Since.
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText("$1,200");
  await expect(row).toContainText("year");
  await expect(row).toContainText("$100");
  await expect(row).toContainText("$149");
  await expect(totals).not.toHaveText(before ?? "");

  // A click on the row opens it; Pause moves it to Paused, Resume brings it back.
  await row.locator("td").nth(2).click();
  const sheet = page.getByRole("dialog", { name });
  await sheet.getByRole("button", { name: "Pause" }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole("button", { name: /^Paused/ }).click();
  await expect(row).toContainText("Paused");
  await row.click();
  await sheet.getByRole("button", { name: "Resume" }).click();
  await page.getByRole("button", { name: /^Active/ }).click();
  await expect(row).toContainText("$100");

  // Leave the shared database as found: the subscription and its charge deleted, the account
  // archived.
  await row.click();
  await sheet.getByRole("button", { name: "Delete" }).click();
  await expect(row).toHaveCount(0);
  await page.goto("/money/transactions");
  await page.getByRole("button", { name, exact: true }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  await archiveAccount(page, account);
});
