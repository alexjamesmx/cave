import { ownerContext, pickAccount, pushed } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("Money has five tabs; an entry whose date is cleared waits under Undated, out of every total, until dated again", async ({
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
    "Subscriptions",
    "Net worth",
    "Categories",
  ]);
  await page.goto("/money/wealth");
  await expect(page).toHaveURL(/\/money\/net-worth$/);

  // An entry, then its date cleared in the editor, as an import or an agent may leave one.
  await page.goto("/money/transactions");
  await page.getByRole("button", { name: "New entry" }).click();
  const sheet = page.getByRole("dialog", { name: "New entry" });
  const form = sheet.getByRole("form", { name: "Expense" });
  await form.getByLabel("Amount").fill("1240");
  await form.getByLabel("Title").fill("Undated e2e");
  await pickAccount(form);
  await form.getByRole("button", { name: /^Save/ }).click();
  await expect(sheet.getByRole("status").filter({ hasText: "Undated e2e" })).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Undated e2e", exact: true }).click();
  const drawer = page.getByRole("complementary", { name: "Money item" });
  await drawer.getByLabel("Date", { exact: true }).fill("");
  await drawer.getByLabel("Date", { exact: true }).blur();
  await drawer.getByRole("button", { name: "Close" }).click();

  const undated = page.getByRole("region", { name: "Undated" });
  await expect(undated).toContainText(/Undated · \d+ · \$[\d,]+ in no total until dated/);
  const row = undated.getByRole("listitem").filter({ hasText: "Undated e2e" });
  await expect(row).toContainText("−$1,240");

  // The month's totals say what they leave out.
  await page.goto("/money/overview");
  await expect(page.getByText(/\d+ undated, \$[\d,]+ not counted\./)).toBeVisible();

  // Set date (the 1st of this month, so the month view shows it) moves it out of Undated.
  const now = new Date();
  const first = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  await page.goto("/money/transactions");
  await row.getByRole("button", { name: "Set date" }).click();
  await row.getByLabel("Date for Undated e2e").fill(`${first}T12:00`);
  await row.getByRole("button", { name: "Save" }).click();
  await expect(undated).toHaveCount(0);
  const dated = page.getByRole("listitem").filter({ hasText: "Undated e2e" });
  await expect(dated).toContainText("12:00");
  await expect(
    page
      .getByRole("region", { name: /^(Today|Yesterday|[A-Z][a-z]+day 1)$/ })
      .filter({ hasText: "Undated e2e" }),
  ).toHaveCount(1);

  // Leave the shared database as found.
  await dated.getByRole("button", { name: "Undated e2e" }).click();
  await pushed(page, () =>
    page
      .getByRole("complementary", { name: "Money item" })
      .getByRole("button", { name: "Delete" })
      .click(),
  );
  await expect(page.getByRole("listitem").filter({ hasText: "Undated e2e" })).toHaveCount(0);
});

test("a subscription can't be saved without amount, repeat and account", async ({ browser }) => {
  const page = await (await ownerContext(browser)).newPage();
  // The old Payments tab lands on Subscriptions.
  await page.goto("/money/payments");
  await expect(page).toHaveURL(/\/money\/subscriptions$/);
  await page.getByRole("button", { name: "New subscription" }).click();
  const form = page.getByRole("form", { name: "New subscription" });
  await form.getByLabel("Name").fill("Strict e2e");
  await expect(form.getByText(/Still needs: amount, due date(, account)?./)).toBeVisible();
  await expect(form.getByRole("button", { name: "Save" })).toBeDisabled();
});
