import { ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("Money has four described tabs; an undated transaction saves, shows under Undated and is left out of totals", async ({
  browser,
}) => {
  const page = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/money");
  const tabs = page.getByRole("navigation", { name: "Money tabs" });
  await expect(tabs.getByRole("link")).toHaveText([
    "Overview",
    "Transactions",
    "Payments",
    "Net worth",
  ]);
  await expect(page.getByText("Where your money went this month.")).toBeVisible();
  await tabs.getByRole("link", { name: "Net worth" }).click();
  await expect(page.getByText("What you own minus what you owe.")).toBeVisible();
  await page.goto("/money/wealth");
  await expect(page).toHaveURL(/\/money\/net-worth$/);

  // A transaction with no date and no account.
  await page.goto("/money/transactions");
  await expect(
    page.getByText("Money that moved. Every expense, income and transfer."),
  ).toBeVisible();
  await expect(page.getByRole("columnheader")).toHaveText([
    "Date",
    "Title",
    "Category",
    "Amount",
    "Account",
  ]);
  await page.getByRole("button", { name: "New transaction" }).click();
  const form = page.getByRole("form", { name: "Expense" });
  await form.getByLabel("Amount").fill("1240");
  await form.getByLabel("Title").fill("Undated e2e");
  await form.getByRole("button", { name: "No date" }).click();
  await expect(form.getByText(/Saved without a date/)).toBeVisible();
  await form.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Undated e2e" })).toBeVisible();

  const undated = page.getByRole("rowgroup", { name: "Undated" });
  await expect(undated).toContainText(/Undated · \d+ · \$[\d,]+ in no total until dated/);
  const row = undated.getByRole("row").filter({ hasText: "Undated e2e" });
  await expect(row).toContainText("−$1,240");

  // The month's totals say what they leave out.
  await page.goto("/money/overview");
  await expect(page.getByText(/\d+ undated, \$[\d,]+ not counted\./)).toBeVisible();

  // Set date moves it out of Undated.
  await page.goto("/money/transactions");
  await row.getByRole("button", { name: "Set date" }).click();
  await row.getByLabel("Date for Undated e2e").fill("2026-10-01T12:00");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(undated.getByRole("row").filter({ hasText: "Undated e2e" })).toHaveCount(0);
  const dated = page.getByRole("row").filter({ hasText: "Undated e2e" });
  await expect(dated).toContainText("Oct 1");

  // Leave the shared database as found.
  await dated.getByRole("button", { name: "Undated e2e" }).click();
  await page
    .getByRole("complementary", { name: "Money item" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page.getByRole("row").filter({ hasText: "Undated e2e" })).toHaveCount(0);
});

test("a subscription can't be saved without amount, repeat and account", async ({ browser }) => {
  const page = await (await ownerContext(browser)).newPage();
  await page.goto("/money/payments");
  await page.getByRole("button", { name: "New payment" }).click();
  const form = page.getByRole("form", { name: "Payment" });
  await form.getByLabel("Title").fill("Strict e2e");
  await form.getByLabel("Kind").selectOption("subscription");
  await expect(form.getByText("A subscription needs: amount, due date, account.")).toBeVisible();
  await expect(form.getByRole("button", { name: "Save" })).toBeDisabled();
  await form.getByLabel("Kind").selectOption("bill");
  await expect(form.getByText("Still needs: due date.")).toBeVisible();
});
