import { addMoney, ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("Overview: tiles with their change, where it went into the ledger, the year table, and filters kept in the URL", async ({
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
    /vs last month/,
  );
  await expect(page.getByRole("region", { name: "Saved", exact: true })).toContainText(/of income/);
  await expect(page.getByRole("img", { name: /Spent per month, 12 months/ })).toBeVisible();

  // A monthly limit typed on the Budget tile: what is left and the pace, then cleared again.
  const budget = page.getByRole("region", { name: "Budget", exact: true });
  await expect(budget).toContainText("Set a monthly limit");
  await budget.getByRole("button", { name: "Edit" }).click();
  const limit = page.getByRole("region", { name: "Budget settings" }).getByLabel("Monthly limit");
  await limit.fill("1000000");
  await limit.blur();
  await expect(budget).toContainText(/\$[\d,]+ left/);
  await expect(budget).toContainText(/of \$1,000,000 · at this rate/);
  await limit.fill("");
  await limit.blur();
  await expect(budget).toContainText("Set a monthly limit");
  await expect(page.getByRole("img", { name: /Spending per day in/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /Spending per month by category/ })).toBeVisible();
  const where = page.getByRole("region", { name: "Where it went" });
  await expect(where).toContainText("🍬 Gula");

  // A category row opens the ledger filtered to it, for this month.
  await where.getByRole("link", { name: /Gula/ }).click();
  await expect(page).toHaveURL(/\/money\/transactions\?month=\d{4}-\d{2}&category=gula$/);
  await expect(page.getByRole("row").filter({ hasText: "Dashboard gula" }).first()).toBeVisible();
  await page.goBack();

  await page.getByRole("button", { name: "Year", exact: true }).click();
  const year = new Date().getFullYear();
  await expect(page.getByRole("heading", { name: String(year) })).toBeVisible();
  await expect(page.getByRole("region", { name: "Months" }).getByRole("row")).toHaveCount(13);
  await expect(page.getByText("Biggest expenses of the year")).toBeVisible();
  await expect(page.getByRole("region", { name: "Spent", exact: true })).toContainText(
    /vs last year/,
  );

  // A category filter goes into the URL and survives a reload.
  await page.getByText("Filters", { exact: true }).click();
  await page.getByRole("combobox", { name: "Add a category" }).fill("gul");
  await page.getByRole("option", { name: "🍬 Gula" }).click();
  await expect(page).toHaveURL(/categories=gula/);
  await page.reload();
  await expect(page).toHaveURL(/categories=gula/);
  await expect(page.getByText("Filters · 1 on")).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Top titles" })
      .locator(".bar-label", { hasText: "Dashboard gula" }),
  ).toBeVisible();

  await page.screenshot({ path: "test-results/money-dashboard.png", fullPage: true });
  await page.getByText("Filters · 1 on").click();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).not.toHaveURL(/categories=/);
});
