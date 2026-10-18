import { addMoney, offOriginRequests, ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("a copy of Salary → save with a 100 threshold creates the task for an income of 200; Undo removes it", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const context = await ownerContext(browser);
  const foreign = offOriginRequests(context, baseURL as string);
  const page = await context.newPage();
  await page.goto("/flows/flow-salary");
  await expect(page.getByLabel("Flow name")).toHaveValue("Salary → save");

  await page.getByRole("button", { name: "Duplicate" }).click();
  await expect(page).toHaveURL(/\/flows\/(?!flow-salary)[^/]+$/);
  await expect(page.getByLabel("Flow name")).toHaveValue("Copy of Salary → save");

  // The if step: amount ≥ 100 instead of 15,000.
  await page.getByRole("button", { name: /If amount >= 15000/ }).click();
  const editor = page.getByRole("complementary", { name: "Step settings" });
  const threshold = editor.getByLabel("Value");
  await threshold.fill("100");
  await threshold.blur();
  await expect(page.getByRole("button", { name: /If amount >= 100,/ })).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText("ON", { exact: true })).toBeVisible();
  const flowUrl = page.url();

  await page.goto("/");
  await addMoney(page, { amount: 200, title: "bonus", income: true });
  await expect(
    page.getByRole("status").filter({ hasText: "Saved · Income · bonus" }),
  ).toBeVisible();

  // The server runs the flow when the income syncs; a reload pulls the task it wrote.
  await expect(async () => {
    await page.goto("/c/tasks");
    await expect(page.getByText("Move 40 to invest")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });

  await page.goto(flowUrl);
  const history = page.getByRole("region", { name: "Run history" });
  await history.getByRole("button", { name: "Refresh" }).click();
  await expect(history.getByText("ok", { exact: true })).toBeVisible();
  await expect(history.getByRole("link", { name: "Move 40 to invest" })).toBeVisible();

  await history.getByRole("button", { name: "Undo" }).click();
  await expect(history.getByText("undone")).toBeVisible();
  await page.goto("/c/tasks");
  await expect(page.getByText("Move 40 to invest")).toHaveCount(0);

  await page.goto(flowUrl);
  await page.getByRole("button", { name: "Turn off" }).click();
  await expect(page.getByText("OFF", { exact: true })).toBeVisible();

  expect(foreign).toEqual([]);
});
