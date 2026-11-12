import { offOriginRequests, ownerContext } from "./helpers.ts";
import { expect, type Locator, type Page, test } from "./test.ts";

const LONG = "Renew the passport, book the appointment and gather every document they ask for";

/** Drags `card` to a point in `target`: near its top or bottom edge, or `at` (0 top, 1 bottom). */
async function dragTo(page: Page, card: Locator, target: Locator, at: "top" | "bottom" | number) {
  const from = await card.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("not on screen");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  const x = to.x + to.width / 2;
  const y =
    at === "top" ? to.y + 4 : at === "bottom" ? to.y + to.height - 4 : to.y + to.height * at;
  await page.mouse.move(x, y, { steps: 12 });
  await page.mouse.up();
}

const column = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
// Other specs share the database, so only this spec's cards are compared.
const OWN = new Set(["Write report", "Call the bank", "Pay the plumber", LONG]);
const titles = async (col: Locator) =>
  (await col.locator("[data-card] .board-title").allTextContents()).filter((t) => OWN.has(t));

test("adding from New and from a column, drag and drop anywhere in a column, arrow keys, and full-height columns that never overlap", async ({
  browser,
  baseURL,
}) => {
  const context = await ownerContext(browser, { viewport: { width: 1360, height: 900 } });
  const foreign = offOriginRequests(context, baseURL as string);
  const page = await context.newPage();
  await page.goto("/c/tasks/board");

  // New task opens the add at the end of To do; Enter adds and keeps it open for the next.
  await page.getByRole("button", { name: "New task" }).click();
  for (const title of ["Write report", "Call the bank", LONG]) {
    await page.getByPlaceholder("New task").fill(title);
    await page.getByPlaceholder("New task").press("Enter");
    await expect(column(page, "To do").getByText(title)).toBeVisible();
  }
  await page.getByPlaceholder("New task").press("Escape");
  await expect(page.getByPlaceholder("New task")).toHaveCount(0);

  // A column's + adds to that column; its "+ Add a task" does too.
  await page.getByRole("button", { name: "Add to Waiting" }).click();
  await page.getByPlaceholder("New task").fill("Pay the plumber");
  await page.getByPlaceholder("New task").press("Enter");
  await expect(column(page, "Waiting").getByText("Pay the plumber")).toBeVisible();
  await page.getByPlaceholder("New task").press("Escape");
  await expect(column(page, "Doing").getByRole("button", { name: "+ Add a task" })).toBeVisible();

  // The columns reach the bottom of the screen.
  const box = await column(page, "Doing").boundingBox();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(900 - 40);

  // Between columns, then within one: the order sticks.
  const card = (title: string) => page.locator("[data-card]", { hasText: title });
  await dragTo(page, card("Call the bank"), column(page, "Doing"), "bottom");
  await expect(column(page, "Doing").getByText("Call the bank")).toBeVisible();
  await dragTo(page, card(LONG), card("Write report"), "top");
  await expect.poll(() => titles(column(page, "To do"))).toEqual([LONG, "Write report"]);

  // A drop on a short column's empty area, far below its cards, puts the card at the end.
  await dragTo(page, card("Write report"), column(page, "Waiting"), 0.7);
  await expect
    .poll(() => titles(column(page, "Waiting")))
    .toEqual(["Pay the plumber", "Write report"]);

  // Arrow keys: doing → waiting, to the end.
  await card("Call the bank").focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => titles(column(page, "Waiting")))
    .toEqual(["Pay the plumber", "Write report", "Call the bank"]);

  // Done and Dropped wait behind Show done; a drop on done stamps completed (the drawer shows it).
  await expect(column(page, "Done")).toHaveCount(0);
  await page.getByRole("button", { name: /^Show done/ }).click();
  await dragTo(page, card("Write report"), column(page, "Done"), "bottom");
  await expect(column(page, "Done").getByText("Write report")).toBeVisible();
  await card("Write report").click();
  await expect(page.getByLabel("Completed")).not.toHaveValue("");
  await page.keyboard.press("Escape");

  for (const width of [1360, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const boxes = await page.locator(".board-column").evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right };
      }),
    );
    for (let i = 1; i < boxes.length; i++)
      expect(boxes[i]?.left ?? 0).toBeGreaterThanOrEqual(boxes[i - 1]?.right ?? 0);
    // Long titles wrap inside their card.
    const overflow = await card(LONG).evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }

  // No focus ring in the comparison.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.setViewportSize({ width: 1360, height: 900 });
  await expect(page.locator(".board")).toHaveScreenshot("board-1360.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".board")).toHaveScreenshot("board-390.png");

  // The choice is per device and survives a reload; hiding again leaves the work in flight.
  await page.reload();
  await expect(column(page, "Done")).toBeVisible();
  await page.getByRole("button", { name: /^Hide done/ }).click();
  await expect(column(page, "Done")).toHaveCount(0);

  // Tasks → List: Open by default; Done shows the finished one; search narrows.
  await page.goto("/tasks/list");
  const table = page.getByRole("table", { name: "Tasks" });
  await expect(table.getByRole("button", { name: "Call the bank" })).toBeVisible();
  await expect(table.getByRole("button", { name: "Write report" })).toHaveCount(0);
  await page.getByRole("button", { name: /^Done/ }).click();
  await expect(page).toHaveURL(/chip=done/);
  await expect(table.getByRole("button", { name: "Write report" })).toBeVisible();
  await page.getByRole("button", { name: /^All/ }).click();
  await page.getByLabel("Search tasks").fill("bank");
  await expect(table.getByRole("button")).toHaveText(["Call the bank"]);

  expect(foreign).toEqual([]);
});
