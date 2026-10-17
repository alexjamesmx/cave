import { expect, type Page, test } from "@playwright/test";
import { ownerContext } from "./helpers.ts";

/** A card by its exact title ("Plan" would also match the "planned" status of others). */
const card = (page: Page, title: string) =>
  page.locator(".react-flow__node", { has: page.getByText(title, { exact: true }) });

const translate = async (page: Page, title: string) => {
  const node = card(page, title);
  const t = await node.evaluate((el) => (el as HTMLElement).style.transform);
  const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(t);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : undefined;
};

test("a project's map: drag a part, add a note, and both survive a reload", async ({ browser }) => {
  const page = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  page.on("dialog", (dialog) => void dialog.accept());
  const name = `Map e2e ${Date.now()}`;
  await page.goto("/projects/all");
  await page.getByRole("textbox", { name: "New project" }).fill(name);
  await page.getByLabel("Template").selectOption({ label: "Software" });
  await page.getByRole("button", { name: "New project" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  await page
    .getByRole("navigation", { name: "Project tabs" })
    .getByRole("link", { name: "Map" })
    .click();
  const canvas = page.getByRole("region", { name: "Project map" });
  const plan = card(page, "Plan");
  await expect(plan).toBeVisible();
  // Let fitView settle before grabbing the card.
  await page.waitForTimeout(500);
  const before = await translate(page, "Plan");
  const box = await plan.boundingBox();
  if (!box || !before) throw new Error("no Plan node");
  await page.mouse.move(box.x + 20, box.y + 16);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 116, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await translate(page, "Plan"))?.x).toBeGreaterThan(before.x + 40);
  const after = await translate(page, "Plan");

  await page.getByRole("button", { name: "Add note" }).click();
  const note = canvas.getByLabel("Sticky note");
  await note.fill("Ship it");
  await note.blur();
  await page.waitForTimeout(300);

  await page.reload();
  await expect(card(page, "Plan")).toBeVisible();
  // Stored positions are whole pixels; a drag can end between two.
  const reloaded = await translate(page, "Plan");
  expect(Math.abs((reloaded?.x ?? 0) - (after?.x ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((reloaded?.y ?? 0) - (after?.y ?? 0))).toBeLessThanOrEqual(1);
  await expect(canvas.getByLabel("Sticky note")).toHaveValue("Ship it");

  // Double-click opens the part's drawer.
  await card(page, "Build").dblclick();
  await expect(page.getByRole("complementary", { name: "Parts item" })).toBeVisible();
});
