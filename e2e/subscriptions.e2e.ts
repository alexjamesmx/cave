import { ownerContext } from "./helpers.ts";
import { expect, type Page, test } from "./test.ts";

async function spend(page: Page, title: string, amount: number, when: string) {
  await page.goto("/money/transactions");
  await page.getByRole("button", { name: "New transaction" }).click();
  const form = page.getByRole("form", { name: "Expense" });
  await form.getByLabel("Amount").fill(String(amount));
  await form.getByLabel("Title").fill(title);
  await form.getByLabel("When").fill(when);
  await form.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: title })).toBeVisible();
}

test("subscription history becomes a payment only after approval; rejected charges and 'Not a subscription' change nothing", async ({
  browser,
}) => {
  const page = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  page.on("dialog", (dialog) => void dialog.accept());
  const gym = `E2E Gym ${Date.now()}`;
  const noise = `E2E Noise ${Date.now()}`;
  for (const day of ["2026-06-05", "2026-07-05", "2026-08-05"])
    await spend(page, gym, 500, `${day}T09:00`);
  for (const day of ["2026-07-10", "2026-08-10"]) await spend(page, noise, 80, `${day}T09:00`);

  await page.goto("/money/review");
  const review = page.getByRole("region", { name: "Subscriptions" });
  const proposal = review.getByRole("article", { name: gym });
  // Two intervals don't say how often it repeats: no repeat, and no date.
  await expect(proposal).toContainText(
    "New subscription · $500 · repeat not clear yet · Needs date",
  );

  // Nothing is written yet: no payment exists.
  await page.goto("/money/payments");
  await expect(page.getByRole("button", { name: gym, exact: true })).toHaveCount(0);

  // Approve two of the three charges.
  await page.goto("/money/review");
  await proposal.getByRole("checkbox").first().uncheck();
  await proposal.getByRole("button", { name: "Approve 2 of 3" }).click();
  await expect(review.getByRole("status")).toContainText(`Added · ${gym}: 2 charges linked`);
  // The one left out is still proposed, now attaching to the new payment.
  await expect(proposal).toContainText(`Attach to the payment “${gym}”`);
  await expect(proposal.getByRole("checkbox")).toHaveCount(1);

  // "Not a subscription" is remembered and writes no payment.
  await review
    .getByRole("article", { name: noise })
    .getByRole("button", { name: "Not a subscription" })
    .click();
  await expect(review.getByRole("article", { name: noise })).toHaveCount(0);
  await page.reload();
  await expect(review.getByRole("article", { name: noise })).toHaveCount(0);

  // The payment is under Needs date, and its drawer shows its history.
  await page.goto("/money/payments");
  const needs = page.getByRole("region", { name: "Needs date" });
  await needs.getByRole("button", { name: gym, exact: true }).click();
  const drawer = page.getByRole("complementary", { name: "Payments item" });
  await expect(drawer.getByRole("region", { name: "History" })).toContainText("History · 2");

  // Leave the shared database as found.
  await drawer.getByRole("button", { name: "Delete" }).click();
  for (const title of [gym, gym, gym, noise, noise]) {
    await page.goto("/money/transactions");
    await page.getByRole("button", { name: title, exact: true }).first().click();
    await page
      .getByRole("complementary", { name: "Money item" })
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(page.getByRole("complementary", { name: "Money item" })).toHaveCount(0);
  }
});

test("a payment past its due date shows under Overdue with Paid, Set next date and Deactivate", async ({
  browser,
}) => {
  const page = await (await ownerContext(browser)).newPage();
  page.on("dialog", (dialog) => void dialog.accept());
  const title = `iphone e2e ${Date.now()}`;
  await page.goto("/money/payments");
  await page.getByRole("button", { name: "New payment" }).click();
  const form = page.getByRole("form", { name: "Payment" });
  await form.getByLabel("Title").fill(title);
  await form.getByLabel("Kind").selectOption("bill");
  await form.getByLabel("Due").fill("2026-08-02T09:00");
  await form.getByRole("button", { name: "Save" }).click();

  const overdue = page.getByRole("region", { name: "Overdue" });
  const row = overdue.locator(".system-row", { hasText: title });
  for (const action of ["Paid", "Set next date", "Deactivate"])
    await expect(row.getByRole("button", { name: action })).toBeVisible();
  await row.getByRole("button", { name: "Deactivate" }).click();
  const inactive = page.getByRole("region", { name: "Inactive" });
  await expect(inactive.locator(".system-row", { hasText: title })).toBeVisible();
  // Its kind is left as the owner set it.
  await expect(inactive.locator(".system-row", { hasText: title })).toContainText("bill");

  await inactive.getByRole("button", { name: title, exact: true }).click();
  await page
    .getByRole("complementary", { name: "Payments item" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page.getByRole("button", { name: title, exact: true })).toHaveCount(0);
});
