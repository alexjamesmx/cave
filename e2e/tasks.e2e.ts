import { expect, type Locator, type Page, test } from "@playwright/test";
import { offOriginRequests, ownerContext } from "./helpers.ts";

const LONG = "Renew the passport, book the appointment and gather every document they ask for";

async function dragTo(page: Page, card: Locator, target: Locator, where: "top" | "bottom") {
  const from = await card.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("not on screen");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  const x = to.x + to.width / 2;
  const y = where === "top" ? to.y + 4 : to.y + to.height - 4;
  await page.mouse.move(x, y, { steps: 12 });
  await page.mouse.up();
}

const column = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
// Other specs share the database, so only this spec's cards are compared.
const OWN = new Set(["Write report", "Call the bank", LONG]);
const titles = async (col: Locator) =>
  (await col.locator("[data-card] .board-title").allTextContents()).filter((t) => OWN.has(t));

test("one New task button, drag and drop between and within columns, arrow keys, and a board that never overlaps", async ({
  browser,
  baseURL,
}) => {
  const context = await ownerContext(browser, { viewport: { width: 1360, height: 900 } });
  const foreign = offOriginRequests(context, baseURL as string);
  const page = await context.newPage();
  await page.goto("/c/tasks/board");

  // No per-column add; one button adds to To do.
  await expect(page.getByPlaceholder("Add")).toHaveCount(0);
  for (const title of ["Write report", "Call the bank", LONG]) {
    await page.getByRole("button", { name: "New task" }).click();
    await page.getByPlaceholder("New task").fill(title);
    await page.getByPlaceholder("New task").press("Enter");
    await expect(column(page, "todo").getByText(title)).toBeVisible();
  }

  // Between columns, then within one: the order sticks.
  const card = (title: string) => page.locator("[data-card]", { hasText: title });
  await dragTo(page, card("Call the bank"), column(page, "doing"), "bottom");
  await expect(column(page, "doing").getByText("Call the bank")).toBeVisible();
  await dragTo(page, card(LONG), card("Write report"), "top");
  await expect.poll(() => titles(column(page, "todo"))).toEqual([LONG, "Write report"]);

  // Arrow keys: doing → waiting.
  await card("Call the bank").focus();
  await page.keyboard.press("ArrowRight");
  await expect(column(page, "waiting").getByText("Call the bank")).toBeVisible();

  // A drop on done stamps completed (the drawer shows it).
  await dragTo(page, card("Write report"), column(page, "done"), "bottom");
  await expect(column(page, "done").getByText("Write report")).toBeVisible();
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

  expect(foreign).toEqual([]);
});
