import { addMoney, ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("Overview: four numbers with their change, the budget, where it went into the ledger for the same month or year, the days shaded and twelve months", async ({
  browser,
}) => {
  const context = await ownerContext(browser, { viewport: { width: 1360, height: 900 } });
  const page = await context.newPage();
  await page.goto("/");
  await addMoney(page, { amount: 333, title: "Dashboard gula", category: "Gula" });
  await expect(page.getByRole("form", { name: "Expense" })).toHaveCount(0);
  // Saved needs income this month; the spec brings its own instead of relying on whichever
  // spec ran before it.
  await addMoney(page, { amount: 1000, title: "Dashboard salary", income: true });
  await expect(page.getByRole("form", { name: /Income/ })).toHaveCount(0);

  await page.goto("/money/overview");
  await expect(page.getByRole("region", { name: "Spent", exact: true })).toContainText(
    /vs [A-Z][a-z]+|Same as|None in/,
  );
  await expect(page.getByRole("region", { name: "Saved", exact: true })).toContainText(
    /of what came in/,
  );

  // A monthly limit set from the Budget left card: what is left, then cleared again.
  const budget = page.getByRole("region", { name: "Budget left", exact: true });
  await expect(budget).toContainText("No limit set");
  await budget.getByRole("button", { name: "Set" }).click();
  const limit = page.getByRole("region", { name: "Budget settings" }).getByLabel("Monthly limit");
  await limit.fill("1000000");
  await limit.blur();
  await expect(budget).toContainText(/of \$1,000,000/);
  await limit.fill("");
  await limit.blur();
  await expect(budget).toContainText("No limit set");

  await expect(page.getByRole("img", { name: /Spending per day in/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /Spending per month by category/ })).toBeVisible();
  const where = page.getByRole("region", { name: "Where it went" });
  await expect(where).toContainText("Gula");

  // A category row opens the ledger filtered to it, for this month.
  await where.getByRole("link", { name: /Gula/ }).click();
  await expect(page).toHaveURL(/\/money\/transactions\?month=\d{4}-\d{2}&category=gula$/);
  await expect(page.getByRole("listitem").filter({ hasText: "Dashboard gula" })).toBeVisible();
  await page.goBack();

  // In Year, the same row opens that year only (not every year), from 1 January to today.
  await page.getByRole("button", { name: "Year", exact: true }).click();
  const year = String(new Date().getFullYear());
  await expect(page.getByRole("heading", { name: year, exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: `Spending per month in ${year}` })).toBeVisible();
  await where.getByRole("link", { name: /Gula/ }).click();
  await expect(page).toHaveURL(new RegExp(`/money/transactions\\?month=${year}&category=gula$`));
  await expect(page.getByRole("heading", { name: year, exact: true })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Dashboard gula" })).toBeVisible();
  await page.screenshot({ path: "test-results/money-dashboard.png", fullPage: true });
});
