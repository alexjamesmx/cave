import { openNew, ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("Money → Categories & accounts: rename, emoji, colour, reorder, archive and restore; payments share the lists", async ({
  browser,
}) => {
  const page = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  await page.goto("/money/lists");
  // Categories in three lists by what the money does.
  const categories = page.getByRole("region", { name: "Expense categories list" });
  const list = categories.getByRole("list", { name: "Expense category options" });
  const income = page
    .getByRole("region", { name: "Income categories list" })
    .getByRole("list", { name: "Income category options" });
  const transfers = page
    .getByRole("region", { name: "Transfers list" })
    .getByRole("list", { name: "Transfer category options" });
  await expect(list.getByRole("listitem").first()).toContainText("🍔 Food");
  await expect(income).toContainText("Salary");
  await expect(income).not.toContainText("Food");
  await expect(list).not.toContainText("Salary");
  const count = await list.getByRole("listitem").count();
  expect(count).toBeGreaterThanOrEqual(10);

  // Rename and an emoji: the value stays, only what shows changes.
  await list.getByLabel("Name for food").fill("Takeout");
  await list.getByLabel("Emoji for food").fill("🥡");
  await list.getByLabel("Emoji for food").blur();
  await expect(list.getByRole("listitem").first()).toContainText("🥡 Takeout");

  // A colour from the palette, then one typed as hex.
  await list.getByRole("button", { name: "Colour for food", exact: true }).click();
  await list.getByRole("button", { name: "#7FC4CF" }).click();
  await list.getByRole("button", { name: "Colour for food", exact: true }).click();
  await list.getByLabel("Colour for food as hex").fill("#123456");
  await list.getByLabel("Colour for food as hex").press("Enter");
  await expect(list.locator(".swatch").first()).toHaveCSS("background-color", "rgb(18, 52, 86)");

  // A kind change moves the category to that list and survives a reload (M12 part 1: it used
  // to save the kind it replaced).
  await transfers.getByLabel("Kind for transfer", { exact: true }).selectOption("expense");
  await expect(list.getByLabel("Kind for transfer", { exact: true })).toHaveValue("expense");
  await page.reload();
  await expect(list.getByLabel("Kind for transfer", { exact: true })).toHaveValue("expense");
  await list.getByLabel("Kind for transfer", { exact: true }).selectOption("transfer");
  await expect(transfers.getByLabel("Kind for transfer", { exact: true })).toHaveValue("transfer");

  // Reorder, archive and restore, on whichever category is second (the stored order is the
  // owner's).
  const secondName = list
    .getByRole("listitem")
    .nth(1)
    .getByRole("textbox", { name: /^Name for / });
  const second = ((await secondName.getAttribute("aria-label")) ?? "").replace("Name for ", "");
  expect(second).not.toBe("");
  await list.getByRole("button", { name: `Move ${second} up` }).click();
  await expect(list.getByRole("listitem").first().getByLabel(`Name for ${second}`)).toBeVisible();
  await list.getByRole("button", { name: `Archive ${second}` }).click();
  await expect(list.getByRole("listitem")).toHaveCount(count - 1);
  await categories.getByText("Archived (1)").click();
  await categories.getByRole("button", { name: `Restore ${second}` }).click();
  await expect(list.getByRole("listitem")).toHaveCount(count);

  // Put it back as it was for the other specs.
  await list.getByRole("button", { name: `Move ${second} down` }).click();
  await expect(list.getByRole("listitem").first().getByLabel("Name for food")).toBeVisible();
  await list.getByLabel("Name for food").fill("Food");
  await list.getByLabel("Emoji for food").fill("🍔");
  await list.getByLabel("Emoji for food").blur();
  await expect(list.getByRole("listitem").first()).toContainText("🍔 Food");

  // A new account typed in the money form joins the Account list. The e2e database starts with
  // none, so it is then the only live one: the payment form takes it without a picker.
  const account = `E2E bank ${Date.now()}`;
  await page.goto("/");
  await openNew(page);
  await page.getByRole("button", { name: "Money", exact: true }).click();
  const form = page.getByRole("form", { name: /Expense/ });
  await form.getByLabel("Amount").fill("10");
  await form.getByLabel("Title").fill("Lists e2e");
  await form.getByLabel("Account").selectOption("New account…");
  await form.getByLabel("New account").fill(account);
  await form.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Lists e2e" })).toBeVisible();
  await openNew(page);
  await page.getByRole("button", { name: "Subscription", exact: true }).click();
  const pay = page.getByRole("form", { name: "New subscription" });
  await expect(pay.getByLabel("Name")).toBeVisible();
  await expect(pay.getByLabel("Account")).toHaveCount(0);

  // Archive the account again so the shared list stays as found; the entry keeps it, greyed.
  await page.goto("/money/lists");
  const accounts = page.getByRole("list", { name: "Account options" });
  await expect(accounts.getByText(account)).toBeVisible();
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
