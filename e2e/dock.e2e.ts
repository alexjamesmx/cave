import { ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

const PHONE = { width: 390, height: 844 };
const ALL = ["Money", "Tasks", "Calendar", "Notes", "Flows", "Settings"];
const DOCK = ["Money", "Tasks", "Calendar", "Notes"];

test("the phone dock: four sections and New; ⚙️ in the header opens every section", async ({
  browser,
}) => {
  const context = await ownerContext(browser, { viewport: PHONE });
  const page = await context.newPage();
  await page.goto("/c/money");

  const dock = page.getByRole("navigation", { name: "Dock" });
  await expect(dock).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Notes" }),
  ).toBeHidden();
  await expect(dock.getByRole("link")).toHaveText(DOCK);
  await expect(dock.getByRole("link", { name: "Money" })).toHaveAttribute("aria-current", "page");

  // The dock never covers the page's end.
  const padding = await page
    .locator(".stage")
    .evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingBottom));
  expect(padding).toBeGreaterThanOrEqual(100);

  // New: the same sheet as the rail's, from any screen.
  await dock.getByRole("button", { name: "New" }).click();
  const sheet = page.getByRole("dialog", { name: "New" });
  await expect(sheet.getByRole("button", { name: "Reminder" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  // ⚙️ (Everything): every section, Flows and Settings included, each once.
  await page.getByRole("button", { name: "Everything" }).click();
  const more = page.getByRole("dialog", { name: "Everything" });
  await expect(more.getByRole("link")).toHaveText(ALL);
  await more.getByRole("link", { name: "Flows" }).click();
  await expect(page).toHaveURL(/\/flows$/);
  await expect(more).toHaveCount(0);
});

test("on a desktop the rail stays and there is no dock", async ({ browser }) => {
  const page = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Dock" })).toBeHidden();
  await expect(
    page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Notes" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Everything" })).toBeHidden();
});
