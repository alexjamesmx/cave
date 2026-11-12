import { ownerContext, pickAccount, pickCategory, pushed } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("Transactions: the form from the page, the chips and To review, a category picked in place, a search by amount, the year, and the editor", async ({
  browser,
}) => {
  const page = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  const stamp = Date.now();
  await page.goto("/money/transactions");
  await page.getByRole("button", { name: "New entry" }).click();
  const sheet = page.getByRole("dialog", { name: "New entry" });
  const form = sheet.getByRole("form", { name: /Expense|Income/ });
  const save = form.getByRole("button", { name: /^Save/ });

  // The amount comes first; Income offers income categories only, even under More.
  await expect(form.getByLabel("Amount")).toBeFocused();
  await form.getByRole("button", { name: "Income", exact: true }).click();
  await expect(form.getByRole("button", { name: "Salary", exact: true })).toBeVisible();
  await form.getByRole("button", { name: "More" }).click();
  await expect(form.getByRole("button", { name: "Gula", exact: true })).toHaveCount(0);
  await form.getByRole("button", { name: "Expense", exact: true }).click();

  // An expense: a typed amount with its comma, a category from More found by typing.
  await form.getByLabel("Amount").fill("1,225");
  await form.getByLabel("Title").fill(`Mezcal ${stamp}`);
  await form.getByLabel("Find a category").fill("gul");
  await form.getByRole("button", { name: "Gula", exact: true }).click();
  // On a database with no account yet, one is typed in place, and Save waits for it.
  if ((await form.getByLabel("Add an account").count()) > 0) await expect(save).toBeDisabled();
  await pickAccount(form);
  await expect(save).toHaveText("Save −$1,225 · Gula");
  await save.click();
  await expect(
    sheet.getByRole("status").filter({ hasText: `Saved · Expense · Mezcal ${stamp}` }),
  ).toBeVisible();
  // The form stays, cleared for the next one; this one has no category.
  await expect(form.getByLabel("Amount")).toHaveValue("");
  await expect(form.getByLabel("Amount")).toBeFocused();
  await form.getByLabel("Amount").fill("60");
  await form.getByLabel("Title").fill(`Mystery ${stamp}`);
  await expect(save).toHaveText("Save −$60");
  await save.click();
  await expect(sheet.getByRole("status").filter({ hasText: `Mystery ${stamp}` })).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();

  const rows = page.getByRole("listitem");
  const mezcal = rows.filter({ hasText: `Mezcal ${stamp}` });
  const mystery = rows.filter({ hasText: `Mystery ${stamp}` });
  await expect(mezcal).toContainText("Gula");
  await expect(mezcal).toContainText("−$1,225");

  // To review keeps the entry without a category; a category picked in place clears it.
  await page.getByRole("button", { name: /^To review/ }).click();
  await expect(page).toHaveURL(/chip=review/);
  await expect(mystery).toHaveCount(1);
  await expect(mezcal).toHaveCount(0);
  await mystery.getByRole("button", { name: "+ Pick category" }).click();
  await mystery.getByRole("combobox", { name: `Category for Mystery ${stamp}` }).fill("food");
  await page.getByRole("option", { name: /Food$/ }).click();
  await expect(mystery).toHaveCount(0);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page).not.toHaveURL(/chip=/);
  await expect(mystery).toContainText("Food");

  // One search finds an amount with or without $ and its comma, and a category by name.
  const search = page.getByLabel("Search transactions");
  for (const q of ["$1225", "1,225", "gula"]) {
    await search.fill(q);
    await expect(mezcal).toHaveCount(1);
    await expect(mystery).toHaveCount(0);
  }
  await search.fill("");

  // A year scope runs from 1 January to today; the month comes back with Month.
  await page.getByRole("button", { name: "Year", exact: true }).click();
  await expect(page).toHaveURL(/month=\d{4}$/);
  await expect(mezcal).toHaveCount(1);
  await page.getByRole("button", { name: "Previous year" }).click();
  await expect(mezcal).toHaveCount(0);
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await expect(page).toHaveURL(/month=\d{4}-12$/);
  await page.goto("/money/transactions");
  await expect(mezcal).toHaveCount(1);

  // A row opens the editor; an expense offers expense categories, income swaps them.
  await mezcal.locator(".tx-acct").click();
  const drawer = page.getByRole("complementary", { name: "Money item" });
  const choices = () => drawer.getByLabel("Category", { exact: true }).locator("option");
  await expect(choices().filter({ hasText: "Gula" })).toHaveCount(1);
  await expect(choices().filter({ hasText: "Salary" })).toHaveCount(0);
  await drawer.getByLabel("Direction").selectOption("income");
  await expect(choices().filter({ hasText: "Salary" })).toHaveCount(1);
  // The category it already has stays offered until it is changed.
  await expect(choices().filter({ hasText: "Gula" })).toHaveCount(1);
  await drawer.getByLabel("Direction").selectOption("expense");
  await drawer.getByRole("button", { name: "Close" }).click();

  // Leave the shared database as found.
  page.on("dialog", (dialog) => void dialog.accept());
  for (const title of [`Mezcal ${stamp}`, `Mystery ${stamp}`]) {
    await page.getByRole("button", { name: title, exact: true }).click();
    await pushed(page, () =>
      page
        .getByRole("complementary", { name: "Money item" })
        .getByRole("button", { name: "Delete" })
        .click(),
    );
    await expect(rows.filter({ hasText: title })).toHaveCount(0);
  }
});

test("the money form: an account is always chosen, never No account; a new one is typed in place and Save waits for it", async ({
  browser,
}) => {
  // The spec above leaves at least one live account.
  const page = await (await ownerContext(browser)).newPage();
  await page.goto("/money/transactions");
  await page.getByRole("button", { name: "New entry" }).click();
  const form = page.getByRole("dialog", { name: "New entry" }).getByRole("form");
  const save = form.getByRole("button", { name: /^Save/ });
  await form.getByLabel("Amount").fill("12");
  await pickCategory(form, "Food");
  const accounts = form.getByRole("group", { name: "Account" });
  await expect(accounts.getByRole("button", { name: "No account" })).toHaveCount(0);
  await expect(accounts.getByRole("button", { pressed: true })).toHaveCount(1);
  await expect(save).toBeEnabled();
  await accounts.getByRole("button", { name: "+ New" }).click();
  await expect(save).toBeDisabled();
  await form.getByLabel("New account").fill("E2E spare");
  await expect(save).toBeEnabled();
});
