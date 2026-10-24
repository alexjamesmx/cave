import { ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("Diary → Months: a written day gets a dot and its habits a strip; a click opens that day in Write", async ({
  browser,
}) => {
  const page = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  await page.goto("/diary/write");
  await expect(page.getByText(/^Today /)).toBeVisible();
  const text = `Months e2e ${Date.now()}`;
  await page.getByLabel("Diary entry").fill(text);
  await page.getByLabel("Diary entry").blur();
  const habit = page.locator("button.chip[aria-pressed=false]").first();
  const name = (await habit.textContent()) ?? "";
  await habit.click();
  await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page
    .getByRole("navigation", { name: "Diary tabs" })
    .getByRole("link", { name: "Months" })
    .click();
  await expect(page).toHaveURL(/\/diary\/months$/);
  const today = page.getByRole("region", { name: "Months" }).locator("a.today");
  await expect(today).toHaveAttribute("aria-label", /, written, \d+ habits?$/);
  await expect(today.locator(".entry-dot")).toBeVisible();
  await expect(today.locator(".habit-pip.on")).toHaveCount(1);
  const day = (await today.getAttribute("href"))?.split("day=")[1] ?? "";
  expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  await today.click();
  await expect(page).toHaveURL(new RegExp(`/diary/write\\?day=${day}$`));
  await expect(page.getByLabel("Diary entry")).toHaveValue(text);

  // Leave the shared database as found.
  await page.getByLabel("Diary entry").fill("");
  await page.getByLabel("Diary entry").blur();
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
