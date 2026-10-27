import { addMoney, ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("Money → Subscriptions: a charge under Subscriptions is offered to set up from its last charge; set up, it is active with its charges; Cancel and Restore", async ({
  browser,
}) => {
  const page = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  page.on("dialog", (dialog) => void dialog.accept());
  const name = `Streaming ${Date.now()}`;
  await page.goto("/");
  await addMoney(page, { amount: 149, title: name, category: "Subscriptions" });
  await expect(page.getByRole("status").filter({ hasText: name })).toBeVisible();

  await page.goto("/money/subscriptions");
  await expect(page.getByText("What you pay for every month or year")).toBeVisible();
  const found = page.getByRole("region", { name: "Found in your transactions" });
  await expect(found).toContainText(name);

  // Set up opens the form from the last charge: its name, amount and the subscription kind.
  await found.getByRole("button", { name: `Set up ${name}` }).click();
  const form = page.getByRole("form", { name: "Payment" });
  await expect(form.getByLabel("Title")).toHaveValue(name);
  await expect(form.getByLabel("Amount (expected)")).toHaveValue("149");
  await expect(form.getByLabel("Kind")).toHaveValue("subscription");
  await expect(form.getByLabel("Due")).not.toHaveValue("");
  // The charge had no account, so the form asks for one before it saves.
  const account = `E2E card ${Date.now()}`;
  await expect(form).toContainText("A subscription needs: account.");
  await form.getByLabel("Account").selectOption("New account…");
  await form.getByLabel("New account").fill(account);
  await form.getByRole("button", { name: "Save" }).click();

  // Now it is active, with its charge counted, and no longer offered.
  const active = page.getByRole("region", { name: "Active subscriptions" });
  const row = active.getByRole("listitem").filter({ hasText: name });
  await expect(row).toContainText("1 charge");
  await expect(row).toContainText("/ month");
  await expect(page.getByRole("button", { name: `Set up ${name}` })).toHaveCount(0);

  // Cancel moves it to Cancelled; Restore brings it back.
  await row.getByRole("button", { name: "Cancel" }).click();
  const cancelled = page.getByRole("region", { name: "Cancelled subscriptions" });
  await expect(cancelled).toContainText(name);
  await cancelled
    .getByRole("listitem")
    .filter({ hasText: name })
    .getByRole("button", { name: "Restore" })
    .click();
  await expect(row).toBeVisible();

  // Leave the shared database as found: the subscription and its charge deleted, the account
  // archived.
  await row.getByRole("button", { name, exact: true }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(active).not.toContainText(name);
  await page.goto("/money/transactions");
  await page.getByRole("button", { name, exact: true }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  await page.goto("/money/lists");
  const accounts = page.getByRole("list", { name: "Account options" });
  await accounts.getByRole("button", { name: `Archive ${account}` }).click();
  await expect(accounts.getByText(account)).toHaveCount(0);
});
