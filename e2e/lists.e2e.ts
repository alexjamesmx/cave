import { ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("Settings → Lists: rename, emoji, colour, reorder, archive and restore; payments share money's lists", async ({
  browser,
}) => {
  const page = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  await page.goto("/settings/lists");
  const tasks = page.getByRole("region", { name: "Tasks lists" });
  const priority = tasks.getByRole("list", { name: "Priority options" });
  await expect(priority.getByRole("listitem")).toHaveCount(3);

  // Rename and an emoji: the value stays, only what shows changes.
  await priority.getByLabel("Name for high").fill("Urgent");
  await priority.getByLabel("Emoji for high").fill("🔥");
  await priority.getByLabel("Emoji for high").blur();
  await expect(priority.getByRole("listitem").first()).toContainText("🔥 Urgent");

  // A colour from the palette, then one typed as hex.
  await priority.getByRole("button", { name: "Colour for high", exact: true }).click();
  await priority.getByRole("button", { name: "#3DE0FF" }).click();
  await priority.getByRole("button", { name: "Colour for high", exact: true }).click();
  await priority.getByLabel("Colour for high as hex").fill("#123456");
  await priority.getByLabel("Colour for high as hex").press("Enter");
  await expect(priority.locator(".swatch").first()).toHaveCSS(
    "background-color",
    "rgb(18, 52, 86)",
  );

  // Reorder, archive and restore.
  await priority.getByRole("button", { name: "Move low up" }).click();
  await expect(priority.getByRole("listitem").nth(1)).toContainText("low");
  await priority.getByRole("button", { name: "Archive low" }).click();
  await expect(priority.getByRole("listitem")).toHaveCount(2);
  await tasks.getByText("Archived (1)").click();
  await tasks.getByRole("button", { name: "Restore low" }).click();
  await expect(priority.getByRole("listitem")).toHaveCount(3);

  // Put it back as it was for the other specs.
  await priority.getByRole("button", { name: "Move low down" }).click();
  await priority.getByLabel("Name for high").fill("");
  await priority.getByLabel("Emoji for high").fill("");
  await priority.getByLabel("Emoji for high").blur();
  await expect(priority.getByRole("listitem").nth(2)).toContainText("low");

  // Payments' category and account are money's lists, not copies.
  const money = page.getByRole("region", { name: "Money lists" });
  await expect(money.getByText("Payments · Category")).toBeVisible();
  await expect(money.getByText(/Uses Money → Category \(expense only\)/)).toBeVisible();
  await expect(money.getByText(/Uses Money → Account,/)).toBeVisible();

  // A new account typed in the money form joins the list the payment form offers.
  const account = `E2E bank ${Date.now()}`;
  await page.goto("/");
  await page.getByRole("button", { name: "Expense" }).first().click();
  const form = page.getByRole("form", { name: /Expense/ });
  await form.getByLabel("Amount").fill("10");
  await form.getByLabel("Title").fill("Lists e2e");
  await form.getByLabel("Account").selectOption("New account…");
  await form.getByLabel("New account").fill(account);
  await form.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Lists e2e" })).toBeVisible();
  await page.getByRole("button", { name: "Payment", exact: true }).click();
  const pay = page.getByRole("form", { name: "Payment" });
  await expect(pay.getByLabel("Account").locator("option", { hasText: account })).toHaveCount(1);

  // Archive the account again so the shared list stays as found; the entry keeps it, greyed.
  await page.goto("/settings/lists");
  const accounts = page.getByRole("list", { name: "Account options" });
  await accounts.getByRole("button", { name: `Archive ${account}` }).click();
  await expect(accounts.getByText(account)).toHaveCount(0);
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/money/transactions");
  await page.getByRole("button", { name: "Lists e2e", exact: true }).click();
  await page
    .getByRole("complementary", { name: "Money item" })
    .getByRole("button", { name: "Delete" })
    .click();
});
