import { expect, type Page, test } from "@playwright/test";
import { ownerContext } from "./helpers.ts";

/** A local `YYYY-MM-DDTHH:mm` `days` from now at 09:00, as the browser sees it. */
const localAt = (page: Page, days: number) =>
  page.evaluate((d) => {
    const at = new Date(Date.now() + d * 86_400_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T09:00`;
  }, days);

test("a card payment marked paid logs the expense and moves to next month; Undo reverses both", async ({
  browser,
}) => {
  const page = await (await ownerContext(browser)).newPage();
  await page.goto("/");
  const due = await localAt(page, 2);
  const [y, m, d] = due.slice(0, 10).split("-").map(Number) as [number, number, number];
  const nextMonth = new Date(
    Date.UTC(y, m, Math.min(d, new Date(Date.UTC(y, m + 1, 0)).getUTCDate())),
  )
    .toISOString()
    .slice(0, 10);

  await page.getByRole("button", { name: "Payment", exact: true }).click();
  const form = page.getByRole("form", { name: "Payment" });
  await form.getByLabel("Title").fill("Nu card e2e");
  await form.getByLabel("Kind").selectOption("card");
  await form.getByLabel("Amount (expected)").fill("3000");
  await form.getByLabel("Amount varies").check();
  await form.getByLabel("Due").fill(due);
  await form.getByLabel("Repeat").selectOption("monthly");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved · Payment · Nu card e2e" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Due" })).toHaveCount(1);

  await page.goto("/c/payments");
  const list = page.getByRole("region", { name: "Next 30 days" });
  const row = list.locator(".system-row", { hasText: "Nu card e2e" });
  await expect(row).toContainText(due.slice(0, 10));
  await expect(row).toContainText("≈ $3,000");
  const pay = async (amount: string) => {
    await row.getByRole("button", { name: "Paid" }).click();
    // The amount varies, so the form asks for it.
    const expense = page.getByRole("form", { name: "Expense" });
    await expect(expense.getByLabel("Title")).toHaveValue("Nu card e2e");
    await expect(expense.getByLabel("Amount")).toHaveValue("");
    await expense.getByLabel("Amount").fill(amount);
    await expense.getByRole("button", { name: "Save expense and mark paid" }).click();
    await expect(page.getByText("Paid · Nu card e2e: expense saved, next date set.")).toBeVisible();
  };

  // Paid, then Undo: the payment is back on its date and the expense is gone.
  await pay("1");
  await expect(row).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Undone · Nu card e2e" })).toBeVisible();
  await expect(row).toContainText(due.slice(0, 10));
  await page.goto("/c/money/table");
  await expect(page.getByRole("row").filter({ hasText: "Nu card e2e" })).toHaveCount(0);

  // Paid for real: the expense is logged and the same payment moves to next month.
  await page.goto("/c/payments");
  await pay("2875.5");
  await page.goto("/c/payments/table");
  await expect(page.getByRole("row").filter({ hasText: "Nu card e2e" })).toContainText(
    new Date(`${nextMonth}T12:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  );
  await page.goto("/c/money/table");
  await expect(page.getByRole("row").filter({ hasText: "Nu card e2e" })).toContainText("$2,875.5");
});

test("a repeating task marked done comes back on its next date instead of piling up", async ({
  browser,
}) => {
  const page = await (await ownerContext(browser)).newPage();
  await page.goto("/");
  const due = await localAt(page, 1);
  await page.getByRole("button", { name: "Task", exact: true }).click();
  const form = page.getByRole("form", { name: "Task" });
  await form.getByLabel("Title").fill("Pay rent e2e");
  await form.getByLabel("Due (optional)").fill(due);
  await form.getByLabel("Repeat").selectOption("monthly");
  await expect(form.getByText("never piles up copies")).toBeVisible();
  await form.getByRole("button", { name: "Save" }).click();

  const card = page.getByRole("region", { name: "Due" }).locator("li", { hasText: "Pay rent e2e" });
  await card.getByRole("button", { name: "Done" }).click();
  // It moved to next month, so it leaves today's Due list.
  await expect(card).toHaveCount(0);
  await page.goto("/c/tasks/table");
  const rows = page.getByRole("row").filter({ hasText: "Pay rent e2e" });
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("todo");

  // Leave the shared board as found (the tasks spec compares screenshots of it).
  page.on("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Pay rent e2e" }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(rows).toHaveCount(0);
});

test("the subscription finder proposes and adds nothing until confirmed", async ({ browser }) => {
  const page = await (await ownerContext(browser)).newPage();
  await page.goto("/");
  for (const date of ["2026-07-05T08:00", "2026-08-05T08:00", "2026-09-05T08:00"]) {
    await page.getByRole("button", { name: "Expense" }).first().click();
    const form = page.getByRole("form", { name: "Expense" });
    await form.getByLabel("Amount").fill("699");
    await form.getByLabel("Title").fill("Gym sub e2e");
    await form.getByLabel("When").fill(date);
    await form.getByRole("button", { name: "Save" }).click();
    // The same message each time, so wait for the form to close: the write is done then.
    await expect(form).toHaveCount(0);
  }
  await page.goto("/c/payments/table");
  await expect(page.getByRole("row").filter({ hasText: "Gym sub e2e" })).toHaveCount(0);

  await page.goto("/c/payments");
  await page.getByRole("button", { name: "Find subscriptions" }).click();
  const found = page.getByRole("region", { name: "Possible subscriptions" });
  const candidate = found.locator(".system-row", { hasText: "Gym sub e2e" });
  await expect(candidate).toContainText("monthly · 3 times · next 2026-10-05");
  await candidate.getByRole("button", { name: "Add as payment" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Added · Gym sub e2e" })).toBeVisible();
  await page.goto("/c/payments/table");
  await expect(page.getByRole("row").filter({ hasText: "Gym sub e2e" })).toHaveCount(1);
});
