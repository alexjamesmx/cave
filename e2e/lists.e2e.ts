import { addMoney, deleteAccount, openNew, ownerContext, pickAccount, pushed } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("Money → Categories: four lists, rename, emoji, colour and kind, reorder, and a delete that moves its entries, with Undo", async ({
  browser,
}) => {
  const page = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  const stamp = Date.now();
  await page.goto("/money/lists");
  const tabs = page.getByRole("group", { name: "List" });
  await expect(tabs.getByRole("button")).toContainText([
    "Expenses",
    "Income",
    "Transfers",
    "Accounts",
  ]);
  const list = page.getByRole("list", { name: "Expense category options" });
  await expect(list.getByRole("listitem").first().getByLabel("Name for food")).toHaveValue("Food");
  await expect(list.getByLabel("Name for salary")).toHaveCount(0);
  await tabs.getByRole("button", { name: /^Income/ }).click();
  const income = page.getByRole("list", { name: "Income category options" });
  await expect(income.getByLabel("Name for salary")).toHaveValue("Salary");
  await tabs.getByRole("button", { name: /^Expenses/ }).click();

  // Rename and an emoji: the value stays, only what shows changes.
  await list.getByLabel("Name for food").fill("Takeout");
  await list.getByLabel("Name for food").blur();
  await list.getByRole("button", { name: "Change icon of food" }).click();
  await page.getByLabel("Emoji for food").fill("🥡");
  await page.getByLabel("Emoji for food").press("Enter");
  await expect(list.getByRole("button", { name: "Change icon of food" })).toHaveAttribute(
    "data-emoji",
    "🥡",
  );
  await page.reload();
  await expect(list.getByLabel("Name for food")).toHaveValue("Takeout");

  // A colour from the sixteen swatches.
  await list.getByRole("button", { name: "Colour for food" }).click();
  await page
    .getByRole("group", { name: "Colour for food" })
    .getByRole("button", { name: "#2DD4BF" })
    .click();
  await expect(list.getByRole("button", { name: "Colour for food" })).toHaveCSS(
    "background-color",
    "rgb(45, 212, 191)",
  );

  // Reorder from the handle with the keyboard (drag does the same), on whichever is second.
  const second = (
    (await list.getByRole("listitem").nth(1).getByRole("textbox").getAttribute("aria-label")) ?? ""
  ).replace("Name for ", "");
  await list.getByRole("button", { name: `Move ${second}` }).press("ArrowUp");
  await expect(list.getByRole("listitem").first().getByLabel(`Name for ${second}`)).toBeVisible();
  await list.getByRole("button", { name: `Move ${second}` }).press("ArrowDown");
  await expect(list.getByRole("listitem").first().getByLabel("Name for food")).toBeVisible();

  // Put food back as it was for the other specs.
  await list.getByLabel("Name for food").fill("Food");
  await list.getByLabel("Name for food").blur();
  await list.getByRole("button", { name: "Change icon of food" }).click();
  await page.getByLabel("Emoji for food").fill("🍔");
  await page.getByLabel("Emoji for food").press("Enter");
  await list.getByRole("button", { name: "Colour for food" }).click();
  await page
    .getByRole("group", { name: "Colour for food" })
    .getByRole("button", { name: "#FF8A4C" })
    .click();

  // A new category; its kind moves it to Income and back.
  const sweets = `E2E sweets ${stamp}`;
  await page.getByLabel("New expense category", { exact: true }).fill(sweets);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(list.getByLabel(`Name for ${sweets}`)).toBeVisible();
  await list.getByRole("button", { name: `Colour for ${sweets}` }).click();
  await page
    .getByRole("group", { name: `Kind for ${sweets}` })
    .getByRole("button", { name: "Income" })
    .click();
  await expect(list.getByLabel(`Name for ${sweets}`)).toHaveCount(0);
  await tabs.getByRole("button", { name: /^Income/ }).click();
  await income.getByRole("button", { name: `Colour for ${sweets}` }).click();
  await page
    .getByRole("group", { name: `Kind for ${sweets}` })
    .getByRole("button", { name: "Expense" })
    .click();
  await tabs.getByRole("button", { name: /^Expenses/ }).click();
  await expect(list.getByLabel(`Name for ${sweets}`)).toBeVisible();

  // Used by no entry, it goes without a question, and Undo brings it back.
  const toast = page.getByRole("status").filter({ hasText: `Deleted ${sweets}` });
  await list.getByRole("button", { name: `Delete ${sweets}` }).click();
  await expect(list.getByLabel(`Name for ${sweets}`)).toHaveCount(0);
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(list.getByLabel(`Name for ${sweets}`)).toBeVisible();

  // Used by an entry: the dialog asks where it goes. Moved to Food, then undone.
  await addMoney(page, { amount: 45, title: `Treat ${stamp}`, category: sweets });
  await expect(page.getByRole("status").filter({ hasText: `Treat ${stamp}` })).toBeVisible();
  const row = list.getByRole("listitem").filter({ has: page.getByLabel(`Name for ${sweets}`) });
  await expect(row).toContainText("1");
  await list.getByRole("button", { name: `Delete ${sweets}` }).click();
  const dialog = page.getByRole("dialog", { name: `Delete “${sweets}”?` });
  await expect(dialog).toContainText("1 entry uses it. Move them to");
  await dialog.getByRole("combobox").selectOption("food");
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(list.getByLabel(`Name for ${sweets}`)).toHaveCount(0);
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(row).toContainText("1");

  // Deleted again, to nothing: the entry waits in To review.
  await list.getByRole("button", { name: `Delete ${sweets}` }).click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(list.getByLabel(`Name for ${sweets}`)).toHaveCount(0);
  await page.goto("/money/transactions?chip=review");
  const treat = page.getByRole("listitem").filter({ hasText: `Treat ${stamp}` });
  await expect(treat).toContainText("+ Pick category");

  // Leave the shared database as found.
  page.on("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: `Treat ${stamp}`, exact: true }).click();
  await pushed(page, () =>
    page
      .getByRole("complementary", { name: "Money item" })
      .getByRole("button", { name: "Delete" })
      .click(),
  );
  await expect(treat).toHaveCount(0);
});

test("Accounts: a new one typed in the money form joins the list, the forms preselect one, and it deletes like a category", async ({
  browser,
}) => {
  const page = await (await ownerContext(browser)).newPage();
  const account = `E2E bank ${Date.now()}`;
  await page.goto("/");
  const sheet = await openNew(page);
  await sheet.getByRole("button", { name: "Money", exact: true }).click();
  const form = sheet.getByRole("form", { name: "Expense" });
  await form.getByLabel("Amount").fill("10");
  await form.getByLabel("Title").fill("Lists e2e");
  await pickAccount(form);
  const newChip = form.getByRole("button", { name: "+ New" });
  if ((await newChip.count()) > 0) await newChip.click();
  await form.getByLabel(/New account|Add an account/).fill(account);
  await form.getByRole("button", { name: /^Save/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Lists e2e" })).toBeVisible();

  // The next entry starts on the account the last one used.
  await openNew(page);
  await sheet.getByRole("button", { name: "Money", exact: true }).click();
  await expect(form.getByRole("button", { name: account })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");

  await page.goto("/money/lists");
  await page.getByRole("button", { name: /^Accounts/ }).click();
  const accounts = page.getByRole("list", { name: "Account options" });
  await expect(accounts.getByLabel(`Name for ${account}`)).toBeVisible();

  // Its entry goes first, then the account, with nothing left to move.
  page.on("dialog", (d) => void d.accept());
  await page.goto("/money/transactions");
  await page.getByRole("button", { name: "Lists e2e", exact: true }).click();
  await pushed(page, () =>
    page
      .getByRole("complementary", { name: "Money item" })
      .getByRole("button", { name: "Delete" })
      .click(),
  );
  await deleteAccount(page, account);
});
