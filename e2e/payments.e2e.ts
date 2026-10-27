import { openNew, ownerContext } from "./helpers.ts";
import { expect, type Page, test } from "./test.ts";

/** A local `YYYY-MM-DDTHH:mm` `days` from now at 09:00, as the browser sees it. */
const localAt = (page: Page, days: number) =>
  page.evaluate((d) => {
    const at = new Date(Date.now() + d * 86_400_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T09:00`;
  }, days);

test("a repeating task marked done comes back on its next date instead of piling up", async ({
  browser,
}) => {
  const page = await (await ownerContext(browser)).newPage();
  await page.goto("/");
  const due = await localAt(page, 1);
  await openNew(page);
  await page.getByRole("button", { name: "Task", exact: true }).click();
  const form = page.getByRole("form", { name: "Task" });
  await form.getByLabel("Title").fill("Pay rent e2e");
  await form.getByLabel("Due (optional)").fill(due);
  await form.getByLabel("Repeat").selectOption("monthly");
  await expect(form.getByText("never piles up copies")).toBeVisible();
  await form.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("status").filter({ hasText: "Pay rent e2e" })).toBeVisible();
  // Done on the board (arrow keys to the done column) brings it back as todo on its next date.
  await page.goto("/tasks/board");
  const card = page.locator("[data-card]", { hasText: "Pay rent e2e" });
  // A move re-renders the card, so it is focused again before each step: todo → doing → waiting → done.
  for (const next of ["doing", "waiting"]) {
    await card.focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      page.getByRole("region", { name: next, exact: true }).getByText("Pay rent e2e"),
    ).toBeVisible();
  }
  await card.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("region", { name: "todo", exact: true }).getByText("Pay rent e2e"),
  ).toBeVisible();
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
