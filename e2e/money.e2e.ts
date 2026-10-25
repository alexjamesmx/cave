import { ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("Transactions: entries from the page itself, chips, group by category, the category filter and the month strip", async ({
  browser,
}) => {
  const page = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  const stamp = Date.now();
  await page.goto("/money/transactions");
  await page.getByRole("button", { name: "New entry" }).click();
  const form = page.getByRole("form", { name: /Expense|Income/ });
  const picker = form.getByRole("combobox", { name: "Category", exact: true });

  // Income offers income categories only, found by typing.
  await form.getByRole("button", { name: "Income", exact: true }).click();
  await picker.fill("sal");
  await expect(page.getByRole("option", { name: "💼 Salary" })).toBeVisible();
  await expect(page.getByRole("option", { name: "🍬 Gula" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await form.getByRole("button", { name: "Expense", exact: true }).click();

  // An expense with a category picked by typing; the form stays open, cleared for the next.
  await form.getByLabel("Amount").fill("410");
  await form.getByLabel("Title").fill(`Mezcal ${stamp}`);
  await picker.fill("gul");
  await page.getByRole("option", { name: "🍬 Gula" }).click();
  await expect(picker).toHaveValue("🍬 Gula");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: `Saved · Expense · Mezcal ${stamp}` }),
  ).toBeVisible();
  await expect(form.getByLabel("Amount")).toHaveValue("");
  await form.getByLabel("Amount").fill("60");
  await form.getByLabel("Title").fill(`Mystery ${stamp}`);
  await form.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Mystery ${stamp}` })).toBeVisible();

  const rows = page.getByRole("row");
  const mezcal = rows.filter({ hasText: `Mezcal ${stamp}` });
  const mystery = rows.filter({ hasText: `Mystery ${stamp}` });
  await expect(mezcal).toContainText("🍬 Gula");
  await expect(mezcal).toContainText("−$410");

  // The Uncategorized chip keeps only the entry with no category.
  await page.getByRole("button", { name: "Uncategorized", exact: true }).click();
  await expect(page).toHaveURL(/chip=uncategorized/);
  await expect(mystery).toHaveCount(1);
  await expect(mezcal).toHaveCount(0);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page).not.toHaveURL(/chip=/);

  // Group by category: a Gula group with its subtotal, collapsible.
  await page.getByLabel("Group by").selectOption("category");
  const gula = page.getByRole("rowgroup", { name: "🍬 Gula" });
  await expect(gula.getByRole("row").filter({ hasText: `Mezcal ${stamp}` })).toBeVisible();
  await expect(gula.getByRole("row").first()).toContainText("−$");
  await gula.getByRole("button", { name: /Gula/ }).click();
  await expect(gula.getByRole("row").filter({ hasText: `Mezcal ${stamp}` })).toHaveCount(0);
  await expect(page.getByRole("rowgroup", { name: "Uncategorized" })).toContainText(
    `Mystery ${stamp}`,
  );

  // The category filter, then the month strip and All time.
  await page.getByLabel("Group by").selectOption("day");
  await page.getByRole("combobox", { name: "Category filter" }).fill("gul");
  await page.getByRole("option", { name: "🍬 Gula" }).click();
  await expect(page).toHaveURL(/category=gula/);
  await expect(mystery).toHaveCount(0);
  await expect(mezcal).toHaveCount(1);
  await page.getByRole("button", { name: "Clear category filter" }).click();
  await expect(page).not.toHaveURL(/category=/);
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(page).toHaveURL(/month=\d{4}-\d{2}/);
  await expect(mezcal).toHaveCount(0);
  await page.getByRole("button", { name: "All time" }).click();
  await expect(page).toHaveURL(/month=all/);
  await expect(mezcal).toHaveCount(1);

  // Leave the shared database as found.
  page.on("dialog", (dialog) => void dialog.accept());
  for (const title of [`Mezcal ${stamp}`, `Mystery ${stamp}`]) {
    await page.getByRole("button", { name: title, exact: true }).click();
    await page
      .getByRole("complementary", { name: "Money item" })
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(rows.filter({ hasText: title })).toHaveCount(0);
  }
});
