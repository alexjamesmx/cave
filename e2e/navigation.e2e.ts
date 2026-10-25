import { ownerContext } from "./helpers.ts";
import { expect, test } from "./test.ts";

test("the rail shows the six sections and Settings once; a tab survives a reload; old links land in place", async ({
  browser,
}) => {
  const page = await (
    await ownerContext(browser, { viewport: { width: 1360, height: 900 } })
  ).newPage();
  await page.goto("/");
  const main = page.getByRole("navigation", { name: "Main" });
  await expect(main.getByRole("link")).toHaveText([
    "Money",
    "Calendar",
    "Flows",
    "Projects",
    "Diary",
    "Tasks",
    "Settings",
  ]);

  // Show names widens the rail to its labels; the choice survives a reload; Hide names undoes it.
  const side = page.locator(".side");
  const narrow = (await side.boundingBox())?.width ?? 0;
  await page.getByRole("button", { name: "Show names" }).click();
  await expect(main.getByText("Money", { exact: true })).toBeVisible();
  expect((await side.boundingBox())?.width ?? 0).toBeGreaterThan(narrow + 100);
  await page.reload();
  await expect(page.getByRole("button", { name: "Hide names" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(main.getByText("Money", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hide names" }).click();
  await expect(page.getByRole("button", { name: "Show names" })).toBeVisible();
  expect((await side.boundingBox())?.width ?? 0).toBeLessThan(narrow + 10);

  await main.getByRole("link", { name: "Money" }).click();
  const tabs = page.getByRole("navigation", { name: "Money tabs" });
  await tabs.getByRole("link", { name: "Payments" }).click();
  await expect(page).toHaveURL(/\/money\/payments$/);
  await page.reload();
  await expect(tabs.getByRole("link", { name: "Payments" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("region", { name: "Payments by due date" })).toBeVisible();

  for (const [from, to] of [
    ["/", /\/projects\/scene$/],
    ["/c/journal", /\/diary\/write$/],
    ["/life/habits", /\/diary\/days$/],
    ["/agents", /\/settings\/agents$/],
    ["/settings/flows/flow-rent", /\/flows\/flow-rent$/],
    ["/ai/flows/flow-salary", /\/flows\/flow-salary$/],
    ["/ai/activity", /\/projects\/activity$/],
    ["/system/jobs", /\/settings\/devices\/jobs$/],
    ["/settings/system/flows", /\/flows$/],
    ["/settings/lists", /\/money\/lists$/],
    ["/c/proposals", /\/settings\/data\/proposals$/],
  ] as const) {
    await page.goto(from);
    await expect(page).toHaveURL(to);
  }
});
