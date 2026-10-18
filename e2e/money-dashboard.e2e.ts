import { addMoney, ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("year view with its month table, compare, and filters kept in the URL", async ({
  browser,
}) => {
  const context = await ownerContext(browser, { viewport: { width: 1360, height: 1400 } });
  const page = await context.newPage();
  await page.goto("/");
  await addMoney(page, { amount: 333, title: "Dashboard gula", category: "Gula" });
  await expect(page.getByRole("form", { name: "Expense" })).toHaveCount(0);
  // The savings rate needs income this year; the spec brings its own instead of relying on
  // whichever spec ran before it.
  await addMoney(page, { amount: 1000, title: "Dashboard salary", income: true });
  await expect(page.getByRole("form", { name: /Income/ })).toHaveCount(0);

  await page.goto("/c/money");
  await page.getByRole("button", { name: "Year", exact: true }).click();
  const year = new Date().getFullYear();
  await expect(page.getByRole("heading", { name: String(year) })).toBeVisible();
  const months = page.getByRole("region", { name: "Months" });
  await expect(months.getByRole("row")).toHaveCount(13);
  await expect(page.getByText("Biggest expenses of the year")).toBeVisible();
  await expect(page.getByRole("img", { name: /Spending and income per month/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /Savings rate per month/ })).toBeVisible();

  await page.getByLabel("Compare to previous").check();
  await expect(page.getByText(/vs before/).first()).toBeVisible();

  // A category filter goes into the URL and survives a reload.
  await page.getByText("Filters").click();
  await page.getByRole("button", { name: "🍬 Gula" }).first().click();
  await expect(page).toHaveURL(/categories=gula/);
  await page.reload();
  await expect(page).toHaveURL(/categories=gula/);
  await expect(page.getByText("Filters · 1 on")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Top titles" }).getByText("Dashboard gula"),
  ).toBeVisible();

  await page.screenshot({ path: "test-results/money-dashboard.png", fullPage: true });
  await page.getByText("Filters · 1 on").click();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).not.toHaveURL(/categories=/);
});
