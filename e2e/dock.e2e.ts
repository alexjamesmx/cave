import { ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

const PHONE = { width: 390, height: 844 };
const ALL = ["Money", "Calendar", "Flows", "Projects", "Notes", "Tasks", "Settings"];
const DEFAULT = ["Projects", "Money", "Tasks", "Calendar"];

test("the phone dock: four sections and New, More with every section, and an edited dock that syncs", async ({
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
  await expect(dock.getByRole("link")).toHaveText(DEFAULT);
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

  // More: every section, and Edit dock.
  await dock.getByRole("button", { name: "More" }).click();
  const more = page.getByRole("dialog", { name: "Everything" });
  // The same sections as the rail, each once.
  await expect(more.getByRole("link")).toHaveText(ALL);
  await more.getByRole("button", { name: "Edit dock" }).click();
  const edit = page.getByRole("dialog", { name: "Edit dock" });
  for (const name of DEFAULT)
    await edit.getByRole("button", { name: new RegExp(`${name}$`) }).click();
  await expect(edit.getByRole("button", { name: "Save dock" })).toBeDisabled();
  const picked = ["Notes", "Money", "Settings", "Flows"];
  for (const name of picked)
    await edit.getByRole("button", { name: new RegExp(`${name}$`) }).click();
  await edit.getByRole("button", { name: "Save dock" }).click();
  await expect(dock.getByRole("link")).toHaveText(picked);

  // Another phone gets the same dock through sync.
  const other = await (await ownerContext(browser, { viewport: PHONE })).newPage();
  await expect(async () => {
    await other.goto("/");
    await expect(other.getByRole("navigation", { name: "Dock" }).getByRole("link")).toHaveText(
      picked,
      { timeout: 2_000 },
    );
  }).toPass({ timeout: 30_000 });

  // Back to the default, so other specs see it.
  await dock.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: "Edit dock" }).click();
  const reset = page.getByRole("dialog", { name: "Edit dock" });
  for (const name of [...picked, ...DEFAULT])
    await reset.getByRole("button", { name: new RegExp(`${name}$`) }).click();
  await reset.getByRole("button", { name: "Save dock" }).click();
  await expect(dock.getByRole("link")).toHaveText(DEFAULT);
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
});
